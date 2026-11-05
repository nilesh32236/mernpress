import type { AnalyticsService, AuthService } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';
import { sendRouteError } from './send-error.js';

const recordSchema = z
  .object({
    path: z.string().min(1).max(2048),
    referrer: z.string().max(2048).nullable().optional(),
  })
  .strict();

const summaryQuerySchema = z
  .object({ days: z.coerce.number().int().min(1).max(365).optional() })
  .strict();

interface AnalyticsRouteOptions {
  env: Env;
  auth: AuthService;
  analytics: AnalyticsService;
}

/**
 * Public beacon + admin dashboard data. The beacon answers 204 for anything it
 * chooses not to record (API/admin/static paths, bots) so a page view can never
 * surface an error to a visitor.
 */
export function registerAnalyticsRoutes(
  app: FastifyInstance,
  options: AnalyticsRouteOptions,
): void {
  const { env, auth, analytics } = options;

  app.post('/api/public/views', async (request, reply) => {
    try {
      const body = recordSchema.parse(request.body);
      await analytics.record({
        path: body.path,
        referrer: body.referrer ?? null,
        userAgent: request.headers['user-agent'] ?? null,
      });
    } catch {
      // Malformed beacons are ignored rather than surfaced to the visitor.
    }
    return reply.code(204).send();
  });

  app.get('/api/admin/analytics', async (request, reply) => {
    const ctx = await requireAdmin(request as FastifyRequest, reply as FastifyReply, {
      env,
      auth,
    });
    if (!ctx) return;
    try {
      const query = summaryQuerySchema.parse(request.query);
      return await analytics.summary(ctx.principal, query.days ?? 7);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });
}

import type { AuthService, ConsentService } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';
import { sendRouteError } from './send-error.js';

const label = z.string().trim().min(1).max(40);
const consentSchema = z
  .object({
    enabled: z.boolean(),
    version: z.number().int().min(1).max(1000),
    title: z.string().trim().min(1).max(120),
    message: z.string().trim().min(1).max(500),
    acceptLabel: label,
    rejectLabel: label,
    saveLabel: label,
    analyticsEnabled: z.boolean(),
    marketingEnabled: z.boolean(),
    analyticsRequired: z.boolean(),
  })
  .strict();

interface ConsentRouteOptions {
  env: Env;
  auth: AuthService;
  consent: ConsentService;
}

/** Settings → Consent: administrator-only banner configuration. */
export function registerConsentRoutes(app: FastifyInstance, options: ConsentRouteOptions): void {
  const { env, auth, consent } = options;
  const guard = (request: FastifyRequest, reply: FastifyReply) =>
    requireAdmin(request, reply, { env, auth });

  app.get('/api/admin/consent', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      return await consent.get(ctx.principal);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.put('/api/admin/consent', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const body = consentSchema.parse(request.body);
      return await consent.update(ctx.principal, body);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });
}

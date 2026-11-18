import type { AuditLogService, AuthService } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';
import { sendRouteError } from './send-error.js';

/** Strict query contract for `GET /api/admin/audit` (D-154). */
export const listAuditQuerySchema = z
  .object({
    eventType: z.string().min(1).max(64).optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

interface AuditRouteOptions {
  env: Env;
  auth: AuthService;
  audit: AuditLogService;
}

/**
 * Administrator audit-log route (D-154).
 *
 * `requireAdmin` authenticates the session; it deliberately does not decide
 * permission. The handler passes the principal to `AuditLogService`, which
 * requires the `audit.read` capability, so an editor/author/subscriber session
 * gets 403 FORBIDDEN from the service (ADR 0004).
 */
export function registerAuditRoutes(app: FastifyInstance, options: AuditRouteOptions): void {
  const { env, auth, audit } = options;
  const guard = (request: FastifyRequest, reply: FastifyReply) =>
    requireAdmin(request, reply, { env, auth });

  app.get('/api/admin/audit', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const query = listAuditQuerySchema.parse(request.query);
      return await audit.listAuditEvents(ctx.principal, query);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });
}

import type { AuthService, SpamGuardService } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';
import { sendRouteError } from './send-error.js';

const updateSchema = z
  .object({
    enabled: z.boolean(),
    spamThreshold: z.number().int().min(1).max(20),
    moderationThreshold: z.number().int().min(1).max(20),
  })
  .strict();

interface SpamGuardRouteOptions {
  env: Env;
  auth: AuthService;
  spamGuard: SpamGuardService;
}

/** Settings → Connectors → Spam protection (administrators only). */
export function registerSpamGuardRoutes(
  app: FastifyInstance,
  options: SpamGuardRouteOptions,
): void {
  const { env, auth, spamGuard } = options;
  const guard = (request: FastifyRequest, reply: FastifyReply) =>
    requireAdmin(request, reply, { env, auth });

  app.get('/api/admin/connectors/spam', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      return await spamGuard.get(ctx.principal);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.put('/api/admin/connectors/spam', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const body = updateSchema.parse(request.body);
      return await spamGuard.update(ctx.principal, body);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });
}

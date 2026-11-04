import type { AuthService, UpdateService } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';
import { sendRouteError } from './send-error.js';

interface UpdateRouteOptions {
  env: Env;
  auth: AuthService;
  updates: UpdateService;
}

/** Dashboard → Updates. WordPress gates update checking on `update_core`. */
export function registerUpdateRoutes(app: FastifyInstance, options: UpdateRouteOptions): void {
  const { env, auth, updates } = options;
  const guard = (request: FastifyRequest, reply: FastifyReply) =>
    requireAdmin(request, reply, { env, auth });

  app.get('/api/admin/updates', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      return await updates.status(ctx.principal);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.post('/api/admin/updates/check', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      return await updates.check(ctx.principal);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });
}

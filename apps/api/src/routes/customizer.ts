import type { AuthService, CustomizerService } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';
import { sendRouteError } from './send-error.js';

const updateSchema = z
  .object({
    colors: z.unknown(),
    menu: z.unknown(),
    css: z.unknown(),
    showOnFront: z.string(),
    pageOnFront: z.string().nullable(),
    pageForPosts: z.string().nullable(),
  })
  .strict();

interface CustomizerRouteOptions {
  env: Env;
  auth: AuthService;
  customizer: CustomizerService;
}

/** Appearance → Customize (administrators only). */
export function registerCustomizerRoutes(
  app: FastifyInstance,
  options: CustomizerRouteOptions,
): void {
  const { env, auth, customizer } = options;
  const guard = (request: FastifyRequest, reply: FastifyReply) =>
    requireAdmin(request, reply, { env, auth });

  app.get('/api/admin/customizer', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      return await customizer.get(ctx.principal);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  // The Additional CSS field allows 20,000 characters; the global 16 KB body
  // limit would reject a valid payload with 413 before validation runs.
  app.put('/api/admin/customizer', { bodyLimit: 64 * 1024 }, async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const body = updateSchema.parse(request.body);
      return await customizer.update(ctx.principal, body);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });
}

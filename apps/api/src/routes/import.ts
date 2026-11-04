import type { AuthService, ImportService } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';
import { sendRouteError } from './send-error.js';

const importSchema = z
  .object({
    content: z
      .string()
      .min(1)
      .max(10 * 1024 * 1024),
    type: z.enum(['post', 'page']).optional(),
  })
  .strict();

interface ImportRouteOptions {
  env: Env;
  auth: AuthService;
  imports: ImportService;
}

export function registerImportRoutes(app: FastifyInstance, options: ImportRouteOptions): void {
  const { env, auth, imports } = options;
  const guard = (request: FastifyRequest, reply: FastifyReply) =>
    requireAdmin(request, reply, { env, auth });

  app.post('/api/admin/import/wordpress', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const body = importSchema.parse(request.body);
      return await imports.importWordPress(ctx.principal, body.content, {
        ...(body.type ? { type: body.type } : {}),
      });
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });
}

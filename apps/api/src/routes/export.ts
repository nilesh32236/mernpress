import type { AuthService, ExportScope, ExportService } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';
import { sendRouteError } from './send-error.js';

const exportQuerySchema = z
  .object({ content: z.enum(['all', 'posts', 'pages', 'media']).default('all') })
  .strict();

interface ExportRouteOptions {
  env: Env;
  auth: AuthService;
  exports: ExportService;
}

/** Tools → Export. WordPress downloads a WXR XML file. */
export function registerExportRoutes(app: FastifyInstance, options: ExportRouteOptions): void {
  const { env, auth, exports } = options;
  const guard = (request: FastifyRequest, reply: FastifyReply) =>
    requireAdmin(request, reply, { env, auth });

  app.get('/api/admin/export', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const query = exportQuerySchema.parse(request.query);
      const xml = await exports.exportWxr(ctx.principal, query.content as ExportScope);
      const date = new Date().toISOString().slice(0, 10);
      reply.header('content-type', 'application/rss+xml; charset=utf-8');
      reply.header('content-disposition', `attachment; filename="mernpress-export-${date}.xml"`);
      reply.header('cache-control', 'no-store');
      return reply.send(xml);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });
}

import type { AuthService, ExportScope, ExportService } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';
import { sendRouteError } from './send-error.js';

const exportQuerySchema = z
  .object({
    content: z.enum(['all', 'posts', 'pages', 'media']).default('all'),
    author: z.string().uuid().optional(),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD')
      .optional(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD')
      .optional(),
    status: z.enum(['publish', 'draft', 'private', 'future']).optional(),
    category: z.string().uuid().optional(),
  })
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
      const { content, ...filters } = exportQuerySchema.parse(request.query);
      const xml = await exports.exportWxr(ctx.principal, content as ExportScope, filters);
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

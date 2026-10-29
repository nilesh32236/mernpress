import type { AuthService, BulkService } from '@mernpress/cms-core';
import { BULK_MAX_IDS } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';

const bulkBodySchema = z
  .object({
    action: z.enum(['publish', 'unpublish', 'trash', 'restore', 'delete']),
    items: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            baseVersion: z.number().int().min(1),
          })
          .strict(),
      )
      .min(1)
      .max(BULK_MAX_IDS),
  })
  .strict();

interface BulkRouteOptions {
  env: Env;
  auth: AuthService;
  bulk: BulkService;
}

function sendError(reply: FastifyReply, request: FastifyRequest, error: unknown): FastifyReply {
  if (error instanceof z.ZodError) {
    return reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        requestId: request.id,
        details: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
  }
  return reply.code(500).send({
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error', requestId: request.id },
  });
}

export function registerContentBulkRoutes(app: FastifyInstance, options: BulkRouteOptions): void {
  const { env, auth, bulk } = options;

  app.post('/api/admin/posts/bulk', async (request, reply) => {
    const ctx = await requireAdmin(request, reply, { env, auth });
    if (!ctx) return;
    try {
      const body = bulkBodySchema.parse(request.body);
      // Always 200: per-item outcomes are reported in the result body.
      return await bulk.applyBulk(ctx.principal, body.action, body.items);
    } catch (error) {
      return sendError(reply, request, error);
    }
  });
}

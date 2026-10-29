import type { AuthService, AutosaveService } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';

/**
 * Autosave endpoints (P8-02). One autosave per post; the posts row is never
 * touched, so autosaves cannot overwrite newer edits by design.
 */

const autosaveBodySchema = z
  .object({
    title: z.string().max(300),
    excerpt: z.string().max(2000).nullable().optional(),
    content: z.string().max(2_100_000),
    seoTitle: z.string().max(300).nullable().optional(),
    seoDescription: z.string().max(500).nullable().optional(),
    canonicalUrl: z.string().max(2048).nullable().optional(),
    robots: z.string().max(100).nullable().optional(),
    ogTitle: z.string().max(300).nullable().optional(),
    ogDescription: z.string().max(500).nullable().optional(),
  })
  .strict();

const idParamSchema = z.object({ id: z.string().uuid() }).strict();

interface AutosaveRouteOptions {
  env: Env;
  auth: AuthService;
  autosave: AutosaveService;
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
  const contentError = error as { code?: string; statusCode?: number; message?: string };
  const statusCode =
    typeof contentError.statusCode === 'number' && contentError.statusCode >= 400
      ? contentError.statusCode
      : 500;
  const code = typeof contentError.code === 'string' ? contentError.code : 'INTERNAL_ERROR';
  const message =
    statusCode >= 500 ? 'Internal server error' : (contentError.message ?? 'Request rejected');
  return reply.code(statusCode).send({ error: { code, message, requestId: request.id } });
}

export function registerAutosaveRoutes(app: FastifyInstance, options: AutosaveRouteOptions): void {
  const { env, auth, autosave } = options;
  const guard = (request: FastifyRequest, reply: FastifyReply) =>
    requireAdmin(request, reply, { env, auth });

  app.put('/api/admin/posts/:id/autosave', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = idParamSchema.parse(request.params);
      const body = autosaveBodySchema.parse(request.body);
      return await autosave.saveAutosave(ctx.principal, id, {
        title: body.title,
        excerpt: body.excerpt ?? null,
        content: body.content,
        seoTitle: body.seoTitle ?? null,
        seoDescription: body.seoDescription ?? null,
        canonicalUrl: body.canonicalUrl ?? null,
        robots: body.robots ?? null,
        ogTitle: body.ogTitle ?? null,
        ogDescription: body.ogDescription ?? null,
      });
    } catch (error) {
      return sendError(reply, request, error);
    }
  });

  app.get('/api/admin/posts/:id/autosave', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = idParamSchema.parse(request.params);
      return await autosave.getAutosave(ctx.principal, id);
    } catch (error) {
      return sendError(reply, request, error);
    }
  });

  app.delete('/api/admin/posts/:id/autosave', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = idParamSchema.parse(request.params);
      await autosave.discardAutosave(ctx.principal, id);
      return reply.code(204).send();
    } catch (error) {
      return sendError(reply, request, error);
    }
  });
}

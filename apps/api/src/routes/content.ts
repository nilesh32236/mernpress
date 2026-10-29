import type { ContentService } from '@mernpress/cms-core';
import type { Env } from '../config/env.js';
import type { AuthService } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin, type AdminContext } from '../auth/require-admin.js';
import {
  adminListQuerySchema,
  assignTermsSchema,
  createPostSchema,
  idParamSchema,
  transitionSchema,
  updatePostSchema,
} from './content-schemas.js';

const CONTENT_BODY_LIMIT = 2_100_000; // 2 MB content + envelope overhead

const revisionParamsSchema = z
  .object({ id: z.string().uuid(), revisionId: z.string().uuid() })
  .strict();

interface ContentRouteOptions {
  env: Env;
  auth: AuthService;
  content: ContentService;
}

function sendError(reply: FastifyReply, request: FastifyRequest, error: unknown): FastifyReply {
  if (error instanceof z.ZodError) {
    return reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        requestId: request.id,
        details: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
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

export function registerContentRoutes(app: FastifyInstance, options: ContentRouteOptions): void {
  const { env, auth, content } = options;
  const guard = (request: FastifyRequest, reply: FastifyReply) =>
    requireAdmin(request, reply, { env, auth });

  app.get('/api/admin/posts', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const query = adminListQuerySchema.parse(request.query);
      return await content.listAdmin(ctx.principal, query);
    } catch (error) {
      return sendError(reply, request, error);
    }
  });

  app.post('/api/admin/posts', { bodyLimit: CONTENT_BODY_LIMIT }, async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const body = createPostSchema.parse(request.body);
      const post = await content.createPost(ctx.principal, body);
      return reply.code(201).send(post);
    } catch (error) {
      return sendError(reply, request, error);
    }
  });

  app.get('/api/admin/posts/:id', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = idParamSchema.parse(request.params);
      return await content.getPost(ctx.principal, id);
    } catch (error) {
      return sendError(reply, request, error);
    }
  });

  app.patch('/api/admin/posts/:id', { bodyLimit: CONTENT_BODY_LIMIT }, async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = idParamSchema.parse(request.params);
      const body = updatePostSchema.parse(request.body);
      return await content.updatePost(ctx.principal, id, body);
    } catch (error) {
      return sendError(reply, request, error);
    }
  });

  const transitions = [
    {
      path: 'publish',
      run: (c: ContentService, p: AdminContext['principal'], id: string, v: number) =>
        c.publish(p, id, v),
    },
    {
      path: 'unpublish',
      run: (c: ContentService, p: AdminContext['principal'], id: string, v: number) =>
        c.unpublish(p, id, v),
    },
    {
      path: 'trash',
      run: (c: ContentService, p: AdminContext['principal'], id: string, v: number) =>
        c.trash(p, id, v),
    },
    {
      path: 'restore',
      run: (c: ContentService, p: AdminContext['principal'], id: string, v: number) =>
        c.restore(p, id, v),
    },
  ] as const;

  for (const t of transitions) {
    app.post(`/api/admin/posts/:id/${t.path}`, async (request, reply) => {
      const ctx = await guard(request, reply);
      if (!ctx) return;
      try {
        const { id } = idParamSchema.parse(request.params);
        const { baseVersion } = transitionSchema.parse(request.body);
        return await t.run(content, ctx.principal, id, baseVersion);
      } catch (error) {
        return sendError(reply, request, error);
      }
    });
  }

  app.put('/api/admin/posts/:id/terms', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = idParamSchema.parse(request.params);
      const body = assignTermsSchema.parse(request.body);
      return await content.assignTerms(
        ctx.principal,
        id,
        body.categoryIds,
        body.tagIds,
        body.baseVersion,
      );
    } catch (error) {
      return sendError(reply, request, error);
    }
  });

  // ---- P8-01: post revisions ----
  app.get('/api/admin/posts/:id/revisions', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = idParamSchema.parse(request.params);
      return await content.listRevisions(ctx.principal, id);
    } catch (error) {
      return sendError(reply, request, error);
    }
  });

  app.get('/api/admin/posts/:id/revisions/:revisionId', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id, revisionId } = revisionParamsSchema.parse(request.params);
      return await content.getRevision(ctx.principal, id, revisionId);
    } catch (error) {
      return sendError(reply, request, error);
    }
  });

  app.post('/api/admin/posts/:id/revisions/:revisionId/restore', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id, revisionId } = revisionParamsSchema.parse(request.params);
      const { baseVersion } = transitionSchema.parse(request.body);
      return await content.restoreRevision(ctx.principal, id, revisionId, baseVersion);
    } catch (error) {
      return sendError(reply, request, error);
    }
  });

  // ---- P8-03: preview tokens ----
  app.post('/api/admin/posts/:id/preview-token', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = idParamSchema.parse(request.params);
      return await content.rotatePreviewToken(ctx.principal, id);
    } catch (error) {
      return sendError(reply, request, error);
    }
  });

  app.delete('/api/admin/posts/:id/preview-token', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = idParamSchema.parse(request.params);
      return await content.revokePreviewToken(ctx.principal, id);
    } catch (error) {
      return sendError(reply, request, error);
    }
  });
}

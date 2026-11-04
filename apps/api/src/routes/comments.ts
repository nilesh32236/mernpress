import type { AuthService, CommentService, CommentStatus } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/require-admin.js';
import { SESSION_COOKIE } from '../auth/cookies.js';
import type { Env } from '../config/env.js';
import { sendRouteError } from './send-error.js';

const postIdParamSchema = z.object({ postId: z.string().uuid() }).strict();
const commentIdParamSchema = z.object({ id: z.string().uuid() }).strict();
const commentStatus = z.enum(['PENDING', 'APPROVED', 'SPAM', 'TRASHED']);

const createCommentSchema = z
  .object({
    authorName: z.string().trim().min(1).max(200),
    authorEmail: z.string().trim().min(1).max(254),
    authorUrl: z.string().trim().max(2048).nullable().optional(),
    content: z.string().trim().min(1).max(10_000),
    parentId: z.string().uuid().nullable().optional(),
  })
  .strict();

const updateCommentSchema = z
  .object({
    authorName: z.string().trim().min(1).max(200).optional(),
    authorEmail: z.string().trim().min(1).max(254).optional(),
    authorUrl: z.string().trim().max(2048).nullable().optional(),
    content: z.string().trim().min(1).max(10_000).optional(),
  })
  .strict();

const listCommentsQuerySchema = z
  .object({
    status: commentStatus.optional(),
    postId: z.string().uuid().optional(),
    search: z.string().trim().max(200).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

const countsByPostQuerySchema = z.object({ ids: z.string().max(4000) }).strict();
const recentQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(20).default(5) })
  .strict();
const bulkCommentSchema = z
  .object({ ids: z.array(z.string().uuid()).min(1).max(100), status: commentStatus })
  .strict();

export function registerPublicCommentRoutes(
  app: FastifyInstance,
  options: { comments: CommentService; auth: AuthService },
): void {
  const { comments, auth } = options;

  app.get('/api/public/posts/:postId/comments', async (request, reply) => {
    try {
      const { postId } = postIdParamSchema.parse(request.params);
      return { items: await comments.publicList(postId) };
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.post('/api/public/posts/:postId/comments', async (request, reply) => {
    try {
      const { postId } = postIdParamSchema.parse(request.params);
      const body = createCommentSchema.parse(request.body);
      const token = request.cookies[SESSION_COOKIE];
      let userId: string | null = null;
      if (typeof token === 'string' && token) {
        const session = await auth.validateSession(token).catch(() => null);
        userId = session?.user.id ?? null;
      }
      const created = await comments.createPublic(postId, { ...body, userId });
      return reply.code(201).send(created);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });
}

interface AdminCommentOptions {
  env: Env;
  auth: AuthService;
  comments: CommentService;
}

export function registerCommentRoutes(app: FastifyInstance, options: AdminCommentOptions): void {
  const { env, auth, comments } = options;
  const guard = (request: FastifyRequest, reply: FastifyReply) =>
    requireAdmin(request, reply, { env, auth });

  app.get('/api/admin/comments', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const query = listCommentsQuerySchema.parse(request.query);
      return await comments.adminList(ctx.principal, query);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.get('/api/admin/comments/counts', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      return await comments.countsFor(ctx.principal);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.get('/api/admin/comments/recent', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const query = recentQuerySchema.parse(request.query);
      return { items: await comments.recent(ctx.principal, query.limit) };
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.get('/api/admin/comments/counts-by-post', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const query = countsByPostQuerySchema.parse(request.query);
      const ids = query.ids
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      for (const id of ids) {
        if (!z.string().uuid().safeParse(id).success) {
          throw new z.ZodError([
            { code: 'custom', path: ['ids'], message: 'Invalid post id.', input: id },
          ]);
        }
      }
      return await comments.countsByPost(ctx.principal, ids);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.patch('/api/admin/comments/:id/status', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = commentIdParamSchema.parse(request.params);
      const body = z.object({ status: commentStatus }).strict().parse(request.body);
      return await comments.setStatus(ctx.principal, id, body.status as CommentStatus);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.put('/api/admin/comments/:id', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = commentIdParamSchema.parse(request.params);
      const body = updateCommentSchema.parse(request.body);
      return await comments.update(ctx.principal, id, body);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.delete('/api/admin/comments/:id', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = commentIdParamSchema.parse(request.params);
      await comments.remove(ctx.principal, id);
      return reply.code(204).send();
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.post('/api/admin/comments/bulk', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const body = bulkCommentSchema.parse(request.body);
      const results = [];
      for (const id of body.ids) {
        results.push(await comments.setStatus(ctx.principal, id, body.status as CommentStatus));
      }
      return { updated: results.length, items: results };
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });
}

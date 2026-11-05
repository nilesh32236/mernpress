import type { AuthService, NoteService } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';
import { sendRouteError } from './send-error.js';

const postParamSchema = z.object({ id: z.string().uuid() }).strict();
const noteParamSchema = z.object({ id: z.string().uuid(), noteId: z.string().uuid() }).strict();
const blockAnchorSchema = z
  .object({
    name: z
      .string()
      .regex(/^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/)
      .max(100),
    path: z
      .string()
      .regex(/^\d+(?:\.\d+){0,9}$/)
      .max(100),
    hash: z.string().regex(/^[0-9a-f]{16}$/),
    text: z.string().max(200),
    anchorId: z
      .string()
      .regex(/^[0-9a-f]{16}$/)
      .nullable()
      .optional(),
  })
  .strict();

const createSchema = z
  .object({
    content: z.string().min(1).max(2000),
    parentId: z.string().uuid().nullable().optional(),
    block: blockAnchorSchema.nullable().optional(),
  })
  .strict();
const resolveSchema = z.object({ resolved: z.boolean() }).strict();
const listQuerySchema = z.object({ status: z.enum(['active', 'trash']).optional() }).strict();

interface NoteRouteOptions {
  env: Env;
  auth: AuthService;
  notes: NoteService;
}

/**
 * Editor notes. Authentication is the usual session + CSRF guard; the service
 * applies the content edit policy, so only users who may edit the post can read
 * or write its notes.
 */
export function registerNoteRoutes(app: FastifyInstance, options: NoteRouteOptions): void {
  const { env, auth, notes } = options;
  const guard = (request: FastifyRequest, reply: FastifyReply) =>
    requireAdmin(request, reply, { env, auth });

  app.get('/api/admin/posts/:id/notes', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = postParamSchema.parse(request.params);
      const query = listQuerySchema.parse(request.query);
      if (query.status === 'trash') {
        return { notes: [], trash: await notes.list(ctx.principal, id, { trashed: true }) };
      }
      return await notes.lists(ctx.principal, id);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.post('/api/admin/posts/:id/notes', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = postParamSchema.parse(request.params);
      const body = createSchema.parse(request.body);
      const note = await notes.create(ctx.principal, id, body);
      return reply.code(201).send(note);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.delete('/api/admin/posts/:id/notes/:noteId', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id, noteId } = noteParamSchema.parse(request.params);
      await notes.trash(ctx.principal, id, noteId);
      return reply.code(204).send();
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.post('/api/admin/posts/:id/notes/:noteId/restore', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id, noteId } = noteParamSchema.parse(request.params);
      return await notes.restore(ctx.principal, id, noteId);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.delete('/api/admin/posts/:id/notes/:noteId/permanent', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id, noteId } = noteParamSchema.parse(request.params);
      await notes.purge(ctx.principal, id, noteId);
      return reply.code(204).send();
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.patch('/api/admin/posts/:id/notes/:noteId', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id, noteId } = noteParamSchema.parse(request.params);
      const body = resolveSchema.parse(request.body);
      return await notes.setResolved(ctx.principal, id, noteId, body.resolved);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });
}

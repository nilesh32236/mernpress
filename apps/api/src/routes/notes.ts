import type { AuthService, NoteService } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';
import { sendRouteError } from './send-error.js';

const postParamSchema = z.object({ id: z.string().uuid() }).strict();
const noteParamSchema = z.object({ id: z.string().uuid(), noteId: z.string().uuid() }).strict();
const createSchema = z
  .object({
    content: z.string().min(1).max(2000),
    parentId: z.string().uuid().nullable().optional(),
  })
  .strict();
const resolveSchema = z.object({ resolved: z.boolean() }).strict();

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
      return { notes: await notes.list(ctx.principal, id) };
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

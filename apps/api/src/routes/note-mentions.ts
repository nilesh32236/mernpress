import type { AuthService, NoteService } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';
import { sendRouteError } from './send-error.js';

const postParamSchema = z.object({ id: z.string().uuid() }).strict();
const querySchema = z.object({ search: z.string().max(100).optional() }).strict();

interface NoteMentionRouteOptions {
  env: Env;
  auth: AuthService;
  notes: NoteService;
}

/**
 * @mention candidates for the note composer. Only active users who can edit
 * the post are returned; the service applies the same content policy as notes.
 */
export function registerNoteMentionRoutes(
  app: FastifyInstance,
  options: NoteMentionRouteOptions,
): void {
  const { env, auth, notes } = options;
  const guard = (request: FastifyRequest, reply: FastifyReply) =>
    requireAdmin(request, reply, { env, auth });

  app.get('/api/admin/posts/:id/note-mentions', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = postParamSchema.parse(request.params);
      const query = querySchema.parse(request.query);
      const items = await notes.mentionCandidates(ctx.principal, id, query.search ?? '');
      return { items };
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });
}

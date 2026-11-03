import type { AuthService, UserAdminService } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';
import { sendRouteError } from './send-error.js';

export const updateProfileSchema = z
  .object({
    username: z.string().min(1).max(64).optional(),
    email: z.string().max(254).nullable().optional(),
    displayName: z.string().max(100).nullable().optional(),
    bio: z.string().max(2000).nullable().optional(),
    website: z.string().max(2048).nullable().optional(),
  })
  .strict();

export const changeOwnPasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(1).max(128),
  })
  .strict();

interface ProfileRouteOptions {
  env: Env;
  auth: AuthService;
  users: UserAdminService;
}

/**
 * Self-service profile routes (wp-admin Profile).
 *
 * `requireAdmin` here means only "valid active session + CSRF on mutations" —
 * despite the name it does not require the administrator role. Any authenticated
 * user (editor, author, contributor, subscriber) can read and edit their own
 * profile; `UserAdminService` acts only on `principal.userId`.
 */
export function registerProfileRoutes(app: FastifyInstance, options: ProfileRouteOptions): void {
  const { env, auth, users } = options;
  const guard = (request: FastifyRequest, reply: FastifyReply) =>
    requireAdmin(request, reply, { env, auth });

  app.get('/api/profile', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      return await users.getOwnProfile(ctx.principal);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.put('/api/profile', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const body = updateProfileSchema.parse(request.body);
      return await users.updateOwnProfile(ctx.principal, body);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.put('/api/profile/password', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const body = changeOwnPasswordSchema.parse(request.body);
      await users.changeOwnPassword(ctx.principal, body);
      return reply.code(204).send();
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });
}

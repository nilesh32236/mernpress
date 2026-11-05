import type {
  ApplicationPasswordService,
  AuthService,
  TwoFactorService,
  UserAdminService,
} from '@mernpress/cms-core';
import { AVAILABLE_LOCALES } from '@mernpress/cms-core';
import { isAdminColorScheme, type AdminColorScheme } from '@mernpress/contracts';
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
    firstName: z.string().max(100).nullable().optional(),
    lastName: z.string().max(100).nullable().optional(),
    nickname: z.string().max(100).nullable().optional(),
    bio: z.string().max(2000).nullable().optional(),
    website: z.string().max(2048).nullable().optional(),
    syntaxHighlighting: z.boolean().optional(),
    locale: z.string().max(20).optional(),
    adminColor: z.custom<AdminColorScheme>(isAdminColorScheme, 'Unknown colour scheme').optional(),
  })
  .strict();

const applicationPasswordNameSchema = z.object({ name: z.string().min(1).max(200) }).strict();
const applicationPasswordParamSchema = z.object({ id: z.string().uuid() }).strict();
const twoFactorCodeSchema = z.object({ code: z.string().min(4).max(32) }).strict();
const twoFactorDisableSchema = z
  .object({ password: z.string().min(1).max(128), code: z.string().min(4).max(32) })
  .strict();
const twoFactorPasswordSchema = z.object({ password: z.string().min(1).max(128) }).strict();

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
  appPasswords: ApplicationPasswordService;
  twoFactor: TwoFactorService;
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
  const { env, auth, users, appPasswords, twoFactor } = options;
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

  app.get('/api/profile/locales', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    return { items: AVAILABLE_LOCALES };
  });

  app.get('/api/profile/two-factor', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      return await twoFactor.status(ctx.principal);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.post('/api/profile/two-factor/setup', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      return await twoFactor.beginSetup(ctx.principal);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.post('/api/profile/two-factor/confirm', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const body = twoFactorCodeSchema.parse(request.body);
      return await twoFactor.confirmSetup(ctx.principal, body.code);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.post('/api/profile/two-factor/disable', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const body = twoFactorDisableSchema.parse(request.body);
      return await twoFactor.disable(ctx.principal, body.password, body.code);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.post('/api/profile/two-factor/recovery-codes', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const body = twoFactorPasswordSchema.parse(request.body);
      return await twoFactor.regenerateRecoveryCodes(ctx.principal, body.password);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.get('/api/profile/app-passwords', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      return { items: await appPasswords.list(ctx.principal) };
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.post('/api/profile/app-passwords', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const body = applicationPasswordNameSchema.parse(request.body);
      const created = await appPasswords.create(ctx.principal, body.name);
      return reply.code(201).send(created);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.delete('/api/profile/app-passwords/:id', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = applicationPasswordParamSchema.parse(request.params);
      await appPasswords.revoke(ctx.principal, id);
      return reply.code(204).send();
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

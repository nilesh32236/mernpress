import type { AuthService, UserAdminService } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';
import { sendRouteError } from './send-error.js';

const uuid = z.string().uuid();
const username = z.string().min(1).max(64);
const password = z.string().min(1).max(128);
const role = z.enum(['administrator', 'editor', 'author', 'contributor', 'subscriber']);
const status = z.enum(['active', 'disabled']);

export const listUsersQuerySchema = z
  .object({
    search: z.string().max(200).optional(),
    role: z.enum(['administrator', 'editor', 'author', 'contributor', 'subscriber']).optional(),
    sort: z.enum(['username', 'email']).default('username'),
    order: z.enum(['asc', 'desc']).default('asc'),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const createUserSchema = z
  .object({
    username,
    password,
    role,
    email: z.string().max(254).nullable().optional(),
    displayName: z.string().max(100).nullable().optional(),
    firstName: z.string().max(100).nullable().optional(),
    lastName: z.string().max(100).nullable().optional(),
    nickname: z.string().max(100).nullable().optional(),
    website: z.string().max(2048).nullable().optional(),
    sendNotification: z.boolean().optional(),
  })
  .strict();

export const updateUserRoleSchema = z.object({ role }).strict();
export const updateUserStatusSchema = z.object({ status }).strict();
export const resetUserPasswordSchema = z.object({ password }).strict();
export const userIdParamSchema = z.object({ id: uuid }).strict();
export const deleteUserQuerySchema = z.object({ reassignTo: uuid.optional() }).strict();

interface UserRouteOptions {
  env: Env;
  auth: AuthService;
  users: UserAdminService;
}

function deleteOptions(query: z.infer<typeof deleteUserQuerySchema>) {
  return query.reassignTo === undefined ? {} : { reassignToUserId: query.reassignTo };
}

/**
 * Administrator user-management routes (wp-admin Users → All Users).
 *
 * `requireAdmin` authenticates the session and enforces CSRF for mutations; it
 * deliberately does not decide permission. Every handler passes the principal
 * to `UserAdminService`, which requires the `user.manage` capability, so an
 * editor/author/subscriber session gets 403 FORBIDDEN from the service.
 */
export function registerUserRoutes(app: FastifyInstance, options: UserRouteOptions): void {
  const { env, auth, users } = options;
  const guard = (request: FastifyRequest, reply: FastifyReply) =>
    requireAdmin(request, reply, { env, auth });

  app.get('/api/users', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const query = listUsersQuerySchema.parse(request.query);
      return await users.listUsers(ctx.principal, query);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.post('/api/users', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const body = createUserSchema.parse(request.body);
      const created = await users.createUser(ctx.principal, body);
      return reply.code(201).send(created);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.put('/api/users/:id/role', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = userIdParamSchema.parse(request.params);
      const body = updateUserRoleSchema.parse(request.body);
      return await users.updateUserRole(ctx.principal, id, body.role);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.put('/api/users/:id/status', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = userIdParamSchema.parse(request.params);
      const body = updateUserStatusSchema.parse(request.body);
      return await users.setUserStatus(ctx.principal, id, body.status);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.put('/api/users/:id/password', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = userIdParamSchema.parse(request.params);
      const body = resetUserPasswordSchema.parse(request.body);
      await users.resetUserPassword(ctx.principal, id, body.password);
      return reply.code(204).send();
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.delete('/api/users/:id', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = userIdParamSchema.parse(request.params);
      const query = deleteUserQuerySchema.parse(request.query);
      await users.deleteUser(ctx.principal, id, deleteOptions(query));
      return reply.code(204).send();
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });
}

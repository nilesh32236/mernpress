import type { AuthService, DataRequestType, PrivacyService } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';
import { sendRouteError } from './send-error.js';

const requestType = z.enum(['EXPORT', 'ERASE']);
const listQuerySchema = z.object({ type: requestType }).strict();
const createSchema = z.object({ type: requestType, email: z.string().trim().max(254) }).strict();
const idParamSchema = z.object({ id: z.string().uuid() }).strict();

interface PrivacyRouteOptions {
  env: Env;
  auth: AuthService;
  privacy: PrivacyService;
}

export function registerPrivacyRoutes(app: FastifyInstance, options: PrivacyRouteOptions): void {
  const { env, auth, privacy } = options;
  const guard = (request: FastifyRequest, reply: FastifyReply) =>
    requireAdmin(request, reply, { env, auth });

  app.get('/api/admin/data-requests', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const query = listQuerySchema.parse(request.query);
      return { items: await privacy.list(ctx.principal, query.type as DataRequestType) };
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.post('/api/admin/data-requests', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const body = createSchema.parse(request.body);
      const created = await privacy.create(ctx.principal, {
        type: body.type as DataRequestType,
        email: body.email,
      });
      return reply.code(201).send(created);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.get('/api/admin/data-requests/:id/export', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = idParamSchema.parse(request.params);
      const payload = await privacy.exportData(ctx.principal, id);
      reply.header('content-type', 'application/json; charset=utf-8');
      reply.header('content-disposition', `attachment; filename="personal-data-${id}.json"`);
      return reply.send(payload);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.post('/api/admin/data-requests/:id/complete', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = idParamSchema.parse(request.params);
      return await privacy.complete(ctx.principal, id);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });
}

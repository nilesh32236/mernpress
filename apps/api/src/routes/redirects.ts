import type { AuthService, RedirectService } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';
import { createMemoryRateLimit } from '../security/memory-rate-limit.js';
import { sendRouteError } from './send-error.js';

const redirectBodySchema = z
  .object({
    fromPath: z.string().min(1).max(2048),
    toPath: z.string().min(1).max(2048),
    statusCode: z.union([z.literal(301), z.literal(302)]).optional(),
  })
  .strict();
const redirectParamSchema = z.object({ id: z.string().uuid() }).strict();
const pathBodySchema = z.object({ path: z.string().min(1).max(2048) }).strict();

interface RedirectRouteOptions {
  env: Env;
  auth: AuthService;
  redirects: RedirectService;
}

/** Tools → Redirects (administrators only). */
export function registerRedirectRoutes(app: FastifyInstance, options: RedirectRouteOptions): void {
  const { env, auth, redirects } = options;
  const guard = (request: FastifyRequest, reply: FastifyReply) =>
    requireAdmin(request, reply, { env, auth });

  app.get('/api/admin/redirects', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      return await redirects.list(ctx.principal);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.post('/api/admin/redirects', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const body = redirectBodySchema.parse(request.body);
      return await redirects.create(ctx.principal, body);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.put('/api/admin/redirects/:id', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = redirectParamSchema.parse(request.params);
      const body = redirectBodySchema.parse(request.body);
      return await redirects.update(ctx.principal, id, body);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.delete('/api/admin/redirects/:id', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = redirectParamSchema.parse(request.params);
      return await redirects.remove(ctx.principal, id);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.delete('/api/admin/redirects/not-found/:id', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = redirectParamSchema.parse(request.params);
      return await redirects.dismissNotFound(ctx.principal, id);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });
}

interface PublicRedirectRouteOptions {
  redirects: RedirectService;
}

/**
 * Public redirect data for the Next.js middleware and the 404 logger.
 *
 * The map endpoint is read-only and cacheable; `hit` and `not-found` are
 * rate-limited per client so the tables cannot be flooded anonymously.
 */
export function registerPublicRedirectRoutes(
  app: FastifyInstance,
  options: PublicRedirectRouteOptions,
): void {
  const { redirects } = options;
  const logLimiter = createMemoryRateLimit({ max: 120, windowMs: 60 * 1000 });

  app.get('/api/public/redirects', async () => ({ items: await redirects.publicMap() }));

  app.post('/api/public/redirects/hit', async (request, reply) => {
    const decision = logLimiter(`${request.ip}:redirect`);
    if (!decision.allowed) {
      return reply
        .code(429)
        .send({ error: { code: 'RATE_LIMITED', message: 'Too many requests.' } });
    }
    const parsed = pathBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid path.' } });
    }
    await redirects.resolve(parsed.data.path);
    return reply.code(204).send();
  });

  app.post('/api/public/not-found', async (request, reply) => {
    const decision = logLimiter(`${request.ip}:not-found`);
    if (!decision.allowed) {
      return reply
        .code(429)
        .send({ error: { code: 'RATE_LIMITED', message: 'Too many requests.' } });
    }
    const parsed = pathBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid path.' } });
    }
    await redirects.logNotFound(parsed.data.path);
    return reply.code(204).send();
  });
}

import type { AuthService, JobQueueService } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';
import { sendRouteError } from './send-error.js';

const listQuerySchema = z
  .object({
    status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']).optional(),
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

const jobParamSchema = z.object({ id: z.string().uuid() }).strict();

interface JobRouteOptions {
  env: Env;
  auth: AuthService;
  jobs: JobQueueService;
}

/** Tools → Scheduled Actions (administrators only). */
export function registerJobRoutes(app: FastifyInstance, options: JobRouteOptions): void {
  const { env, auth, jobs } = options;
  const guard = (request: FastifyRequest, reply: FastifyReply) =>
    requireAdmin(request, reply, { env, auth });

  app.get('/api/admin/jobs', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const query = listQuerySchema.parse(request.query);
      return await jobs.list(ctx.principal, query);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.post('/api/admin/jobs/:id/run', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = jobParamSchema.parse(request.params);
      return await jobs.reschedule(ctx.principal, id);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.post('/api/admin/jobs/:id/cancel', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = jobParamSchema.parse(request.params);
      return await jobs.cancel(ctx.principal, id);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });
}

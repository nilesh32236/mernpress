import type { AuthService, ScheduleService } from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';

/**
 * First-publish scheduling endpoints (P8-04, ADR 0008 §4).
 */

const scheduleBodySchema = z
  .object({
    scheduledAt: z.string().datetime({ offset: true }),
    baseVersion: z.number().int().min(1),
  })
  .strict();

const unscheduleBodySchema = z
  .object({
    baseVersion: z.number().int().min(1),
  })
  .strict();

const idParamSchema = z.object({ id: z.string().uuid() }).strict();

interface ScheduleRouteOptions {
  env: Env;
  auth: AuthService;
  schedule: ScheduleService;
}

function sendError(reply: FastifyReply, request: FastifyRequest, error: unknown): FastifyReply {
  if (error instanceof z.ZodError) {
    return reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        requestId: request.id,
        details: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
  }
  const contentError = error as { code?: string; statusCode?: number; message?: string };
  const statusCode =
    typeof contentError.statusCode === 'number' && contentError.statusCode >= 400
      ? contentError.statusCode
      : 500;
  const code = typeof contentError.code === 'string' ? contentError.code : 'INTERNAL_ERROR';
  const message =
    statusCode >= 500 ? 'Internal server error' : (contentError.message ?? 'Request rejected');
  return reply.code(statusCode).send({ error: { code, message, requestId: request.id } });
}

export function registerScheduleRoutes(app: FastifyInstance, options: ScheduleRouteOptions): void {
  const { env, auth, schedule } = options;
  const guard = (request: FastifyRequest, reply: FastifyReply) =>
    requireAdmin(request, reply, { env, auth });

  app.get('/api/admin/posts/:id/schedule', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = idParamSchema.parse(request.params);
      return await schedule.getSchedule(ctx.principal, id);
    } catch (error) {
      return sendError(reply, request, error);
    }
  });

  app.put('/api/admin/posts/:id/schedule', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = idParamSchema.parse(request.params);
      const body = scheduleBodySchema.parse(request.body);
      return await schedule.schedule(
        ctx.principal,
        id,
        new Date(body.scheduledAt),
        body.baseVersion,
      );
    } catch (error) {
      return sendError(reply, request, error);
    }
  });

  app.delete('/api/admin/posts/:id/schedule', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = idParamSchema.parse(request.params);
      const body = unscheduleBodySchema.parse(request.body);
      return await schedule.unschedule(ctx.principal, id, body.baseVersion);
    } catch (error) {
      return sendError(reply, request, error);
    }
  });
}

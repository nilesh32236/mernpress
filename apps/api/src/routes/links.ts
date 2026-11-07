import {
  ContentError,
  requireCapability,
  type AuthService,
  type JobQueueService,
  type LinkCheckService,
} from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';
import { JOB_TYPES } from '../jobs/types.js';
import { sendRouteError } from './send-error.js';

const paramSchema = z.object({ id: z.string().uuid() }).strict();

interface LinkRouteOptions {
  env: Env;
  auth: AuthService;
  linkChecks: LinkCheckService;
  jobs: JobQueueService;
}

/** Tools → Redirects → Broken links (administrators only). */
export function registerLinkRoutes(app: FastifyInstance, options: LinkRouteOptions): void {
  const { env, auth, linkChecks, jobs } = options;
  const guard = (request: FastifyRequest, reply: FastifyReply) =>
    requireAdmin(request, reply, { env, auth });

  app.get('/api/admin/links', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      return await linkChecks.list(ctx.principal);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.post('/api/admin/links/check', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      requireCapability(ctx.principal, 'manage_options');
      if (await jobs.hasActive(JOB_TYPES.linkCheck)) {
        throw new ContentError(
          'LINK_CHECK_IN_PROGRESS',
          'A link check is already queued or running.',
          409,
        );
      }
      const job = await jobs.enqueue({ type: JOB_TYPES.linkCheck, maxAttempts: 2 });
      return reply.code(202).send({ job });
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.delete('/api/admin/links/:id', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { id } = paramSchema.parse(request.params);
      return await linkChecks.dismiss(ctx.principal, id);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });
}

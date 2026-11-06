import { createReadStream } from 'node:fs';
import {
  ContentError,
  requireCapability,
  type AuthService,
  type BackupService,
  type JobQueueService,
} from '@mernpress/cms-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/require-admin.js';
import type { Env } from '../config/env.js';
import { sendRouteError } from './send-error.js';
import { JOB_TYPES } from '../jobs/types.js';

const backupParamSchema = z
  .object({ file: z.string().regex(/^mernpress-backup-\d{8}T\d{6}Z\.tar\.gz$/) })
  .strict();

interface BackupRouteOptions {
  env: Env;
  auth: AuthService;
  backups: BackupService;
  jobs: JobQueueService;
}

/** Tools → Backups (administrators only). */
export function registerBackupRoutes(app: FastifyInstance, options: BackupRouteOptions): void {
  const { env, auth, backups, jobs } = options;
  const guard = (request: FastifyRequest, reply: FastifyReply) =>
    requireAdmin(request, reply, { env, auth });

  app.get('/api/admin/backups', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      return await backups.list(ctx.principal);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.post('/api/admin/backups', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      requireCapability(ctx.principal, 'manage_options');
      if (await jobs.hasActive(JOB_TYPES.backupCreate)) {
        throw new ContentError(
          'BACKUP_IN_PROGRESS',
          'A backup is already queued or running. Try again when it finishes.',
          409,
        );
      }
      const job = await jobs.enqueue({
        type: JOB_TYPES.backupCreate,
        maxAttempts: 2,
      });
      const list = await backups.list(ctx.principal);
      return reply.code(202).send({ job, ...list });
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.delete('/api/admin/backups/:file', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { file } = backupParamSchema.parse(request.params);
      return await backups.remove(ctx.principal, file);
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });

  app.get('/api/admin/backups/:file/download', async (request, reply) => {
    const ctx = await guard(request, reply);
    if (!ctx) return;
    try {
      const { file } = backupParamSchema.parse(request.params);
      const absolute = await backups.resolve(ctx.principal, file);
      reply.header('cache-control', 'no-store');
      reply.header('content-type', 'application/gzip');
      reply.header('content-disposition', `attachment; filename="${file}"`);
      return reply.send(createReadStream(absolute));
    } catch (error) {
      return sendRouteError(reply, request, error);
    }
  });
}

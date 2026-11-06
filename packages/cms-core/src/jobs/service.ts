import { Prisma } from '@mernpress/database';
import { requireCapability } from '../auth/capabilities.js';
import type { Principal } from '../content/types.js';
import { ContentError } from '../content/errors.js';
import type {
  ClaimedJob,
  JobDto,
  JobListQuery,
  JobQueueService,
  JobQueueServiceOptions,
  JobStatus,
} from './types.js';

const TYPE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,99}$/;
const MAX_PAYLOAD_BYTES = 32 * 1024;
const MAX_ERROR_LENGTH = 2000;
const BASE_RETRY_SECONDS = 30;
const MAX_RETRY_SECONDS = 60 * 60;

function truncateError(error: string): string {
  const clean = error.replace(/[\r\n]+/g, ' ').trim();
  return clean.length > MAX_ERROR_LENGTH ? `${clean.slice(0, MAX_ERROR_LENGTH)}…` : clean;
}

function retryDelaySeconds(attempts: number): number {
  return Math.min(MAX_RETRY_SECONDS, BASE_RETRY_SECONDS * 2 ** Math.max(0, attempts - 1));
}

/**
 * Durable background jobs (ADR 0054).
 *
 * Rows are claimed with one `UPDATE … FOR UPDATE SKIP LOCKED`, so several API
 * instances can share the table and never run the same job twice. The worker
 * owns execution and retry policy; this service owns validation, claiming and
 * the admin operations.
 */
export function createJobQueueService(options: JobQueueServiceOptions): JobQueueService {
  const { prisma } = options;
  const now = options.now ?? (() => new Date());

  function toDto(row: {
    id: string;
    type: string;
    payload: Prisma.JsonValue;
    status: string;
    priority: number;
    attempts: number;
    maxAttempts: number;
    scheduledAt: Date;
    lockedAt: Date | null;
    lockedBy: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    lastError: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): JobDto {
    return {
      id: row.id,
      type: row.type,
      payload: row.payload,
      status: row.status as JobStatus,
      priority: row.priority,
      attempts: row.attempts,
      maxAttempts: row.maxAttempts,
      scheduledAt: row.scheduledAt.toISOString(),
      lockedAt: row.lockedAt?.toISOString() ?? null,
      lockedBy: row.lockedBy,
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      lastError: row.lastError,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async function enqueue(input: {
    type: string;
    payload?: Record<string, unknown> | undefined;
    runAt?: Date | undefined;
    maxAttempts?: number | undefined;
    priority?: number | undefined;
  }): Promise<JobDto> {
    if (!TYPE_PATTERN.test(input.type)) {
      throw new ContentError('VALIDATION_ERROR', 'Invalid job type.', 400);
    }
    const payload = input.payload ?? {};
    if (JSON.stringify(payload).length > MAX_PAYLOAD_BYTES) {
      throw new ContentError('CONTENT_TOO_LARGE', 'Job payload is too large.', 413);
    }
    const maxAttempts = input.maxAttempts ?? 3;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
      throw new ContentError('VALIDATION_ERROR', 'maxAttempts must be 1-10.', 400);
    }
    const priority = input.priority ?? 0;
    if (!Number.isInteger(priority) || priority < -100 || priority > 100) {
      throw new ContentError('VALIDATION_ERROR', 'priority must be -100-100.', 400);
    }
    const row = await prisma.job.create({
      data: {
        type: input.type,
        payload: payload as Prisma.InputJsonValue,
        scheduledAt: input.runAt ?? now(),
        maxAttempts,
        priority,
      },
    });
    return toDto(row);
  }

  async function list(principal: Principal, query: JobListQuery) {
    requireCapability(principal, 'manage_options');
    const where: Prisma.JobWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.search) {
      where.type = { contains: query.search, mode: 'insensitive' };
    }
    const [rows, total] = await prisma.$transaction([
      prisma.job.findMany({
        where,
        orderBy: [{ scheduledAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
      prisma.job.count({ where }),
    ]);
    return {
      items: rows.map(toDto),
      pagination: {
        page: query.page,
        perPage: query.perPage,
        total,
        totalPages: Math.ceil(total / query.perPage),
      },
    };
  }

  async function reschedule(principal: Principal, id: string): Promise<JobDto> {
    requireCapability(principal, 'manage_options');
    const existing = await prisma.job.findUnique({ where: { id } });
    if (!existing) throw new ContentError('NOT_FOUND', 'Not found', 404);
    if (existing.status === 'RUNNING') {
      throw new ContentError('JOB_RUNNING', 'This job is running; wait for it to finish.', 409);
    }
    const updated = await prisma.job.update({
      where: { id },
      data: {
        status: 'PENDING',
        scheduledAt: now(),
        attempts: 0,
        lockedAt: null,
        lockedBy: null,
        startedAt: null,
        completedAt: null,
        lastError: null,
      },
    });
    return toDto(updated);
  }

  async function cancel(principal: Principal, id: string): Promise<JobDto> {
    requireCapability(principal, 'manage_options');
    const existing = await prisma.job.findUnique({ where: { id } });
    if (!existing) throw new ContentError('NOT_FOUND', 'Not found', 404);
    if (existing.status !== 'PENDING' && existing.status !== 'FAILED') {
      throw new ContentError(
        'JOB_NOT_CANCELLABLE',
        'Only pending or failed jobs can be cancelled.',
        409,
      );
    }
    const updated = await prisma.job.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        lockedAt: null,
        lockedBy: null,
        completedAt: now(),
      },
    });
    return toDto(updated);
  }

  async function hasActive(type: string): Promise<boolean> {
    const row = await prisma.job.findFirst({
      where: { type, status: { in: ['PENDING', 'RUNNING'] } },
      select: { id: true },
    });
    return row !== null;
  }

  async function claimDue(limit: number, workerId: string): Promise<ClaimedJob[]> {
    const at = now();
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        type: string;
        payload: Prisma.JsonValue;
        attempts: number;
        max_attempts: number;
      }>
    >(Prisma.sql`
      UPDATE "jobs"
      SET "status" = 'RUNNING',
          "locked_at" = ${at},
          "locked_by" = ${workerId},
          "started_at" = ${at},
          "attempts" = "attempts" + 1,
          "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" IN (
        SELECT "id" FROM "jobs"
        WHERE "status" = 'PENDING' AND "scheduled_at" <= ${at}
        ORDER BY "priority" DESC, "scheduled_at" ASC, "id" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id", "type", "payload", "attempts", "max_attempts"
    `);
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      payload: row.payload,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
    }));
  }

  async function complete(id: string): Promise<void> {
    await prisma.job.updateMany({
      where: { id, status: 'RUNNING' },
      data: {
        status: 'COMPLETED',
        completedAt: now(),
        lockedAt: null,
        lockedBy: null,
        lastError: null,
      },
    });
  }

  async function fail(job: ClaimedJob, error: string): Promise<void> {
    const at = now();
    const message = truncateError(error);
    if (job.attempts >= job.maxAttempts) {
      await prisma.job.updateMany({
        where: { id: job.id, status: 'RUNNING' },
        data: {
          status: 'FAILED',
          completedAt: at,
          lockedAt: null,
          lockedBy: null,
          lastError: message,
        },
      });
      return;
    }
    const retryAt = new Date(at.getTime() + retryDelaySeconds(job.attempts) * 1000);
    await prisma.job.updateMany({
      where: { id: job.id, status: 'RUNNING' },
      data: {
        status: 'PENDING',
        scheduledAt: retryAt,
        lockedAt: null,
        lockedBy: null,
        startedAt: null,
        lastError: message,
      },
    });
  }

  async function recoverStuck(olderThan: Date): Promise<number> {
    const result = await prisma.job.updateMany({
      where: { status: 'RUNNING', lockedAt: { lt: olderThan } },
      data: {
        status: 'PENDING',
        lockedAt: null,
        lockedBy: null,
        startedAt: null,
        lastError: 'Worker stopped before completion; retrying.',
      },
    });
    return result.count;
  }

  async function pruneHistory(completedDays = 7, failedDays = 30): Promise<number> {
    const at = now();
    const completedCutoff = new Date(at.getTime() - completedDays * 24 * 60 * 60 * 1000);
    const failedCutoff = new Date(at.getTime() - failedDays * 24 * 60 * 60 * 1000);
    const [done, failed] = await prisma.$transaction([
      prisma.job.deleteMany({
        where: {
          status: { in: ['COMPLETED', 'CANCELLED'] },
          completedAt: { lt: completedCutoff },
        },
      }),
      prisma.job.deleteMany({
        where: { status: 'FAILED', completedAt: { lt: failedCutoff } },
      }),
    ]);
    return done.count + failed.count;
  }

  return {
    enqueue,
    list,
    reschedule,
    cancel,
    hasActive,
    claimDue,
    complete,
    fail,
    recoverStuck,
    pruneHistory,
  };
}

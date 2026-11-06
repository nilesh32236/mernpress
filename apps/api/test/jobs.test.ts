import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createJobQueueService, type JobHandler } from '@mernpress/cms-core';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  loginAs,
  seedAdmin,
  seedUser,
} from './helpers/auth.js';
import { createJobHandlers } from '../src/jobs/handlers.js';
import { createJobWorker } from '../src/jobs/worker.js';
import { JOB_TYPES } from '../src/jobs/types.js';

let app: FastifyInstance;
let cookieHeader: string;
let csrfToken: string;
let clock: Date;

const silentLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

beforeEach(async () => {
  app = await createTestApp();
  await seedAdmin(app);
  const session = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
  cookieHeader = session.cookieHeader;
  csrfToken = session.csrfToken;
  clock = new Date('2026-11-06T12:00:00.000Z');
});

afterEach(async () => {
  await app.close();
});

function adminHeaders(): Record<string, string> {
  return {
    cookie: cookieHeader,
    'x-csrf-token': csrfToken,
    origin: ADMIN_ORIGIN,
    'content-type': 'application/json',
  };
}

describe('durable job queue', () => {
  it('claims due jobs once, in priority order, and completes them', async () => {
    const queue = createJobQueueService({ prisma: app.database, now: () => clock });
    const low = await queue.enqueue({ type: 'test.low', priority: 0 });
    const high = await queue.enqueue({ type: 'test.high', priority: 5 });

    const first = await queue.claimDue(1, 'worker-a');
    expect(first).toHaveLength(1);
    expect(first[0]?.id).toBe(high.id);
    expect(first[0]?.attempts).toBe(1);

    const second = await queue.claimDue(10, 'worker-b');
    expect(second.map((job) => job.id)).toEqual([low.id]);

    await queue.complete(first[0]!.id);
    const row = await app.database.job.findUniqueOrThrow({ where: { id: high.id } });
    expect(row.status).toBe('COMPLETED');
    expect(row.completedAt).not.toBeNull();
    expect(row.lockedAt).toBeNull();
  });

  it('retries with backoff and marks the job failed after maxAttempts', async () => {
    const queue = createJobQueueService({ prisma: app.database, now: () => clock });
    const enqueued = await queue.enqueue({ type: 'test.retry', maxAttempts: 2 });

    const first = await queue.claimDue(1, 'worker-a');
    await queue.fail(first[0]!, 'temporary failure');
    let row = await app.database.job.findUniqueOrThrow({ where: { id: enqueued.id } });
    expect(row.status).toBe('PENDING');
    expect(row.attempts).toBe(1);
    expect(row.lastError).toContain('temporary failure');
    expect(row.scheduledAt.getTime()).toBe(clock.getTime() + 30_000);

    clock = new Date(clock.getTime() + 31_000);
    const second = await queue.claimDue(1, 'worker-b');
    expect(second[0]?.attempts).toBe(2);
    await queue.fail(second[0]!, 'still broken');
    row = await app.database.job.findUniqueOrThrow({ where: { id: enqueued.id } });
    expect(row.status).toBe('FAILED');
    expect(row.completedAt).not.toBeNull();
    expect(row.lastError).toContain('still broken');
  });

  it('returns stale RUNNING jobs to the queue and reports active jobs', async () => {
    const queue = createJobQueueService({ prisma: app.database, now: () => clock });
    const enqueued = await queue.enqueue({ type: 'test.stale' });
    expect(await queue.hasActive('test.stale')).toBe(true);
    await queue.claimDue(1, 'worker-a');

    clock = new Date(clock.getTime() + 11 * 60 * 1000);
    const recovered = await queue.recoverStuck(new Date(clock.getTime() - 10 * 60 * 1000));
    expect(recovered).toBe(1);
    const row = await app.database.job.findUniqueOrThrow({ where: { id: enqueued.id } });
    expect(row.status).toBe('PENDING');
    expect(row.lockedAt).toBeNull();
    expect(row.lastError).toContain('Worker stopped');
  });

  it('runs handlers, records a missing handler and retries a throwing handler', async () => {
    const queue = createJobQueueService({ prisma: app.database, now: () => clock });
    const ok = await queue.enqueue({ type: 'test.ok' });
    const bad = await queue.enqueue({ type: 'test.bad', maxAttempts: 1 });
    const missing = await queue.enqueue({ type: 'test.missing', maxAttempts: 1 });
    let handled = 0;
    const handlers: Record<string, JobHandler> = {
      'test.ok': async () => {
        handled += 1;
      },
      'test.bad': async () => {
        throw new Error('handler exploded');
      },
    };

    const worker = createJobWorker({
      queue,
      handlers,
      logger: silentLogger,
      workerId: 'test-worker',
      now: () => clock,
    });
    const result = await worker.tick();
    expect(result).toEqual({ claimed: 3, completed: 1, failed: 2 });
    expect(handled).toBe(1);

    const rows = await app.database.job.findMany({ orderBy: { type: 'asc' } });
    expect(rows.find((row) => row.id === ok.id)?.status).toBe('COMPLETED');
    expect(rows.find((row) => row.id === bad.id)?.status).toBe('FAILED');
    expect(rows.find((row) => row.id === missing.id)?.lastError).toContain('No handler');
  });

  it('lists, reschedules and cancels jobs through the admin API', async () => {
    const queue = createJobQueueService({ prisma: app.database, now: () => clock });
    const job = await queue.enqueue({ type: JOB_TYPES.analyticsRetention, runAt: new Date(0) });

    const list = await app.inject({
      method: 'GET',
      url: '/api/admin/jobs?status=PENDING&search=analytics',
      headers: { cookie: cookieHeader },
    });
    expect(list.statusCode).toBe(200);
    const body = list.json() as { items: Array<{ id: string }>; pagination: { total: number } };
    expect(body.pagination.total).toBe(1);
    expect(body.items[0]?.id).toBe(job.id);

    const cancelled = await app.inject({
      method: 'POST',
      url: `/api/admin/jobs/${job.id}/cancel`,
      headers: adminHeaders(),
      payload: {},
    });
    expect(cancelled.statusCode).toBe(200);
    expect((cancelled.json() as { status: string }).status).toBe('CANCELLED');

    const run = await app.inject({
      method: 'POST',
      url: `/api/admin/jobs/${job.id}/run`,
      headers: adminHeaders(),
      payload: {},
    });
    expect(run.statusCode).toBe(200);
    expect((run.json() as { status: string }).status).toBe('PENDING');
    expect((run.json() as { attempts: number }).attempts).toBe(0);
  });

  it('rejects job administration for non-administrators', async () => {
    await seedUser(app, {
      username: 'jobs-subscriber',
      password: 'Subscriber-pass-1!',
      role: 'subscriber',
    });
    const session = await loginAs(app, 'jobs-subscriber', 'Subscriber-pass-1!');
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/jobs',
      headers: { cookie: session.cookieHeader },
    });
    expect(response.statusCode).toBe(403);
  });

  it('runs the retention handlers with the configured windows', async () => {
    const purged: number[] = [];
    const pruned: number[] = [];
    const notes = {
      purgeExpiredTrash: async ({ retentionDays }: { retentionDays: number }) => {
        purged.push(retentionDays);
        return { purged: 2 };
      },
    };
    const analytics = {
      prune: async (days: number) => {
        pruned.push(days);
        return { pruned: 1, retentionDays: days, cutoffDay: '2026-11-01' };
      },
    };
    const handlers = createJobHandlers({
      prisma: app.database,
      notes: notes as never,
      analytics: analytics as never,
      jobs: { pruneHistory: async () => 0 } as never,
    });

    await handlers[JOB_TYPES.notesRetention]?.({} as never);
    await handlers[JOB_TYPES.analyticsRetention]?.({} as never);
    expect(purged).toEqual([30]);
    expect(pruned).toEqual([90]);
  });
  it('prunes old completed and failed history without touching recent rows', async () => {
    const queue = createJobQueueService({ prisma: app.database, now: () => clock });
    const day = 24 * 60 * 60 * 1000;
    const oldCompleted = await app.database.job.create({
      data: {
        type: 'test.old_completed',
        status: 'COMPLETED',
        completedAt: new Date(clock.getTime() - 8 * day),
      },
    });
    const oldFailed = await app.database.job.create({
      data: {
        type: 'test.old_failed',
        status: 'FAILED',
        completedAt: new Date(clock.getTime() - 31 * day),
      },
    });
    const recent = await app.database.job.create({
      data: {
        type: 'test.recent',
        status: 'COMPLETED',
        completedAt: new Date(clock.getTime() - 2 * day),
      },
    });

    const pruned = await queue.pruneHistory();
    expect(pruned).toBe(2);
    const remaining = await app.database.job.findMany({ select: { id: true } });
    expect(remaining.map((row) => row.id)).toEqual([recent.id]);
    expect(remaining.some((row) => row.id === oldCompleted.id)).toBe(false);
    expect(remaining.some((row) => row.id === oldFailed.id)).toBe(false);
  });
});

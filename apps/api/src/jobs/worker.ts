import type { FastifyInstance } from 'fastify';
import type { JobHandler, JobQueueService } from '@mernpress/cms-core';

export interface JobWorkerLogger {
  info(meta: Record<string, unknown>, message: string): void;
  warn(meta: Record<string, unknown>, message: string): void;
  error(meta: Record<string, unknown>, message: string): void;
}

export interface JobWorkerOptions {
  queue: JobQueueService;
  handlers: Record<string, JobHandler>;
  logger: JobWorkerLogger;
  workerId?: string | undefined;
  /** Claim batch size per tick. Default 10. */
  batchSize?: number | undefined;
  /** Tick interval. Default 15 s. */
  intervalMs?: number | undefined;
  /** Delay before the first tick so startup work finishes. Default 3 s. */
  bootDelayMs?: number | undefined;
  /** A RUNNING row older than this is returned to PENDING. Default 10 min. */
  stuckAfterMs?: number | undefined;
  now?: (() => Date) | undefined;
}

export interface JobWorker {
  /** Process one batch; exposed for tests. Safe to call concurrently (guard). */
  tick(): Promise<{ claimed: number; completed: number; failed: number }>;
  start(): void;
  stop(): void;
}

const EMPTY = { claimed: 0, completed: 0, failed: 0 };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Durable job worker (ADR 0054).
 *
 * One tick recovers stale RUNNING rows, claims a batch with SKIP LOCKED and
 * runs each registered handler. A handler failure is recorded by the queue,
 * which schedules a backoff retry or marks the job FAILED after maxAttempts.
 * The worker never throws into the timer loop.
 */
export function createJobWorker(options: JobWorkerOptions): JobWorker {
  const {
    queue,
    handlers,
    logger,
    intervalMs = 15_000,
    batchSize = 10,
    bootDelayMs = 3_000,
    stuckAfterMs = 10 * 60 * 1000,
  } = options;
  const now = options.now ?? (() => new Date());
  const workerId =
    options.workerId ?? `api-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  let running = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let boot: ReturnType<typeof setTimeout> | null = null;

  async function tick(): Promise<{ claimed: number; completed: number; failed: number }> {
    if (running) return EMPTY;
    running = true;
    try {
      const recovered = await queue.recoverStuck(new Date(now().getTime() - stuckAfterMs));
      if (recovered > 0) {
        logger.warn({ recovered }, 'stale background jobs returned to the queue');
      }
      const jobs = await queue.claimDue(batchSize, workerId);
      let completed = 0;
      let failed = 0;
      for (const job of jobs) {
        const handler = handlers[job.type];
        if (!handler) {
          await queue.fail(job, `No handler registered for job type "${job.type}".`);
          failed += 1;
          logger.error(
            { jobId: job.id, type: job.type, attempts: job.attempts },
            'background job has no handler',
          );
          continue;
        }
        // Keep the lock fresh while long handlers run, otherwise stale-lock
        // recovery requeues the job and a second worker executes it again.
        const heartbeatMs = Math.max(1_000, Math.floor(stuckAfterMs / 4));
        const heartbeat = setInterval(() => {
          void queue.touch(job.id).catch(() => undefined);
        }, heartbeatMs);
        heartbeat.unref?.();
        try {
          await handler(job.payload);
          await queue.complete(job.id);
          completed += 1;
          logger.info(
            { jobId: job.id, type: job.type, attempts: job.attempts },
            'background job completed',
          );
        } catch (error) {
          failed += 1;
          await queue.fail(job, errorMessage(error));
          logger.error(
            { jobId: job.id, type: job.type, attempts: job.attempts, err: error },
            'background job failed',
          );
        } finally {
          clearInterval(heartbeat);
        }
      }
      return { claimed: jobs.length, completed, failed };
    } finally {
      running = false;
    }
  }

  function start(): void {
    if (timer !== null) return;
    boot = setTimeout(() => {
      void tick().catch((error) => logger.error({ err: error }, 'background job tick failed'));
    }, bootDelayMs);
    boot.unref();
    timer = setInterval(() => {
      void tick().catch((error) => logger.error({ err: error }, 'background job tick failed'));
    }, intervalMs);
    timer.unref();
  }

  function stop(): void {
    if (boot !== null) clearTimeout(boot);
    if (timer !== null) clearInterval(timer);
    boot = null;
    timer = null;
  }

  return { tick, start, stop };
}

/** Start the worker and stop it when the Fastify app closes. */
export function startJobWorker(
  app: FastifyInstance,
  options: Omit<JobWorkerOptions, 'logger'>,
): void {
  const worker = createJobWorker({ ...options, logger: app.log });
  worker.start();
  app.addHook('onClose', async () => worker.stop());
}

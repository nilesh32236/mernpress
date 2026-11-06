import type { JobQueueService, ScheduleService } from '@mernpress/cms-core';
import type { FastifyInstance } from 'fastify';
import { JOB_TYPES } from './jobs/types.js';

/**
 * In-process schedulers (ADR 0008 §4, ADR 0045, ADR 0054).
 *
 * - publish: promotes due scheduled posts every minute (the claim is the lock).
 * - retention: enqueues durable `notes.retention` (6 h) and
 *   `analytics.retention` (24 h) jobs instead of running the sweeps here. The
 *   job row survives a restart and the worker retries failures, so a crash
 *   between intervals no longer loses the window.
 *
 * All are disabled via SCHEDULER_ENABLED=false (tests, unsynchronized
 * multi-instance deployments). Notes and analytics also have operator CLIs.
 */

const PUBLISH_INTERVAL_MS = 60_000;
const PUBLISH_BOOT_DELAY_MS = 2_000;
const NOTES_INTERVAL_MS = 6 * 60 * 60 * 1000;
const NOTES_BOOT_DELAY_MS = 8_000;
const ANALYTICS_INTERVAL_MS = 24 * 60 * 60 * 1000;
const ANALYTICS_BOOT_DELAY_MS = 15_000;
const JOBS_CLEANUP_BOOT_DELAY_MS = 20_000;

export function startSchedulers(
  app: FastifyInstance,
  options: {
    schedule: ScheduleService;
    jobs: JobQueueService;
  },
): void {
  const { schedule, jobs } = options;
  let publishing = false;
  let enqueueing = false;

  async function sweepPublish(): Promise<void> {
    if (publishing) {
      return;
    }
    publishing = true;
    try {
      const result = await schedule.publishDueScheduled();
      if (result.published.length > 0) {
        app.log.info({ postIds: result.published }, 'scheduled posts published');
      }
    } catch (error) {
      app.log.error({ err: error }, 'publish scheduler sweep failed');
    } finally {
      publishing = false;
    }
  }

  async function enqueueRetention(type: string): Promise<void> {
    if (enqueueing) return;
    enqueueing = true;
    try {
      // One pending/running job per type is enough; the worker owns execution.
      if (await jobs.hasActive(type)) return;
      await jobs.enqueue({ type });
      app.log.info({ type }, 'background retention job enqueued');
    } catch (error) {
      app.log.error({ err: error, type }, 'failed to enqueue retention job');
    } finally {
      enqueueing = false;
    }
  }

  const publishTimer = setInterval(() => void sweepPublish(), PUBLISH_INTERVAL_MS);
  publishTimer.unref();
  const publishBoot = setTimeout(() => void sweepPublish(), PUBLISH_BOOT_DELAY_MS);
  publishBoot.unref();

  const notesTimer = setInterval(
    () => void enqueueRetention(JOB_TYPES.notesRetention),
    NOTES_INTERVAL_MS,
  );
  notesTimer.unref();
  const notesBoot = setTimeout(
    () => void enqueueRetention(JOB_TYPES.notesRetention),
    NOTES_BOOT_DELAY_MS,
  );
  notesBoot.unref();

  const cleanupTimer = setInterval(
    () => void enqueueRetention(JOB_TYPES.jobsCleanup),
    ANALYTICS_INTERVAL_MS,
  );
  cleanupTimer.unref();
  const cleanupBoot = setTimeout(
    () => void enqueueRetention(JOB_TYPES.jobsCleanup),
    JOBS_CLEANUP_BOOT_DELAY_MS,
  );
  cleanupBoot.unref();

  const analyticsTimer = setInterval(
    () => void enqueueRetention(JOB_TYPES.analyticsRetention),
    ANALYTICS_INTERVAL_MS,
  );
  analyticsTimer.unref();
  const analyticsBoot = setTimeout(
    () => void enqueueRetention(JOB_TYPES.analyticsRetention),
    ANALYTICS_BOOT_DELAY_MS,
  );
  analyticsBoot.unref();

  app.addHook('onClose', async () => {
    clearInterval(publishTimer);
    clearTimeout(publishBoot);
    clearInterval(notesTimer);
    clearTimeout(notesBoot);
    clearInterval(analyticsTimer);
    clearTimeout(analyticsBoot);
    clearInterval(cleanupTimer);
    clearTimeout(cleanupBoot);
  });
}

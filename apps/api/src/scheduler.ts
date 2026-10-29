import type { FastifyInstance } from 'fastify';
import type { ScheduleService } from '@mernpress/cms-core';

/**
 * First-publish scheduling sweeper (P8-04, ADR 0008 §4).
 *
 * Single in-process interval: claims due rows atomically (the claim is the
 * lock) and promotes them through the same lifecycle action as a manual
 * publish. Runs a boot catch-up shortly after start so downtime does not
 * strand overdue content. Disabled via SCHEDULER_ENABLED=false (tests,
 * unsynchronized multi-instance deployments).
 */

const SWEEP_INTERVAL_MS = 60_000;
const BOOT_CATCHUP_DELAY_MS = 2_000;

export function startPublishScheduler(
  app: FastifyInstance,
  options: { schedule: ScheduleService },
): void {
  const { schedule } = options;
  let running = false;

  async function sweep(): Promise<void> {
    if (running) {
      return;
    }
    running = true;
    try {
      const result = await schedule.publishDueScheduled();
      if (result.published.length > 0) {
        app.log.info({ postIds: result.published }, 'scheduled posts published');
      }
    } catch (error) {
      app.log.error({ err: error }, 'publish scheduler sweep failed');
    } finally {
      running = false;
    }
  }

  const timer = setInterval(() => void sweep(), SWEEP_INTERVAL_MS);
  timer.unref();
  const boot = setTimeout(() => void sweep(), BOOT_CATCHUP_DELAY_MS);
  boot.unref();

  app.addHook('onClose', async () => {
    clearInterval(timer);
    clearTimeout(boot);
  });
}

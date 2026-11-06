import {
  ANALYTICS_RETENTION_DEFAULT_DAYS,
  ANALYTICS_RETENTION_MAX_DAYS,
} from '@mernpress/contracts';
import type { AnalyticsService, NoteService, ScheduleService } from '@mernpress/cms-core';
import type { DatabaseClient } from '@mernpress/database';
import type { FastifyInstance } from 'fastify';

/**
 * In-process background sweeps (ADR 0008 §4, ADR 0045).
 *
 * - publish: promotes due scheduled posts every minute (the claim is the lock).
 * - notes: permanently removes editor notes that have been in the trash past
 *   the configured retention window. Runs every six hours, with a boot catch-up
 *   so downtime does not postpone retention indefinitely.
 * - analytics: deletes aggregate `analytics_daily` rows older than the privacy
 *   retention window. Runs daily with a boot catch-up (rows hold no visitor
 *   identifiers; only counts are logged).
 *
 * All are disabled via SCHEDULER_ENABLED=false (tests, unsynchronized
 * multi-instance deployments). Notes and analytics also have operator CLIs.
 */

const PUBLISH_INTERVAL_MS = 60_000;
const PUBLISH_BOOT_DELAY_MS = 2_000;
const TRASH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const TRASH_BOOT_DELAY_MS = 8_000;
const DEFAULT_TRASH_RETENTION_DAYS = 30;
const ANALYTICS_INTERVAL_MS = 24 * 60 * 60 * 1000;
const ANALYTICS_BOOT_DELAY_MS = 15_000;

export function startSchedulers(
  app: FastifyInstance,
  options: {
    schedule: ScheduleService;
    notes: NoteService;
    analytics: AnalyticsService;
    prisma: DatabaseClient;
  },
): void {
  const { schedule, notes, analytics, prisma } = options;
  let publishing = false;
  let sweeping = false;
  let pruning = false;

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

  /**
   * Read a non-negative integer option. A missing row or unparseable value
   * falls back to the default; a failed *query* returns null so the sweep is
   * skipped instead of pruning with a guessed window.
   */
  async function optionNumber(key: string, fallback: number, max: number): Promise<number | null> {
    let row: { value: string } | null;
    try {
      row = await prisma.option.findUnique({ where: { key }, select: { value: true } });
    } catch {
      return null;
    }
    if (!row) return fallback;
    try {
      const parsed: unknown = JSON.parse(row.value);
      if (typeof parsed === 'number' && Number.isInteger(parsed) && parsed >= 0 && parsed <= max) {
        return parsed;
      }
    } catch {
      // Corrupt stored value: use the default.
    }
    return fallback;
  }

  async function retentionDays(): Promise<number | null> {
    return optionNumber('notes_trash_retention_days', DEFAULT_TRASH_RETENTION_DAYS, 365);
  }

  async function analyticsRetentionDays(): Promise<number | null> {
    return optionNumber(
      'analytics_retention_days',
      ANALYTICS_RETENTION_DEFAULT_DAYS,
      ANALYTICS_RETENTION_MAX_DAYS,
    );
  }

  async function sweepTrash(): Promise<void> {
    if (sweeping) {
      return;
    }
    sweeping = true;
    try {
      const days = await retentionDays();
      if (days === null) {
        app.log.warn('note trash sweep skipped: retention option read failed');
        return;
      }
      const result = await notes.purgeExpiredTrash({ retentionDays: days });
      if (result.purged > 0) {
        app.log.info({ purged: result.purged }, 'expired note trash purged');
      }
    } catch (error) {
      app.log.error({ err: error }, 'note trash sweep failed');
    } finally {
      sweeping = false;
    }
  }

  async function sweepAnalytics(): Promise<void> {
    if (pruning) {
      return;
    }
    pruning = true;
    try {
      const days = await analyticsRetentionDays();
      if (days === null) {
        app.log.warn('analytics retention sweep skipped: option read failed');
        return;
      }
      const result = await analytics.prune(days);
      if (result.pruned > 0) {
        app.log.info(
          {
            pruned: result.pruned,
            retentionDays: result.retentionDays,
            cutoffDay: result.cutoffDay,
          },
          'analytics retention sweep pruned old rows',
        );
      }
    } catch (error) {
      app.log.error({ err: error }, 'analytics retention sweep failed');
    } finally {
      pruning = false;
    }
  }

  const publishTimer = setInterval(() => void sweepPublish(), PUBLISH_INTERVAL_MS);
  publishTimer.unref();
  const publishBoot = setTimeout(() => void sweepPublish(), PUBLISH_BOOT_DELAY_MS);
  publishBoot.unref();

  const trashTimer = setInterval(() => void sweepTrash(), TRASH_INTERVAL_MS);
  trashTimer.unref();
  const trashBoot = setTimeout(() => void sweepTrash(), TRASH_BOOT_DELAY_MS);
  trashBoot.unref();

  const analyticsTimer = setInterval(() => void sweepAnalytics(), ANALYTICS_INTERVAL_MS);
  analyticsTimer.unref();
  const analyticsBoot = setTimeout(() => void sweepAnalytics(), ANALYTICS_BOOT_DELAY_MS);
  analyticsBoot.unref();

  app.addHook('onClose', async () => {
    clearInterval(publishTimer);
    clearTimeout(publishBoot);
    clearInterval(trashTimer);
    clearTimeout(trashBoot);
    clearInterval(analyticsTimer);
    clearTimeout(analyticsBoot);
  });
}

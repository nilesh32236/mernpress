import type { ScheduleService, NoteService } from '@mernpress/cms-core';
import type { DatabaseClient } from '@mernpress/database';
import type { FastifyInstance } from 'fastify';

/**
 * In-process background sweeps (ADR 0008 §4, ADR 0045).
 *
 * - publish: promotes due scheduled posts every minute (the claim is the lock).
 * - notes: permanently removes editor notes that have been in the trash past
 *   the configured retention window. Runs every six hours, with a boot catch-up
 *   so downtime does not postpone retention indefinitely.
 *
 * Both are disabled via SCHEDULER_ENABLED=false (tests, unsynchronized
 * multi-instance deployments); the notes sweep also has a CLI for operators.
 */

const PUBLISH_INTERVAL_MS = 60_000;
const PUBLISH_BOOT_DELAY_MS = 2_000;
const TRASH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const TRASH_BOOT_DELAY_MS = 8_000;
const DEFAULT_TRASH_RETENTION_DAYS = 30;

export function startSchedulers(
  app: FastifyInstance,
  options: { schedule: ScheduleService; notes: NoteService; prisma: DatabaseClient },
): void {
  const { schedule, notes, prisma } = options;
  let publishing = false;
  let sweeping = false;

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

  async function retentionDays(): Promise<number> {
    try {
      const row = await prisma.option.findUnique({
        where: { key: 'notes_trash_retention_days' },
        select: { value: true },
      });
      if (!row) return DEFAULT_TRASH_RETENTION_DAYS;
      const parsed: unknown = JSON.parse(row.value);
      if (typeof parsed === 'number' && Number.isInteger(parsed) && parsed >= 0 && parsed <= 365) {
        return parsed;
      }
    } catch {
      // A corrupt option read falls back to the default.
    }
    return DEFAULT_TRASH_RETENTION_DAYS;
  }

  async function sweepTrash(): Promise<void> {
    if (sweeping) {
      return;
    }
    sweeping = true;
    try {
      const result = await notes.purgeExpiredTrash({ retentionDays: await retentionDays() });
      if (result.purged > 0) {
        app.log.info({ purged: result.purged }, 'expired note trash purged');
      }
    } catch (error) {
      app.log.error({ err: error }, 'note trash sweep failed');
    } finally {
      sweeping = false;
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

  app.addHook('onClose', async () => {
    clearInterval(publishTimer);
    clearTimeout(publishBoot);
    clearInterval(trashTimer);
    clearTimeout(trashBoot);
  });
}

import { openMailMessage } from '@mernpress/cms-core';
import type {
  AnalyticsService,
  BackupService,
  JobHandler,
  JobQueueService,
  MailService,
  MediaService,
  NoteService,
} from '@mernpress/cms-core';
import type { DatabaseClient } from '@mernpress/database';
import {
  ANALYTICS_RETENTION_DEFAULT_DAYS,
  ANALYTICS_RETENTION_MAX_DAYS,
} from '@mernpress/contracts';
import { JOB_TYPES } from './types.js';

const DEFAULT_TRASH_RETENTION_DAYS = 30;

interface HandlerOptions {
  prisma: DatabaseClient;
  notes: NoteService;
  analytics: AnalyticsService;
  jobs: JobQueueService;
  backups: BackupService;
  media: MediaService;
  mail: MailService;
  /** Secret used to open the sealed mail payload (AUTH_HASH_PEPPER). */
  mailSecret: string;
  logger?: { info(meta: Record<string, unknown>, message: string): void } | undefined;
}

/**
 * Read a non-negative integer option. A missing row or unparseable value uses
 * the default; a failed query throws so the queue retries the job instead of
 * running a sweep with a guessed window.
 */
async function optionNumber(
  prisma: DatabaseClient,
  key: string,
  fallback: number,
  max: number,
): Promise<number> {
  const row = await prisma.option.findUnique({ where: { key }, select: { value: true } });
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

/** Handlers registered with the durable worker (ADR 0054). */
export function createJobHandlers(options: HandlerOptions): Record<string, JobHandler> {
  const { prisma, notes, analytics, jobs, backups, media, mail, mailSecret, logger } = options;

  return {
    [JOB_TYPES.mailSend]: async (payload) => {
      const message = openMailMessage(payload, mailSecret);
      const result = await mail.sendDirect(message);
      if (!result.sent) {
        throw new Error(`Mail delivery failed: ${result.reason ?? 'unknown'}`);
      }
      logger?.info({ to: message.to, subject: message.subject }, 'queued mail delivered');
    },
    [JOB_TYPES.backupCreate]: async () => {
      const result = await backups.createSystem();
      logger?.info({ backups: result.backups.length }, 'backup created');
    },
    [JOB_TYPES.mediaRegenerate]: async (payload) => {
      const raw = payload as { folderId?: unknown } | null;
      if (
        raw !== null &&
        typeof raw === 'object' &&
        raw.folderId !== undefined &&
        raw.folderId !== null &&
        typeof raw.folderId !== 'string'
      ) {
        throw new Error('Invalid media.regenerate folderId payload.');
      }
      const folderId =
        raw && typeof raw === 'object' && 'folderId' in raw
          ? (raw.folderId as string | null)
          : undefined;
      let after: string | undefined;
      let processed = 0;
      let failed = 0;
      for (let batch = 0; batch < 10_000; batch += 1) {
        const result = await media.regenerateDerivativesSystem({
          ...(folderId === undefined ? {} : { folderId }),
          ...(after ? { after } : {}),
          limit: 20,
        });
        processed += result.processed;
        failed += result.failed;
        if (!result.nextAfter) break;
        if (result.nextAfter === after) {
          throw new Error('Media regeneration cursor did not advance.');
        }
        after = result.nextAfter;
      }
      logger?.info(
        { processed, failed, folderId: folderId ?? null },
        'media derivatives regenerated',
      );
      if (failed > 0) {
        throw new Error(
          `${failed} image(s) could not be regenerated; see the API log for item ids.`,
        );
      }
    },
    [JOB_TYPES.notesRetention]: async () => {
      const days = await optionNumber(
        prisma,
        'notes_trash_retention_days',
        DEFAULT_TRASH_RETENTION_DAYS,
        365,
      );
      const result = await notes.purgeExpiredTrash({ retentionDays: days });
      if (result.purged > 0) {
        logger?.info({ purged: result.purged, retentionDays: days }, 'expired note trash purged');
      }
    },
    [JOB_TYPES.jobsCleanup]: async () => {
      const pruned = await jobs.pruneHistory();
      if (pruned > 0) {
        logger?.info({ pruned }, 'old background job rows pruned');
      }
    },
    [JOB_TYPES.analyticsRetention]: async () => {
      const days = await optionNumber(
        prisma,
        'analytics_retention_days',
        ANALYTICS_RETENTION_DEFAULT_DAYS,
        ANALYTICS_RETENTION_MAX_DAYS,
      );
      const result = await analytics.prune(days);
      if (result.pruned > 0) {
        logger?.info(
          {
            pruned: result.pruned,
            vitalsPruned: result.vitalsPruned,
            retentionDays: result.retentionDays,
            cutoffDay: result.cutoffDay,
          },
          'analytics retention sweep pruned old rows',
        );
      }
    },
  };
}

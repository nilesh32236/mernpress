import { createNoteService } from '@mernpress/cms-core';
import { createDatabaseClient } from '@mernpress/database';
import { loadEnv } from '../config/env.js';

/**
 * Operator command: permanently delete editor notes that have been in the trash
 * longer than the retention window (ADR 0045).
 *
 * The API's scheduler runs the same sweep every six hours when
 * SCHEDULER_ENABLED=true; this CLI exists for deployments with the scheduler
 * off, for an immediate run after changing the option, and for cron operators.
 *
 * Usage:
 *   pnpm --filter @mernpress/api notes:purge-trash
 *   pnpm --filter @mernpress/api notes:purge-trash -- --days 7
 *
 * `--days 0` disables the sweep. Without `--days`, the command reads
 * `notes_trash_retention_days` (default 30).
 */

const DEFAULT_RETENTION_DAYS = 30;

function parseDays(argv: string[]): number | null {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      console.log(
        [
          'Usage: pnpm --filter @mernpress/api notes:purge-trash [-- --days N]',
          '',
          'Permanently deletes notes trashed longer than the retention window.',
          'N must be 0-365; 0 disables the sweep. Without --days the',
          'notes_trash_retention_days option (default 30) is used.',
        ].join('\n'),
      );
      return null;
    }
    if (argument === '--days' || argument?.startsWith('--days=')) {
      const raw = argument.includes('=') ? argument.slice('--days='.length) : argv[index + 1];
      if (!raw || raw.startsWith('--')) throw new Error('--days requires a value');
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 0 || value > 365) {
        throw new Error('--days must be an integer between 0 and 365');
      }
      return value;
    }
    if (argument !== '--') {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return null;
}

async function main(): Promise<void> {
  const override = parseDays(process.argv.slice(2));
  if (override === null && process.argv.some((arg) => arg === '--help' || arg === '-h')) {
    return;
  }

  const env = loadEnv();
  const prisma = createDatabaseClient({ connectionString: env.DATABASE_URL });
  try {
    let days = override;
    if (days === null) {
      const row = await prisma.option.findUnique({
        where: { key: 'notes_trash_retention_days' },
        select: { value: true },
      });
      days = DEFAULT_RETENTION_DAYS;
      if (row) {
        try {
          const parsed: unknown = JSON.parse(row.value);
          if (
            typeof parsed === 'number' &&
            Number.isInteger(parsed) &&
            parsed >= 0 &&
            parsed <= 365
          ) {
            days = parsed;
          }
        } catch {
          // Corrupt option: keep the default.
        }
      }
    }

    if (days === 0) {
      console.log('notes_trash_retention_days is 0 (automatic purge disabled); nothing to do.');
      return;
    }

    const notes = createNoteService({ prisma });
    const result = await notes.purgeExpiredTrash({ retentionDays: days });
    console.log(`Purged ${result.purged} note(s) trashed longer than ${days} day(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(`Failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});

import {
  ANALYTICS_RETENTION_DEFAULT_DAYS,
  ANALYTICS_RETENTION_MAX_DAYS,
} from '@mernpress/contracts';
import { createAnalyticsService } from '@mernpress/cms-core';
import { createDatabaseClient } from '@mernpress/database';
import { loadEnv } from '../config/env.js';

/**
 * Operator command: delete aggregate analytics rows older than the retention
 * window (ADR 0049). The API scheduler runs the same sweep daily when
 * SCHEDULER_ENABLED=true; this CLI covers scheduler-less deployments and an
 * immediate run after changing the option.
 *
 * Usage:
 *   pnpm --filter @mernpress/api analytics:prune
 *   pnpm --filter @mernpress/api analytics:prune -- --days 30
 *
 * `--days 0` disables the sweep. Without `--days`, the command reads
 * `analytics_retention_days` (default 90).
 */

function parseDays(argv: string[]): number | null {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      console.log(
        [
          'Usage: pnpm --filter @mernpress/api analytics:prune [-- --days N]',
          '',
          'Deletes aggregate analytics rows older than the retention window.',
          'N must be 0-3650; 0 disables the sweep. Without --days the',
          'analytics_retention_days option (default 90) is used.',
        ].join('\n'),
      );
      return null;
    }
    if (argument === '--days' || argument?.startsWith('--days=')) {
      const raw = argument.includes('=') ? argument.slice('--days='.length) : argv[index + 1];
      if (!raw || raw.startsWith('--')) throw new Error('--days requires a value');
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 0 || value > ANALYTICS_RETENTION_MAX_DAYS) {
        throw new Error(`--days must be an integer between 0 and ${ANALYTICS_RETENTION_MAX_DAYS}`);
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
        where: { key: 'analytics_retention_days' },
        select: { value: true },
      });
      days = ANALYTICS_RETENTION_DEFAULT_DAYS;
      if (row) {
        try {
          const parsed: unknown = JSON.parse(row.value);
          if (
            typeof parsed === 'number' &&
            Number.isInteger(parsed) &&
            parsed >= 0 &&
            parsed <= ANALYTICS_RETENTION_MAX_DAYS
          ) {
            days = parsed;
          }
        } catch {
          // Corrupt option: keep the default.
        }
      }
    }

    if (days === 0) {
      console.log(
        override === 0
          ? '--days 0 disables pruning; nothing to do.'
          : 'analytics_retention_days is 0 (pruning disabled); nothing to do.',
      );
      return;
    }

    const analytics = createAnalyticsService({ prisma });
    const result = await analytics.prune(days);
    console.log(
      `Pruned ${result.pruned} analytics row(s); keeping ${result.retentionDays} day(s) including today (from ${result.cutoffDay}).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(`Failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});

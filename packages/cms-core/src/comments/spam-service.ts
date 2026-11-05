import type { DatabaseClient } from '@mernpress/database';
import { requireCapability } from '../auth/capabilities.js';
import { ContentError } from '../content/errors.js';
import type { Principal } from '../content/types.js';

/**
 * Settings → Connectors → Spam protection.
 *
 * Manages the bundled, local heuristic guard and reports what it has caught.
 * Akismet is listed but not implemented: it needs an external account, a
 * third-party API call for every comment and owner-supplied credentials, none of
 * which this build has.
 */
export interface SpamGuardSettings {
  enabled: boolean;
  spamThreshold: number;
  moderationThreshold: number;
}

export interface SpamGuardState {
  settings: SpamGuardSettings;
  stats: {
    /** Comments currently in the Spam tab. */
    spam: number;
    /** Comments awaiting moderation. */
    pending: number;
    /** Spam caught in the last seven days. */
    spamLast7Days: number;
  };
  engine: {
    id: 'local-heuristic';
    name: string;
    description: string;
  };
  akismet: {
    available: false;
    reason: string;
  };
}

export interface SpamGuardServiceOptions {
  prisma: DatabaseClient;
  now?: () => Date;
}

const KEYS = {
  enabled: 'spam_guard_enabled',
  spam: 'spam_guard_spam_threshold',
  moderation: 'spam_guard_moderation_threshold',
} as const;

const AKISMET_REASON =
  'Akismet calls an external service and needs an Akismet account and API key. ' +
  'This build makes no third-party comment calls, so it ships the local heuristic guard instead.';

function parse<T>(value: string | undefined, fallback: T): T {
  if (value === undefined) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function createSpamGuardService({
  prisma,
  now = () => new Date(),
}: SpamGuardServiceOptions) {
  async function settings(): Promise<SpamGuardSettings> {
    const rows = await prisma.option.findMany({
      where: { key: { in: Object.values(KEYS) } },
    });
    const byKey = new Map(rows.map((row) => [row.key, row.value]));
    return {
      enabled: parse<boolean>(byKey.get(KEYS.enabled), true),
      spamThreshold: parse<number>(byKey.get(KEYS.spam), 6),
      moderationThreshold: parse<number>(byKey.get(KEYS.moderation), 3),
    };
  }

  async function get(principal: Principal): Promise<SpamGuardState> {
    requireCapability(principal, 'manage_options');
    const [current, spam, pending, spamLast7Days] = await Promise.all([
      settings(),
      prisma.comment.count({ where: { status: 'SPAM' } }),
      prisma.comment.count({ where: { status: 'PENDING' } }),
      prisma.comment.count({
        where: {
          status: 'SPAM',
          createdAt: { gte: new Date(now().getTime() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);
    return {
      settings: current,
      stats: { spam, pending, spamLast7Days },
      engine: {
        id: 'local-heuristic',
        name: 'Bundled heuristic guard',
        description:
          'Scores every comment locally for links, spam phrases, disposable email domains, ' +
          'shouting, obfuscated markup and duplicates. No comment data leaves this server.',
      },
      akismet: { available: false, reason: AKISMET_REASON },
    };
  }

  async function update(principal: Principal, input: SpamGuardSettings): Promise<SpamGuardState> {
    requireCapability(principal, 'manage_options');
    if (typeof input.enabled !== 'boolean') {
      throw new ContentError('VALIDATION_ERROR', 'Enabled must be true or false.', 400);
    }
    for (const [field, value] of [
      ['spamThreshold', input.spamThreshold],
      ['moderationThreshold', input.moderationThreshold],
    ] as const) {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 20) {
        throw new ContentError('VALIDATION_ERROR', `${field} must be 1-20.`, 400);
      }
    }
    if (input.moderationThreshold > input.spamThreshold) {
      throw new ContentError(
        'VALIDATION_ERROR',
        'The moderation threshold cannot be higher than the spam threshold.',
        400,
      );
    }
    const values: Array<[string, unknown]> = [
      [KEYS.enabled, input.enabled],
      [KEYS.spam, input.spamThreshold],
      [KEYS.moderation, input.moderationThreshold],
    ];
    await prisma.$transaction(
      values.map(([key, value]) =>
        prisma.option.upsert({
          where: { key },
          create: { key, value: JSON.stringify(value), group: 'discussion' },
          update: { value: JSON.stringify(value), group: 'discussion' },
        }),
      ),
    );
    return get(principal);
  }

  return { get, update };
}

export type SpamGuardService = ReturnType<typeof createSpamGuardService>;

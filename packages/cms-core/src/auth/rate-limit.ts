import type { DatabaseClient } from '@mernpress/database';
import type { IdentifierHasher } from './identifiers.js';

/**
 * Maximum expired `login_attempts` rows removed per login request. Cleanup must
 * stay bounded so the login endpoint cannot be turned into a bulk-delete job.
 */
export const LOGIN_ATTEMPT_CLEANUP_BATCH = 100;

export interface LoginRateLimitConfig {
  /** Failures allowed inside the window before requests are rejected. */
  max: number;
  /** Sliding window length in minutes. */
  windowMinutes: number;
}

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export interface LoginRateLimiter {
  /** The two HMAC keys (IP and normalized username) used by this request. */
  keysFor(username: string, ip: string): string[];
  /** Prunes expired rows and reports whether the request may proceed. */
  check(keys: string[]): Promise<RateLimitDecision>;
  /** Records one failed attempt and reports whether a key just hit the limit. */
  record(keys: string[]): Promise<{ thresholdReached: boolean }>;
  /** Clears both keys after a successful login; accepts a transaction client. */
  clear(keys: string[], client?: Pick<DatabaseClient, 'loginAttempt'>): Promise<void>;
}

/**
 * Database-backed sliding-window limiter for login attempts.
 *
 * This module owns every `login_attempts` read/write so the auth service only
 * orchestrates. It is stateless between calls, which keeps multiple API
 * instances correct across restarts, and it never stores raw IPs or usernames.
 *
 * Expired rows are pruned opportunistically in bounded batches before counting.
 * That removes one-off keys that will never be queried again without a
 * scheduler and without an unbounded table-wide delete.
 */
export function createLoginRateLimiter(options: {
  prisma: DatabaseClient;
  hasher: IdentifierHasher;
  config: LoginRateLimitConfig;
  now?: () => Date;
}): LoginRateLimiter {
  const { prisma, hasher, config } = options;
  const now = options.now ?? (() => new Date());
  const windowMs = config.windowMinutes * 60_000;

  function cutoffFor(at: Date): Date {
    return new Date(at.getTime() - windowMs);
  }

  async function countRecent(keys: string[], cutoff: Date): Promise<number[]> {
    return Promise.all(
      keys.map((keyHash) =>
        prisma.loginAttempt.count({
          where: { keyHash, attemptedAt: { gte: cutoff } },
        }),
      ),
    );
  }

  async function pruneExpired(cutoff: Date): Promise<void> {
    // Parameterized Prisma tagged SQL. The table name is a literal; the cutoff
    // and batch size are bound parameters. SKIP LOCKED lets concurrent API
    // instances prune without blocking each other.
    await prisma.$executeRaw`
      DELETE FROM login_attempts
      WHERE id IN (
        SELECT id FROM login_attempts
        WHERE attempted_at < ${cutoff}
        ORDER BY attempted_at
        LIMIT ${LOGIN_ATTEMPT_CLEANUP_BATCH}
        FOR UPDATE SKIP LOCKED
      )
    `;
  }

  return {
    keysFor(username, ip) {
      return [hasher.ip(ip), hasher.username(username)];
    },

    async check(keys) {
      const current = now();
      const cutoff = cutoffFor(current);

      await pruneExpired(cutoff);

      const counts = await countRecent(keys, cutoff);
      if (!counts.some((count) => count >= config.max)) {
        return { allowed: true };
      }

      const oldest = await prisma.loginAttempt.findFirst({
        where: { keyHash: { in: keys }, attemptedAt: { gte: cutoff } },
        orderBy: { attemptedAt: 'asc' },
        select: { attemptedAt: true },
      });

      const retryAfterSeconds = oldest
        ? Math.max(
            1,
            Math.ceil((oldest.attemptedAt.getTime() + windowMs - current.getTime()) / 1000),
          )
        : Math.ceil(windowMs / 1000);

      return { allowed: false, retryAfterSeconds };
    },

    async record(keys) {
      const attemptedAt = now();
      const cutoff = cutoffFor(attemptedAt);

      await prisma.loginAttempt.createMany({
        data: keys.map((keyHash) => ({ keyHash, attemptedAt })),
      });

      const counts = await countRecent(keys, cutoff);
      return { thresholdReached: counts.some((count) => count >= config.max) };
    },

    async clear(keys, client = prisma) {
      await client.loginAttempt.deleteMany({ where: { keyHash: { in: keys } } });
    },
  };
}

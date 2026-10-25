import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { LOGIN_ATTEMPT_CLEANUP_BATCH } from '@mernpress/cms-core';
import { createTestApp, seedAdmin } from '../helpers/auth.js';

const WINDOW_MINUTES = 15;

function oneOffKeyHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('login attempt retention', () => {
  it('removes expired rows for one-off keys that are never seen again', async () => {
    let current = new Date('2026-10-25T00:00:00.000Z');
    const app = await createTestApp({
      LOGIN_RATE_LIMIT_MAX: 10,
      LOGIN_RATE_LIMIT_WINDOW_MINUTES: WINDOW_MINUTES,
      now: () => current,
    });

    try {
      await seedAdmin(app);

      for (let index = 0; index < 3; index += 1) {
        await expect(
          app.auth.login({
            username: `oneoff_${index}`,
            password: 'wrong password',
            ip: `10.0.0.${index}`,
          }),
        ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
      }
      expect(await app.database.loginAttempt.count()).toBe(6);

      current = new Date(current.getTime() + 14 * 60_000);
      await expect(
        app.auth.login({
          username: 'recent_user',
          password: 'wrong password',
          ip: '10.0.0.99',
        }),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
      const recentAttemptedAt = current;
      expect(await app.database.loginAttempt.count()).toBe(8);

      current = new Date(current.getTime() + 2 * 60_000);
      const cutoff = new Date(current.getTime() - WINDOW_MINUTES * 60_000);

      // Any later login attempt triggers the bounded opportunistic cleanup.
      await expect(
        app.auth.login({
          username: 'trigger_user',
          password: 'wrong password',
          ip: '10.0.0.98',
        }),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

      const remaining = await app.database.loginAttempt.findMany({
        orderBy: { attemptedAt: 'asc' },
      });

      expect(remaining.every((row) => row.attemptedAt.getTime() >= cutoff.getTime())).toBe(true);
      expect(
        remaining.some((row) => row.attemptedAt.getTime() === recentAttemptedAt.getTime()),
      ).toBe(true);
      expect(remaining).toHaveLength(4);
    } finally {
      await app.close();
    }
  });

  it('bounds cleanup work per invocation instead of deleting the whole table', async () => {
    const current = new Date('2026-10-25T00:00:00.000Z');
    const app = await createTestApp({
      LOGIN_RATE_LIMIT_MAX: 100,
      LOGIN_RATE_LIMIT_WINDOW_MINUTES: WINDOW_MINUTES,
      now: () => current,
    });

    try {
      await seedAdmin(app);
      const expiredAt = new Date(current.getTime() - WINDOW_MINUTES * 60_000 - 60_000);
      const total = LOGIN_ATTEMPT_CLEANUP_BATCH + 50;

      await app.database.loginAttempt.createMany({
        data: Array.from({ length: total }, (_unused, index) => ({
          keyHash: oneOffKeyHash(`expired-${index}`),
          attemptedAt: expiredAt,
        })),
      });
      expect(await app.database.loginAttempt.count()).toBe(total);

      await expect(
        app.auth.login({
          username: 'cleanup_trigger',
          password: 'wrong password',
          ip: '10.1.0.1',
        }),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

      const stillExpired = await app.database.loginAttempt.count({
        where: { attemptedAt: { lt: new Date(current.getTime() - WINDOW_MINUTES * 60_000) } },
      });

      const deleted = total - stillExpired;
      expect(deleted).toBe(LOGIN_ATTEMPT_CLEANUP_BATCH);
      expect(stillExpired).toBe(50);
    } finally {
      await app.close();
    }
  });

  it('does not reset an active limiter while pruning old rows', async () => {
    let current = new Date('2026-10-25T00:00:00.000Z');
    const app = await createTestApp({
      LOGIN_RATE_LIMIT_MAX: 2,
      LOGIN_RATE_LIMIT_WINDOW_MINUTES: WINDOW_MINUTES,
      now: () => current,
    });

    try {
      await seedAdmin(app);
      await app.auth
        .login({ username: 'cleanup_user', password: 'wrong password', ip: '10.2.0.1' })
        .catch(() => undefined);
      await app.auth
        .login({ username: 'cleanup_user', password: 'wrong password', ip: '10.2.0.1' })
        .catch(() => undefined);

      current = new Date(current.getTime() + 60_000);

      await expect(
        app.auth.login({ username: 'cleanup_user', password: 'wrong password', ip: '10.2.0.1' }),
      ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    } finally {
      await app.close();
    }
  });
});

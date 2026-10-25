import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { AuthError } from '@mernpress/cms-core';
import { ADMIN_PASSWORD, createTestApp, seedAdmin } from '../helpers/auth.js';

let app: FastifyInstance;

beforeEach(async () => {
  app = await createTestApp();
});

afterEach(async () => {
  await app.close();
});

describe('administrator bootstrap', () => {
  it('creates exactly one administrator on an empty database', async () => {
    const user = await seedAdmin(app, '  Admin.User  ', ADMIN_PASSWORD);

    expect(user).toEqual({
      id: expect.any(String),
      username: 'admin.user',
      role: 'administrator',
      status: 'active',
    });
    expect(user).not.toHaveProperty('passwordHash');

    const stored = await app.database.user.findUnique({ where: { username: 'admin.user' } });
    expect(stored?.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(stored?.passwordHash).not.toContain(ADMIN_PASSWORD);

    const audit = await app.database.auditEvent.findMany({
      where: { eventType: 'auth.bootstrap' },
    });
    expect(audit).toHaveLength(1);
  });

  it('refuses a second administrator and preserves the first', async () => {
    await seedAdmin(app, 'first_admin');
    await expect(seedAdmin(app, 'second_admin')).rejects.toMatchObject({
      code: 'ADMIN_ALREADY_EXISTS',
    });
    expect(await app.database.user.count()).toBe(1);
    expect(await app.database.user.count({ where: { username: 'second_admin' } })).toBe(0);
  });

  it('serializes concurrent bootstrap attempts under the advisory lock', async () => {
    const results = await Promise.allSettled([
      seedAdmin(app, 'concurrent_a'),
      seedAdmin(app, 'concurrent_b'),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(AuthError);
    expect(await app.database.user.count()).toBe(1);
  });

  it('rejects weak passwords and invalid usernames without creating a user', async () => {
    await expect(seedAdmin(app, 'admin', 'short')).rejects.toMatchObject({ code: 'WEAK_PASSWORD' });
    await expect(seedAdmin(app, 'bad username', ADMIN_PASSWORD)).rejects.toMatchObject({
      code: 'INVALID_USERNAME',
    });
    expect(await app.database.user.count()).toBe(0);
  });
});

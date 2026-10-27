import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, seedAdmin } from '../helpers/auth.js';

/**
 * Tests for the development-only manual-test account use-case backing the
 * `pnpm dev:create-test-account` CLI (ADR 0004 manual-acceptance aid). The CLI
 * wrapper adds the opt-in flag + production refusal; the domain use-case enforces
 * the role allowlist, hashing, and no-overwrite.
 */
describe('auth.createManualTestAccount (dev-only role accounts)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates an editor with a hashed (never plaintext) password', async () => {
    const user = await app.auth.createManualTestAccount({
      username: 'Editor-One',
      password: 'Correct horse battery staple',
      role: 'editor',
    });

    expect(user.username).toBe('editor-one');
    expect(user.role).toBe('editor');

    const row = await app.database.user.findUniqueOrThrow({ where: { username: user.username } });
    expect(row.passwordHash).toMatch(/^\$argon2/);
    expect(row.passwordHash).not.toContain('Correct horse');
    expect(row.role).toBe('editor');
  });

  it('refuses to create an administrator', async () => {
    await expect(
      app.auth.createManualTestAccount({
        username: 'Sneaky',
        password: 'Correct horse battery staple',
        // @ts-expect-error administrator is not a ManualTestRole
        role: 'administrator',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('refuses an invalid role', async () => {
    await expect(
      app.auth.createManualTestAccount({
        username: 'Nope',
        password: 'Correct horse battery staple',
        // @ts-expect-error not a valid role
        role: 'superadmin',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('never overwrites an existing account on a username collision (409, no re-role, no password reset)', async () => {
    await app.auth.createManualTestAccount({
      username: 'Collide',
      password: 'Correct horse battery staple',
      role: 'author',
    });
    const before = await app.database.user.findUniqueOrThrow({ where: { username: 'collide' } });

    await expect(
      app.auth.createManualTestAccount({
        username: 'Collide',
        password: 'A totally different password 123',
        role: 'editor', // attempt to re-role must be refused, not applied
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    const after = await app.database.user.findUniqueOrThrow({ where: { username: 'collide' } });
    expect(after.role).toBe('author'); // unchanged
    expect(after.passwordHash).toBe(before.passwordHash); // password not reset
  });

  it('is safe to re-run with a fresh unique username (idempotent-safe pattern)', async () => {
    const first = await app.auth.createManualTestAccount({
      username: 'dev-editor-aaa111',
      password: 'Correct horse battery staple',
      role: 'editor',
    });
    const second = await app.auth.createManualTestAccount({
      username: 'dev-editor-bbb222',
      password: 'Correct horse battery staple',
      role: 'editor',
    });
    expect(first.username).not.toBe(second.username);
    expect(await app.database.user.count({ where: { role: 'editor' } })).toBe(2);
  });

  it('enforces the username and password policy', async () => {
    await expect(
      app.auth.createManualTestAccount({
        username: 'x',
        password: 'Correct horse battery staple',
        role: 'editor',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      app.auth.createManualTestAccount({
        username: 'validname',
        password: 'short',
        role: 'editor',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('coexists with the bootstrapped administrator without affecting it', async () => {
    await seedAdmin(app);
    await app.auth.createManualTestAccount({
      username: 'sub1',
      password: 'Correct horse battery staple',
      role: 'subscriber',
    });

    const admin = await app.database.user.findFirstOrThrow({ where: { role: 'administrator' } });
    expect(admin.role).toBe('administrator');
    expect(await app.database.user.count()).toBe(2);
  });
});

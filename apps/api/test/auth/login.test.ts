import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { sha256Hex } from '@mernpress/cms-core';
import {
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  findSetCookie,
  loginAs,
  seedAdmin,
  setCookieHeader,
} from '../helpers/auth.js';

let app: FastifyInstance;

beforeEach(async () => {
  app = await createTestApp();
  await seedAdmin(app);
});

afterEach(async () => {
  await app.close();
});

describe('POST /api/auth/login', () => {
  it('creates a session and returns only safe user data with secure cookie attributes for test HTTP', async () => {
    const { response, csrfToken } = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      user: Record<string, unknown>;
      csrfToken: string;
      expiresAt: string;
    };

    expect(body.user).toEqual({
      id: expect.any(String),
      username: ADMIN_USERNAME,
      role: 'administrator',
      status: 'active',
      adminColor: 'fresh',
    });
    expect(body.user).not.toHaveProperty('passwordHash');
    expect(body.csrfToken).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toContain(ADMIN_PASSWORD);

    const sessionCookie = findSetCookie(response, 'mernpress_session');
    expect(sessionCookie).toMatch(/HttpOnly/);
    expect(sessionCookie).toMatch(/SameSite=Lax/);
    expect(sessionCookie).toMatch(/Path=\/api/);
    expect(sessionCookie).toMatch(/Max-Age=28800/);
    expect(sessionCookie).not.toMatch(/Secure/);

    const csrfCookie = findSetCookie(response, 'mernpress_csrf');
    expect(csrfCookie).toMatch(/Path=\//);
    expect(csrfCookie).not.toMatch(/HttpOnly/);

    const stored = await app.database.session.findFirstOrThrow();
    const rawToken = response.cookies.find((cookie) => cookie.name === 'mernpress_session')?.value;
    expect(rawToken).toEqual(expect.any(String));
    expect(stored.tokenHash).toBe(sha256Hex(rawToken as string));
    expect(stored.csrfHash).toBe(sha256Hex(csrfToken));
    expect(stored.tokenHash).not.toBe(rawToken);
    expect(stored.revokedAt).toBeNull();

    const audit = await app.database.auditEvent.findMany({
      where: { eventType: 'auth.login.success' },
    });
    expect(audit).toHaveLength(1);
  });

  it('uses Secure cookies when NODE_ENV is production', async () => {
    const productionApp = await createTestApp({
      NODE_ENV: 'production',
      CORS_ORIGINS: ['https://admin.example.com'],
    });
    try {
      await seedAdmin(productionApp);
      const { response } = await loginAs(
        productionApp,
        ADMIN_USERNAME,
        ADMIN_PASSWORD,
        'https://admin.example.com',
      );
      expect(response.statusCode).toBe(200);
      expect(setCookieHeader(response)).toMatch(/mernpress_session=.*Secure/);
      expect(setCookieHeader(response)).toMatch(/mernpress_csrf=.*Secure/);
    } finally {
      await productionApp.close();
    }
  });

  it('returns the same generic response for an unknown user and a wrong password', async () => {
    const unknown = await loginAs(app, 'does_not_exist', 'wrong password');
    const wrong = await loginAs(app, ADMIN_USERNAME, 'wrong password');

    expect(unknown.response.statusCode).toBe(401);
    expect(wrong.response.statusCode).toBe(401);
    expect(unknown.response.json()).toMatchObject({
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' },
    });
    expect(wrong.response.json()).toMatchObject({
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' },
    });
    expect(JSON.stringify(unknown.response.json())).not.toContain('does_not_exist');
    expect(JSON.stringify(wrong.response.json())).not.toContain(ADMIN_USERNAME);

    const failures = await app.database.auditEvent.findMany({
      where: { eventType: 'auth.login.failure' },
      orderBy: { createdAt: 'asc' },
    });
    expect(failures.map((event) => (event.metadata as { reason?: string }).reason)).toEqual([
      'unknown_user',
      'invalid_password',
    ]);
  });

  it('rejects a disabled user with the generic response and no session', async () => {
    await app.database.user.update({
      where: { username: ADMIN_USERNAME },
      data: { status: 'disabled' },
    });

    const { response } = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_CREDENTIALS' } });
    expect(await app.database.session.count()).toBe(0);
  });
});

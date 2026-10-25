import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  findSetCookie,
  getSession,
  loginAs,
  logoutAs,
  seedAdmin,
} from '../helpers/auth.js';

describe('session lifecycle', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestApp();
    await seedAdmin(app);
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns the current session and revokes it on logout', async () => {
    const { cookieHeader, csrfToken } = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);

    const current = await getSession(app, cookieHeader);
    expect(current.statusCode).toBe(200);
    expect(current.json()).toMatchObject({
      user: { username: ADMIN_USERNAME, role: 'administrator' },
    });

    const logout = await logoutAs(app, cookieHeader, csrfToken);
    expect(logout.statusCode).toBe(204);
    expect(findSetCookie(logout, 'mernpress_session')).toMatch(/Expires=Thu, 01 Jan 1970/);

    const after = await getSession(app, cookieHeader);
    expect(after.statusCode).toBe(401);

    const session = await app.database.session.findFirstOrThrow();
    expect(session.revokedAt).not.toBeNull();
    const audit = await app.database.auditEvent.findMany({ where: { eventType: 'auth.logout' } });
    expect(audit).toHaveLength(1);
  });

  it('rejects missing and unknown session cookies', async () => {
    const missing = await app.inject({ method: 'GET', url: '/api/auth/session' });
    expect(missing.statusCode).toBe(401);

    const unknown = await getSession(app, 'mernpress_session=not-a-real-token');
    expect(unknown.statusCode).toBe(401);
  });

  it('revokes a session when the user is disabled', async () => {
    const { cookieHeader } = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    await app.database.user.update({
      where: { username: ADMIN_USERNAME },
      data: { status: 'disabled' },
    });

    const response = await getSession(app, cookieHeader);
    expect(response.statusCode).toBe(401);

    const session = await app.database.session.findFirstOrThrow();
    expect(session.revokedAt).not.toBeNull();
    const audit = await app.database.auditEvent.findFirst({
      where: { eventType: 'auth.session.revoked' },
      orderBy: { createdAt: 'desc' },
    });
    expect((audit?.metadata as { reason?: string }).reason).toBe('user_disabled');
  });

  it('rejects logout without a valid CSRF token', async () => {
    const { cookieHeader } = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);

    const missing = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { origin: 'http://127.0.0.1:5173', cookie: cookieHeader },
    });
    expect(missing.statusCode).toBe(403);

    const wrong = await logoutAs(app, cookieHeader, 'wrong-token');
    expect(wrong.statusCode).toBe(403);
    expect(await app.database.session.count({ where: { revokedAt: null } })).toBe(1);
  });
});

describe('session expiry', () => {
  it('revokes an idle-expired session', async () => {
    let current = new Date('2026-10-25T00:00:00.000Z');
    const app = await createTestApp({ now: () => current });

    try {
      await seedAdmin(app);
      const { cookieHeader } = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
      current = new Date(current.getTime() + 31 * 60_000);

      const response = await getSession(app, cookieHeader);
      expect(response.statusCode).toBe(401);

      const session = await app.database.session.findFirstOrThrow();
      expect(session.revokedAt).not.toBeNull();
      const audit = await app.database.auditEvent.findFirst({
        where: { eventType: 'auth.session.revoked' },
      });
      expect((audit?.metadata as { reason?: string }).reason).toBe('idle_timeout');
    } finally {
      await app.close();
    }
  });

  it('revokes an absolutely expired session', async () => {
    let current = new Date('2026-10-25T00:00:00.000Z');
    const app = await createTestApp({ now: () => current });

    try {
      await seedAdmin(app);
      const { cookieHeader } = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
      current = new Date(current.getTime() + 481 * 60_000);

      const response = await getSession(app, cookieHeader);
      expect(response.statusCode).toBe(401);

      const session = await app.database.session.findFirstOrThrow();
      expect(session.revokedAt).not.toBeNull();
      const audit = await app.database.auditEvent.findFirst({
        where: { eventType: 'auth.session.revoked' },
      });
      expect((audit?.metadata as { reason?: string }).reason).toBe('expired');
    } finally {
      await app.close();
    }
  });
});

import { afterEach, describe, expect, it } from 'vitest';
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
  setCookieHeader,
} from '../helpers/auth.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

function cookieHeaderFor(response: { cookies: Array<{ name: string; value: string }> }): string {
  return response.cookies
    .filter((cookie) => cookie.value !== '')
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

describe('GET /api/auth/csrf', () => {
  it('issues a pre-auth token for anonymous callers without touching the session CSRF cookie', async () => {
    app = await createTestApp();

    const response = await app.inject({ method: 'GET', url: '/api/auth/csrf' });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { csrfToken: string };
    expect(body.csrfToken).toEqual(expect.any(String));
    expect(response.headers['cache-control']).toBe('no-store');

    const preAuthCookie = response.cookies.find(
      (cookie) => cookie.name === 'mernpress_csrf_preauth',
    );
    expect(preAuthCookie?.value).toBe(body.csrfToken);
    expect(findSetCookie(response, 'mernpress_csrf')).toBe('');
  });

  it('does not invalidate the session-bound CSRF token after login', async () => {
    app = await createTestApp();
    await seedAdmin(app);
    const login = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    expect(login.response.statusCode).toBe(200);

    // The admin calls the CSRF endpoint again with an active session.
    const refreshed = await app.inject({
      method: 'GET',
      url: '/api/auth/csrf',
      headers: { cookie: login.cookieHeader },
    });

    expect(refreshed.statusCode).toBe(200);
    expect(findSetCookie(refreshed, 'mernpress_csrf')).toBe('');
    expect(findSetCookie(refreshed, 'mernpress_csrf_preauth')).not.toBe('');

    const logout = await logoutAs(app, login.cookieHeader, login.csrfToken);
    expect(logout.statusCode).toBe(204);
  });

  it('still returns a login token when the session cookie is invalid, without mutating cookie state', async () => {
    app = await createTestApp();
    await seedAdmin(app);
    const login = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/csrf',
      headers: {
        cookie: `mernpress_session=not-a-real-token; ${login.cookieHeader}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(findSetCookie(response, 'mernpress_csrf')).toBe('');
    expect(findSetCookie(response, 'mernpress_session')).toBe('');
    expect(setCookieHeader(response)).not.toContain('mernpress_csrf=;');
  });

  it('works for an expired session without destroying the CSRF cookie on a GET', async () => {
    let current = new Date('2026-10-25T00:00:00.000Z');
    app = await createTestApp({ now: () => current });
    await seedAdmin(app);
    const login = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    current = new Date(current.getTime() + 31 * 60_000);

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/csrf',
      headers: { cookie: login.cookieHeader },
    });

    expect(response.statusCode).toBe(200);
    expect(findSetCookie(response, 'mernpress_csrf')).toBe('');

    const session = await getSession(app, login.cookieHeader);
    expect(session.statusCode).toBe(401);
  });
});

describe('authenticated CSRF flow regression', () => {
  it('keeps the login flow working after a CSRF refresh and captures a safe failure', async () => {
    app = await createTestApp();
    await seedAdmin(app);

    const login = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    const refreshed = await app.inject({
      method: 'GET',
      url: '/api/auth/csrf',
      headers: { cookie: login.cookieHeader },
    });
    const refreshedCookies = cookieHeaderFor(refreshed);

    // If the endpoint rotated the session cookie, this mirrors what the browser
    // would send next: the new CSRF cookie with the old session cookie.
    const browserCookies = refreshedCookies
      ? `${login.cookieHeader}; ${refreshedCookies}`
      : login.cookieHeader;
    const logout = await logoutAs(app, browserCookies, login.csrfToken);

    expect(logout.statusCode).toBe(204);
    expect(await app.database.session.count({ where: { revokedAt: null } })).toBe(0);
  });
});

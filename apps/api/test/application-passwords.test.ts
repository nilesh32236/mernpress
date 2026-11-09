import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  loginAs,
  seedAdmin,
} from './helpers/auth.js';

interface ApplicationPasswordShape {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  passwordHash?: unknown;
}

describe('profile preferences and application passwords', () => {
  let app: FastifyInstance;
  let adminCookie: string;
  let adminCsrf: string;

  beforeEach(async () => {
    app = await createTestApp();
    await seedAdmin(app);
    const session = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    adminCookie = session.cookieHeader;
    adminCsrf = session.csrfToken;
  });

  afterEach(async () => {
    await app.close();
  });

  function headers(): Record<string, string> {
    return {
      origin: ADMIN_ORIGIN,
      cookie: adminCookie,
      'x-csrf-token': adminCsrf,
      'content-type': 'application/json',
    };
  }

  /** DELETE has no body, so it must not claim a JSON body. */
  function deleteHeaders(): Record<string, string> {
    return {
      origin: ADMIN_ORIGIN,
      cookie: adminCookie,
      'x-csrf-token': adminCsrf,
    };
  }

  function basic(username: string, password: string): Record<string, string> {
    return {
      authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
    };
  }

  it('persists syntax highlighting and language on the profile', async () => {
    const update = await app.inject({
      method: 'PUT',
      url: '/api/profile',
      headers: headers(),
      payload: { syntaxHighlighting: false, locale: 'en_US' },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json()).toMatchObject({ syntaxHighlighting: false, locale: 'en_US' });

    const read = await app.inject({
      method: 'GET',
      url: '/api/profile',
      headers: { cookie: adminCookie },
    });
    expect(read.json()).toMatchObject({ syntaxHighlighting: false, locale: 'en_US' });

    const locales = await app.inject({
      method: 'GET',
      url: '/api/profile/locales',
      headers: { cookie: adminCookie },
    });
    expect(locales.statusCode).toBe(200);
    expect((locales.json() as { items: Array<{ value: string }> }).items).toEqual([
      { value: 'en_US', label: 'English (United States)' },
    ]);

    const invalid = await app.inject({
      method: 'PUT',
      url: '/api/profile',
      headers: headers(),
      payload: { locale: 'xx_YY' },
    });
    expect(invalid.statusCode).toBe(400);
    expect((invalid.json() as { error: { message: string } }).error.message).toBe(
      'That language is not installed.',
    );
  });

  it('creates a password once, lists it without secrets, and revokes it', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/profile/app-passwords',
      headers: headers(),
      payload: { name: 'CI deploy' },
    });
    expect(created.statusCode).toBe(201);
    const body = created.json() as { password: string; item: ApplicationPasswordShape };
    expect(body.password).toMatch(/^[a-z0-9]{4}( [a-z0-9]{4}){5}$/i);
    expect(body.item).toMatchObject({ name: 'CI deploy', lastUsedAt: null });
    expect(body.item.passwordHash).toBeUndefined();

    const stored = await app.database.applicationPassword.findUnique({
      where: { id: body.item.id },
    });
    expect(stored).not.toBeNull();
    expect(stored!.passwordHash).not.toContain(body.password.replace(/\s+/g, ''));

    const list = await app.inject({
      method: 'GET',
      url: '/api/profile/app-passwords',
      headers: { cookie: adminCookie },
    });
    expect(list.statusCode).toBe(200);
    const items = (list.json() as { items: ApplicationPasswordShape[] }).items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: body.item.id, name: 'CI deploy' });
    expect(items[0]!.passwordHash).toBeUndefined();

    const revoked = await app.inject({
      method: 'DELETE',
      url: `/api/profile/app-passwords/${body.item.id}`,
      headers: deleteHeaders(),
    });
    expect(revoked.statusCode).toBe(204);
    const after = await app.inject({
      method: 'GET',
      url: '/api/profile/app-passwords',
      headers: { cookie: adminCookie },
    });
    expect((after.json() as { items: unknown[] }).items).toHaveLength(0);

    const secondRevoke = await app.inject({
      method: 'DELETE',
      url: `/api/profile/app-passwords/${body.item.id}`,
      headers: deleteHeaders(),
    });
    expect(secondRevoke.statusCode).toBe(404);
  });

  it('authenticates API requests with Basic auth and no CSRF token', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/profile/app-passwords',
      headers: headers(),
      payload: { name: 'API client' },
    });
    const { password, item } = created.json() as {
      password: string;
      item: ApplicationPasswordShape;
    };

    const read = await app.inject({
      method: 'GET',
      url: '/api/admin/posts?type=post&page=1&perPage=10',
      headers: basic(ADMIN_USERNAME, password),
    });
    expect(read.statusCode).toBe(200);

    // The last-used stamp is recorded (the first use is never throttled).
    const used = await app.database.applicationPassword.findUnique({ where: { id: item.id } });
    expect(used!.lastUsedAt).not.toBeNull();

    // A Basic-authenticated mutation needs no CSRF token.
    const mutate = await app.inject({
      method: 'POST',
      url: '/api/profile/app-passwords',
      headers: {
        ...basic(ADMIN_USERNAME, password),
        'content-type': 'application/json',
      },
      payload: { name: 'Second credential' },
    });
    expect(mutate.statusCode).toBe(201);

    // Spaces are optional when presenting the credential.
    const withoutSpaces = await app.inject({
      method: 'GET',
      url: '/api/profile',
      headers: basic(ADMIN_USERNAME, password.replace(/\s+/g, '')),
    });
    expect(withoutSpaces.statusCode).toBe(200);

    const wrong = await app.inject({
      method: 'GET',
      url: '/api/profile',
      headers: basic(ADMIN_USERNAME, 'wrong-password-123'),
    });
    expect(wrong.statusCode).toBe(401);

    await app.inject({
      method: 'DELETE',
      url: `/api/profile/app-passwords/${item.id}`,
      headers: deleteHeaders(),
    });
    const revoked = await app.inject({
      method: 'GET',
      url: '/api/profile',
      headers: basic(ADMIN_USERNAME, password),
    });
    expect(revoked.statusCode).toBe(401);
  });

  it('still requires CSRF for session-authenticated mutations', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/profile/app-passwords',
      headers: {
        origin: ADMIN_ORIGIN,
        cookie: adminCookie,
        'content-type': 'application/json',
      },
      payload: { name: 'No CSRF' },
    });
    expect(response.statusCode).toBe(403);
    expect((response.json() as { error: { code: string } }).error.code).toBe('CSRF_INVALID');
  });

  it('throttles repeated failed application-password attempts per IP', async () => {
    // Eleven failures from one caller: the first ten are 401, the eleventh is
    // rate-limited before another Argon2id verify can run.
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await app.inject({
        method: 'GET',
        url: '/api/profile',
        remoteAddress: '203.0.113.9',
        headers: basic(ADMIN_USERNAME, `wrong-${attempt}`),
      });
      statuses.push(response.statusCode);
    }
    expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateTotp } from '@mernpress/cms-core';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  getCsrf,
  loginAs,
  seedAdmin,
  seedUser,
} from './helpers/auth.js';

interface LoginShape {
  twoFactorRequired?: boolean;
  challengeToken?: string;
  username?: string;
  user?: { id: string; username: string };
  csrfToken?: string;
  expiresAt?: string;
}

describe('two-factor authentication', () => {
  let app: FastifyInstance;
  let cookie: string;
  let csrf: string;

  beforeEach(async () => {
    app = await createTestApp();
    await seedAdmin(app);
    const session = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    cookie = session.cookieHeader;
    csrf = session.csrfToken;
  });

  afterEach(async () => {
    await app.close();
  });

  function headers(): Record<string, string> {
    return {
      origin: ADMIN_ORIGIN,
      cookie,
      'x-csrf-token': csrf,
      'content-type': 'application/json',
    };
  }

  async function login(
    username: string,
    password: string,
  ): Promise<{ statusCode: number; body: LoginShape; cookies: string[] }> {
    const pre = await getCsrf(app);
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: {
        origin: ADMIN_ORIGIN,
        cookie: pre.cookieHeader,
        'x-csrf-token': pre.token,
        'content-type': 'application/json',
      },
      payload: { username, password },
    });
    return {
      statusCode: response.statusCode,
      body: response.json() as LoginShape,
      cookies: response.cookies.map((entry) => `${entry.name}=${entry.value}`),
    };
  }

  /** Next 30-second step: enrollment already consumed the current counter. */
  function nextCode(secret: string): string {
    return generateTotp(secret, Date.now() + 30_000);
  }

  async function completeTwoFactor(challengeToken: string, code: string) {
    const pre = await getCsrf(app);
    return app.inject({
      method: 'POST',
      url: '/api/auth/two-factor',
      headers: {
        origin: ADMIN_ORIGIN,
        cookie: pre.cookieHeader,
        'x-csrf-token': pre.token,
        'content-type': 'application/json',
      },
      payload: { challengeToken, code },
    });
  }

  async function enableTwoFactor(): Promise<{ secret: string; recoveryCodes: string[] }> {
    const { 'content-type': _contentType, ...setupHeaders } = headers();
    const setup = await app.inject({
      method: 'POST',
      url: '/api/profile/two-factor/setup',
      headers: setupHeaders,
    });
    expect(setup.statusCode).toBe(200);
    const body = setup.json() as { secret: string; otpauthUrl: string; recoveryCodes: string[] };
    expect(body.otpauthUrl).toContain('otpauth://totp/');
    expect(body.recoveryCodes).toHaveLength(8);
    const confirm = await app.inject({
      method: 'POST',
      url: '/api/profile/two-factor/confirm',
      headers: headers(),
      payload: { code: generateTotp(body.secret) },
    });
    expect(confirm.statusCode).toBe(200);
    expect((confirm.json() as { enabled: boolean }).enabled).toBe(true);
    return { secret: body.secret, recoveryCodes: body.recoveryCodes };
  }

  it('enrolls, challenges the password login and verifies a TOTP code', async () => {
    const enabled = await enableTwoFactor();
    const status = await app.inject({
      method: 'GET',
      url: '/api/profile/two-factor',
      headers: { cookie },
    });
    expect(status.json()).toMatchObject({ enabled: true, recoveryCodesRemaining: 8 });

    const challenge = await login(ADMIN_USERNAME, ADMIN_PASSWORD);
    expect(challenge.statusCode).toBe(200);
    expect(challenge.body).toMatchObject({ twoFactorRequired: true, username: ADMIN_USERNAME });
    expect(challenge.body.challengeToken).toBeTruthy();
    expect(challenge.cookies.join(';')).not.toContain('mernpress_session=');

    const wrong = await completeTwoFactor(challenge.body.challengeToken!, '000000');
    expect(wrong.statusCode).toBe(401);

    const good = await completeTwoFactor(challenge.body.challengeToken!, nextCode(enabled.secret));
    expect(good.statusCode).toBe(200);
    expect((good.json() as LoginShape).user?.username).toBe(ADMIN_USERNAME);
    const sessionCookie = good.cookies.find((entry) => entry.name === 'mernpress_session');
    expect(sessionCookie).toBeTruthy();
    const session = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: `mernpress_session=${sessionCookie!.value}` },
    });
    expect(session.statusCode).toBe(200);
  });

  it('rejects a replayed TOTP code and accepts a single-use recovery code once', async () => {
    const enabled = await enableTwoFactor();
    const code = nextCode(enabled.secret);

    const first = await login(ADMIN_USERNAME, ADMIN_PASSWORD);
    expect((await completeTwoFactor(first.body.challengeToken!, code)).statusCode).toBe(200);

    const second = await login(ADMIN_USERNAME, ADMIN_PASSWORD);
    const replay = await completeTwoFactor(second.body.challengeToken!, code);
    expect(replay.statusCode).toBe(401);

    const recovery = enabled.recoveryCodes[0]!;
    const third = await login(ADMIN_USERNAME, ADMIN_PASSWORD);
    expect((await completeTwoFactor(third.body.challengeToken!, recovery)).statusCode).toBe(200);

    const fourth = await login(ADMIN_USERNAME, ADMIN_PASSWORD);
    const reused = await completeTwoFactor(fourth.body.challengeToken!, recovery);
    expect(reused.statusCode).toBe(401);
  });

  it('disables with password and code, then login no longer challenges', async () => {
    const enabled = await enableTwoFactor();
    const disabled = await app.inject({
      method: 'POST',
      url: '/api/profile/two-factor/disable',
      headers: headers(),
      payload: { password: ADMIN_PASSWORD, code: nextCode(enabled.secret) },
    });
    expect(disabled.statusCode).toBe(200);
    expect((disabled.json() as { enabled: boolean }).enabled).toBe(false);

    const challenge = await login(ADMIN_USERNAME, ADMIN_PASSWORD);
    expect(challenge.body.twoFactorRequired).toBeUndefined();
    expect(challenge.body.user?.username).toBe(ADMIN_USERNAME);
    expect(challenge.cookies.join(';')).toContain('mernpress_session=');
  });

  it('lets an administrator reset another user’s second factor', async () => {
    const created = await seedUser(app, {
      username: 'two-factor-user',
      password: 'User-pass-2026!',
      role: 'editor',
    });
    const userSession = await loginAs(app, 'two-factor-user', 'User-pass-2026!');
    const setup = await app.inject({
      method: 'POST',
      url: '/api/profile/two-factor/setup',
      headers: {
        origin: ADMIN_ORIGIN,
        cookie: userSession.cookieHeader,
        'x-csrf-token': userSession.csrfToken,
      },
    });
    const body = setup.json() as { secret: string };
    await app.inject({
      method: 'POST',
      url: '/api/profile/two-factor/confirm',
      headers: {
        origin: ADMIN_ORIGIN,
        cookie: userSession.cookieHeader,
        'x-csrf-token': userSession.csrfToken,
        'content-type': 'application/json',
      },
      payload: { code: generateTotp(body.secret) },
    });

    const listed = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { cookie },
    });
    const listedUser = (
      listed.json() as { items: Array<{ id: string; twoFactorEnabled: boolean }> }
    ).items.find((entry) => entry.id === created.id);
    expect(listedUser?.twoFactorEnabled).toBe(true);

    const reset = await app.inject({
      method: 'DELETE',
      url: `/api/users/${created.id}/two-factor`,
      headers: { origin: ADMIN_ORIGIN, cookie, 'x-csrf-token': csrf },
    });
    expect(reset.statusCode).toBe(200);
    expect((reset.json() as { enabled: boolean }).enabled).toBe(false);

    const challenge = await login('two-factor-user', 'User-pass-2026!');
    expect(challenge.body.twoFactorRequired).toBeUndefined();
    expect(challenge.cookies.join(';')).toContain('mernpress_session=');
  });

  it('rejects setup confirmation with a wrong code and anonymous access', async () => {
    const { 'content-type': _contentType, ...setupHeaders } = headers();
    const setup = await app.inject({
      method: 'POST',
      url: '/api/profile/two-factor/setup',
      headers: setupHeaders,
    });
    expect(setup.statusCode).toBe(200);
    const wrong = await app.inject({
      method: 'POST',
      url: '/api/profile/two-factor/confirm',
      headers: headers(),
      payload: { code: '000000' },
    });
    expect(wrong.statusCode).toBe(401);

    const anonymous = await app.inject({ method: 'GET', url: '/api/profile/two-factor' });
    expect(anonymous.statusCode).toBe(401);
  });
});

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

describe('lost-password reset flow', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestApp({ MAIL_TRANSPORT: 'memory' });
    await seedAdmin(app);
    await app.database.option.upsert({
      where: { key: 'site_url' },
      create: {
        key: 'site_url',
        value: JSON.stringify('https://mernpress.example'),
        group: 'general',
      },
      update: { value: JSON.stringify('https://mernpress.example') },
    });
    await app.database.option.upsert({
      where: { key: 'admin_email' },
      create: { key: 'admin_email', value: JSON.stringify('admin@example.com'), group: 'general' },
      update: { value: JSON.stringify('admin@example.com') },
    });
  });

  afterEach(async () => {
    await app.close();
  });

  async function postCsrf(
    url: string,
    payload: Record<string, unknown>,
  ): Promise<{ statusCode: number; body: unknown }> {
    const csrf = await getCsrf(app);
    const response = await app.inject({
      method: 'POST',
      url,
      headers: {
        origin: ADMIN_ORIGIN,
        cookie: csrf.cookieHeader,
        'x-csrf-token': csrf.token,
        'content-type': 'application/json',
      },
      payload,
    });
    return {
      statusCode: response.statusCode,
      body: response.statusCode === 204 ? null : response.json(),
    };
  }

  async function createReader(): Promise<string> {
    await seedUser(app, {
      username: 'reader',
      password: 'Reader-pass-2026!',
      role: 'subscriber',
    });
    await app.database.user.update({
      where: { username: 'reader' },
      data: { email: 'reader@example.com' },
    });
    return 'reader@example.com';
  }

  async function latestResetLink(): Promise<{ key: string; login: string }> {
    const message = app.mail.outbox.at(-1);
    expect(message).toBeDefined();
    const match = /[?&]key=([^&\s]+)&login=([^&\s]+)/.exec(message!.text);
    expect(match).not.toBeNull();
    return {
      key: decodeURIComponent(match![1]!),
      login: decodeURIComponent(match![2]!),
    };
  }

  it('requests a reset link, resets the password and invalidates sessions', async () => {
    const email = await createReader();
    const session = await loginAs(app, 'reader', 'Reader-pass-2026!');

    const requested = await postCsrf('/api/auth/lost-password', { identifier: email });
    expect(requested.statusCode).toBe(200);
    expect(requested.body).toEqual({ sent: true });
    expect(app.mail.outbox).toHaveLength(1);
    const message = app.mail.outbox[0]!;
    expect(message.to).toBe('reader@example.com');
    expect(message.subject).toContain('Password Reset');
    expect(message.text).toContain('https://mernpress.example/admin/?action=rp&key=');

    const { key, login } = await latestResetLink();
    expect(login).toBe('reader');

    const reset = await postCsrf('/api/auth/reset-password', {
      key,
      login,
      password: 'Brand-new-pass-2026!',
    });
    expect(reset.statusCode).toBe(204);

    // The old password no longer works; the new one does.
    const oldLogin = await loginAs(app, 'reader', 'Reader-pass-2026!');
    expect(oldLogin.response.statusCode).toBe(401);
    const newLogin = await loginAs(app, 'reader', 'Brand-new-pass-2026!');
    expect(newLogin.response.statusCode).toBe(200);

    // The session that existed before the reset is gone.
    const stale = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: session.cookieHeader },
    });
    expect(stale.statusCode).toBe(401);

    // Single use: replaying the same token fails.
    const replay = await postCsrf('/api/auth/reset-password', {
      key,
      login,
      password: 'Another-pass-2026!',
    });
    expect(replay.statusCode).toBe(400);
    expect((replay.body as { error: { code: string } }).error.code).toBe('INVALID_RESET_KEY');
  });

  it('answers generically for unknown accounts and sends nothing', async () => {
    const response = await postCsrf('/api/auth/lost-password', {
      identifier: 'nobody@example.com',
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ sent: true });
    expect(app.mail.outbox).toHaveLength(0);
  });

  it('rate-limits repeated reset requests', async () => {
    const email = await createReader();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await postCsrf('/api/auth/lost-password', { identifier: email });
      expect(response.statusCode).toBe(200);
    }
    const limited = await postCsrf('/api/auth/lost-password', { identifier: email });
    expect(limited.statusCode).toBe(429);
    expect((limited.body as { error: { code: string } }).error.code).toBe('RATE_LIMITED');
  });

  it('reports mail as unavailable instead of pretending to send', async () => {
    await app.close();
    app = await createTestApp();
    await seedAdmin(app);
    await seedUser(app, {
      username: 'reader',
      password: 'Reader-pass-2026!',
      role: 'subscriber',
    });
    await app.database.user.update({
      where: { username: 'reader' },
      data: { email: 'reader@example.com' },
    });

    const response = await postCsrf('/api/auth/lost-password', {
      identifier: 'reader@example.com',
    });
    expect(response.statusCode).toBe(503);
    expect((response.body as { error: { code: string } }).error.code).toBe('MAIL_NOT_CONFIGURED');
  });

  it('includes a working reset link in the new-user notification', async () => {
    const session = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    const created = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: {
        origin: ADMIN_ORIGIN,
        cookie: session.cookieHeader,
        'x-csrf-token': session.csrfToken,
        'content-type': 'application/json',
      },
      payload: {
        username: 'invitee',
        password: 'Initial-pass-2026!',
        role: 'author',
        email: 'invitee@example.com',
        sendNotification: true,
      },
    });
    expect(created.statusCode).toBe(201);

    const message = app.mail.outbox.at(-1);
    expect(message?.text).toContain('To set your password');
    const match = /[?&]key=([^&\s]+)&login=([^&\s]+)/.exec(message!.text);
    expect(match).not.toBeNull();

    const reset = await postCsrf('/api/auth/reset-password', {
      key: decodeURIComponent(match![1]!),
      login: decodeURIComponent(match![2]!),
      password: 'Chosen-pass-2026!',
    });
    expect(reset.statusCode).toBe(204);
    const login = await loginAs(app, 'invitee', 'Chosen-pass-2026!');
    expect(login.response.statusCode).toBe(200);
  });
});

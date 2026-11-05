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

describe('Users → Send password reset', () => {
  let app: FastifyInstance;
  let cookie: string;
  let csrf: string;
  let targetId: string;

  beforeEach(async () => {
    app = await createTestApp({ MAIL_TRANSPORT: 'memory' });
    await seedAdmin(app);
    const session = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    cookie = session.cookieHeader;
    csrf = session.csrfToken;
    await seedUser(app, {
      username: 'invitee',
      password: 'Invitee-pass-2026!',
      role: 'author',
    });
    const target = await app.database.user.update({
      where: { username: 'invitee' },
      data: { email: 'invitee@example.com' },
    });
    targetId = target.id;
  });

  afterEach(async () => {
    await app.close();
  });

  function headers(): Record<string, string> {
    return {
      origin: ADMIN_ORIGIN,
      cookie,
      'x-csrf-token': csrf,
    };
  }

  it('e-mails a working single-use reset link to the selected user', async () => {
    const sent = await app.inject({
      method: 'POST',
      url: `/api/users/${targetId}/send-password-reset`,
      headers: headers(),
    });
    expect(sent.statusCode).toBe(200);
    expect(sent.json()).toEqual({ sent: true });

    expect(app.mail.outbox).toHaveLength(1);
    const message = app.mail.outbox[0]!;
    expect(message.to).toBe('invitee@example.com');
    expect(message.subject).toContain('Password Reset');
    const match = /[?&]key=([^&\s]+)&login=([^&\s]+)/.exec(message.text);
    expect(match).not.toBeNull();

    const preAuth = await getCsrf(app);
    const reset = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      headers: {
        origin: ADMIN_ORIGIN,
        cookie: preAuth.cookieHeader,
        'x-csrf-token': preAuth.token,
        'content-type': 'application/json',
      },
      payload: {
        key: decodeURIComponent(match![1]!),
        login: decodeURIComponent(match![2]!),
        password: 'Chosen-pass-2026!',
      },
    });
    expect(reset.statusCode).toBe(204);

    const login = await loginAs(app, 'invitee', 'Chosen-pass-2026!');
    expect(login.response.statusCode).toBe(200);
  });

  it('rejects users without an email and disabled users', async () => {
    const noEmail = await seedUser(app, {
      username: 'noemail',
      password: 'Noemail-pass-2026!',
      role: 'subscriber',
    });
    const missing = await app.inject({
      method: 'POST',
      url: `/api/users/${noEmail.id}/send-password-reset`,
      headers: headers(),
    });
    expect(missing.statusCode).toBe(400);
    expect((missing.json() as { error: { code: string } }).error.code).toBe('INVALID_EMAIL');

    await app.database.user.update({
      where: { id: targetId },
      data: { status: 'disabled' },
    });
    const disabled = await app.inject({
      method: 'POST',
      url: `/api/users/${targetId}/send-password-reset`,
      headers: headers(),
    });
    expect(disabled.statusCode).toBe(400);
    expect((disabled.json() as { error: { code: string } }).error.code).toBe('INVALID_STATUS');
  });

  it('rejects unknown users, editors, anonymous callers and missing CSRF', async () => {
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/users/00000000-0000-7000-8000-000000000000/send-password-reset',
      headers: headers(),
    });
    expect(unknown.statusCode).toBe(404);

    const anonymous = await app.inject({
      method: 'POST',
      url: `/api/users/${targetId}/send-password-reset`,
      headers: { origin: ADMIN_ORIGIN },
    });
    expect(anonymous.statusCode).toBe(401);

    await seedUser(app, { username: 'editor', password: 'Editor-pass-2026!', role: 'editor' });
    const editor = await loginAs(app, 'editor', 'Editor-pass-2026!');
    const forbidden = await app.inject({
      method: 'POST',
      url: `/api/users/${targetId}/send-password-reset`,
      headers: {
        origin: ADMIN_ORIGIN,
        cookie: editor.cookieHeader,
        'x-csrf-token': editor.csrfToken,
      },
    });
    expect(forbidden.statusCode).toBe(403);

    const noCsrf = await app.inject({
      method: 'POST',
      url: `/api/users/${targetId}/send-password-reset`,
      headers: { origin: ADMIN_ORIGIN, cookie },
    });
    expect(noCsrf.statusCode).toBe(403);
    expect((noCsrf.json() as { error: { code: string } }).error.code).toBe('CSRF_INVALID');
  });

  it('reports mail as unconfigured instead of pretending to send', async () => {
    await app.close();
    app = await createTestApp();
    await seedAdmin(app);
    const session = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    cookie = session.cookieHeader;
    csrf = session.csrfToken;
    await seedUser(app, {
      username: 'invitee',
      password: 'Invitee-pass-2026!',
      role: 'author',
    });
    const target = await app.database.user.update({
      where: { username: 'invitee' },
      data: { email: 'invitee@example.com' },
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/users/${target.id}/send-password-reset`,
      headers: headers(),
    });
    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: { code: string } }).error.code).toBe('MAIL_NOT_CONFIGURED');
  });
});

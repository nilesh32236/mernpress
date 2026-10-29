import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  loginAs,
  seedAdmin,
  seedUser,
} from './helpers/auth.js';

interface ErrorEnvelope {
  error: { code: string; message: string; requestId: string };
}

describe('options (settings) api', () => {
  let app: FastifyInstance;
  let adminCookie: string;
  let adminCsrf: string;
  let editorCookie: string;
  let editorCsrf: string;

  beforeEach(async () => {
    app = await createTestApp();
    await seedAdmin(app);
    const adminSession = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    adminCookie = adminSession.cookieHeader;
    adminCsrf = adminSession.csrfToken;

    await seedUser(app, {
      username: 'editor1',
      password: 'Correct horse battery staple',
      role: 'editor',
    });
    const editorSession = await loginAs(app, 'editor1', 'Correct horse battery staple');
    editorCookie = editorSession.cookieHeader;
    editorCsrf = editorSession.csrfToken;
  });

  afterEach(async () => {
    await app.close();
  });

  function adminHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return {
      cookie: adminCookie,
      'x-csrf-token': adminCsrf,
      origin: ADMIN_ORIGIN,
      'content-type': 'application/json',
      ...extra,
    };
  }

  it('returns 401 for unauthenticated GET', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/options?group=general',
    });
    expect(response.statusCode).toBe(401);
    expect((response.json() as ErrorEnvelope).error.code).toBe('UNAUTHENTICATED');
  });

  it('returns defaults before any write', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/options?group=reading',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body.homepage_mode).toBe('latest_posts');
    expect(body.homepage_id).toBeNull();
    expect(body.posts_page_id).toBeNull();
    expect(body.posts_per_page).toBe(10);
  });

  it('allows non-admin GET', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/options?group=general',
      headers: { cookie: editorCookie },
    });
    expect(response.statusCode).toBe(200);
  });

  it('forbids non-admin PUT with 403', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/options',
      headers: {
        cookie: editorCookie,
        'x-csrf-token': editorCsrf,
        origin: ADMIN_ORIGIN,
        'content-type': 'application/json',
      },
      payload: { group: 'general', values: { site_title: 'Hacked' } },
    });
    expect(response.statusCode).toBe(403);
  });

  it('persists administrator PUT and GET reflects it', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: '/api/options',
      headers: adminHeaders(),
      payload: { group: 'general', values: { site_title: 'New Title' } },
    });
    expect(put.statusCode).toBe(200);
    const putBody = put.json() as Record<string, unknown>;
    expect(putBody.site_title).toBe('New Title');

    const get = await app.inject({
      method: 'GET',
      url: '/api/options?group=general',
      headers: { cookie: adminCookie },
    });
    expect(get.statusCode).toBe(200);
    expect((get.json() as Record<string, unknown>).site_title).toBe('New Title');
  });

  it('rejects unknown key with 400 UNKNOWN_OPTION_KEY', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/options',
      headers: adminHeaders(),
      payload: { group: 'general', values: { totally_unknown: 'x' } },
    });
    expect(response.statusCode).toBe(400);
    expect((response.json() as ErrorEnvelope).error.code).toBe('UNKNOWN_OPTION_KEY');
  });

  it('rejects bad type with 400 VALIDATION_ERROR', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/options',
      headers: adminHeaders(),
      payload: { group: 'reading', values: { posts_per_page: 'ten' } },
    });
    expect(response.statusCode).toBe(400);
    expect((response.json() as ErrorEnvelope).error.code).toBe('VALIDATION_ERROR');
  });

  it('requires CSRF on PUT (missing token -> 403)', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/options',
      headers: {
        cookie: adminCookie,
        origin: ADMIN_ORIGIN,
        'content-type': 'application/json',
      },
      payload: { group: 'general', values: { site_title: 'No CSRF' } },
    });
    expect(response.statusCode).toBe(403);
    expect((response.json() as ErrorEnvelope).error.code).toBe('CSRF_INVALID');
  });
});

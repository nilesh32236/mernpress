import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ConsentConfig } from '@mernpress/contracts';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  loginAs,
  seedAdmin,
  seedUser,
} from './helpers/auth.js';

const config: ConsentConfig = {
  enabled: true,
  version: 2,
  title: 'Cookies on this site',
  message: 'Choose which optional storage you allow.',
  acceptLabel: 'Accept all',
  rejectLabel: 'Reject non-essential',
  saveLabel: 'Save choices',
  analyticsEnabled: true,
  marketingEnabled: false,
  analyticsRequired: true,
};

describe('cookie consent configuration', () => {
  let app: FastifyInstance;
  let adminHeaders: Record<string, string>;
  let adminCookie: string;

  beforeEach(async () => {
    app = await createTestApp();
    await seedAdmin(app);
    const session = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    adminCookie = session.cookieHeader;
    adminHeaders = {
      origin: ADMIN_ORIGIN,
      cookie: session.cookieHeader,
      'x-csrf-token': session.csrfToken,
      'content-type': 'application/json',
    };
  });

  afterEach(async () => {
    await app.close();
  });

  async function read() {
    return app.inject({
      method: 'GET',
      url: '/api/admin/consent',
      headers: { cookie: adminCookie },
    });
  }

  async function put(payload: unknown, headers = adminHeaders) {
    return app.inject({
      method: 'PUT',
      url: '/api/admin/consent',
      headers,
      payload: payload as Record<string, unknown>,
    });
  }

  async function publicSettings() {
    return app.inject({ method: 'GET', url: '/api/public/site' });
  }

  it('defaults to disabled, saves the config and exposes it publicly', async () => {
    const initial = await read();
    expect(initial.statusCode).toBe(200);
    expect((initial.json() as ConsentConfig).enabled).toBe(false);

    const saved = await put(config);
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual(config);

    const reread = await read();
    expect(reread.json()).toEqual(config);

    const site = await publicSettings();
    expect(site.statusCode).toBe(200);
    expect((site.json() as { consent: ConsentConfig }).consent).toEqual(config);
  });

  it('normalizes forgiving values but rejects malformed shapes', async () => {
    const normalized = await put({
      ...config,
      title: '  Trimmed title  ',
      version: 1000,
      unknown: true,
    });
    expect(normalized.statusCode).toBe(400);
    expect((normalized.json() as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');

    for (const payload of [
      { ...config, enabled: 'yes' },
      { ...config, version: 0 },
      { ...config, title: '   ' },
      { ...config, acceptLabel: 'x'.repeat(41) },
      { ...config, message: 'x'.repeat(501) },
    ]) {
      expect((await put(payload)).statusCode, JSON.stringify(payload).slice(0, 60)).toBe(400);
    }
  });

  it('restricts mutations to administrators', async () => {
    const anonymous = await app.inject({ method: 'GET', url: '/api/admin/consent' });
    expect(anonymous.statusCode).toBe(401);

    await seedUser(app, {
      username: 'consent-editor',
      password: 'Editor-pass-2026!',
      role: 'editor',
    });
    const editor = await loginAs(app, 'consent-editor', 'Editor-pass-2026!');
    const editorHeaders = {
      origin: ADMIN_ORIGIN,
      cookie: editor.cookieHeader,
      'x-csrf-token': editor.csrfToken,
      'content-type': 'application/json',
    };
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/admin/consent',
          headers: { cookie: editor.cookieHeader },
        })
      ).statusCode,
    ).toBe(403);
    expect((await put(config, editorHeaders)).statusCode).toBe(403);
    // The public config still reads without a session (defaults).
    const publicResponse = await publicSettings();
    expect(publicResponse.statusCode, publicResponse.body).toBe(200);
  });
});

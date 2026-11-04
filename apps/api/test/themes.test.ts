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

let app: FastifyInstance;

beforeEach(async () => {
  app = await createTestApp();
  await seedAdmin(app);
});

afterEach(async () => {
  await app.close();
});

async function adminHeaders() {
  const { cookieHeader, csrfToken } = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
  return {
    origin: ADMIN_ORIGIN,
    cookie: cookieHeader,
    'x-csrf-token': csrfToken,
    'content-type': 'application/json',
  };
}

describe('appearance themes api', () => {
  it('lists the installed theme as active for an administrator', async () => {
    const headers = await adminHeaders();
    const response = await app.inject({ method: 'GET', url: '/api/admin/themes', headers });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      active: string;
      themes: Array<{ id: string; active: boolean; name: string; tags: string[] }>;
    };
    expect(body.active).toBe('mernpress');
    expect(body.themes).toHaveLength(1);
    expect(body.themes[0]).toMatchObject({ id: 'mernpress', active: true, name: 'MERNPress' });
    expect(body.themes[0]!.tags.length).toBeGreaterThan(3);
  });

  it('activates an installed theme and rejects an unknown one', async () => {
    const headers = await adminHeaders();
    const { 'content-type': _contentType, ...noBody } = headers;
    const activated = await app.inject({
      method: 'POST',
      url: '/api/admin/themes/mernpress/activate',
      headers: noBody,
    });
    expect(activated.statusCode).toBe(200);
    expect((activated.json() as { active: string }).active).toBe('mernpress');

    const missing = await app.inject({
      method: 'POST',
      url: '/api/admin/themes/does-not-exist/activate',
      headers: noBody,
    });
    expect(missing.statusCode).toBe(404);
  });

  it('stores the automatic update preference', async () => {
    const headers = await adminHeaders();
    const enabled = await app.inject({
      method: 'POST',
      url: '/api/admin/themes/auto-updates',
      headers,
      payload: { enabled: true },
    });
    expect(enabled.statusCode).toBe(200);
    expect((enabled.json() as { themes: Array<{ autoUpdates: boolean }> }).themes[0]).toMatchObject(
      { autoUpdates: true },
    );

    const disabled = await app.inject({
      method: 'POST',
      url: '/api/admin/themes/auto-updates',
      headers,
      payload: { enabled: false },
    });
    expect(
      (disabled.json() as { themes: Array<{ autoUpdates: boolean }> }).themes[0]!.autoUpdates,
    ).toBe(false);
  });

  it('rejects anonymous and non-administrator access', async () => {
    const anonymous = await app.inject({ method: 'GET', url: '/api/admin/themes' });
    expect(anonymous.statusCode).toBe(401);

    await seedUser(app, { username: 'editor', password: 'Editor-pass-2026!', role: 'editor' });
    const { cookieHeader } = await loginAs(app, 'editor', 'Editor-pass-2026!');
    const editor = await app.inject({
      method: 'GET',
      url: '/api/admin/themes',
      headers: { cookie: cookieHeader },
    });
    expect(editor.statusCode).toBe(403);
  });
});

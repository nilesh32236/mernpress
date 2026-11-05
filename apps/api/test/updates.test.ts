import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createUpdateService, ContentError } from '@mernpress/cms-core';
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

const principal = {
  userId: '00000000-0000-7000-8000-000000000000',
  role: 'administrator',
};

describe('updates api', () => {
  it('reports installed versions and no check source by default', async () => {
    const { cookieHeader } = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/updates',
      headers: { cookie: cookieHeader },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      coreVersion: string;
      source: string;
      lastCheckedAt: string | null;
      items: Array<{ type: string; installedVersion: string }>;
    };
    expect(body.coreVersion).toBe('0.1.0');
    expect(body.source).toBe('local');
    expect(body.lastCheckedAt).toBeNull();
    expect(body.items.some((item) => item.type === 'theme')).toBe(true);
    expect(body.items.some((item) => item.type === 'plugin')).toBe(true);
  });

  it('records the check time when Check again runs', async () => {
    const { cookieHeader, csrfToken } = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/updates/check',
      headers: { origin: ADMIN_ORIGIN, cookie: cookieHeader, 'x-csrf-token': csrfToken },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { lastCheckedAt: string | null; source: string };
    expect(body.source).toBe('local');
    expect(typeof body.lastCheckedAt).toBe('string');
  });

  it('rejects anonymous and non-administrator access', async () => {
    const anonymous = await app.inject({ method: 'GET', url: '/api/admin/updates' });
    expect(anonymous.statusCode).toBe(401);

    await seedUser(app, { username: 'editor', password: 'Editor-pass-2026!', role: 'editor' });
    const { cookieHeader } = await loginAs(app, 'editor', 'Editor-pass-2026!');
    const editor = await app.inject({
      method: 'GET',
      url: '/api/admin/updates',
      headers: { cookie: cookieHeader },
    });
    expect(editor.statusCode).toBe(403);
  });
});

describe('update checking against a manifest', () => {
  it('marks newer core/plugin versions as updates', async () => {
    const service = createUpdateService({
      prisma: app.database,
      manifestUrl: 'https://updates.example/manifest.json',
      installedPlugins: async () => [
        {
          id: 'hello-mernpress',
          name: 'Hello MERNPress',
          version: '1.0.0',
          author: 'The MERNPress team',
          description: 'A plugin.',
          details: 'Details.',
        },
      ],
      now: () => new Date('2026-11-04T10:00:00.000Z'),
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            core: '0.2.0',
            plugins: { 'hello-mernpress': '1.0.1' },
            themes: { mernpress: '0.1.0' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    });

    const result = await service.check(principal);
    expect(result.manifestConfigured).toBe(true);
    expect(result.source).toBe('manifest');
    expect(result.updatesAvailable).toBe(2);
    expect(result.lastCheckedAt).toBe('2026-11-04T10:00:00.000Z');
    const core = result.items.find((item) => item.type === 'core');
    expect(core).toMatchObject({ availableVersion: '0.2.0', status: 'update' });
    const theme = result.items.find((item) => item.type === 'theme');
    expect(theme?.status).toBe('current');
  });

  it('keeps the last check result for later screen loads', async () => {
    const service = createUpdateService({
      prisma: app.database,
      manifestUrl: 'https://updates.example/manifest.json',
      now: () => new Date('2026-11-04T10:00:00.000Z'),
      fetchImpl: async () => new Response(JSON.stringify({ core: '0.3.0' }), { status: 200 }),
    });
    await service.check(principal);
    const reread = await service.status(principal);
    expect(reread.lastCheckedAt).toBe('2026-11-04T10:00:00.000Z');
    expect(reread.updatesAvailable).toBe(1);
    const core = reread.items.find((item) => item.type === 'core');
    expect(core).toMatchObject({ availableVersion: '0.3.0', status: 'update' });
  });

  it('treats equal or older published versions as current', async () => {
    const service = createUpdateService({
      prisma: app.database,
      manifestUrl: 'https://updates.example/manifest.json',
      fetchImpl: async () =>
        new Response(JSON.stringify({ core: '0.1.0', themes: { mernpress: '0.0.9' } }), {
          status: 200,
        }),
    });
    const result = await service.check(principal);
    expect(result.updatesAvailable).toBe(0);
    expect(result.items.every((item) => item.status === 'current')).toBe(true);
  });

  it('surfaces an unreachable update service as UPDATE_CHECK_FAILED', async () => {
    const service = createUpdateService({
      prisma: app.database,
      manifestUrl: 'https://updates.example/manifest.json',
      fetchImpl: async () => {
        throw new Error('network down');
      },
    });
    await expect(service.check(principal)).rejects.toMatchObject({
      code: 'UPDATE_CHECK_FAILED',
      statusCode: 502,
    });
    await expect(service.check(principal)).rejects.toBeInstanceOf(ContentError);
  });
});

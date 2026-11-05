import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  loginAs,
  seedAdmin,
  seedUser,
} from './helpers/auth.js';

interface RedirectListShape {
  redirects: Array<{
    id: string;
    fromPath: string;
    toPath: string;
    statusCode: number;
    hits: number;
  }>;
  notFound: Array<{ id: string; path: string; hits: number }>;
}

describe('redirects and 404 log', () => {
  let app: FastifyInstance;
  let headers: Record<string, string>;
  let cookie: string;

  beforeEach(async () => {
    app = await createTestApp();
    await seedAdmin(app);
    const session = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    cookie = session.cookieHeader;
    headers = {
      origin: ADMIN_ORIGIN,
      cookie,
      'x-csrf-token': session.csrfToken,
      'content-type': 'application/json',
    };
  });

  afterEach(async () => {
    await app.close();
  });

  const bodyless = () => {
    const { 'content-type': _contentType, ...rest } = headers;
    return rest;
  };

  async function createRedirect(fromPath: string, toPath: string, statusCode?: 301 | 302) {
    return app.inject({
      method: 'POST',
      url: '/api/admin/redirects',
      headers,
      payload: { fromPath, toPath, ...(statusCode ? { statusCode } : {}) },
    });
  }

  it('creates, lists, updates and deletes a redirect', async () => {
    const created = await createRedirect('/old-post', '/posts/new-post');
    expect(created.statusCode).toBe(200);
    const list = created.json() as RedirectListShape;
    expect(list.redirects).toHaveLength(1);
    expect(list.redirects[0]).toMatchObject({
      fromPath: '/old-post',
      toPath: '/posts/new-post',
      statusCode: 301,
      hits: 0,
    });

    const id = list.redirects[0]!.id;
    const updated = await app.inject({
      method: 'PUT',
      url: `/api/admin/redirects/${id}`,
      headers,
      payload: { fromPath: '/old-post/', toPath: 'https://example.com/new', statusCode: 302 },
    });
    expect(updated.statusCode).toBe(200);
    expect((updated.json() as RedirectListShape).redirects[0]).toMatchObject({
      fromPath: '/old-post',
      toPath: 'https://example.com/new',
      statusCode: 302,
    });

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/admin/redirects/${id}`,
      headers: bodyless(),
    });
    expect(deleted.statusCode).toBe(200);
    expect((deleted.json() as RedirectListShape).redirects).toEqual([]);
    const missing = await app.inject({
      method: 'DELETE',
      url: `/api/admin/redirects/${id}`,
      headers: bodyless(),
    });
    expect(missing.statusCode).toBe(404);
  });

  it('normalizes paths and rejects invalid or looping redirects', async () => {
    const normalized = await createRedirect('old/', '/new');
    expect(normalized.statusCode).toBe(200);
    expect((normalized.json() as RedirectListShape).redirects[0]).toMatchObject({
      fromPath: '/old',
      toPath: '/new',
    });

    const duplicate = await createRedirect('/old', '/other');
    expect(duplicate.statusCode).toBe(409);

    const absolute = await createRedirect('https://example.com/old', '/new');
    expect(absolute.statusCode).toBe(400);

    const javascript = await createRedirect('/x', 'javascript:alert(1)');
    expect(javascript.statusCode).toBe(400);

    const loop = await createRedirect('/new', '/old');
    expect(loop.statusCode).toBe(400);
    expect((loop.json() as { error: { message: string } }).error.message).toContain('loop');

    const self = await createRedirect('/self', '/self');
    expect(self.statusCode).toBe(400);
  });

  it('publishes the redirect map and counts hits', async () => {
    await createRedirect('/old', '/posts/new', 301);
    const map = await app.inject({ method: 'GET', url: '/api/public/redirects' });
    expect(map.statusCode).toBe(200);
    const items = (map.json() as { items: Array<{ fromPath: string; toPath: string }> }).items;
    expect(items).toEqual([
      {
        fromPath: '/old',
        toPath: '/posts/new',
        statusCode: 301,
        id: expect.any(String),
        hits: 0,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    ]);

    const hit = await app.inject({
      method: 'POST',
      url: '/api/public/redirects/hit',
      headers: { origin: ADMIN_ORIGIN, 'content-type': 'application/json' },
      payload: { path: '/old/' },
    });
    expect(hit.statusCode).toBe(204);
    const list = await app.inject({
      method: 'GET',
      url: '/api/admin/redirects',
      headers: { cookie },
    });
    expect((list.json() as RedirectListShape).redirects[0]!.hits).toBe(1);
  });

  it('logs 404 paths, aggregates repeats and dismisses them', async () => {
    for (const path of ['/missing', '/missing/', '/another-missing']) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/public/not-found',
        headers: { origin: ADMIN_ORIGIN, 'content-type': 'application/json' },
        payload: { path },
      });
      expect(response.statusCode).toBe(204);
    }
    const list = await app.inject({
      method: 'GET',
      url: '/api/admin/redirects',
      headers: { cookie },
    });
    const notFound = (list.json() as RedirectListShape).notFound;
    expect(notFound).toHaveLength(2);
    expect(notFound.find((entry) => entry.path === '/missing')?.hits).toBe(2);

    const entry = notFound.find((item) => item.path === '/another-missing')!;
    const dismissed = await app.inject({
      method: 'DELETE',
      url: `/api/admin/redirects/not-found/${entry.id}`,
      headers: bodyless(),
    });
    expect(dismissed.statusCode).toBe(200);
    expect((dismissed.json() as RedirectListShape).notFound).toHaveLength(1);
  });

  it('rejects anonymous and non-administrator access', async () => {
    const anonymous = await app.inject({ method: 'GET', url: '/api/admin/redirects' });
    expect(anonymous.statusCode).toBe(401);

    await seedUser(app, { username: 'editor', password: 'Editor-pass-2026!', role: 'editor' });
    const editor = await loginAs(app, 'editor', 'Editor-pass-2026!');
    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/admin/redirects',
      headers: { cookie: editor.cookieHeader },
    });
    expect(forbidden.statusCode).toBe(403);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AdminPost } from '@mernpress/cms-core';
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

async function createRequest(
  headers: Record<string, string>,
  type: 'EXPORT' | 'ERASE',
  email: string,
) {
  return app.inject({
    method: 'POST',
    url: '/api/admin/data-requests',
    headers,
    payload: { type, email },
  });
}

describe('personal data requests', () => {
  it('creates, lists and exports a user data request', async () => {
    await seedUser(app, { username: 'reader', password: 'Reader-pass-2026!', role: 'subscriber' });
    await app.database.user.update({
      where: { username: 'reader' },
      data: { email: 'reader@example.com', displayName: 'Reader' },
    });
    const headers = await adminHeaders();

    const created = await createRequest(headers, 'EXPORT', 'reader@example.com');
    expect(created.statusCode).toBe(201);
    const request = created.json() as { id: string; status: string; type: string };
    expect(request).toMatchObject({ status: 'PENDING', type: 'EXPORT' });

    const list = await app.inject({
      method: 'GET',
      url: '/api/admin/data-requests?type=EXPORT',
      headers: { cookie: headers.cookie },
    });
    expect((list.json() as { items: unknown[] }).items).toHaveLength(1);

    const exported = await app.inject({
      method: 'GET',
      url: `/api/admin/data-requests/${request.id}/export`,
      headers: { cookie: headers.cookie },
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.headers['content-disposition']).toContain('attachment');
    const payload = exported.json() as {
      user: { username: string };
      posts: unknown[];
      comments: unknown[];
    };
    expect(payload.user.username).toBe('reader');

    const completed = await app.inject({
      method: 'POST',
      url: `/api/admin/data-requests/${request.id}/complete`,
      headers,
      payload: {},
    });
    expect(completed.statusCode).toBe(200);
    expect((completed.json() as { status: string }).status).toBe('COMPLETED');
  });

  it('anonymises profile and comment authorship for an erasure request', async () => {
    await seedUser(app, { username: 'eraseme', password: 'Erase-pass-2026!', role: 'author' });
    const user = await app.database.user.findFirst({ where: { username: 'eraseme' } });
    await app.database.user.update({
      where: { id: user!.id },
      data: {
        email: 'erase@example.com',
        displayName: 'Erase Me',
        firstName: 'Erase',
        bio: 'Personal bio',
        website: 'https://erase.example',
      },
    });
    const headers = await adminHeaders();

    const postResponse = await app.inject({
      method: 'POST',
      url: '/api/admin/posts',
      headers,
      payload: { type: 'post', title: 'Commented post' },
    });
    const post = postResponse.json() as AdminPost;
    await app.inject({
      method: 'POST',
      url: `/api/admin/posts/${post.id}/publish`,
      headers,
      payload: { baseVersion: post.version },
    });
    const comment = await app.inject({
      method: 'POST',
      url: `/api/public/posts/${post.id}/comments`,
      headers: { origin: ADMIN_ORIGIN, 'content-type': 'application/json' },
      payload: {
        authorName: 'Erase Me',
        authorEmail: 'erase@example.com',
        content: 'My comment.',
      },
    });
    expect(comment.statusCode).toBe(201);

    const created = await createRequest(headers, 'ERASE', 'erase@example.com');
    expect(created.statusCode).toBe(201);
    const requestId = (created.json() as { id: string }).id;

    const erased = await app.inject({
      method: 'POST',
      url: `/api/admin/data-requests/${requestId}/complete`,
      headers,
      payload: {},
    });
    expect(erased.statusCode).toBe(200);

    const anonymised = await app.database.user.findUnique({ where: { id: user!.id } });
    expect(anonymised).toMatchObject({
      email: null,
      displayName: null,
      firstName: null,
      bio: null,
      website: null,
    });
    const comments = await app.database.comment.findMany({});
    expect(comments[0]).toMatchObject({
      authorName: 'Anonymous',
      authorEmail: 'removed@example.invalid',
      authorUrl: null,
      userId: null,
    });
  });

  it('rejects duplicates, unknown accounts and anonymous callers', async () => {
    await seedUser(app, { username: 'reader2', password: 'Reader-pass-2026!', role: 'subscriber' });
    await app.database.user.update({
      where: { username: 'reader2' },
      data: { email: 'reader2@example.com' },
    });
    const headers = await adminHeaders();
    expect((await createRequest(headers, 'EXPORT', 'reader2@example.com')).statusCode).toBe(201);
    expect((await createRequest(headers, 'EXPORT', 'reader2@example.com')).statusCode).toBe(409);
    expect((await createRequest(headers, 'EXPORT', 'nobody@example.com')).statusCode).toBe(404);
    expect((await createRequest(headers, 'EXPORT', 'not-an-email')).statusCode).toBe(400);

    const anonymous = await app.inject({
      method: 'GET',
      url: '/api/admin/data-requests?type=EXPORT',
    });
    expect(anonymous.statusCode).toBe(401);
  });
});

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
} from '../helpers/auth.js';

interface AdminPostShape {
  id: string;
  status: string;
  authorId: string | null;
  publishedAt: string | null;
  commentStatus: 'open' | 'closed';
  sticky: boolean;
  version: number;
}

interface PublicListShape {
  items: Array<{ id: string; title: string; sticky: boolean }>;
}

describe('quick edit fields: date, author, comments and sticky', () => {
  let app: FastifyInstance;
  let headers: Record<string, string>;

  beforeEach(async () => {
    app = await createTestApp();
    await seedAdmin(app);
    const session = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    headers = {
      origin: ADMIN_ORIGIN,
      cookie: session.cookieHeader,
      'x-csrf-token': session.csrfToken,
      'content-type': 'application/json',
    };
  });

  afterEach(async () => {
    await app.close();
  });

  async function createPost(payload: Record<string, unknown>): Promise<AdminPostShape> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/posts',
      headers,
      payload,
    });
    expect(response.statusCode).toBe(201);
    return response.json() as AdminPostShape;
  }

  async function publish(post: AdminPostShape): Promise<AdminPostShape> {
    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/posts/${post.id}/publish`,
      headers,
      payload: { baseVersion: post.version },
    });
    expect(response.statusCode).toBe(200);
    return response.json() as AdminPostShape;
  }

  it('updates the publish date, author, comment status and sticky flag', async () => {
    await seedUser(app, { username: 'author-b', password: 'Author-pass-2026!', role: 'author' });
    const authorB = await app.database.user.findUniqueOrThrow({
      where: { username: 'author-b' },
    });
    const post = await createPost({ type: 'post', title: 'Quick edit target' });

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}`,
      headers,
      payload: {
        baseVersion: post.version,
        publishedAt: '2026-11-05T09:30:00.000Z',
        authorId: authorB.id,
        commentStatus: 'closed',
        sticky: true,
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      id: post.id,
      authorId: authorB.id,
      publishedAt: '2026-11-05T09:30:00.000Z',
      commentStatus: 'closed',
      sticky: true,
    });

    const read = await app.inject({
      method: 'GET',
      url: `/api/admin/posts/${post.id}`,
      headers: { cookie: headers.cookie },
    });
    expect(read.json()).toMatchObject({ commentStatus: 'closed', sticky: true });
  });

  it('rejects an invalid publish date before touching the row', async () => {
    const post = await createPost({ type: 'post', title: 'Bad date' });
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}`,
      headers,
      payload: { baseVersion: post.version, publishedAt: 'not-a-date' },
    });
    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
  });

  it('only lets users with edit-any permission reassign the author', async () => {
    await seedUser(app, { username: 'author-c', password: 'Author-pass-2026!', role: 'author' });
    const session = await loginAs(app, 'author-c', 'Author-pass-2026!');
    const authorHeaders = {
      origin: ADMIN_ORIGIN,
      cookie: session.cookieHeader,
      'x-csrf-token': session.csrfToken,
      'content-type': 'application/json',
    };
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/posts',
      headers: authorHeaders,
      payload: { type: 'post', title: 'Author owned' },
    });
    expect(created.statusCode).toBe(201);
    const post = created.json() as AdminPostShape;
    const admin = await app.database.user.findUniqueOrThrow({
      where: { username: ADMIN_USERNAME },
    });

    const forbidden = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}`,
      headers: authorHeaders,
      payload: { baseVersion: post.version, authorId: admin.id },
    });
    expect(forbidden.statusCode).toBe(403);
    expect((forbidden.json() as { error: { code: string } }).error.code).toBe('FORBIDDEN');
  });

  it('honours a per-post closed comment status for new comments', async () => {
    await app.database.option.upsert({
      where: { key: 'comment_moderation' },
      create: { key: 'comment_moderation', value: 'false', group: 'discussion' },
      update: { value: 'false' },
    });
    const open = await publish(await createPost({ type: 'post', title: 'Open comments' }));
    const closed = await publish(await createPost({ type: 'post', title: 'Closed comments' }));

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${closed.id}`,
      headers,
      payload: { baseVersion: closed.version, commentStatus: 'closed' },
    });
    expect(patched.statusCode).toBe(200);

    const allowed = await app.inject({
      method: 'POST',
      url: `/api/public/posts/${open.id}/comments`,
      headers: { origin: ADMIN_ORIGIN, 'content-type': 'application/json' },
      payload: { authorName: 'Reader', authorEmail: 'open@example.com', content: 'Open works.' },
    });
    expect(allowed.statusCode).toBe(201);

    const rejected = await app.inject({
      method: 'POST',
      url: `/api/public/posts/${closed.id}/comments`,
      headers: { origin: ADMIN_ORIGIN, 'content-type': 'application/json' },
      payload: { authorName: 'Reader', authorEmail: 'closed@example.com', content: 'Closed.' },
    });
    expect(rejected.statusCode).toBe(403);
    expect((rejected.json() as { error: { message: string } }).error.message).toBe(
      'Comments are closed.',
    );
  });

  it('pins sticky posts above newer normal posts on the public list', async () => {
    const older = await publish(await createPost({ type: 'post', title: 'Older sticky' }));
    const newer = await publish(await createPost({ type: 'post', title: 'Newer normal' }));
    const sticky = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${older.id}`,
      headers,
      payload: {
        baseVersion: older.version,
        sticky: true,
        publishedAt: '2026-01-01T00:00:00.000Z',
      },
    });
    expect(sticky.statusCode).toBe(200);
    const newerPatch = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${newer.id}`,
      headers,
      payload: { baseVersion: newer.version, publishedAt: '2026-11-01T00:00:00.000Z' },
    });
    expect(newerPatch.statusCode).toBe(200);

    const list = await app.inject({ method: 'GET', url: '/api/public/posts?type=post' });
    expect(list.statusCode).toBe(200);
    const body = list.json() as PublicListShape;
    expect(body.items[0]?.title).toBe('Older sticky');
    expect(body.items[0]?.sticky).toBe(true);
    expect(body.items[1]?.title).toBe('Newer normal');
  });
});

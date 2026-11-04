import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AdminComment, AdminPost } from '@mernpress/cms-core';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  loginAs,
  seedAdmin,
} from '../helpers/auth.js';

let app: FastifyInstance;
let headers: Record<string, string>;

beforeEach(async () => {
  app = await createTestApp();
  await seedAdmin(app);
  const { cookieHeader, csrfToken } = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
  headers = {
    origin: ADMIN_ORIGIN,
    cookie: cookieHeader,
    'x-csrf-token': csrfToken,
    'content-type': 'application/json',
  };
});

afterEach(async () => {
  await app.close();
});

async function createPost(payload: Record<string, unknown>): Promise<AdminPost> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/admin/posts',
    headers,
    payload,
  });
  expect(response.statusCode).toBe(201);
  return response.json() as AdminPost;
}

async function publish(post: AdminPost): Promise<AdminPost> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/admin/posts/${post.id}/publish`,
    headers,
    payload: { baseVersion: post.version },
  });
  expect(response.statusCode).toBe(200);
  return response.json() as AdminPost;
}

async function addComment(postId: string, content = 'A public comment.') {
  return app.inject({
    method: 'POST',
    url: `/api/public/posts/${postId}/comments`,
    headers: { origin: ADMIN_ORIGIN, 'content-type': 'application/json' },
    payload: {
      authorName: 'Commenter',
      authorEmail: 'commenter@example.com',
      content,
    },
  });
}

describe('public comments', () => {
  it('accepts an approved comment on a published post and lists it', async () => {
    const post = await publish(await createPost({ type: 'post', title: 'Commented' }));
    const created = await addComment(post.id, 'Hello from a reader.');
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      parentId: null,
      authorName: 'Commenter',
      content: 'Hello from a reader.',
    });

    const list = await app.inject({
      method: 'GET',
      url: `/api/public/posts/${post.id}/comments`,
    });
    expect(list.statusCode).toBe(200);
    expect((list.json() as { items: unknown[] }).items).toHaveLength(1);
  });

  it('rejects comments on drafts and invalid submissions', async () => {
    const draft = await createPost({ type: 'post', title: 'Draft post' });
    const missing = await addComment(draft.id);
    expect(missing.statusCode).toBe(404);

    const post = await publish(await createPost({ type: 'post', title: 'Live' }));
    const badEmail = await app.inject({
      method: 'POST',
      url: `/api/public/posts/${post.id}/comments`,
      headers: { origin: ADMIN_ORIGIN, 'content-type': 'application/json' },
      payload: { authorName: 'A', authorEmail: 'not-an-email', content: 'x' },
    });
    expect(badEmail.statusCode).toBe(400);
  });

  it('rate-limits repeated comments from the same email', async () => {
    const post = await publish(await createPost({ type: 'post', title: 'Rate limited' }));
    expect((await addComment(post.id, 'First')).statusCode).toBe(201);
    const second = await addComment(post.id, 'Second');
    expect(second.statusCode).toBe(429);
  });
});

describe('admin comment moderation', () => {
  it('lists counts, approves, spams and deletes a comment', async () => {
    const post = await publish(await createPost({ type: 'post', title: 'Moderated' }));
    await addComment(post.id);

    const list = await app.inject({ method: 'GET', url: '/api/admin/comments', headers });
    expect(list.statusCode).toBe(200);
    const body = list.json() as {
      items: AdminComment[];
      counts: { all: number; approved: number };
    };
    expect(body.items).toHaveLength(1);
    expect(body.counts).toMatchObject({ all: 1, approved: 1 });

    const id = body.items[0]!.id;
    const spam = await app.inject({
      method: 'PATCH',
      url: `/api/admin/comments/${id}/status`,
      headers,
      payload: { status: 'SPAM' },
    });
    expect(spam.statusCode).toBe(200);
    expect((spam.json() as AdminComment).status).toBe('SPAM');

    const counts = await app.inject({
      method: 'GET',
      url: '/api/admin/comments/counts',
      headers,
    });
    expect(counts.json()).toMatchObject({ spam: 1, approved: 0 });

    const deleteHeaders = { ...headers };
    delete deleteHeaders['content-type'];
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/admin/comments/${id}`,
      headers: deleteHeaders,
    });
    expect(deleted.statusCode).toBe(204);
  });

  it('rejects anonymous moderation and allows editors', async () => {
    const post = await publish(await createPost({ type: 'post', title: 'Roles' }));
    await addComment(post.id);
    const list = await app.inject({ method: 'GET', url: '/api/admin/comments', headers });
    const id = (list.json() as { items: AdminComment[] }).items[0]!.id;

    const anonymous = await app.inject({
      method: 'PATCH',
      url: `/api/admin/comments/${id}/status`,
      headers: { origin: ADMIN_ORIGIN, 'content-type': 'application/json' },
      payload: { status: 'APPROVED' },
    });
    expect(anonymous.statusCode).toBe(401);
  });
});

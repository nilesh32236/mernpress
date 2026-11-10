import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AdminPost, AutosaveState } from '@mernpress/cms-core';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  loginAs,
  seedAdmin,
  seedUser,
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

async function createPost(): Promise<AdminPost> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/admin/posts',
    headers,
    payload: { type: 'post', title: 'Autosave target' },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as AdminPost;
}

function snapshot(overrides: Record<string, unknown> = {}) {
  return { title: 'Autosaved title', content: '<p>Autosaved body</p>', ...overrides };
}

describe('PUT /api/admin/posts/:id/autosave', () => {
  it('stores a snapshot without touching the posts row', async () => {
    const post = await createPost();
    const before = await app.database.post.findUnique({ where: { id: post.id } });

    const response = await app.inject({
      method: 'PUT',
      url: `/api/admin/posts/${post.id}/autosave`,
      headers,
      payload: snapshot(),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as AutosaveState;
    expect(body.title).toBe('Autosaved title');
    expect(body.content).toBe('<p>Autosaved body</p>');

    const after = await app.database.post.findUnique({ where: { id: post.id } });
    expect(after?.title).toBe(before?.title);
    expect(after?.content).toBe(before?.content);
    expect(after?.version).toBe(before?.version);
  });

  it('keeps exactly one autosave per post (replace semantics)', async () => {
    const post = await createPost();
    for (const title of ['v1', 'v2', 'v3']) {
      await app.inject({
        method: 'PUT',
        url: `/api/admin/posts/${post.id}/autosave`,
        headers,
        payload: snapshot({ title }),
      });
    }
    const rows = await app.database.postRevision.findMany({
      where: { postId: post.id, kind: 'autosave' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe('v3');
  });

  it('autosaves never appear in the revisions list and do not consume revision retention', async () => {
    const post = await createPost();
    await app.inject({
      method: 'PUT',
      url: `/api/admin/posts/${post.id}/autosave`,
      headers,
      payload: snapshot(),
    });
    // A normal update writes a real revision.
    await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}`,
      headers,
      payload: { title: 'Real edit', baseVersion: post.version },
    });

    const revisions = await app.inject({
      method: 'GET',
      url: `/api/admin/posts/${post.id}/revisions`,
      headers,
    });
    const list = revisions.json() as Array<{ title: string }>;
    expect(list.map((revision) => revision.title)).not.toContain('Autosaved title');
  });

  it('getAutosave returns the snapshot plus the post updatedAt for recovery prompts', async () => {
    const post = await createPost();
    await app.inject({
      method: 'PUT',
      url: `/api/admin/posts/${post.id}/autosave`,
      headers,
      payload: snapshot(),
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/admin/posts/${post.id}/autosave`,
      headers,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { autosave: AutosaveState; postUpdatedAt: string };
    expect(body.autosave.title).toBe('Autosaved title');
    expect(new Date(body.autosave.createdAt).getTime()).toBeGreaterThan(
      new Date(body.postUpdatedAt).getTime() - 5000,
    );
  });

  it('discardAutosave removes the row and is idempotent', async () => {
    const post = await createPost();
    await app.inject({
      method: 'PUT',
      url: `/api/admin/posts/${post.id}/autosave`,
      headers,
      payload: snapshot(),
    });
    // DELETE carries no JSON body; sending a JSON content-type would be a 400.
    const deleteHeaders = { ...headers };
    delete deleteHeaders['content-type'];
    const first = await app.inject({
      method: 'DELETE',
      url: `/api/admin/posts/${post.id}/autosave`,
      headers: deleteHeaders,
    });
    expect(first.statusCode).toBe(204);
    const second = await app.inject({
      method: 'DELETE',
      url: `/api/admin/posts/${post.id}/autosave`,
      headers: deleteHeaders,
    });
    expect(second.statusCode).toBe(204);
    const state = await app.inject({
      method: 'GET',
      url: `/api/admin/posts/${post.id}/autosave`,
      headers,
    });
    expect(state.json().autosave).toBeNull();
  });

  it('requires authentication and object-level edit rights', async () => {
    const post = await createPost();
    const unauthenticated = await app.inject({
      method: 'PUT',
      url: `/api/admin/posts/${post.id}/autosave`,
      headers: { origin: ADMIN_ORIGIN, 'content-type': 'application/json' },
      payload: snapshot(),
    });
    expect(unauthenticated.statusCode).toBe(401);

    await seedUser(app, {
      username: 'outsider',
      password: 'outsider-password-123',
      role: 'author',
    });
    const login = await loginAs(app, 'outsider', 'outsider-password-123');
    const forbidden = await app.inject({
      method: 'PUT',
      url: `/api/admin/posts/${post.id}/autosave`,
      headers: {
        origin: ADMIN_ORIGIN,
        cookie: login.cookieHeader,
        'x-csrf-token': login.csrfToken,
        'content-type': 'application/json',
      },
      payload: snapshot(),
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('rejects oversized titles and content', async () => {
    const post = await createPost();
    const response = await app.inject({
      method: 'PUT',
      url: `/api/admin/posts/${post.id}/autosave`,
      headers,
      payload: snapshot({ title: 'x'.repeat(301) }),
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects invalid block markup so a restore can never land broken content', async () => {
    const post = await createPost();
    const open = '<!-- wp:group -->\n<div class="wp-block-group">';
    const close = '\n</div>\n<!-- /wp:group -->';
    const deeplyNested = open.repeat(25) + '<p>x</p>' + close.repeat(25);
    const response = await app.inject({
      method: 'PUT',
      url: `/api/admin/posts/${post.id}/autosave`,
      headers,
      payload: snapshot({ content: deeplyNested }),
    });
    expect(response.statusCode).toBe(400);
    expect(
      await app.database.postRevision.count({ where: { postId: post.id, kind: 'autosave' } }),
    ).toBe(0);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AdminPost, BulkResult } from '@mernpress/cms-core';
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

async function createPost(title: string): Promise<AdminPost> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/admin/posts',
    headers,
    payload: { type: 'post', title },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as AdminPost;
}

async function bulk(
  action: string,
  items: Array<{ id: string; baseVersion: number }>,
  customHeaders: Record<string, string> = headers,
) {
  return app.inject({
    method: 'POST',
    url: '/api/admin/posts/bulk',
    headers: customHeaders,
    payload: { action, items },
  });
}

describe('POST /api/admin/posts/bulk', () => {
  it('publishes multiple drafts and reports per-item success', async () => {
    const a = await createPost('Bulk A');
    const b = await createPost('Bulk B');

    const response = await bulk('publish', [
      { id: a.id, baseVersion: a.version },
      { id: b.id, baseVersion: b.version },
    ]);
    expect(response.statusCode).toBe(200);
    const result = response.json() as BulkResult;
    expect(result.succeeded.sort()).toEqual([a.id, b.id].sort());
    expect(result.failed).toEqual([]);

    const rows = await app.database.post.findMany({ where: { id: { in: [a.id, b.id] } } });
    expect(rows.every((row) => row.status === 'PUBLISHED')).toBe(true);
  });

  it('reports partial failure transparently (stale version succeeds nowhere, others succeed)', async () => {
    const good = await createPost('Good');
    const stale = await createPost('Stale');

    const response = await bulk('publish', [
      { id: good.id, baseVersion: good.version },
      { id: stale.id, baseVersion: stale.version + 9 },
    ]);
    const result = response.json() as BulkResult;
    expect(result.succeeded).toEqual([good.id]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.id).toBe(stale.id);
    expect(result.failed[0]?.error?.code).toBe('VERSION_CONFLICT');
  });

  it('trash + restore round-trips via bulk', async () => {
    const post = await createPost('Round Trip');
    const trashed = await bulk('trash', [{ id: post.id, baseVersion: post.version }]);
    expect(trashed.json().succeeded).toEqual([post.id]);

    const version = (await app.database.post.findUnique({ where: { id: post.id } }))?.version;
    const restored = await bulk('restore', [{ id: post.id, baseVersion: version! }]);
    expect(restored.json().succeeded).toEqual([post.id]);
    expect((await app.database.post.findUnique({ where: { id: post.id } }))?.status).toBe('DRAFT');
  });

  it('permanently deletes only trashed posts', async () => {
    const trashed = await createPost('Delete Me');
    await bulk('trash', [{ id: trashed.id, baseVersion: trashed.version }]);
    const trashedVersion = (await app.database.post.findUnique({ where: { id: trashed.id } }))!
      .version;

    const notTrashed = await createPost('Keep Me');
    const response = await bulk('delete', [
      { id: trashed.id, baseVersion: trashedVersion },
      { id: notTrashed.id, baseVersion: notTrashed.version },
    ]);
    const result = response.json() as BulkResult;
    expect(result.succeeded).toEqual([trashed.id]);
    expect(result.failed[0]?.id).toBe(notTrashed.id);
    expect(result.failed[0]?.error?.code).toBe('INVALID_TRANSITION');

    expect(await app.database.post.findUnique({ where: { id: trashed.id } })).toBeNull();
    expect(await app.database.post.findUnique({ where: { id: notTrashed.id } })).not.toBeNull();
    // Revisions cascade with the post.
    expect(await app.database.postRevision.count({ where: { postId: trashed.id } })).toBe(0);
  });

  it('rejects more than 100 items', async () => {
    const response = await bulk(
      'trash',
      Array.from({ length: 101 }, () => ({
        id: crypto.randomUUID(),
        baseVersion: 1,
      })),
    );
    expect(response.statusCode).toBe(400);
  });

  it('requires authentication', async () => {
    const post = await createPost('Auth');
    const response = await bulk('trash', [{ id: post.id, baseVersion: post.version }], {
      origin: ADMIN_ORIGIN,
      'content-type': 'application/json',
    });
    expect(response.statusCode).toBe(401);
  });

  it("enforces per-object authorization: an author cannot bulk-trash another author's posts", async () => {
    const mine = await createPost('Admin Post');
    await seedUser(app, { username: 'author1', password: 'author-password-123', role: 'author' });
    const login = await loginAs(app, 'author1', 'author-password-123');

    const response = await bulk('trash', [{ id: mine.id, baseVersion: mine.version }], {
      origin: ADMIN_ORIGIN,
      cookie: login.cookieHeader,
      'x-csrf-token': login.csrfToken,
      'content-type': 'application/json',
    });
    const result = response.json() as BulkResult;
    expect(result.succeeded).toEqual([]);
    expect(result.failed[0]?.error?.code).toBe('FORBIDDEN');
    expect((await app.database.post.findUnique({ where: { id: mine.id } }))?.status).toBe('DRAFT');
  });
});

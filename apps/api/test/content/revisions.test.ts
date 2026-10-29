import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AdminPost, AdminRevision, AdminRevisionDetail } from '@mernpress/cms-core';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  loginAs,
  seedAdmin,
  seedUser,
} from '../helpers/auth.js';

const PASSWORD = 'Correct horse battery staple';

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

function first<T>(items: T[]): T {
  const value = items[0];
  if (value === undefined) {
    throw new Error('expected at least one item');
  }
  return value;
}

function paragraph(value: string): string {
  return `<!-- wp:paragraph --><p>${value}</p><!-- /wp:paragraph -->`;
}

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

async function updatePost(
  id: string,
  payload: Record<string, unknown>,
  requestHeaders: Record<string, string> = headers,
): Promise<AdminPost> {
  const response = await app.inject({
    method: 'PATCH',
    url: `/api/admin/posts/${id}`,
    headers: requestHeaders,
    payload,
  });
  expect(response.statusCode).toBe(200);
  return response.json() as AdminPost;
}

async function listRevisions(id: string, requestHeaders: Record<string, string> = headers) {
  return app.inject({
    method: 'GET',
    url: `/api/admin/posts/${id}/revisions`,
    headers: requestHeaders,
  });
}

async function getRevision(
  id: string,
  revisionId: string,
  requestHeaders: Record<string, string> = headers,
) {
  return app.inject({
    method: 'GET',
    url: `/api/admin/posts/${id}/revisions/${revisionId}`,
    headers: requestHeaders,
  });
}

async function restoreRevision(
  id: string,
  revisionId: string,
  baseVersion: number,
  requestHeaders: Record<string, string> = headers,
) {
  return app.inject({
    method: 'POST',
    url: `/api/admin/posts/${id}/revisions/${revisionId}/restore`,
    headers: requestHeaders,
    payload: { baseVersion },
  });
}

async function createCategory(name: string): Promise<{ id: string }> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/admin/terms',
    headers,
    payload: { taxonomy: 'category', name },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as { id: string };
}

async function revisionCountOf(id: string): Promise<number> {
  const row = await app.database.post.findUnique({
    where: { id },
    select: { revisionCount: true },
  });
  return row?.revisionCount ?? -1;
}

describe('post revisions (P8-01)', () => {
  it('snapshots the PRE-update content, title and SEO on a content update', async () => {
    const post = await createPost({
      type: 'post',
      title: 'Original title',
      content: paragraph('first body'),
      seoTitle: 'Original SEO',
      seoDescription: 'Original description',
    });

    const updated = await updatePost(post.id, {
      baseVersion: post.version,
      title: 'Changed title',
      content: paragraph('second body'),
      seoTitle: 'Changed SEO',
    });

    expect(updated.version).toBe(2);
    expect(updated.title).toBe('Changed title');
    expect(await revisionCountOf(post.id)).toBe(1);

    const listResponse = await listRevisions(post.id);
    expect(listResponse.statusCode).toBe(200);
    const revisions = listResponse.json() as AdminRevision[];
    expect(revisions).toHaveLength(1);
    const revision = first(revisions);
    expect(revision.postId).toBe(post.id);
    expect(revision.title).toBe('Original title');
    expect(revision.revisionNumber).toBe(1);
    expect(revision.authorId).toBe(post.authorId);

    const detailResponse = await getRevision(post.id, revision.id);
    expect(detailResponse.statusCode).toBe(200);
    const detail = detailResponse.json() as AdminRevisionDetail;
    expect(detail.content).toBe(paragraph('first body'));
    expect(detail.seoTitle).toBe('Original SEO');
    expect(detail.seoDescription).toBe('Original description');
    expect(detail.revisionNumber).toBe(1);
  });

  it('does not snapshot a no-op or slug-only update', async () => {
    const post = await createPost({ type: 'post', title: 'Stable', content: paragraph('x') });

    await updatePost(post.id, { baseVersion: post.version, title: 'Stable' });
    const afterNoop = await listRevisions(post.id);
    expect(afterNoop.statusCode).toBe(200);
    expect(afterNoop.json() as AdminRevision[]).toHaveLength(0);
    expect(await revisionCountOf(post.id)).toBe(0);
  });

  it('does not snapshot a terms-only update', async () => {
    const category = await createCategory('Revision News');
    const post = await createPost({ type: 'post', title: 'Tagged', content: paragraph('x') });

    const response = await app.inject({
      method: 'PUT',
      url: `/api/admin/posts/${post.id}/terms`,
      headers,
      payload: { baseVersion: post.version, categoryIds: [category.id], tagIds: [] },
    });
    expect(response.statusCode).toBe(200);

    const listResponse = await listRevisions(post.id);
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json() as AdminRevision[]).toHaveLength(0);
    expect(await revisionCountOf(post.id)).toBe(0);
  });

  it('does not snapshot publish, trash or restore transitions', async () => {
    const post = await createPost({ type: 'post', title: 'Transitions', content: paragraph('x') });

    const published = await app.inject({
      method: 'POST',
      url: `/api/admin/posts/${post.id}/publish`,
      headers,
      payload: { baseVersion: post.version },
    });
    expect(published.statusCode).toBe(200);
    const afterPublish = published.json() as AdminPost;

    const trashed = await app.inject({
      method: 'POST',
      url: `/api/admin/posts/${post.id}/trash`,
      headers,
      payload: { baseVersion: afterPublish.version },
    });
    expect(trashed.statusCode).toBe(200);
    const afterTrash = trashed.json() as AdminPost;

    const restored = await app.inject({
      method: 'POST',
      url: `/api/admin/posts/${post.id}/restore`,
      headers,
      payload: { baseVersion: afterTrash.version },
    });
    expect(restored.statusCode).toBe(200);

    const listResponse = await listRevisions(post.id);
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json() as AdminRevision[]).toHaveLength(0);
    expect(await revisionCountOf(post.id)).toBe(0);
  });

  it('retains the newest 50 revisions while revisionCount stays cumulative', async () => {
    const post = await createPost({ type: 'post', title: 'v0', content: paragraph('v0') });

    let current = post;
    for (let i = 1; i <= 52; i += 1) {
      current = await updatePost(current.id, {
        baseVersion: current.version,
        title: `v${i}`,
        content: paragraph(`v${i}`),
      });
    }
    expect(current.version).toBe(53);
    expect(await revisionCountOf(post.id)).toBe(52);

    const listResponse = await listRevisions(post.id);
    expect(listResponse.statusCode).toBe(200);
    const revisions = listResponse.json() as AdminRevision[];
    expect(revisions).toHaveLength(50);

    // Newest-first: the two oldest snapshots (v0, v1) were pruned.
    expect(revisions[0]?.title).toBe('v51');
    expect(revisions[49]?.title).toBe('v2');
    expect(revisions.map((revision) => revision.title)).not.toContain('v0');
    expect(revisions.map((revision) => revision.title)).not.toContain('v1');

    // revisionNumber is the surviving oldest-first ordinal, so it stays
    // contiguous 1..50 and is stable per revision.
    expect(revisions[49]?.revisionNumber).toBe(1);
    expect(revisions[0]?.revisionNumber).toBe(50);
  });

  it('lists newest-first with stable revision numbers', async () => {
    const post = await createPost({ type: 'post', title: 'one', content: paragraph('one') });
    const second = await updatePost(post.id, {
      baseVersion: post.version,
      title: 'two',
      content: paragraph('two'),
    });
    const third = await updatePost(post.id, {
      baseVersion: second.version,
      title: 'three',
      content: paragraph('three'),
    });

    const before = (await listRevisions(post.id)).json() as AdminRevision[];
    expect(before.map((revision) => revision.title)).toEqual(['two', 'one']);
    expect(before.map((revision) => revision.revisionNumber)).toEqual([2, 1]);

    await updatePost(post.id, {
      baseVersion: third.version,
      title: 'four',
      content: paragraph('four'),
    });

    const after = (await listRevisions(post.id)).json() as AdminRevision[];
    expect(after.map((revision) => revision.title)).toEqual(['three', 'two', 'one']);
    expect(after.map((revision) => revision.revisionNumber)).toEqual([3, 2, 1]);
    // The pre-existing revision numbers did not change.
    const one = after.find((revision) => revision.title === 'one');
    expect(one?.revisionNumber).toBe(1);
  });

  it('returns 404 for a revision from another post or an unknown id', async () => {
    const post = await createPost({ type: 'post', title: 'Owner', content: paragraph('a') });
    await updatePost(post.id, {
      baseVersion: post.version,
      content: paragraph('b'),
      title: 'Owner changed',
    });
    const revisions = (await listRevisions(post.id)).json() as AdminRevision[];
    const revision = first(revisions);

    const other = await createPost({ type: 'post', title: 'Other', content: paragraph('c') });

    const wrongPost = await getRevision(other.id, revision.id);
    expect(wrongPost.statusCode).toBe(404);

    const unknown = await getRevision(post.id, '01900000-0000-7000-8000-000000000000');
    expect(unknown.statusCode).toBe(404);
  });

  it('restores a revision through the normal update path', async () => {
    const post = await createPost({ type: 'post', title: 'Before', content: paragraph('before') });
    const updated = await updatePost(post.id, {
      baseVersion: post.version,
      title: 'After',
      content: paragraph('after'),
      seoTitle: 'After SEO',
    });
    const revisions = (await listRevisions(post.id)).json() as AdminRevision[];
    const target = first(revisions);
    expect(target.title).toBe('Before');

    const response = await restoreRevision(post.id, target.id, updated.version);
    expect(response.statusCode).toBe(200);
    const restored = response.json() as AdminPost;
    expect(restored.title).toBe('Before');
    expect(restored.content).toBe(paragraph('before'));
    expect(restored.seoTitle).toBeNull();
    expect(restored.version).toBe(updated.version + 1);

    // The restore itself is snapshotted (pre-restore "After" state), so it can
    // be undone by restoring again.
    const afterRestore = (await listRevisions(post.id)).json() as AdminRevision[];
    expect(afterRestore).toHaveLength(2);
    expect(afterRestore[0]?.title).toBe('After');
    expect(await revisionCountOf(post.id)).toBe(2);
  });

  it('rejects a restore with a stale baseVersion (409)', async () => {
    const post = await createPost({ type: 'post', title: 'Conflict', content: paragraph('a') });
    const updated = await updatePost(post.id, {
      baseVersion: post.version,
      title: 'Conflict 2',
      content: paragraph('b'),
    });
    const revisions = (await listRevisions(post.id)).json() as AdminRevision[];
    const target = first(revisions);

    const stale = await restoreRevision(post.id, target.id, post.version);
    expect(stale.statusCode).toBe(409);
    expect((stale.json() as { error: { code: string } }).error.code).toBe('VERSION_CONFLICT');

    // A current baseVersion still works.
    const ok = await restoreRevision(post.id, target.id, updated.version);
    expect(ok.statusCode).toBe(200);
  });

  it('enforces object-level authorization for another author', async () => {
    const owner = await seedUser(app, {
      username: 'rev-owner',
      password: PASSWORD,
      role: 'author',
    });
    const ownerLogin = await loginAs(app, 'rev-owner', PASSWORD);
    const ownerHeaders = {
      origin: ADMIN_ORIGIN,
      cookie: ownerLogin.cookieHeader,
      'x-csrf-token': ownerLogin.csrfToken,
      'content-type': 'application/json',
    };

    await seedUser(app, { username: 'rev-other', password: PASSWORD, role: 'author' });
    const otherLogin = await loginAs(app, 'rev-other', PASSWORD);
    const otherHeaders = {
      origin: ADMIN_ORIGIN,
      cookie: otherLogin.cookieHeader,
      'x-csrf-token': otherLogin.csrfToken,
      'content-type': 'application/json',
    };

    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/posts',
      headers: ownerHeaders,
      payload: { type: 'post', title: 'Owner draft', content: paragraph('secret') },
    });
    expect(created.statusCode).toBe(201);
    const post = created.json() as AdminPost;
    expect(post.authorId).toBe(owner.id);

    const edited = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}`,
      headers: ownerHeaders,
      payload: { baseVersion: post.version, content: paragraph('secret v2') },
    });
    expect(edited.statusCode).toBe(200);
    const editedPost = edited.json() as AdminPost;

    const revisions = (await listRevisions(post.id, ownerHeaders)).json() as AdminRevision[];
    const revision = first(revisions);

    // Unreadable object (another author's draft) surfaces as 404, matching the
    // admin read visibility policy.
    const list = await listRevisions(post.id, otherHeaders);
    expect(list.statusCode).toBe(404);
    const get = await getRevision(post.id, revision.id, otherHeaders);
    expect(get.statusCode).toBe(404);

    // Restore requires edit permission on the object: 403.
    const restore = await restoreRevision(post.id, revision.id, editedPost.version, otherHeaders);
    expect(restore.statusCode).toBe(403);
  });

  it('returns 401 for unauthenticated revision access', async () => {
    const post = await createPost({ type: 'post', title: 'Guarded', content: paragraph('a') });

    const list = await app.inject({
      method: 'GET',
      url: `/api/admin/posts/${post.id}/revisions`,
    });
    expect(list.statusCode).toBe(401);

    const restore = await app.inject({
      method: 'POST',
      url: `/api/admin/posts/${post.id}/revisions/01900000-0000-7000-8000-000000000000/restore`,
      headers: { origin: ADMIN_ORIGIN, 'content-type': 'application/json' },
      payload: { baseVersion: post.version },
    });
    expect(restore.statusCode).toBe(401);
  });
});

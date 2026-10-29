import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AdminPost, Paged, PublicPost } from '@mernpress/cms-core';
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

async function createPost(payload: Record<string, unknown> = {}): Promise<AdminPost> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/admin/posts',
    headers,
    payload: { type: 'post', title: 'Scheduled Post', ...payload },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as AdminPost;
}

function futureIso(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

describe('PUT /api/admin/posts/:id/schedule', () => {
  it('schedules a draft for first publication and reads the state back', async () => {
    const post = await createPost();
    const when = futureIso(60 * 60_000);

    const scheduled = await app.inject({
      method: 'PUT',
      url: `/api/admin/posts/${post.id}/schedule`,
      headers,
      payload: { scheduledAt: when, baseVersion: post.version },
    });
    expect(scheduled.statusCode).toBe(200);
    expect(scheduled.json()).toEqual({ scheduledAt: when });

    const state = await app.inject({
      method: 'GET',
      url: `/api/admin/posts/${post.id}/schedule`,
      headers,
    });
    expect(state.json()).toEqual({ scheduledAt: when });

    const row = await app.database.post.findUnique({ where: { id: post.id } });
    expect(row?.status).toBe('DRAFT');
    expect(row?.scheduledAt?.toISOString()).toBe(when);
  });

  it('rejects times less than 60 seconds in the future', async () => {
    const post = await createPost();
    const response = await app.inject({
      method: 'PUT',
      url: `/api/admin/posts/${post.id}/schedule`,
      headers,
      payload: { scheduledAt: futureIso(10_000), baseVersion: post.version },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('SCHEDULE_TOO_SOON');
  });

  it('rejects scheduling a published post', async () => {
    const post = await createPost();
    const published = await app.inject({
      method: 'POST',
      url: `/api/admin/posts/${post.id}/publish`,
      headers,
      payload: { baseVersion: post.version },
    });
    expect(published.statusCode).toBe(200);

    const response = await app.inject({
      method: 'PUT',
      url: `/api/admin/posts/${post.id}/schedule`,
      headers,
      payload: { scheduledAt: futureIso(60 * 60_000), baseVersion: published.json().version },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('SCHEDULE_INVALID_STATUS');
  });

  it('enforces optimistic concurrency', async () => {
    const post = await createPost();
    const response = await app.inject({
      method: 'PUT',
      url: `/api/admin/posts/${post.id}/schedule`,
      headers,
      payload: { scheduledAt: futureIso(60 * 60_000), baseVersion: post.version + 5 },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('VERSION_CONFLICT');
  });

  it('unschedules a scheduled draft', async () => {
    const post = await createPost();
    const scheduled = await app.inject({
      method: 'PUT',
      url: `/api/admin/posts/${post.id}/schedule`,
      headers,
      payload: { scheduledAt: futureIso(60 * 60_000), baseVersion: post.version },
    });
    const version = (await app.database.post.findUnique({ where: { id: post.id } }))?.version;

    const unscheduled = await app.inject({
      method: 'DELETE',
      url: `/api/admin/posts/${post.id}/schedule`,
      headers,
      payload: { baseVersion: version },
    });
    expect(unscheduled.statusCode).toBe(200);
    expect(unscheduled.json()).toEqual({ scheduledAt: null });
    expect(scheduled.statusCode).toBe(200);
  });

  it('requires authentication', async () => {
    const post = await createPost();
    const response = await app.inject({
      method: 'PUT',
      url: `/api/admin/posts/${post.id}/schedule`,
      headers: { origin: ADMIN_ORIGIN, 'content-type': 'application/json' },
      payload: { scheduledAt: futureIso(60 * 60_000), baseVersion: post.version },
    });
    expect(response.statusCode).toBe(401);
  });

  it("forbids a contributor from scheduling another author's post", async () => {
    const post = await createPost();
    await seedUser(app, {
      username: 'contrib',
      password: 'contrib-password-123',
      role: 'contributor',
    });
    const login = await loginAs(app, 'contrib', 'contrib-password-123');
    const response = await app.inject({
      method: 'PUT',
      url: `/api/admin/posts/${post.id}/schedule`,
      headers: {
        origin: ADMIN_ORIGIN,
        cookie: login.cookieHeader,
        'x-csrf-token': login.csrfToken,
        'content-type': 'application/json',
      },
      payload: { scheduledAt: futureIso(60 * 60_000), baseVersion: post.version },
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('publish sweeper (publishDueScheduled)', () => {
  it('promotes due drafts and leaves future-dated rows untouched', async () => {
    const due = await createPost({ title: 'Due' });
    const later = await createPost({ title: 'Later' });
    const past = new Date(Date.now() - 60_000);
    await app.database.post.update({ where: { id: due.id }, data: { scheduledAt: past } });
    await app.database.post.update({
      where: { id: later.id },
      data: { scheduledAt: new Date(Date.now() + 60 * 60_000) },
    });

    const result = await app.schedule.publishDueScheduled();
    expect(result.published).toEqual([due.id]);

    const dueRow = await app.database.post.findUnique({ where: { id: due.id } });
    expect(dueRow?.status).toBe('PUBLISHED');
    expect(dueRow?.publishedAt).not.toBeNull();
    expect(dueRow?.scheduledAt).toBeNull();

    const laterRow = await app.database.post.findUnique({ where: { id: later.id } });
    expect(laterRow?.status).toBe('DRAFT');
    expect(laterRow?.scheduledAt).not.toBeNull();
  });

  it('makes swept posts visible on public routes only after promotion', async () => {
    const post = await createPost({ title: 'Public Soon', slug: 'public-soon' });
    await app.database.post.update({
      where: { id: post.id },
      data: { scheduledAt: new Date(Date.now() - 60_000) },
    });

    const before = await app.inject({
      method: 'GET',
      url: '/api/public/posts/public-soon?type=post',
    });
    expect(before.statusCode).toBe(404);

    await app.schedule.publishDueScheduled();

    const after = await app.inject({
      method: 'GET',
      url: '/api/public/posts/public-soon?type=post',
    });
    expect(after.statusCode).toBe(200);
    const list = await app.inject({ method: 'GET', url: '/api/public/posts' });
    const body = list.json() as Paged<PublicPost>;
    expect(body.items.some((item) => item.id === post.id)).toBe(true);
  });

  it('is idempotent: a second sweep publishes nothing', async () => {
    const post = await createPost();
    await app.database.post.update({
      where: { id: post.id },
      data: { scheduledAt: new Date(Date.now() - 60_000) },
    });

    const first = await app.schedule.publishDueScheduled();
    const second = await app.schedule.publishDueScheduled();
    expect(first.published).toHaveLength(1);
    expect(second.published).toEqual([]);
  });

  it('does not republish a post that was published manually after scheduling', async () => {
    const post = await createPost();
    await app.database.post.update({
      where: { id: post.id },
      data: { scheduledAt: new Date(Date.now() - 60_000) },
    });
    const version = (await app.database.post.findUnique({ where: { id: post.id } }))?.version;
    const published = await app.inject({
      method: 'POST',
      url: `/api/admin/posts/${post.id}/publish`,
      headers,
      payload: { baseVersion: version },
    });
    expect(published.statusCode).toBe(200);
    const publishedAt = (await app.database.post.findUnique({ where: { id: post.id } }))
      ?.publishedAt;

    const result = await app.schedule.publishDueScheduled();
    expect(result.published).toEqual([]);
    const row = await app.database.post.findUnique({ where: { id: post.id } });
    expect(row?.publishedAt?.toISOString()).toBe(publishedAt?.toISOString());
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AdminPost, AdminTerm, Paged, PublicPost } from '@mernpress/cms-core';
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

async function createTerm(payload: Record<string, unknown>): Promise<AdminTerm> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/admin/terms',
    headers,
    payload,
  });
  expect(response.statusCode).toBe(201);
  return response.json() as AdminTerm;
}

describe('GET /api/public/posts', () => {
  it('returns only published posts; drafts and trashed posts are absent', async () => {
    const published = await publish(await createPost({ type: 'post', title: 'Live' }));
    await createPost({ type: 'post', title: 'Hidden Draft' });
    const doomed = await createPost({ type: 'post', title: 'Trashed' });
    await app.inject({
      method: 'POST',
      url: `/api/admin/posts/${doomed.id}/trash`,
      headers,
      payload: { baseVersion: doomed.version },
    });

    const response = await app.inject({ method: 'GET', url: '/api/public/posts' });
    expect(response.statusCode).toBe(200);
    const body = response.json() as Paged<PublicPost>;
    expect(body.pagination.total).toBe(1);
    expect(body.items.map((item) => item.id)).toEqual([published.id]);
  });

  it('excludes posts scheduled in the future (publishedAt > now)', async () => {
    const live = await publish(await createPost({ type: 'post', title: 'Live Now' }));
    const future = await createPost({ type: 'post', title: 'Future' });
    await publish(future);
    // Move the second post's publishedAt into the future, bypassing the service.
    await app.database.post.update({
      where: { id: future.id },
      data: { publishedAt: new Date(Date.now() + 60 * 60_000) },
    });

    const response = await app.inject({ method: 'GET', url: '/api/public/posts' });
    const body = response.json() as Paged<PublicPost>;
    expect(body.pagination.total).toBe(1);
    expect(body.items[0]?.id).toBe(live.id);
  });

  it('orders by publishedAt descending', async () => {
    const older = await publish(await createPost({ type: 'post', title: 'Older' }));
    const newer = await publish(await createPost({ type: 'post', title: 'Newer' }));
    // Force a deterministic publishedAt ordering.
    await app.database.post.update({
      where: { id: older.id },
      data: { publishedAt: new Date('2026-01-01T00:00:00.000Z') },
    });
    await app.database.post.update({
      where: { id: newer.id },
      data: { publishedAt: new Date('2026-06-01T00:00:00.000Z') },
    });

    const response = await app.inject({ method: 'GET', url: '/api/public/posts' });
    const body = response.json() as Paged<PublicPost>;
    expect(body.items.map((item) => item.id)).toEqual([newer.id, older.id]);
  });

  it('filters by type and reports correct pagination totals', async () => {
    for (let i = 0; i < 3; i += 1) {
      await publish(await createPost({ type: 'post', title: `P${i}` }));
    }
    await publish(await createPost({ type: 'page', title: 'Page One' }));

    const posts = await app.inject({
      method: 'GET',
      url: '/api/public/posts?type=post&perPage=2&page=1',
    });
    const postsBody = posts.json() as Paged<PublicPost>;
    expect(postsBody.items).toHaveLength(2);
    expect(postsBody.pagination).toMatchObject({ page: 1, perPage: 2, total: 3, totalPages: 2 });

    const page2 = await app.inject({
      method: 'GET',
      url: '/api/public/posts?type=post&perPage=2&page=2',
    });
    const page2Body = page2.json() as Paged<PublicPost>;
    expect(page2Body.items).toHaveLength(1);
    expect(page2Body.pagination.totalPages).toBe(2);

    const pages = await app.inject({ method: 'GET', url: '/api/public/posts?type=page' });
    expect((pages.json() as Paged<PublicPost>).pagination.total).toBe(1);

    const overBound = await app.inject({
      method: 'GET',
      url: '/api/public/posts?perPage=101',
    });
    expect(overBound.statusCode).toBe(400);
  });
});

describe('GET /api/public/posts/:slug', () => {
  it('returns a published post with its terms', async () => {
    const category = await createTerm({ taxonomy: 'category', name: 'Public Cat' });
    const tag = await createTerm({ taxonomy: 'tag', name: 'Public Tag' });
    const post = await createPost({ type: 'post', title: 'With Terms' });
    const assigned = await app.inject({
      method: 'PUT',
      url: `/api/admin/posts/${post.id}/terms`,
      headers,
      payload: { baseVersion: post.version, categoryIds: [category.id], tagIds: [tag.id] },
    });
    expect(assigned.statusCode).toBe(200);
    const published = await publish(assigned.json() as AdminPost);

    const response = await app.inject({
      method: 'GET',
      url: `/api/public/posts/${published.slug}?type=post`,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as PublicPost;
    expect(body.id).toBe(published.id);
    expect(body.slug).toBe(published.slug);
    expect(body.terms.categories.map((term) => term.id)).toEqual([category.id]);
    expect(body.terms.tags.map((term) => term.id)).toEqual([tag.id]);
    // Public DTO must not leak admin internals.
    expect(body).not.toHaveProperty('authorId');
    expect(body).not.toHaveProperty('status');
    expect(body).not.toHaveProperty('version');
  });

  it('returns 404 for a draft slug', async () => {
    const draft = await createPost({ type: 'post', title: 'Draft Only' });

    const response = await app.inject({
      method: 'GET',
      url: `/api/public/posts/${draft.slug}?type=post`,
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');
  });

  it('returns 404 for a trashed post slug', async () => {
    const post = await publish(await createPost({ type: 'post', title: 'Gone' }));
    await app.inject({
      method: 'POST',
      url: `/api/admin/posts/${post.id}/trash`,
      headers,
      payload: { baseVersion: post.version },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/public/posts/${post.slug}?type=post`,
    });
    expect(response.statusCode).toBe(404);
  });

  it('returns 404 for an unknown slug', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/public/posts/definitely-not-there?type=post',
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');
  });

  it('scopes slug lookup by type', async () => {
    const post = await publish(await createPost({ type: 'post', title: 'Shared Name' }));

    const wrongType = await app.inject({
      method: 'GET',
      url: `/api/public/posts/${post.slug}?type=page`,
    });
    expect(wrongType.statusCode).toBe(404);

    const rightType = await app.inject({
      method: 'GET',
      url: `/api/public/posts/${post.slug}?type=post`,
    });
    expect(rightType.statusCode).toBe(200);
  });
});

describe('rendered public content (ADR 0007)', () => {
  it('returns sanitized renderedContent and a TOC alongside the raw source', async () => {
    const content =
      '<!-- wp:heading -->\n<h2>Rendered Section</h2>\n<!-- /wp:heading -->\n' +
      '<!-- wp:paragraph -->\n<p>Body with <a href="https://example.com">a link</a>.</p>\n<!-- /wp:paragraph -->';
    const post = await publish(await createPost({ type: 'post', title: 'Rendered', content }));

    const response = await app.inject({
      method: 'GET',
      url: `/api/public/posts/${post.slug}?type=post`,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as PublicPost;
    // Raw canonical source is still present for consumers that need it…
    expect(body.content).toBe(content);
    // …but the render path is sanitized and anchor-augmented.
    expect(body.renderedContent).toContain('<h2 id="rendered-section">Rendered Section</h2>');
    expect(body.renderedContent).toContain('<a href="https://example.com">a link</a>');
    expect(body.renderedContent).not.toContain('<!--');
    expect(body.toc).toEqual([{ level: 2, id: 'rendered-section', text: 'Rendered Section' }]);
  });

  it('strips stored XSS payloads from renderedContent on every public route', async () => {
    const content =
      '<!-- wp:paragraph -->\n<p>Text <img src=x onerror=alert(1)> ' +
      '<a href="javascript:alert(2)">bad</a><script>alert(3)</script></p>\n<!-- /wp:paragraph -->\n' +
      '<!-- wp:unknown/widget -->\n<div onclick="alert(4)">widget</div>\n<!-- /wp:unknown/widget -->';
    const post = await publish(await createPost({ type: 'post', title: 'XSS', content }));

    const single = await app.inject({
      method: 'GET',
      url: `/api/public/posts/${post.slug}?type=post`,
    });
    const singleBody = single.json() as PublicPost;
    expect(singleBody.renderedContent).not.toMatch(/onerror|onclick|javascript:|<script/);
    expect(singleBody.renderedContent).toContain('Text');

    const list = await app.inject({ method: 'GET', url: '/api/public/posts' });
    const listBody = list.json() as Paged<PublicPost>;
    const listed = listBody.items.find((item) => item.id === post.id);
    expect(listed?.renderedContent).not.toMatch(/onerror|onclick|javascript:|<script/);
    // The raw stored source is untouched — preservation, not rewriting.
    expect(listed?.content).toBe(content);
  });

  it('fails closed to empty renderedContent for legacy unrenderable rows', async () => {
    const post = await publish(await createPost({ type: 'post', title: 'Legacy' }));
    // Simulate a pre-validation row whose stored markup violates depth limits.
    const deep = `${'<!-- wp:group --><div class="wp-block-group">'.repeat(25)}<p>x</p>${'</div><!-- /wp:group -->'.repeat(25)}`;
    await app.database.post.update({ where: { id: post.id }, data: { content: deep } });

    const response = await app.inject({
      method: 'GET',
      url: `/api/public/posts/${post.slug}?type=post`,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as PublicPost;
    expect(body.renderedContent).toBe('');
    expect(body.toc).toEqual([]);
    expect(body.content).toBe(deep);
  });
});

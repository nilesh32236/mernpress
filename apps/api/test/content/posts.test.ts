import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  loginAs,
  seedAdmin,
} from '../helpers/auth.js';

interface ErrorEnvelope {
  error: { code: string; message: string; requestId: string };
}

interface AdminPostShape {
  id: string;
  type: 'post' | 'page';
  status: 'DRAFT' | 'PUBLISHED' | 'TRASHED';
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  authorId: string | null;
  publishedAt: string | null;
  version: number;
  terms: {
    categories: Array<{ id: string; name: string; slug: string }>;
    tags: Array<{ id: string; name: string; slug: string }>;
  };
}

interface AdminListShape {
  items: AdminPostShape[];
  pagination: { page: number; perPage: number; total: number; totalPages: number };
}

describe('admin content: posts', () => {
  let app: FastifyInstance;
  let cookieHeader: string;
  let csrfToken: string;

  beforeEach(async () => {
    app = await createTestApp();
    await seedAdmin(app);
    const session = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    cookieHeader = session.cookieHeader;
    csrfToken = session.csrfToken;
  });

  afterEach(async () => {
    await app.close();
  });

  function adminHeaders(): Record<string, string> {
    return {
      cookie: cookieHeader,
      'x-csrf-token': csrfToken,
      origin: ADMIN_ORIGIN,
      'content-type': 'application/json',
    };
  }

  async function createPost(payload: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: '/api/admin/posts',
      headers: adminHeaders(),
      payload,
    });
  }

  describe('create', () => {
    it('creates a post and returns 201 with the admin post shape', async () => {
      const response = await createPost({ type: 'post', title: 'Hello World' });

      expect(response.statusCode).toBe(201);
      const post = response.json() as AdminPostShape;
      expect(post.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(post.type).toBe('post');
      expect(post.status).toBe('DRAFT');
      expect(post.title).toBe('Hello World');
      expect(post.slug).toBe('hello-world');
      expect(post.version).toBe(1);
      expect(post.publishedAt).toBeNull();
      expect(post.authorId).not.toBeNull();
      expect(post.terms).toEqual({ categories: [], tags: [] });
    });

    it('creates a page', async () => {
      const response = await createPost({
        type: 'page',
        title: 'About Us',
        content: '<!-- wp:paragraph --><p>About</p><!-- /wp:paragraph -->',
      });

      expect(response.statusCode).toBe(201);
      const page = response.json() as AdminPostShape;
      expect(page.type).toBe('page');
      expect(page.slug).toBe('about-us');
      expect(page.content).toContain('About');
    });

    it('derives the slug from a unicode/accented title', async () => {
      const response = await createPost({ type: 'post', title: 'Café Über Alles!' });

      expect(response.statusCode).toBe(201);
      expect((response.json() as AdminPostShape).slug).toBe('cafe-uber-alles');
    });

    it('auto-suffixes a derived slug on collision (-2)', async () => {
      const first = await createPost({ type: 'post', title: 'Same Title' });
      expect(first.statusCode).toBe(201);
      expect((first.json() as AdminPostShape).slug).toBe('same-title');

      const second = await createPost({ type: 'post', title: 'Same Title' });
      expect(second.statusCode).toBe(201);
      expect((second.json() as AdminPostShape).slug).toBe('same-title-2');
    });

    it('rejects a duplicate explicit slug with 409 SLUG_TAKEN', async () => {
      const first = await createPost({ type: 'post', title: 'One', slug: 'taken-slug' });
      expect(first.statusCode).toBe(201);

      const second = await createPost({ type: 'post', title: 'Two', slug: 'taken-slug' });
      expect(second.statusCode).toBe(409);
      expect((second.json() as ErrorEnvelope).error.code).toBe('SLUG_TAKEN');
    });

    it('rejects a reserved explicit slug with 409 SLUG_RESERVED', async () => {
      const response = await createPost({ type: 'post', title: 'Admin', slug: 'admin' });

      expect(response.statusCode).toBe(409);
      expect((response.json() as ErrorEnvelope).error.code).toBe('SLUG_RESERVED');
    });

    it('rejects an explicit slug that normalizes to empty with 400 SLUG_INVALID', async () => {
      const response = await createPost({ type: 'post', title: 'Weird', slug: '!!!' });

      expect(response.statusCode).toBe(400);
      expect((response.json() as ErrorEnvelope).error.code).toBe('SLUG_INVALID');
    });

    it('scopes slug uniqueness by type: the same slug is allowed for a post and a page', async () => {
      const asPost = await createPost({ type: 'post', title: 'Shared', slug: 'shared-slug' });
      expect(asPost.statusCode).toBe(201);

      const asPage = await createPost({ type: 'page', title: 'Shared', slug: 'shared-slug' });
      expect(asPage.statusCode).toBe(201);
      expect((asPage.json() as AdminPostShape).slug).toBe('shared-slug');

      // ...but a second post with the same slug conflicts.
      const dupePost = await createPost({ type: 'post', title: 'Shared', slug: 'shared-slug' });
      expect(dupePost.statusCode).toBe(409);
      expect((dupePost.json() as ErrorEnvelope).error.code).toBe('SLUG_TAKEN');
    });

    it('rejects a missing title with 400 VALIDATION_ERROR', async () => {
      const response = await createPost({ type: 'post' });

      expect(response.statusCode).toBe(400);
      expect((response.json() as ErrorEnvelope).error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects an empty title with 400 VALIDATION_ERROR', async () => {
      const response = await createPost({ type: 'post', title: '   ' });

      expect(response.statusCode).toBe(400);
      expect((response.json() as ErrorEnvelope).error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects oversized content with 400 VALIDATION_ERROR', async () => {
      const response = await createPost({
        type: 'post',
        title: 'Big',
        content: 'x'.repeat(2_000_001),
      });

      expect(response.statusCode).toBe(400);
      expect((response.json() as ErrorEnvelope).error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects unknown fields (strict schema) with 400 VALIDATION_ERROR', async () => {
      const response = await createPost({
        type: 'post',
        title: 'Strict',
        notARealField: 'nope',
      });

      expect(response.statusCode).toBe(400);
      expect((response.json() as ErrorEnvelope).error.code).toBe('VALIDATION_ERROR');
    });

    it.each(['id', 'authorId', 'status', 'publishedAt', 'version'])(
      'rejects mass-assignment of %s with 400 VALIDATION_ERROR',
      async (field) => {
        const response = await createPost({
          type: 'post',
          title: 'Mass assignment',
          [field]:
            field === 'version'
              ? 99
              : field === 'status'
                ? 'PUBLISHED'
                : field === 'publishedAt'
                  ? '2026-01-01T00:00:00.000Z'
                  : '11111111-1111-4111-8111-111111111111',
        });

        expect(response.statusCode).toBe(400);
        expect((response.json() as ErrorEnvelope).error.code).toBe('VALIDATION_ERROR');
      },
    );
  });

  describe('read', () => {
    it('gets a post by id (200)', async () => {
      const created = (await (
        await createPost({ type: 'post', title: 'Fetch Me' })
      ).json()) as AdminPostShape;

      const response = await app.inject({
        method: 'GET',
        url: `/api/admin/posts/${created.id}`,
        headers: { cookie: cookieHeader },
      });

      expect(response.statusCode).toBe(200);
      expect((response.json() as AdminPostShape).title).toBe('Fetch Me');
    });

    it('returns 404 NOT_FOUND for an unknown id', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/posts/11111111-1111-4111-8111-111111111111',
        headers: { cookie: cookieHeader },
      });

      expect(response.statusCode).toBe(404);
      expect((response.json() as ErrorEnvelope).error.code).toBe('NOT_FOUND');
    });

    it('rejects a malformed id with 400', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/posts/not-a-uuid',
        headers: { cookie: cookieHeader },
      });

      expect(response.statusCode).toBe(400);
      expect((response.json() as ErrorEnvelope).error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      await createPost({ type: 'post', title: 'Alpha news' });
      await createPost({ type: 'post', title: 'Beta news' });
      await createPost({ type: 'post', title: 'Gamma tutorial' });
      await createPost({ type: 'page', title: 'Delta page' });
    });

    it('lists every post with pagination metadata', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/posts',
        headers: { cookie: cookieHeader },
      });

      expect(response.statusCode).toBe(200);
      const list = response.json() as AdminListShape;
      expect(list.pagination).toMatchObject({ page: 1, perPage: 20, total: 4, totalPages: 1 });
      expect(list.items).toHaveLength(4);
    });

    it('filters by type', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/posts?type=page',
        headers: { cookie: cookieHeader },
      });

      const list = response.json() as AdminListShape;
      expect(list.pagination.total).toBe(1);
      expect(list.items[0]?.type).toBe('page');
      expect(list.items[0]?.title).toBe('Delta page');
    });

    it('filters by status', async () => {
      const create = await createPost({ type: 'post', title: 'To publish' });
      const created = create.json() as AdminPostShape;
      await app.inject({
        method: 'POST',
        url: `/api/admin/posts/${created.id}/publish`,
        headers: adminHeaders(),
        payload: { baseVersion: created.version },
      });

      const published = await app.inject({
        method: 'GET',
        url: '/api/admin/posts?status=PUBLISHED',
        headers: { cookie: cookieHeader },
      });
      const publishedList = published.json() as AdminListShape;
      expect(publishedList.pagination.total).toBe(1);
      expect(publishedList.items[0]?.title).toBe('To publish');

      const drafts = await app.inject({
        method: 'GET',
        url: '/api/admin/posts?status=DRAFT',
        headers: { cookie: cookieHeader },
      });
      expect((drafts.json() as AdminListShape).pagination.total).toBe(4);
    });

    it('searches title case-insensitively', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/posts?search=NEWS',
        headers: { cookie: cookieHeader },
      });

      const list = response.json() as AdminListShape;
      expect(list.pagination.total).toBe(2);
      const titles = list.items.map((item) => item.title).sort();
      expect(titles).toEqual(['Alpha news', 'Beta news']);
    });

    it('paginates with page/perPage', async () => {
      const page1 = await app.inject({
        method: 'GET',
        url: '/api/admin/posts?perPage=3&page=1&sort=title&order=asc',
        headers: { cookie: cookieHeader },
      });
      const list1 = page1.json() as AdminListShape;
      expect(list1.pagination).toMatchObject({ page: 1, perPage: 3, total: 4, totalPages: 2 });
      expect(list1.items).toHaveLength(3);
      expect(list1.items.map((item) => item.title)).toEqual([
        'Alpha news',
        'Beta news',
        'Delta page',
      ]);

      const page2 = await app.inject({
        method: 'GET',
        url: '/api/admin/posts?perPage=3&page=2&sort=title&order=asc',
        headers: { cookie: cookieHeader },
      });
      const list2 = page2.json() as AdminListShape;
      expect(list2.items).toHaveLength(1);
      expect(list2.items[0]?.title).toBe('Gamma tutorial');
    });
  });

  describe('update', () => {
    it('updates the title with the correct baseVersion (200) and bumps the version', async () => {
      const created = (await (
        await createPost({ type: 'post', title: 'Before' })
      ).json()) as AdminPostShape;

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/admin/posts/${created.id}`,
        headers: adminHeaders(),
        payload: { baseVersion: created.version, title: 'After' },
      });

      expect(response.statusCode).toBe(200);
      const updated = response.json() as AdminPostShape;
      expect(updated.title).toBe('After');
      expect(updated.version).toBe(created.version + 1);
    });

    it('rejects a stale baseVersion with 409 VERSION_CONFLICT', async () => {
      const created = (await (
        await createPost({ type: 'post', title: 'Versioned' })
      ).json()) as AdminPostShape;

      const first = await app.inject({
        method: 'PATCH',
        url: `/api/admin/posts/${created.id}`,
        headers: adminHeaders(),
        payload: { baseVersion: created.version, title: 'First update' },
      });
      expect(first.statusCode).toBe(200);

      const stale = await app.inject({
        method: 'PATCH',
        url: `/api/admin/posts/${created.id}`,
        headers: adminHeaders(),
        payload: { baseVersion: created.version, title: 'Second update' },
      });
      expect(stale.statusCode).toBe(409);
      expect((stale.json() as ErrorEnvelope).error.code).toBe('VERSION_CONFLICT');
    });

    it('writes a post_slug_history row when the slug of a PUBLISHED post changes', async () => {
      const created = (await (
        await createPost({ type: 'post', title: 'History', slug: 'history-old' })
      ).json()) as AdminPostShape;
      const published = (await (
        await app.inject({
          method: 'POST',
          url: `/api/admin/posts/${created.id}/publish`,
          headers: adminHeaders(),
          payload: { baseVersion: created.version },
        })
      ).json()) as AdminPostShape;
      expect(published.status).toBe('PUBLISHED');

      const renamed = await app.inject({
        method: 'PATCH',
        url: `/api/admin/posts/${created.id}`,
        headers: adminHeaders(),
        payload: { baseVersion: published.version, slug: 'history-new' },
      });
      expect(renamed.statusCode).toBe(200);
      expect((renamed.json() as AdminPostShape).slug).toBe('history-new');

      const history = await app.database.postSlugHistory.findMany({
        where: { postId: created.id },
      });
      expect(history).toHaveLength(1);
      expect(history[0]?.oldSlug).toBe('history-old');
    });

    it('does not write slug history for a draft slug change', async () => {
      const created = (await (
        await createPost({ type: 'post', title: 'Draft history', slug: 'draft-old' })
      ).json()) as AdminPostShape;

      const renamed = await app.inject({
        method: 'PATCH',
        url: `/api/admin/posts/${created.id}`,
        headers: adminHeaders(),
        payload: { baseVersion: created.version, slug: 'draft-new' },
      });
      expect(renamed.statusCode).toBe(200);

      expect(await app.database.postSlugHistory.count({ where: { postId: created.id } })).toBe(0);
    });

    it('rejects an update to a slug already taken with 409 SLUG_TAKEN', async () => {
      const first = (await (
        await createPost({ type: 'post', title: 'First', slug: 'first-slug' })
      ).json()) as AdminPostShape;
      const second = (await (
        await createPost({ type: 'post', title: 'Second', slug: 'second-slug' })
      ).json()) as AdminPostShape;

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/admin/posts/${second.id}`,
        headers: adminHeaders(),
        payload: { baseVersion: second.version, slug: first.slug },
      });

      expect(response.statusCode).toBe(409);
      expect((response.json() as ErrorEnvelope).error.code).toBe('SLUG_TAKEN');
    });

    it('returns 404 NOT_FOUND when updating an unknown post', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/admin/posts/11111111-1111-4111-8111-111111111111',
        headers: adminHeaders(),
        payload: { baseVersion: 1, title: 'Nope' },
      });

      expect(response.statusCode).toBe(404);
      expect((response.json() as ErrorEnvelope).error.code).toBe('NOT_FOUND');
    });
  });
});

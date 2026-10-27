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

interface AdminTermShape {
  id: string;
  taxonomy: 'category' | 'tag';
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  postCount: number;
}

interface AdminPostShape {
  id: string;
  status: string;
  version: number;
  terms: {
    categories: Array<{ id: string; name: string; slug: string }>;
    tags: Array<{ id: string; name: string; slug: string }>;
  };
}

interface TermListShape {
  items: AdminTermShape[];
  pagination: { page: number; perPage: number; total: number; totalPages: number };
}

describe('admin taxonomy: terms', () => {
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

  async function createTerm(payload: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: '/api/admin/terms',
      headers: adminHeaders(),
      payload,
    });
  }

  async function mustCreateTerm(payload: Record<string, unknown>): Promise<AdminTermShape> {
    const response = await createTerm(payload);
    expect(response.statusCode).toBe(201);
    return response.json() as AdminTermShape;
  }

  async function createPost(title: string): Promise<AdminPostShape> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/posts',
      headers: adminHeaders(),
      payload: { type: 'post', title },
    });
    expect(response.statusCode).toBe(201);
    return response.json() as AdminPostShape;
  }

  describe('create', () => {
    it('creates a category (201) with derived slug', async () => {
      const response = await createTerm({ taxonomy: 'category', name: 'News Room' });

      expect(response.statusCode).toBe(201);
      const term = response.json() as AdminTermShape;
      expect(term.taxonomy).toBe('category');
      expect(term.name).toBe('News Room');
      expect(term.slug).toBe('news-room');
      expect(term.parentId).toBeNull();
      expect(term.postCount).toBe(0);
    });

    it('creates a tag (201)', async () => {
      const response = await createTerm({ taxonomy: 'tag', name: 'Featured', slug: 'featured' });

      expect(response.statusCode).toBe(201);
      const term = response.json() as AdminTermShape;
      expect(term.taxonomy).toBe('tag');
      expect(term.slug).toBe('featured');
    });

    it('scopes slug uniqueness per taxonomy: the same slug is allowed as a category AND a tag', async () => {
      const category = await mustCreateTerm({
        taxonomy: 'category',
        name: 'Shared',
        slug: 'shared',
      });

      const tagResponse = await createTerm({ taxonomy: 'tag', name: 'Shared', slug: 'shared' });
      expect(tagResponse.statusCode).toBe(201);
      expect((tagResponse.json() as AdminTermShape).id).not.toBe(category.id);
    });

    it('rejects a duplicate slug within one taxonomy with 409 TERM_SLUG_TAKEN', async () => {
      await mustCreateTerm({ taxonomy: 'category', name: 'First', slug: 'dupe' });

      const response = await createTerm({ taxonomy: 'category', name: 'Second', slug: 'dupe' });

      expect(response.statusCode).toBe(409);
      expect((response.json() as ErrorEnvelope).error.code).toBe('TERM_SLUG_TAKEN');
    });

    it('creates a child category with parentId', async () => {
      const parent = await mustCreateTerm({ taxonomy: 'category', name: 'Parent' });

      const response = await createTerm({
        taxonomy: 'category',
        name: 'Child',
        parentId: parent.id,
      });

      expect(response.statusCode).toBe(201);
      expect((response.json() as AdminTermShape).parentId).toBe(parent.id);
    });

    it('rejects a tag with a parentId with 400 TERM_PARENT_INVALID', async () => {
      const parent = await mustCreateTerm({ taxonomy: 'category', name: 'Parent' });

      const response = await createTerm({
        taxonomy: 'tag',
        name: 'Orphan tag',
        parentId: parent.id,
      });

      expect(response.statusCode).toBe(400);
      expect((response.json() as ErrorEnvelope).error.code).toBe('TERM_PARENT_INVALID');
    });

    it('rejects an unknown taxonomy value with 400 VALIDATION_ERROR', async () => {
      const response = await createTerm({ taxonomy: 'genre', name: 'Nope' });

      expect(response.statusCode).toBe(400);
      expect((response.json() as ErrorEnvelope).error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('read and list', () => {
    it('gets a term by id (200) and 404s an unknown id', async () => {
      const term = await mustCreateTerm({ taxonomy: 'category', name: 'Fetchable' });

      const found = await app.inject({
        method: 'GET',
        url: `/api/admin/terms/${term.id}`,
        headers: { cookie: cookieHeader },
      });
      expect(found.statusCode).toBe(200);
      expect((found.json() as AdminTermShape).name).toBe('Fetchable');

      const missing = await app.inject({
        method: 'GET',
        url: '/api/admin/terms/11111111-1111-4111-8111-111111111111',
        headers: { cookie: cookieHeader },
      });
      expect(missing.statusCode).toBe(404);
      expect((missing.json() as ErrorEnvelope).error.code).toBe('NOT_FOUND');
    });

    it('lists terms with a taxonomy filter', async () => {
      await mustCreateTerm({ taxonomy: 'category', name: 'Cat A' });
      await mustCreateTerm({ taxonomy: 'tag', name: 'Tag A' });
      await mustCreateTerm({ taxonomy: 'tag', name: 'Tag B' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/terms?taxonomy=tag',
        headers: { cookie: cookieHeader },
      });

      expect(response.statusCode).toBe(200);
      const list = response.json() as TermListShape;
      expect(list.pagination.total).toBe(2);
      expect(list.items.every((item) => item.taxonomy === 'tag')).toBe(true);
    });

    it('searches by name or slug', async () => {
      await mustCreateTerm({ taxonomy: 'category', name: 'Technology' });
      await mustCreateTerm({ taxonomy: 'category', name: 'Cooking' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/terms?search=techno',
        headers: { cookie: cookieHeader },
      });

      const list = response.json() as TermListShape;
      expect(list.pagination.total).toBe(1);
      expect(list.items[0]?.name).toBe('Technology');
    });

    it('computes postCount from real assignments', async () => {
      const term = await mustCreateTerm({ taxonomy: 'category', name: 'Counted' });
      const post = await createPost('Counted post');

      const assign = await app.inject({
        method: 'PUT',
        url: `/api/admin/posts/${post.id}/terms`,
        headers: adminHeaders(),
        payload: { categoryIds: [term.id], tagIds: [] },
      });
      expect(assign.statusCode).toBe(200);

      const found = await app.inject({
        method: 'GET',
        url: `/api/admin/terms/${term.id}`,
        headers: { cookie: cookieHeader },
      });
      expect((found.json() as AdminTermShape).postCount).toBe(1);
    });
  });

  describe('update', () => {
    it('updates name and slug (200)', async () => {
      const term = await mustCreateTerm({
        taxonomy: 'category',
        name: 'Old Name',
        slug: 'old-name',
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/admin/terms/${term.id}`,
        headers: adminHeaders(),
        payload: { name: 'New Name', slug: 'new-name' },
      });

      expect(response.statusCode).toBe(200);
      const updated = response.json() as AdminTermShape;
      expect(updated.name).toBe('New Name');
      expect(updated.slug).toBe('new-name');
    });

    it('rejects renaming onto a taken slug with 409 TERM_SLUG_TAKEN', async () => {
      await mustCreateTerm({ taxonomy: 'category', name: 'Taken', slug: 'taken' });
      const other = await mustCreateTerm({ taxonomy: 'category', name: 'Other', slug: 'other' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/admin/terms/${other.id}`,
        headers: adminHeaders(),
        payload: { slug: 'taken' },
      });

      expect(response.statusCode).toBe(409);
      expect((response.json() as ErrorEnvelope).error.code).toBe('TERM_SLUG_TAKEN');
    });

    it('rejects making a term its own parent with 409 TERM_PARENT_CYCLE', async () => {
      const term = await mustCreateTerm({ taxonomy: 'category', name: 'Selfish' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/admin/terms/${term.id}`,
        headers: adminHeaders(),
        payload: { parentId: term.id },
      });

      expect(response.statusCode).toBe(409);
      expect((response.json() as ErrorEnvelope).error.code).toBe('TERM_PARENT_CYCLE');
    });

    it('rejects an indirect cycle (A → B → A) with 409 TERM_PARENT_CYCLE', async () => {
      const a = await mustCreateTerm({ taxonomy: 'category', name: 'A' });
      const b = await mustCreateTerm({ taxonomy: 'category', name: 'B', parentId: a.id });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/admin/terms/${a.id}`,
        headers: adminHeaders(),
        payload: { parentId: b.id },
      });

      expect(response.statusCode).toBe(409);
      expect((response.json() as ErrorEnvelope).error.code).toBe('TERM_PARENT_CYCLE');
    });

    it('rejects a non-existent parent with 400 TERM_PARENT_INVALID', async () => {
      const term = await mustCreateTerm({ taxonomy: 'category', name: 'Reparented' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/admin/terms/${term.id}`,
        headers: adminHeaders(),
        payload: { parentId: '11111111-1111-4111-8111-111111111111' },
      });

      expect(response.statusCode).toBe(400);
      expect((response.json() as ErrorEnvelope).error.code).toBe('TERM_PARENT_INVALID');
    });

    it('rejects a tag as a category parent with 400 TERM_PARENT_INVALID', async () => {
      const tag = await mustCreateTerm({ taxonomy: 'tag', name: 'Not a category' });
      const category = await mustCreateTerm({ taxonomy: 'category', name: 'Reparent me' });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/admin/terms/${category.id}`,
        headers: adminHeaders(),
        payload: { parentId: tag.id },
      });

      expect(response.statusCode).toBe(400);
      expect((response.json() as ErrorEnvelope).error.code).toBe('TERM_PARENT_INVALID');
    });
  });

  describe('post term assignment', () => {
    it('assigns categories and tags to a post (200)', async () => {
      const category = await mustCreateTerm({ taxonomy: 'category', name: 'Assigned Cat' });
      const tag = await mustCreateTerm({ taxonomy: 'tag', name: 'Assigned Tag' });
      const post = await createPost('Tagged post');

      const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/posts/${post.id}/terms`,
        headers: adminHeaders(),
        payload: { categoryIds: [category.id], tagIds: [tag.id] },
      });

      expect(response.statusCode).toBe(200);
      const updated = response.json() as AdminPostShape;
      expect(updated.terms.categories.map((t) => t.id)).toEqual([category.id]);
      expect(updated.terms.tags.map((t) => t.id)).toEqual([tag.id]);
    });

    it('replaces existing assignments on PUT', async () => {
      const first = await mustCreateTerm({ taxonomy: 'category', name: 'First cat' });
      const second = await mustCreateTerm({ taxonomy: 'category', name: 'Second cat' });
      const post = await createPost('Reassigned');

      await app.inject({
        method: 'PUT',
        url: `/api/admin/posts/${post.id}/terms`,
        headers: adminHeaders(),
        payload: { categoryIds: [first.id], tagIds: [] },
      });

      const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/posts/${post.id}/terms`,
        headers: adminHeaders(),
        payload: { categoryIds: [second.id], tagIds: [] },
      });

      const updated = response.json() as AdminPostShape;
      expect(updated.terms.categories.map((t) => t.id)).toEqual([second.id]);
    });

    it('rejects an unknown term id with 400 TERM_NOT_FOUND', async () => {
      const post = await createPost('Bad terms');

      const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/posts/${post.id}/terms`,
        headers: adminHeaders(),
        payload: { categoryIds: ['11111111-1111-4111-8111-111111111111'], tagIds: [] },
      });

      expect(response.statusCode).toBe(400);
      expect((response.json() as ErrorEnvelope).error.code).toBe('TERM_NOT_FOUND');
    });

    it('rejects a category id passed in tagIds with 400 TERM_TAXONOMY_MISMATCH', async () => {
      const category = await mustCreateTerm({ taxonomy: 'category', name: 'Wrong slot' });
      const post = await createPost('Mismatch');

      const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/posts/${post.id}/terms`,
        headers: adminHeaders(),
        payload: { categoryIds: [], tagIds: [category.id] },
      });

      expect(response.statusCode).toBe(400);
      expect((response.json() as ErrorEnvelope).error.code).toBe('TERM_TAXONOMY_MISMATCH');
    });

    it('rejects duplicate ids with 400 VALIDATION_ERROR', async () => {
      const category = await mustCreateTerm({ taxonomy: 'category', name: 'Duplicated' });
      const post = await createPost('Duplicate ids');

      const response = await app.inject({
        method: 'PUT',
        url: `/api/admin/posts/${post.id}/terms`,
        headers: adminHeaders(),
        payload: { categoryIds: [category.id, category.id], tagIds: [] },
      });

      expect(response.statusCode).toBe(400);
      expect((response.json() as ErrorEnvelope).error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 NOT_FOUND when assigning terms on an unknown post', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/admin/posts/11111111-1111-4111-8111-111111111111/terms',
        headers: adminHeaders(),
        payload: { categoryIds: [], tagIds: [] },
      });

      expect(response.statusCode).toBe(404);
      expect((response.json() as ErrorEnvelope).error.code).toBe('NOT_FOUND');
    });
  });

  describe('delete', () => {
    it('detaches post_terms but leaves the post intact', async () => {
      const term = await mustCreateTerm({ taxonomy: 'category', name: 'Doomed' });
      const post = await createPost('Survivor');
      await app.inject({
        method: 'PUT',
        url: `/api/admin/posts/${post.id}/terms`,
        headers: adminHeaders(),
        payload: { categoryIds: [term.id], tagIds: [] },
      });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/admin/terms/${term.id}`,
        headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken, origin: ADMIN_ORIGIN },
      });

      expect(response.statusCode).toBe(200);
      expect((response.json() as { detachedPostCount: number }).detachedPostCount).toBe(1);

      // Term is gone.
      const gone = await app.inject({
        method: 'GET',
        url: `/api/admin/terms/${term.id}`,
        headers: { cookie: cookieHeader },
      });
      expect(gone.statusCode).toBe(404);

      // The post survives, now with empty terms.
      const survivor = await app.inject({
        method: 'GET',
        url: `/api/admin/posts/${post.id}`,
        headers: { cookie: cookieHeader },
      });
      expect(survivor.statusCode).toBe(200);
      expect((survivor.json() as AdminPostShape).terms.categories).toHaveLength(0);

      // No dangling join rows.
      expect(await app.database.postTerm.count({ where: { termId: term.id } })).toBe(0);
    });

    it('returns 404 NOT_FOUND when deleting an unknown term', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/admin/terms/11111111-1111-4111-8111-111111111111',
        headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken, origin: ADMIN_ORIGIN },
      });

      expect(response.statusCode).toBe(404);
      expect((response.json() as ErrorEnvelope).error.code).toBe('NOT_FOUND');
    });

    it('keeps slugs unique when a child could be promoted to root by deleting its parent', async () => {
      // A slug names at most one term per taxonomy (root or child). Creating a
      // root with the same slug as an existing child is rejected, so deleting a
      // parent can never promote a child into a duplicate root.
      const parent = await mustCreateTerm({ taxonomy: 'category', name: 'Shell' });
      await mustCreateTerm({
        taxonomy: 'category',
        name: 'SharedChild',
        slug: 'shared',
        parentId: parent.id,
      });

      // A root with the same slug must be rejected (symmetric reservation).
      const rootDupe = await createTerm({
        taxonomy: 'category',
        name: 'SharedRoot',
        slug: 'shared',
      });
      expect(rootDupe.statusCode).toBe(409);
      expect((rootDupe.json() as ErrorEnvelope).error.code).toBe('TERM_SLUG_TAKEN');

      // Deleting the parent promotes the child to root safely (no 500, no dupe).
      const del = await app.inject({
        method: 'DELETE',
        url: `/api/admin/terms/${parent.id}`,
        headers: { cookie: cookieHeader, 'x-csrf-token': csrfToken, origin: ADMIN_ORIGIN },
      });
      expect(del.statusCode).toBe(200);

      const promoted = await app.inject({
        method: 'GET',
        url: `/api/admin/terms?taxonomy=category&search=shared`,
        headers: { cookie: cookieHeader },
      });
      const list = promoted.json() as TermListShape;
      expect(list.pagination.total).toBe(1);
      expect(list.items[0]?.slug).toBe('shared');
      expect(list.items[0]?.parentId).toBeNull();
    });
  });
});

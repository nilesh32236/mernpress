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
  publishedAt: string | null;
  trashedAt: string | null;
  previousStatus: 'DRAFT' | 'PUBLISHED' | 'TRASHED' | null;
  version: number;
}

interface PublicListShape {
  items: Array<{ id: string; slug: string; status?: string }>;
  pagination: { page: number; perPage: number; total: number; totalPages: number };
}

describe('admin content: status transitions', () => {
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

  async function createDraft(title: string, slug?: string): Promise<AdminPostShape> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/posts',
      headers: adminHeaders(),
      payload: slug === undefined ? { type: 'post', title } : { type: 'post', title, slug },
    });
    expect(response.statusCode).toBe(201);
    return response.json() as AdminPostShape;
  }

  async function transition(
    id: string,
    action: 'publish' | 'unpublish' | 'trash' | 'restore',
    baseVersion: number,
  ) {
    return app.inject({
      method: 'POST',
      url: `/api/admin/posts/${id}/${action}`,
      headers: adminHeaders(),
      payload: { baseVersion },
    });
  }

  it('publishes a draft: status flips to PUBLISHED and publishedAt is set', async () => {
    const draft = await createDraft('Publish me');

    const response = await transition(draft.id, 'publish', draft.version);

    expect(response.statusCode).toBe(200);
    const published = response.json() as AdminPostShape;
    expect(published.status).toBe('PUBLISHED');
    expect(published.publishedAt).not.toBeNull();
    expect(published.version).toBe(draft.version + 1);
  });

  it('publishing an already published post is idempotent (noop)', async () => {
    const draft = await createDraft('Twice');
    const first = (await (
      await transition(draft.id, 'publish', draft.version)
    ).json()) as AdminPostShape;
    expect(first.status).toBe('PUBLISHED');

    const second = await transition(draft.id, 'publish', first.version);
    expect(second.statusCode).toBe(200);
    const again = second.json() as AdminPostShape;
    expect(again.status).toBe('PUBLISHED');
    // Noop: version and publishedAt are untouched.
    expect(again.version).toBe(first.version);
    expect(again.publishedAt).toBe(first.publishedAt);
  });

  it('unpublishes back to DRAFT and preserves publishedAt as history', async () => {
    const draft = await createDraft('Unpublish me');
    const published = (await (
      await transition(draft.id, 'publish', draft.version)
    ).json()) as AdminPostShape;

    const response = await transition(draft.id, 'unpublish', published.version);

    expect(response.statusCode).toBe(200);
    const unpublished = response.json() as AdminPostShape;
    expect(unpublished.status).toBe('DRAFT');
    expect(unpublished.publishedAt).toBe(published.publishedAt);
  });

  it('trashes a post and records previousStatus', async () => {
    const draft = await createDraft('Trash me');
    const published = (await (
      await transition(draft.id, 'publish', draft.version)
    ).json()) as AdminPostShape;

    const response = await transition(published.id, 'trash', published.version);

    expect(response.statusCode).toBe(200);
    const trashed = response.json() as AdminPostShape;
    expect(trashed.status).toBe('TRASHED');
    expect(trashed.previousStatus).toBe('PUBLISHED');
    expect(trashed.trashedAt).not.toBeNull();
  });

  it('restores a trashed post to its previous status (ADR 0003)', async () => {
    const draft = await createDraft('Restore me');
    const published = (await (
      await transition(draft.id, 'publish', draft.version)
    ).json()) as AdminPostShape;
    const trashed = (await (
      await transition(published.id, 'trash', published.version)
    ).json()) as AdminPostShape;
    expect(trashed.previousStatus).toBe('PUBLISHED');

    const response = await transition(trashed.id, 'restore', trashed.version);

    expect(response.statusCode).toBe(200);
    const restored = response.json() as AdminPostShape;
    expect(restored.status).toBe('PUBLISHED');
    expect(restored.previousStatus).toBeNull();
    expect(restored.trashedAt).toBeNull();
  });

  it('re-publish after unpublish preserves the original publishedAt (ADR 0003 D-2)', async () => {
    const draft = await createDraft('Republish');
    const published = (await (
      await transition(draft.id, 'publish', draft.version)
    ).json()) as AdminPostShape;
    const originalPublishedAt = published.publishedAt;
    expect(originalPublishedAt).not.toBeNull();

    const unpublished = (await (
      await transition(draft.id, 'unpublish', published.version)
    ).json()) as AdminPostShape;
    expect(unpublished.status).toBe('DRAFT');

    const republished = (await (
      await transition(draft.id, 'publish', unpublished.version)
    ).json()) as AdminPostShape;

    expect(republished.status).toBe('PUBLISHED');
    // The first-publish instant is history and must not be overwritten.
    expect(republished.publishedAt).toBe(originalPublishedAt);
  });

  it('restores a trashed draft back to DRAFT', async () => {
    const draft = await createDraft('Restore draft');
    const trashed = (await (
      await transition(draft.id, 'trash', draft.version)
    ).json()) as AdminPostShape;
    expect(trashed.previousStatus).toBe('DRAFT');

    const response = await transition(trashed.id, 'restore', trashed.version);

    expect(response.statusCode).toBe(200);
    expect((response.json() as AdminPostShape).status).toBe('DRAFT');
  });

  it('rejects publishing a trashed post with 409 INVALID_TRANSITION', async () => {
    const draft = await createDraft('Trashed publish');
    const trashed = (await (
      await transition(draft.id, 'trash', draft.version)
    ).json()) as AdminPostShape;

    const response = await transition(trashed.id, 'publish', trashed.version);

    expect(response.statusCode).toBe(409);
    expect((response.json() as ErrorEnvelope).error.code).toBe('INVALID_TRANSITION');
  });

  it('rejects a transition with a stale baseVersion with 409 VERSION_CONFLICT', async () => {
    const draft = await createDraft('Stale transition');
    const published = (await (
      await transition(draft.id, 'publish', draft.version)
    ).json()) as AdminPostShape;

    const response = await transition(published.id, 'trash', draft.version);

    expect(response.statusCode).toBe(409);
    expect((response.json() as ErrorEnvelope).error.code).toBe('VERSION_CONFLICT');
  });

  it('returns 404 NOT_FOUND for a transition on an unknown post', async () => {
    const response = await transition('11111111-1111-4111-8111-111111111111', 'publish', 1);

    expect(response.statusCode).toBe(404);
    expect((response.json() as ErrorEnvelope).error.code).toBe('NOT_FOUND');
  });

  describe('public visibility', () => {
    it('serves a published post by slug and 404s drafts and trashed posts', async () => {
      const draft = await createDraft('Public target', 'public-target');

      // Draft: not public yet.
      const draftResponse = await app.inject({
        method: 'GET',
        url: '/api/public/posts/public-target?type=post',
      });
      expect(draftResponse.statusCode).toBe(404);

      const published = (await (
        await transition(draft.id, 'publish', draft.version)
      ).json()) as AdminPostShape;
      const publicResponse = await app.inject({
        method: 'GET',
        url: '/api/public/posts/public-target?type=post',
      });
      expect(publicResponse.statusCode).toBe(200);
      const body = publicResponse.json() as { slug: string; title: string };
      expect(body.slug).toBe('public-target');
      expect(body.title).toBe('Public target');
      // The public DTO must not leak status internals.
      expect('status' in body).toBe(false);
      expect('version' in body).toBe(false);

      // Trashed: disappears from the public API again.
      const trashed = (await (
        await transition(published.id, 'trash', published.version)
      ).json()) as AdminPostShape;
      expect(trashed.status).toBe('TRASHED');
      const trashedResponse = await app.inject({
        method: 'GET',
        url: '/api/public/posts/public-target?type=post',
      });
      expect(trashedResponse.statusCode).toBe(404);
    });

    it('lists only published posts in the public list', async () => {
      const visible = await createDraft('Visible one', 'visible-one');
      const hiddenDraft = await createDraft('Hidden draft', 'hidden-draft');
      const hiddenTrashed = await createDraft('Hidden trashed', 'hidden-trashed');

      const publishedVisible = (await (
        await transition(visible.id, 'publish', visible.version)
      ).json()) as AdminPostShape;
      const publishedTrashed = (await (
        await transition(hiddenTrashed.id, 'publish', hiddenTrashed.version)
      ).json()) as AdminPostShape;
      await transition(publishedTrashed.id, 'trash', publishedTrashed.version);
      void publishedVisible;
      void hiddenDraft;

      const response = await app.inject({ method: 'GET', url: '/api/public/posts?type=post' });
      expect(response.statusCode).toBe(200);
      const list = response.json() as PublicListShape;
      expect(list.pagination.total).toBe(1);
      expect(list.items).toHaveLength(1);
      expect(list.items[0]?.slug).toBe('visible-one');
    });

    it('scopes the public slug lookup by type', async () => {
      const post = await createDraft('Typed slug', 'typed-slug');
      await transition(post.id, 'publish', post.version);

      // Same slug, but requested as a page: not found.
      const asPage = await app.inject({
        method: 'GET',
        url: '/api/public/posts/typed-slug?type=page',
      });
      expect(asPage.statusCode).toBe(404);

      const asPost = await app.inject({
        method: 'GET',
        url: '/api/public/posts/typed-slug?type=post',
      });
      expect(asPost.statusCode).toBe(200);
    });
  });
});

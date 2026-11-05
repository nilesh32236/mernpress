import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  loginAs,
  seedAdmin,
} from '../helpers/auth.js';

interface PublicAuthorShape {
  id: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  website: string | null;
}

interface PublicPostShape {
  id: string;
  slug: string;
  author: PublicAuthorShape | null;
}

describe('public author profile', () => {
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

  async function publishedPost(title: string): Promise<PublicPostShape> {
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/posts',
      headers,
      payload: {
        type: 'post',
        title,
        content: '<!-- wp:paragraph --><p>Body</p><!-- /wp:paragraph -->',
      },
    });
    expect(created.statusCode).toBe(201);
    const post = created.json() as { id: string; version: number };
    const published = await app.inject({
      method: 'POST',
      url: `/api/admin/posts/${post.id}/publish`,
      headers,
      payload: { baseVersion: post.version },
    });
    expect(published.statusCode).toBe(200);
    return published.json() as PublicPostShape;
  }

  it('exposes display name, bio and website but never the email', async () => {
    const updated = await app.inject({
      method: 'PUT',
      url: '/api/profile',
      headers,
      payload: {
        displayName: 'Ada Lovelace',
        email: 'ada@example.com',
        bio: 'Writes about engines and analytical machines.',
        website: 'https://example.com/ada',
      },
    });
    expect(updated.statusCode).toBe(200);

    const post = await publishedPost('Author profile post');
    const response = await app.inject({
      method: 'GET',
      url: `/api/public/posts/${post.slug}?type=post`,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as PublicPostShape;
    expect(body.author).toMatchObject({
      username: ADMIN_USERNAME,
      displayName: 'Ada Lovelace',
      bio: 'Writes about engines and analytical machines.',
      website: 'https://example.com/ada',
    });
    expect(body.author).not.toHaveProperty('email');

    // The whole public payload must not leak the account email.
    expect(response.body).not.toContain('ada@example.com');
    expect(response.body).not.toContain('passwordHash');
  });

  it('returns empty profile fields when the author has not filled them in', async () => {
    const post = await publishedPost('Blank author profile');
    const detail = await app.inject({
      method: 'GET',
      url: `/api/public/posts/${post.slug}?type=post`,
    });
    expect((detail.json() as PublicPostShape).author).toMatchObject({
      username: ADMIN_USERNAME,
      displayName: null,
      bio: null,
      website: null,
    });

    const list = await app.inject({
      method: 'GET',
      url: '/api/public/posts?type=post&perPage=10',
    });
    const items = (list.json() as { items: PublicPostShape[] }).items;
    expect(items[0]?.author).toMatchObject({ username: ADMIN_USERNAME });
  });
});

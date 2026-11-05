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

interface AdminPostShape {
  id: string;
  status: string;
  passwordProtected: boolean;
  isPrivate: boolean;
  format: string;
  version: number;
}

interface PublicPostShape {
  passwordProtected: boolean;
  renderedContent: string;
  format: string;
}

describe('post privacy, password and format', () => {
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

  async function publishedPost(title: string): Promise<AdminPostShape> {
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/posts',
      headers,
      payload: {
        type: 'post',
        title,
        content: '<!-- wp:paragraph --><p>Protected body text.</p><!-- /wp:paragraph -->',
      },
    });
    expect(created.statusCode).toBe(201);
    const post = created.json() as AdminPostShape;
    const published = await app.inject({
      method: 'POST',
      url: `/api/admin/posts/${post.id}/publish`,
      headers,
      payload: { baseVersion: post.version },
    });
    expect(published.statusCode).toBe(200);
    return published.json() as AdminPostShape;
  }

  it('protects a post with a password and unlocks it with the right password', async () => {
    const post = await publishedPost('Secret post');
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}`,
      headers,
      payload: { baseVersion: post.version, password: 'open-sesame-2026' },
    });
    expect(patched.statusCode).toBe(200);
    const admin = patched.json() as AdminPostShape & { passwordHash?: unknown };
    expect(admin.passwordProtected).toBe(true);
    expect(admin.passwordHash).toBeUndefined();

    const publicRead = await app.inject({
      method: 'GET',
      url: '/api/public/posts/secret-post?type=post',
    });
    expect(publicRead.statusCode).toBe(200);
    const publicPost = publicRead.json() as PublicPostShape;
    expect(publicPost.passwordProtected).toBe(true);
    expect(publicPost.renderedContent).toBe('');

    const wrong = await app.inject({
      method: 'POST',
      url: '/api/public/posts/secret-post/unlock',
      headers: { origin: ADMIN_ORIGIN, 'content-type': 'application/json' },
      payload: { password: 'wrong-password' },
    });
    expect(wrong.statusCode).toBe(403);

    const unlocked = await app.inject({
      method: 'POST',
      url: '/api/public/posts/secret-post/unlock',
      headers: { origin: ADMIN_ORIGIN, 'content-type': 'application/json' },
      payload: { password: 'open-sesame-2026' },
    });
    expect(unlocked.statusCode).toBe(200);
    expect((unlocked.json() as { renderedContent: string }).renderedContent).toContain(
      'Protected body text.',
    );
  });

  it('removes the password with null and validates oversized passwords', async () => {
    const post = await publishedPost('Removable password');
    const protectedPost = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}`,
      headers,
      payload: { baseVersion: post.version, password: 'temporary-pass' },
    });
    expect(protectedPost.statusCode).toBe(200);
    const version = (protectedPost.json() as AdminPostShape).version;

    const removed = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}`,
      headers,
      payload: { baseVersion: version, password: null },
    });
    expect(removed.statusCode).toBe(200);
    expect((removed.json() as AdminPostShape).passwordProtected).toBe(false);

    const tooLong = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}`,
      headers,
      payload: {
        baseVersion: (removed.json() as AdminPostShape).version,
        password: 'x'.repeat(101),
      },
    });
    expect(tooLong.statusCode).toBe(400);
  });

  it('hides private posts from public detail, list and unlock', async () => {
    const post = await publishedPost('Private post');
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}`,
      headers,
      payload: { baseVersion: post.version, isPrivate: true, password: 'hidden-pass' },
    });
    expect(patched.statusCode).toBe(200);
    expect((patched.json() as AdminPostShape).isPrivate).toBe(true);

    const detail = await app.inject({
      method: 'GET',
      url: '/api/public/posts/private-post?type=post',
    });
    expect(detail.statusCode).toBe(404);

    const list = await app.inject({ method: 'GET', url: '/api/public/posts?type=post&perPage=50' });
    const titles = (list.json() as { items: Array<{ title: string }> }).items.map(
      (entry) => entry.title,
    );
    expect(titles).not.toContain('Private post');

    const unlock = await app.inject({
      method: 'POST',
      url: '/api/public/posts/private-post/unlock',
      headers: { origin: ADMIN_ORIGIN, 'content-type': 'application/json' },
      payload: { password: 'hidden-pass' },
    });
    expect(unlock.statusCode).toBe(404);
  });

  it('stores and validates the WordPress post format', async () => {
    const post = await publishedPost('Format post');
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}`,
      headers,
      payload: { baseVersion: post.version, format: 'quote' },
    });
    expect(patched.statusCode).toBe(200);
    expect((patched.json() as AdminPostShape).format).toBe('quote');

    const publicRead = await app.inject({
      method: 'GET',
      url: '/api/public/posts/format-post?type=post',
    });
    expect((publicRead.json() as PublicPostShape).format).toBe('quote');

    const invalid = await app.inject({
      method: 'PATCH',
      url: `/api/admin/posts/${post.id}`,
      headers,
      payload: {
        baseVersion: (patched.json() as AdminPostShape).version,
        format: 'not-a-format',
      },
    });
    expect(invalid.statusCode).toBe(400);
  });
});

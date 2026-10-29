import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AdminPost, PreviewLinkResult, PublicPost } from '@mernpress/cms-core';
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
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

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

async function rotate(id: string, requestHeaders: Record<string, string> = headers) {
  return app.inject({
    method: 'POST',
    url: `/api/admin/posts/${id}/preview-token`,
    headers: withoutContentType(requestHeaders),
  });
}

async function revoke(id: string) {
  return app.inject({
    method: 'DELETE',
    url: `/api/admin/posts/${id}/preview-token`,
    headers: withoutContentType(headers),
  });
}

// Token rotation/revocation carries no body: sending a JSON content-type with
// an empty body is rejected by Fastify's parser before the route runs.
function withoutContentType(source: Record<string, string>): Record<string, string> {
  const { 'content-type': _contentType, ...rest } = source;
  return rest;
}

async function preview(token: string) {
  return app.inject({ method: 'GET', url: `/api/public/preview/${token}` });
}

async function rotateToken(id: string): Promise<PreviewLinkResult> {
  const response = await rotate(id);
  expect(response.statusCode).toBe(200);
  return response.json() as PreviewLinkResult;
}

describe('post preview tokens (P8-03)', () => {
  it('rotates a 64-hex token, persists it and returns a relative preview path', async () => {
    const post = await createPost({ type: 'post', title: 'Preview me' });

    const result = await rotateToken(post.id);
    expect(result.previewToken).toMatch(TOKEN_PATTERN);
    expect(result.previewPath).toBe(`/api/public/preview/${result.previewToken}`);
    // Without a configured site_url, previewUrl is the relative web path.
    expect(result.previewUrl).toBe(`/preview/${result.previewToken}`);

    const stored = await app.database.post.findUnique({
      where: { id: post.id },
      select: { previewToken: true },
    });
    expect(stored?.previewToken).toBe(result.previewToken);
  });

  it('derives an absolute previewUrl from the site_url option when configured', async () => {
    const post = await createPost({ type: 'post', title: 'Preview URL' });
    await app.database.option.upsert({
      where: { key: 'site_url' },
      // Option values are JSON-encoded at rest (options service contract).
      create: {
        key: 'site_url',
        value: JSON.stringify('https://mernpress.example/'),
        group: 'general',
      },
      update: { value: JSON.stringify('https://mernpress.example/') },
    });

    const result = await rotateToken(post.id);
    expect(result.previewUrl).toBe(`https://mernpress.example/preview/${result.previewToken}`);
  });

  it('returns the token on the single-post admin view but never in the list', async () => {
    const post = await createPost({ type: 'post', title: 'Token visibility' });
    const { previewToken } = await rotateToken(post.id);

    const single = await app.inject({
      method: 'GET',
      url: `/api/admin/posts/${post.id}`,
      headers,
    });
    expect(single.statusCode).toBe(200);
    expect((single.json() as AdminPost).previewToken).toBe(previewToken);

    const list = await app.inject({
      method: 'GET',
      url: '/api/admin/posts',
      headers,
    });
    expect(list.statusCode).toBe(200);
    const body = list.json() as { items: Array<Record<string, unknown>> };
    const listed = body.items.find((item) => item['id'] === post.id);
    expect(listed).toBeDefined();
    expect(listed).not.toHaveProperty('previewToken');
    expect(JSON.stringify(body)).not.toContain(previewToken);
  });

  it('serves a DRAFT preview through the sanitized public renderer without cache or indexing', async () => {
    const content =
      '<!-- wp:paragraph -->\n<p>Draft <img src=x onerror=alert(1)> ' +
      '<a href="javascript:alert(2)">bad</a><script>alert(3)</script></p>\n<!-- /wp:paragraph -->\n' +
      '<!-- wp:heading -->\n<h2>Preview Heading</h2>\n<!-- /wp:heading -->';
    const post = await createPost({ type: 'post', title: 'Secret draft', content });
    expect(post.status).toBe('DRAFT');
    const { previewToken } = await rotateToken(post.id);
    if (previewToken === null) {
      throw new Error('expected a preview token');
    }

    const response = await preview(previewToken);
    expect(response.statusCode).toBe(200);
    const body = response.json() as PublicPost;
    expect(body.id).toBe(post.id);
    // Same rendered DTO as the public slug route, and sanitized.
    expect(body.renderedContent).toContain('Draft');
    expect(body.renderedContent).toContain('<h2 id="preview-heading">Preview Heading</h2>');
    expect(body.renderedContent).not.toMatch(/onerror|javascript:|<script/);
    expect(body.toc.some((entry) => entry.text === 'Preview Heading')).toBe(true);
    // The raw canonical store is preserved, not rewritten.
    expect(body.content).toBe(content);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
    // The bearer token must never be echoed back.
    expect(JSON.stringify(body)).not.toContain(previewToken);
  });

  it('404s an unknown well-formed token, a revoked token and a trashed post', async () => {
    const post = await createPost({ type: 'post', title: 'Revoked soon' });
    const first = await rotateToken(post.id);
    expect(first.previewToken).not.toBeNull();
    const token = first.previewToken ?? '';
    expect((await preview(token)).statusCode).toBe(200);

    // Unknown but well-formed token → 404 (same shape as a draft miss).
    const unknown = await preview('a'.repeat(64));
    expect(unknown.statusCode).toBe(404);
    expect((unknown.json() as { error: { code: string } }).error.code).toBe('NOT_FOUND');

    // Revocation nulls the token and the old URL stops working.
    const revoked = await revoke(post.id);
    expect(revoked.statusCode).toBe(200);
    expect((revoked.json() as PreviewLinkResult).previewToken).toBeNull();
    const afterRevoke = await preview(token);
    expect(afterRevoke.statusCode).toBe(404);

    // Trashed posts are unreachable even with the current token.
    const rerotated = await rotateToken(post.id);
    const trashed = await app.inject({
      method: 'POST',
      url: `/api/admin/posts/${post.id}/trash`,
      headers,
      payload: { baseVersion: post.version },
    });
    expect(trashed.statusCode).toBe(200);
    const trashedPreview = await preview(rerotated.previewToken ?? '');
    expect(trashedPreview.statusCode).toBe(404);
  });

  it('rejects a malformed token with 400', async () => {
    const response = await preview('not-a-preview-token');
    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
  });

  it('rotating invalidates the previous token', async () => {
    const post = await createPost({ type: 'post', title: 'Rotate' });
    const first = await rotateToken(post.id);
    const second = await rotateToken(post.id);
    expect(second.previewToken).not.toBe(first.previewToken);

    expect((await preview(first.previewToken ?? '')).statusCode).toBe(404);
    expect((await preview(second.previewToken ?? '')).statusCode).toBe(200);
  });

  it('forbids rotating another author’s preview token', async () => {
    const owner = await seedUser(app, {
      username: 'preview-owner',
      password: PASSWORD,
      role: 'author',
    });
    const ownerLogin = await loginAs(app, 'preview-owner', PASSWORD);
    const ownerHeaders = {
      origin: ADMIN_ORIGIN,
      cookie: ownerLogin.cookieHeader,
      'x-csrf-token': ownerLogin.csrfToken,
      'content-type': 'application/json',
    };

    await seedUser(app, { username: 'preview-other', password: PASSWORD, role: 'author' });
    const otherLogin = await loginAs(app, 'preview-other', PASSWORD);
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
      payload: { type: 'post', title: 'Owner draft' },
    });
    expect(created.statusCode).toBe(201);
    const post = created.json() as AdminPost;
    expect(post.authorId).toBe(owner.id);

    const denied = await rotate(post.id, otherHeaders);
    expect(denied.statusCode).toBe(403);

    const allowed = await rotate(post.id, ownerHeaders);
    expect(allowed.statusCode).toBe(200);
    expect((allowed.json() as PreviewLinkResult).previewToken).toMatch(TOKEN_PATTERN);
  });
});

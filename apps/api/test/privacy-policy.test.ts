import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  loginAs,
  seedAdmin,
  seedUser,
} from './helpers/auth.js';

interface CreatedPolicyShape {
  pageId: string;
  page: {
    id: string;
    type: 'post' | 'page';
    status: string;
    title: string;
    slug: string;
    content: string;
  };
}

describe('Settings → Privacy policy helpers', () => {
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

  async function policyOption(): Promise<string | null> {
    const row = await app.database.option.findUnique({
      where: { key: 'wp_page_for_privacy_policy' },
    });
    if (!row) return null;
    return JSON.parse(row.value) as string | null;
  }

  async function createPage(title: string): Promise<{ id: string }> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/posts',
      headers,
      payload: {
        type: 'page',
        title,
        content: '<!-- wp:paragraph --><p>Body</p><!-- /wp:paragraph -->',
      },
    });
    expect(response.statusCode).toBe(201);
    return response.json() as { id: string };
  }

  it('creates a draft policy page from the template and selects it', async () => {
    const { 'content-type': _contentType, ...bodyless } = headers;
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/privacy/policy-page',
      headers: bodyless,
    });
    expect(created.statusCode).toBe(200);
    const body = created.json() as CreatedPolicyShape;
    expect(body.page).toMatchObject({
      type: 'page',
      status: 'DRAFT',
      title: 'Privacy Policy',
    });
    expect(body.page.content).toContain('<!-- wp:heading');
    expect(body.page.content).toContain('Who we are');
    expect(body.page.content).toContain('What rights you have over your data');
    expect(await policyOption()).toBe(body.pageId);

    // It is a draft, not published content.
    const publicRead = await app.inject({
      method: 'GET',
      url: '/api/public/posts/privacy-policy?type=page',
    });
    expect(publicRead.statusCode).toBe(404);

    // Creating again allocates a new slug and retargets the option.
    const second = await app.inject({
      method: 'POST',
      url: '/api/admin/privacy/policy-page',
      headers: bodyless,
    });
    expect(second.statusCode).toBe(200);
    const secondBody = second.json() as CreatedPolicyShape;
    expect(secondBody.pageId).not.toBe(body.pageId);
    expect(secondBody.page.slug).not.toBe(body.page.slug);
    expect(await policyOption()).toBe(secondBody.pageId);
  });

  it('selects an existing page, rejects other types and clears the selection', async () => {
    const page = await createPage('Existing policy page');
    const set = await app.inject({
      method: 'PUT',
      url: '/api/admin/privacy/policy-page',
      headers,
      payload: { pageId: page.id },
    });
    expect(set.statusCode).toBe(200);
    expect(set.json()).toEqual({ pageId: page.id });
    expect(await policyOption()).toBe(page.id);

    const post = await app.inject({
      method: 'POST',
      url: '/api/admin/posts',
      headers,
      payload: { type: 'post', title: 'Not a page' },
    });
    const postId = (post.json() as { id: string }).id;
    const wrongType = await app.inject({
      method: 'PUT',
      url: '/api/admin/privacy/policy-page',
      headers,
      payload: { pageId: postId },
    });
    expect(wrongType.statusCode).toBe(400);
    expect((wrongType.json() as { error: { message: string } }).error.message).toContain('page');

    const missing = await app.inject({
      method: 'PUT',
      url: '/api/admin/privacy/policy-page',
      headers,
      payload: { pageId: '00000000-0000-7000-8000-000000000000' },
    });
    expect(missing.statusCode).toBe(404);

    const malformed = await app.inject({
      method: 'PUT',
      url: '/api/admin/privacy/policy-page',
      headers,
      payload: { pageId: 'not-a-uuid' },
    });
    expect(malformed.statusCode).toBe(400);

    const cleared = await app.inject({
      method: 'PUT',
      url: '/api/admin/privacy/policy-page',
      headers,
      payload: { pageId: null },
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json()).toEqual({ pageId: null });
    expect(await policyOption()).toBeNull();
  });

  it('rejects anonymous callers and non-administrators', async () => {
    const anonymousCreate = await app.inject({
      method: 'POST',
      url: '/api/admin/privacy/policy-page',
      headers: { origin: ADMIN_ORIGIN },
    });
    // State-changing requests without a session are never authorized.
    expect(anonymousCreate.statusCode).toBe(401);

    await seedUser(app, { username: 'editor', password: 'Editor-pass-2026!', role: 'editor' });
    const editor = await loginAs(app, 'editor', 'Editor-pass-2026!');
    const editorHeaders = {
      origin: ADMIN_ORIGIN,
      cookie: editor.cookieHeader,
      'x-csrf-token': editor.csrfToken,
      'content-type': 'application/json',
    };
    const { 'content-type': _editorContentType, ...editorPostHeaders } = editorHeaders;
    const create = await app.inject({
      method: 'POST',
      url: '/api/admin/privacy/policy-page',
      headers: editorPostHeaders,
    });
    expect(create.statusCode).toBe(403);
    const set = await app.inject({
      method: 'PUT',
      url: '/api/admin/privacy/policy-page',
      headers: editorHeaders,
      payload: { pageId: null },
    });
    expect(set.statusCode).toBe(403);
  });
});

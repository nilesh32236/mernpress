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

interface CustomizerShape {
  colors: Record<string, string> | null;
  menu: Array<{ label: string; url: string }> | null;
  css: string | null;
  showOnFront: 'posts' | 'page';
  pageOnFront: string | null;
  pageForPosts: string | null;
}

describe('Appearance → Customize API', () => {
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

  async function get(): Promise<CustomizerShape> {
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/customizer',
      headers: { cookie: headers.cookie as string },
    });
    expect(response.statusCode).toBe(200);
    return response.json() as CustomizerShape;
  }

  async function put(payload: Record<string, unknown>) {
    return app.inject({
      method: 'PUT',
      url: '/api/admin/customizer',
      headers,
      payload,
    });
  }

  const base = {
    colors: null,
    menu: null,
    css: null,
    showOnFront: 'posts',
    pageOnFront: null,
    pageForPosts: null,
  };

  async function createPage(title: string, status: 'DRAFT' | 'PUBLISHED' = 'PUBLISHED') {
    const admin = await app.database.user.findUniqueOrThrow({
      where: { username: ADMIN_USERNAME },
    });
    return app.database.post.create({
      data: {
        type: 'page',
        status,
        title,
        slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        content: '<!-- wp:paragraph --><p>Page</p><!-- /wp:paragraph -->',
        authorId: admin.id,
        publishedAt: status === 'PUBLISHED' ? new Date('2026-01-01T00:00:00.000Z') : null,
      },
    });
  }

  it('returns defaults and saves colours, menu and CSS', async () => {
    expect(await get()).toEqual(base);

    const saved = await put({
      ...base,
      colors: { background: '#f7f2e8', accent: '#8a3b2e' },
      menu: [
        { label: 'Home', url: '/' },
        { label: 'Docs', url: 'https://example.com/docs' },
      ],
      css: '.site-title { letter-spacing: 1px; }',
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      colors: { background: '#f7f2e8', accent: '#8a3b2e' },
      menu: [
        { label: 'Home', url: '/' },
        { label: 'Docs', url: 'https://example.com/docs' },
      ],
      css: '.site-title { letter-spacing: 1px; }',
    });

    const site = await app.inject({ method: 'GET', url: '/api/public/site' });
    expect(site.json()).toMatchObject({
      customColors: { background: '#f7f2e8', accent: '#8a3b2e' },
      customMenu: [
        { label: 'Home', url: '/' },
        { label: 'Docs', url: 'https://example.com/docs' },
      ],
      customCss: '.site-title { letter-spacing: 1px; }',
    });
  });

  it('validates colours, menu items and dangerous CSS', async () => {
    expect((await put({ ...base, colors: { background: 'red; }' } })).statusCode).toBe(400);
    expect((await put({ ...base, colors: { background: '#fff' } })).statusCode).toBe(200);

    expect(
      (await put({ ...base, menu: [{ label: 'Bad', url: 'javascript:alert(1)' }] })).statusCode,
    ).toBe(400);
    expect((await put({ ...base, menu: [{ label: '', url: '/' }] })).statusCode).toBe(400);
    expect(
      (
        await put({
          ...base,
          menu: Array.from({ length: 21 }, (_, index) => ({
            label: `Item ${index}`,
            url: '/',
          })),
        })
      ).statusCode,
    ).toBe(400);

    for (const css of [
      '</style><script>alert(1)</script>',
      '@import url(https://evil.example/x.css);',
      '.x { width: expression(alert(1)); }',
      '.x { background: url(javascript:alert(1)); }',
    ]) {
      expect((await put({ ...base, css })).statusCode, css).toBe(400);
    }
    expect((await put({ ...base, css: 'a'.repeat(20_001) })).statusCode).toBe(400);
    expect((await put({ ...base, css: '.x { color: #111; }' })).statusCode).toBe(200);
  });

  it('sets a static homepage and posts page from published pages only', async () => {
    const home = await createPage('Home Page');
    const posts = await createPage('Blog Page');
    const draft = await createPage('Draft Page', 'DRAFT');

    const saved = await put({
      ...base,
      showOnFront: 'page',
      pageOnFront: home.id,
      pageForPosts: posts.id,
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      showOnFront: 'page',
      pageOnFront: home.id,
      pageForPosts: posts.id,
    });
    const site = await app.inject({ method: 'GET', url: '/api/public/site' });
    expect(site.json()).toMatchObject({
      showOnFront: 'page',
      pageOnFrontSlug: 'home-page',
      pageForPostsSlug: 'blog-page',
    });

    expect(
      (await put({ ...base, showOnFront: 'page', pageOnFront: draft.id, pageForPosts: null }))
        .statusCode,
    ).toBe(400);
    expect(
      (await put({ ...base, showOnFront: 'page', pageOnFront: home.id, pageForPosts: home.id }))
        .statusCode,
    ).toBe(400);
    const post = await app.database.post.create({
      data: {
        type: 'post',
        status: 'PUBLISHED',
        title: 'Not a page',
        slug: 'not-a-page',
        content: 'x',
        publishedAt: new Date(),
      },
    });
    expect(
      (await put({ ...base, showOnFront: 'page', pageOnFront: post.id, pageForPosts: null }))
        .statusCode,
    ).toBe(400);

    // Switching back to latest posts clears both selectors.
    const cleared = await put({ ...base, showOnFront: 'posts' });
    expect(cleared.json()).toMatchObject({
      showOnFront: 'posts',
      pageOnFront: null,
      pageForPosts: null,
    });
  });

  it('rejects anonymous and non-administrator callers', async () => {
    const anonymous = await app.inject({ method: 'GET', url: '/api/admin/customizer' });
    expect(anonymous.statusCode).toBe(401);

    await seedUser(app, { username: 'editor', password: 'Editor-pass-2026!', role: 'editor' });
    const editor = await loginAs(app, 'editor', 'Editor-pass-2026!');
    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/admin/customizer',
      headers: { cookie: editor.cookieHeader },
    });
    expect(forbidden.statusCode).toBe(403);
  });
});

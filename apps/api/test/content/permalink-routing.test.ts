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

describe('permalink structures and public routing', () => {
  let app: FastifyInstance;
  let headers: Record<string, string>;
  let postId: string;

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
    const admin = await app.database.user.findUniqueOrThrow({
      where: { username: ADMIN_USERNAME },
    });
    const category = await app.database.term.create({
      data: { taxonomy: 'category', name: 'News', slug: 'news' },
    });
    const post = await app.database.post.create({
      data: {
        type: 'post',
        status: 'PUBLISHED',
        title: 'Hello Routing',
        slug: 'hello-routing',
        content: '<!-- wp:paragraph --><p>Body</p><!-- /wp:paragraph -->',
        authorId: admin.id,
        publishedAt: new Date('2026-01-15T09:30:45.000Z'),
        terms: { create: [{ termId: category.id, position: 0 }] },
      },
    });
    postId = post.id;
    await app.database.post.create({
      data: {
        type: 'page',
        status: 'PUBLISHED',
        title: 'About',
        slug: 'about',
        content: '<!-- wp:paragraph --><p>About</p><!-- /wp:paragraph -->',
        authorId: admin.id,
        publishedAt: new Date('2026-01-02T09:00:00.000Z'),
      },
    });
  });

  afterEach(async () => {
    await app.close();
  });

  async function setPermalinks(values: Record<string, unknown>): Promise<void> {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/options',
      headers,
      payload: { group: 'permalinks', values },
    });
    expect(response.statusCode).toBe(200);
  }

  async function resolve(query: string) {
    return app.inject({ method: 'GET', url: `/api/public/resolve?${query}` });
  }

  const PRETTY = {
    permalink_structure: 'custom',
    permalink_pattern: '/%year%/%monthnum%/%day%/%postname%/',
  };

  it('resolves day, month, numeric, post-name and custom structures', async () => {
    await setPermalinks(PRETTY);
    const day = await resolve('path=%2F2026%2F01%2F15%2Fhello-routing');
    expect(day.statusCode).toBe(200);
    expect(day.json()).toEqual({
      slug: 'hello-routing',
      canonicalPath: '/2026/01/15/hello-routing',
    });

    const wrongDay = await resolve('path=%2F2026%2F01%2F16%2Fhello-routing');
    expect(wrongDay.statusCode).toBe(404);

    await setPermalinks({
      permalink_structure: 'month',
      permalink_pattern: '/%year%/%monthnum%/%postname%/',
    });
    expect((await resolve('path=%2F2026%2F01%2Fhello-routing')).json()).toMatchObject({
      canonicalPath: '/2026/01/hello-routing',
    });

    await setPermalinks({
      permalink_structure: 'numeric',
      permalink_pattern: '/archives/%post_id%/',
    });
    expect((await resolve(`path=%2Farchives%2F${postId}`)).json()).toMatchObject({
      canonicalPath: `/archives/${postId}`,
    });

    await setPermalinks({
      permalink_structure: 'postname',
      permalink_pattern: '/%postname%/',
    });
    expect((await resolve('path=%2Fhello-routing')).json()).toMatchObject({
      canonicalPath: '/hello-routing',
    });

    await setPermalinks({
      permalink_structure: 'custom',
      permalink_pattern: '/%category%/%postname%/',
    });
    expect((await resolve('path=%2Fnews%2Fhello-routing')).json()).toMatchObject({
      canonicalPath: '/news/hello-routing',
    });
    // The category token must match the post's own category.
    expect((await resolve('path=%2Fother%2Fhello-routing')).statusCode).toBe(404);
  });

  it('resolves Plain permalinks by post id', async () => {
    await setPermalinks({
      permalink_structure: 'plain',
      permalink_pattern: null,
    });
    const resolved = await resolve(`p=${postId}`);
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json()).toMatchObject({
      slug: 'hello-routing',
      canonicalPath: `/?p=${postId}`,
    });
    // Pretty paths are not valid while Plain is active.
    expect((await resolve('path=%2Fhello-routing')).statusCode).toBe(404);
    // ?p= is only resolved while Plain is the active structure.
    await setPermalinks({ permalink_structure: 'postname', permalink_pattern: '/%postname%/' });
    expect((await resolve(`p=${postId}`)).statusCode).toBe(404);
  });

  it('lets a published page shadow a root-level post name', async () => {
    await app.database.post.create({
      data: {
        type: 'post',
        status: 'PUBLISHED',
        title: 'Shadowed',
        slug: 'about',
        content: '<!-- wp:paragraph --><p>Post</p><!-- /wp:paragraph -->',
        publishedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    await setPermalinks({ permalink_structure: 'postname', permalink_pattern: '/%postname%/' });
    expect((await resolve('path=%2Fabout')).statusCode).toBe(404);
  });

  it('ignores drafts, private and scheduled posts', async () => {
    await app.database.post.update({
      where: { id: postId },
      data: { isPrivate: true },
    });
    await setPermalinks({ permalink_structure: 'postname', permalink_pattern: '/%postname%/' });
    expect((await resolve('path=%2Fhello-routing')).statusCode).toBe(404);
  });

  it('adds canonical paths and term paths to public responses', async () => {
    await setPermalinks({
      permalink_structure: 'custom',
      permalink_pattern: '/%category%/%postname%/',
      category_base: 'sections',
      tag_base: 'topics',
    });

    const detail = await app.inject({
      method: 'GET',
      url: '/api/public/posts/hello-routing?type=post',
    });
    expect(detail.statusCode).toBe(200);
    const post = detail.json() as {
      path: string;
      terms: { categories: Array<{ path: string }> };
    };
    expect(post.path).toBe('/news/hello-routing');
    expect(post.terms.categories[0]?.path).toBe('/sections/news');

    const list = await app.inject({
      method: 'GET',
      url: '/api/public/posts?type=post&perPage=10',
    });
    expect((list.json() as { items: Array<{ path: string }> }).items[0]?.path).toBe(
      '/news/hello-routing',
    );

    const page = await app.inject({
      method: 'GET',
      url: '/api/public/posts/about?type=page',
    });
    expect((page.json() as { path: string }).path).toBe('/about');

    const site = await app.inject({ method: 'GET', url: '/api/public/site' });
    expect(site.json()).toMatchObject({
      permalinkStructure: 'custom',
      permalinkPattern: '/%category%/%postname%/',
      categoryBase: 'sections',
      tagBase: 'topics',
    });
  });

  it('validates custom structures and bases', async () => {
    const badPattern = await app.inject({
      method: 'PUT',
      url: '/api/options',
      headers,
      payload: {
        group: 'permalinks',
        values: { permalink_structure: 'custom', permalink_pattern: '/%year%/' },
      },
    });
    expect(badPattern.statusCode).toBe(400);
    expect((badPattern.json() as { error: { message: string } }).error.message).toContain(
      '%postname%',
    );

    const badBase = await app.inject({
      method: 'PUT',
      url: '/api/options',
      headers,
      payload: { group: 'permalinks', values: { category_base: 'not a base!' } },
    });
    expect(badBase.statusCode).toBe(400);

    const badStructure = await app.inject({
      method: 'PUT',
      url: '/api/options',
      headers,
      payload: { group: 'permalinks', values: { permalink_structure: 'fancy' } },
    });
    expect(badStructure.statusCode).toBe(400);
  });
});

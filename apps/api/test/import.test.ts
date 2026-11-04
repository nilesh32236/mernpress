import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { parseWxr } from '@mernpress/cms-core';
import {
  ADMIN_ORIGIN,
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  loginAs,
  seedAdmin,
  seedUser,
} from './helpers/auth.js';

let app: FastifyInstance;

beforeEach(async () => {
  app = await createTestApp();
  await seedAdmin(app);
});

afterEach(async () => {
  await app.close();
});

const WXR = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel>
  <title>Old site</title>
  <item>
    <title>Imported post</title>
    <link>https://old.example/imported-post/</link>
    <content:encoded><![CDATA[<!-- wp:paragraph --><p>Hello from the old site.</p><!-- /wp:paragraph -->]]></content:encoded>
    <excerpt:encoded><![CDATA[An imported excerpt.]]></excerpt:encoded>
    <wp:post_name>imported-post</wp:post_name>
    <wp:status>publish</wp:status>
    <wp:post_type>post</wp:post_type>
    <wp:post_date_gmt>2025-05-01 09:30:00</wp:post_date_gmt>
    <category domain="category" nicename="news"><![CDATA[News]]></category>
    <category domain="post_tag" nicename="imported"><![CDATA[Imported]]></category>
  </item>
  <item>
    <title>Imported page</title>
    <wp:post_name>imported-page</wp:post_name>
    <wp:status>draft</wp:status>
    <wp:post_type>page</wp:post_type>
    <content:encoded><![CDATA[<p>Page body.</p>]]></content:encoded>
  </item>
  <item>
    <title>Attachment</title>
    <wp:post_type>attachment</wp:post_type>
    <wp:status>inherit</wp:status>
  </item>
</channel>
</rss>`;

async function adminHeaders() {
  const { cookieHeader, csrfToken } = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
  return {
    origin: ADMIN_ORIGIN,
    cookie: cookieHeader,
    'x-csrf-token': csrfToken,
    'content-type': 'application/json',
  };
}

describe('WordPress WXR import', () => {
  it('parses posts, pages, statuses, dates and terms', () => {
    const { items, skipped } = parseWxr(WXR);
    expect(skipped).toBe(1);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      type: 'post',
      status: 'publish',
      title: 'Imported post',
      slug: 'imported-post',
      excerpt: 'An imported excerpt.',
    });
    expect(items[0]!.publishedAt?.toISOString()).toBe('2025-05-01T09:30:00.000Z');
    expect(items[0]!.categories).toEqual([{ name: 'News', slug: 'news' }]);
    expect(items[0]!.tags).toEqual([{ name: 'Imported', slug: 'imported' }]);
    expect(items[1]).toMatchObject({ type: 'page', status: 'draft', slug: 'imported-page' });
  });

  it('imports posts and pages with terms through the API', async () => {
    const headers = await adminHeaders();
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/import/wordpress',
      headers,
      payload: { content: WXR },
    });
    expect(response.statusCode).toBe(200);
    const result = response.json() as {
      imported: number;
      posts: number;
      pages: number;
      terms: number;
      skipped: number;
      failed: number;
    };
    expect(result).toMatchObject({
      imported: 2,
      posts: 1,
      pages: 1,
      terms: 2,
      skipped: 1,
      failed: 0,
    });

    const posts = await app.inject({ method: 'GET', url: '/api/public/posts?perPage=10' });
    const titles = (posts.json() as { items: Array<{ title: string }> }).items.map(
      (item) => item.title,
    );
    expect(titles).toContain('Imported post');
  });

  it('rejects non-WXR payloads and anonymous callers', async () => {
    const headers = await adminHeaders();
    const bad = await app.inject({
      method: 'POST',
      url: '/api/admin/import/wordpress',
      headers,
      payload: { content: 'not xml' },
    });
    expect(bad.statusCode).toBe(400);

    const anonymous = await app.inject({
      method: 'POST',
      url: '/api/admin/import/wordpress',
      payload: { content: WXR },
    });
    // Mutations hit the CSRF guard before the session check.
    expect([401, 403]).toContain(anonymous.statusCode);

    await seedUser(app, { username: 'editor', password: 'Editor-pass-2026!', role: 'editor' });
    const { cookieHeader, csrfToken } = await loginAs(app, 'editor', 'Editor-pass-2026!');
    const editor = await app.inject({
      method: 'POST',
      url: '/api/admin/import/wordpress',
      headers: {
        origin: ADMIN_ORIGIN,
        cookie: cookieHeader,
        'x-csrf-token': csrfToken,
        'content-type': 'application/json',
      },
      payload: { content: WXR },
    });
    // Editors can create content, so the import is allowed for them.
    expect(editor.statusCode).toBe(200);
  });
});

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseWxr } from '@mernpress/cms-core';
import {
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  loginAs,
  seedAdmin,
  seedUser,
} from './helpers/auth.js';

describe('Tools → Export (WXR)', () => {
  let app: FastifyInstance;
  let cookie: string;

  beforeEach(async () => {
    app = await createTestApp();
    await seedAdmin(app);
    const session = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    cookie = session.cookieHeader;
    await app.database.option.upsert({
      where: { key: 'site_url' },
      create: {
        key: 'site_url',
        value: JSON.stringify('https://mernpress.example'),
        group: 'general',
      },
      update: { value: JSON.stringify('https://mernpress.example') },
    });

    const admin = await app.database.user.findUniqueOrThrow({
      where: { username: ADMIN_USERNAME },
    });
    const draft = await app.database.post.create({
      data: {
        type: 'post',
        status: 'DRAFT',
        title: 'Draft & <export>',
        slug: 'draft-export',
        content: '<!-- wp:paragraph --><p>Draft body</p><!-- /wp:paragraph -->',
        excerpt: 'Draft excerpt',
        authorId: admin.id,
      },
    });
    const published = await app.database.post.create({
      data: {
        type: 'post',
        status: 'PUBLISHED',
        title: 'Published post',
        slug: 'published-post',
        content: '<!-- wp:paragraph --><p>Published body</p><!-- /wp:paragraph -->',
        authorId: admin.id,
        publishedAt: new Date('2026-10-01T09:00:00.000Z'),
      },
    });
    await app.database.post.create({
      data: {
        type: 'page',
        status: 'DRAFT',
        title: 'Exported page',
        slug: 'exported-page',
        content: '<p>Page body</p>',
        authorId: admin.id,
      },
    });
    const category = await app.database.term.create({
      data: { taxonomy: 'category', name: 'News & Updates', slug: 'news-updates' },
    });
    await app.database.postTerm.create({
      data: { postId: published.id, termId: category.id, position: 0 },
    });
    await app.database.comment.create({
      data: {
        postId: published.id,
        authorName: 'Reader',
        authorEmail: 'reader@example.com',
        content: 'A useful comment.',
        status: 'APPROVED',
      },
    });
    await app.database.mediaItem.create({
      data: {
        fileName: 'abc123.webp',
        originalName: 'Photo.png',
        mimeType: 'image/png',
        sizeBytes: 100,
        storagePath: '2026/11/abc123.webp',
        caption: 'A caption',
        description: 'A description',
        uploadedById: admin.id,
      },
    });
    void draft;
  });

  afterEach(async () => {
    await app.close();
  });

  async function exportXml(scope: string): Promise<string> {
    const response = await app.inject({
      method: 'GET',
      url: `/api/admin/export?content=${scope}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/rss+xml');
    expect(response.headers['content-disposition']).toContain('.xml');
    return response.body;
  }

  it('exports posts, pages, terms, comments and media as WXR', async () => {
    const xml = await exportXml('all');
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8" ?>');
    expect(xml).toContain('<wp:wxr_version>1.2</wp:wxr_version>');
    expect(xml).toContain('<wp:base_site_url>https://mernpress.example</wp:base_site_url>');
    expect(xml).toContain('<![CDATA[Draft & <export>]]>');
    expect(xml).toContain('<content:encoded><![CDATA[<!-- wp:paragraph -->');
    expect(xml).toContain('<wp:post_type><![CDATA[page]]></wp:post_type>');
    expect(xml).toContain(
      '<category domain="category" nicename="news-updates"><![CDATA[News & Updates]]></category>',
    );
    expect(xml).toContain('<wp:comment_content><![CDATA[A useful comment.]]></wp:comment_content>');
    expect(xml).toContain('<wp:attachment_url><![CDATA[https://mernpress.example/api/media/');
    expect(xml).toContain('<wp:post_type><![CDATA[attachment]]></wp:post_type>');

    // The export must be readable by MERNPress's own WXR parser (and therefore
    // by WordPress-compatible importers): posts/pages with their metadata.
    const parsed = parseWxr(xml);
    expect(parsed.items.map((item) => item.title)).toEqual(
      expect.arrayContaining(['Draft & <export>', 'Published post', 'Exported page']),
    );
    const published = parsed.items.find((item) => item.title === 'Published post');
    expect(published).toMatchObject({ type: 'post', status: 'publish', slug: 'published-post' });
    expect(published?.categories).toEqual([{ name: 'News & Updates', slug: 'news-updates' }]);
    expect(published?.publishedAt?.toISOString()).toBe('2026-10-01T09:00:00.000Z');
    expect(parsed.items.find((item) => item.title === 'Exported page')?.type).toBe('page');
  });

  it('honours the scope selection', async () => {
    const posts = await exportXml('posts');
    expect(posts).toContain('Published post');
    expect(posts).toContain('Draft & <export>');
    expect(posts).not.toContain('Exported page');
    expect(posts).not.toContain('wp:post_type><![CDATA[attachment]]');

    const pages = await exportXml('pages');
    expect(pages).toContain('Exported page');
    expect(pages).not.toContain('Published post');

    const media = await exportXml('media');
    expect(media).toContain('Photo.png');
    expect(media).toContain('wp:post_type><![CDATA[attachment]]');
    expect(media).not.toContain('Published post');
  });

  it('rejects anonymous callers and non-administrators', async () => {
    const anonymous = await app.inject({ method: 'GET', url: '/api/admin/export?content=all' });
    expect(anonymous.statusCode).toBe(401);

    await seedUser(app, { username: 'editor', password: 'Editor-pass-2026!', role: 'editor' });
    const editor = await loginAs(app, 'editor', 'Editor-pass-2026!');
    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/admin/export?content=all',
      headers: { cookie: editor.cookieHeader },
    });
    expect(forbidden.statusCode).toBe(403);
  });
});

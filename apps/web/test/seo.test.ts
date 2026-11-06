import { describe, expect, it } from 'vitest';
import {
  articleSchema,
  breadcrumbSchema,
  collectionSchema,
  profileSchema,
  siteGraph,
} from '../lib/seo';
import type { PublicPost } from '../lib/api';

const base = 'https://example.com';

const post: PublicPost = {
  id: '1',
  type: 'post',
  title: 'Hello World',
  slug: 'hello-world',
  path: '/posts/hello-world',
  excerpt: 'An excerpt',
  content: '',
  contentFormat: 'wp_block_html',
  renderedContent: '<p>Body</p>',
  toc: [],
  featuredImage: {
    id: 'm1',
    url: '/api/media/m1/a.webp',
    width: 1600,
    height: 900,
    altText: 'A beach',
    derivatives: {},
  },
  seoTitle: null,
  seoDescription: null,
  canonicalUrl: null,
  robots: null,
  ogTitle: null,
  ogDescription: null,
  publishedAt: '2026-01-01T00:00:00.000Z',
  commentStatus: 'open',
  sticky: false,
  passwordProtected: false,
  format: 'standard',
  language: 'en',
  updatedAt: '2026-01-02T00:00:00.000Z',
  terms: {
    categories: [{ id: 'c1', name: 'News', slug: 'news', path: '/category/news' }],
    tags: [{ id: 't1', name: 'Demo', slug: 'demo', path: '/tag/demo' }],
  },
  author: {
    id: 'u1',
    username: 'admin',
    displayName: null,
    bio: null,
    website: null,
  },
};

describe('SEO structured data', () => {
  it('builds a site graph with linked WebSite and Organization entities', () => {
    const graph = siteGraph(base, { title: 'MERNPress', tagline: 'A CMS' }) as {
      '@graph': Array<Record<string, unknown>>;
    };
    expect(graph['@graph']).toHaveLength(2);
    expect(graph['@graph'][0]).toMatchObject({
      '@type': 'Organization',
      '@id': `${base}/#organization`,
      name: 'MERNPress',
    });
    expect(graph['@graph'][1]).toMatchObject({
      '@type': 'WebSite',
      '@id': `${base}/#website`,
      url: base,
      publisher: { '@id': `${base}/#organization` },
    });
  });

  it('describes a post with BlogPosting and visible metadata only', () => {
    const article = articleSchema(base, post) as Record<string, unknown>;
    expect(article).toMatchObject({
      '@type': 'BlogPosting',
      headline: 'Hello World',
      url: `${base}/posts/hello-world`,
      datePublished: '2026-01-01T00:00:00.000Z',
      dateModified: '2026-01-02T00:00:00.000Z',
      author: { '@type': 'Person', name: 'admin' },
      isPartOf: { '@id': `${base}/#website` },
      keywords: 'Demo',
      articleSection: 'News',
    });
    const images = article['image'] as Array<Record<string, unknown>>;
    expect(images[0]).toMatchObject({
      '@type': 'ImageObject',
      url: 'http://127.0.0.1:4000/api/media/m1/a.webp',
      width: 1600,
      height: 900,
    });
  });

  it('uses WebPage for pages and omits publication dates that do not exist', () => {
    const page = articleSchema(base, {
      ...post,
      type: 'page',
      publishedAt: null,
      slug: 'about',
      path: '/about',
    }) as Record<string, unknown>;
    expect(page['@type']).toBe('WebPage');
    expect(page['url']).toBe(`${base}/about`);
    expect(page).not.toHaveProperty('datePublished');
  });

  it('numbers breadcrumbs in order and links collections', () => {
    const crumbs = breadcrumbSchema(base, [
      { name: 'Home', url: base },
      { name: 'Blog', url: `${base}/posts` },
      { name: 'Hello World', url: `${base}/posts/hello-world` },
    ]) as { itemListElement: Array<Record<string, unknown>> };
    expect(crumbs.itemListElement.map((item) => item['position'])).toEqual([1, 2, 3]);

    const collection = collectionSchema(base, {
      url: `${base}/posts`,
      name: 'Blog',
      posts: [post],
    }) as { mainEntity: { itemListElement: Array<Record<string, unknown>> } };
    expect(collection.mainEntity.itemListElement[0]).toMatchObject({
      position: 1,
      url: `${base}/posts/hello-world`,
      name: 'Hello World',
    });

    expect(profileSchema(base, 'admin')).toMatchObject({
      '@type': 'ProfilePage',
      mainEntity: { '@type': 'Person', name: 'admin' },
    });
  });
});

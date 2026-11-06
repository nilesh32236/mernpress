import { describe, expect, it } from 'vitest';
import type { PublicPost } from '../lib/api';
import { buildPostSitemapEntries } from '../lib/sitemap';

function post(overrides: Partial<PublicPost> = {}): PublicPost {
  return {
    id: 'p1',
    type: 'post',
    title: 'Hello',
    slug: 'hello',
    path: '/posts/hello',
    excerpt: null,
    content: '',
    contentFormat: 'wp_block_html',
    renderedContent: '<p>Body</p>',
    toc: [],
    featuredImage: null,
    seoTitle: null,
    seoDescription: null,
    canonicalUrl: null,
    robots: null,
    ogTitle: null,
    ogDescription: null,
    publishedAt: '2026-11-06T00:00:00.000Z',
    commentStatus: 'open',
    sticky: false,
    passwordProtected: false,
    format: 'standard',
    language: 'en',
    translationGroup: 'group-1',
    updatedAt: '2026-11-06T10:00:00.000Z',
    author: null,
    terms: { categories: [], tags: [] },
    ...overrides,
  };
}

describe('sitemap translation alternates', () => {
  it('groups variants and emits xhtml alternates with x-default', () => {
    const entries = buildPostSitemapEntries('https://example.com', 'en', [
      post(),
      post({
        id: 'p2',
        title: 'नमस्ते',
        slug: 'hello-hi',
        path: '/hi/posts/hello-hi',
        language: 'hi',
      }),
      post({
        id: 'p3',
        title: 'Only English',
        slug: 'only',
        path: '/posts/only',
        translationGroup: 'group-2',
      }),
    ]);

    expect(entries).toHaveLength(3);
    const en = entries.find((entry) => entry.url === 'https://example.com/posts/hello');
    const hi = entries.find((entry) => entry.url === 'https://example.com/hi/posts/hello-hi');
    expect(en?.alternates).toEqual({
      languages: {
        en: 'https://example.com/posts/hello',
        hi: 'https://example.com/hi/posts/hello-hi',
        'x-default': 'https://example.com/posts/hello',
      },
    });
    expect(hi?.alternates).toEqual(en?.alternates);
    const solo = entries.find((entry) => entry.url === 'https://example.com/posts/only');
    expect(solo?.alternates).toBeUndefined();
  });

  it('deduplicates variants and points x-default at the home page when the default is missing', () => {
    const entries = buildPostSitemapEntries('https://example.com', 'en', [
      post({ id: 'p2', language: 'hi', slug: 'hello-hi', path: '/hi/posts/hello-hi' }),
      post({ id: 'p2', language: 'hi', slug: 'hello-hi', path: '/hi/posts/hello-hi' }),
      post({
        id: 'p3',
        language: 'es',
        slug: 'hola',
        path: '/es/posts/hola',
        translationGroup: 'group-3',
      }),
      post({
        id: 'p4',
        language: 'hi',
        slug: 'hola-hi',
        path: '/hi/posts/hola-hi',
        translationGroup: 'group-3',
      }),
    ]);

    expect(entries).toHaveLength(3);
    const hindi = entries.find((entry) => entry.url === 'https://example.com/hi/posts/hello-hi');
    // The group has only Hindi, so no alternates block is emitted.
    expect(hindi?.alternates).toBeUndefined();
    const spanish = entries.find((entry) => entry.url === 'https://example.com/es/posts/hola');
    // group-3 has no English variant: x-default falls back to the home page.
    expect(spanish?.alternates).toEqual({
      languages: {
        es: 'https://example.com/es/posts/hola',
        hi: 'https://example.com/hi/posts/hola-hi',
        'x-default': 'https://example.com',
      },
    });
  });

  it('keeps page translations and image sitemap data', () => {
    const withImage = post({
      id: 'pg1',
      type: 'page',
      slug: 'about',
      path: '/about',
      featuredImage: {
        id: 'm1',
        url: '/api/media/m1/a.webp',
        width: 800,
        height: 600,
        altText: 'About',
        derivatives: {},
      },
      translationGroup: 'group-page',
    });
    const hindiPage = post({
      id: 'pg2',
      type: 'page',
      language: 'hi',
      slug: 'about-hi',
      path: '/hi/about-hi',
      translationGroup: 'group-page',
    });
    const entries = buildPostSitemapEntries('https://example.com', 'en', [withImage, hindiPage]);
    expect(entries).toHaveLength(2);
    const english = entries.find((entry) => entry.url === 'https://example.com/about');
    expect(english?.images?.[0]).toMatch(/\/api\/media\/m1\/a\.webp$/);
    expect(english?.alternates?.languages).toMatchObject({
      en: 'https://example.com/about',
      hi: 'https://example.com/hi/about-hi',
      'x-default': 'https://example.com/about',
    });
  });
  it('omits noindex, password-protected and off-site canonical documents', () => {
    const entries = buildPostSitemapEntries('https://example.com', 'en', [
      post({ id: 'ok' }),
      post({ id: 'noindex', slug: 'noindex', path: '/posts/noindex', robots: 'noindex, follow' }),
      post({
        id: 'password',
        slug: 'secret',
        path: '/posts/secret',
        passwordProtected: true,
      }),
      post({
        id: 'canonical',
        slug: 'canonical',
        path: '/posts/canonical',
        canonicalUrl: 'https://elsewhere.example/original',
      }),
    ]);
    expect(entries.map((entry) => entry.url)).toEqual(['https://example.com/posts/hello']);
  });
});

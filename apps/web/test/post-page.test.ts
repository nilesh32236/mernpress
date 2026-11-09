import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import PostPage, { generateMetadata } from '../app/posts/[slug]/page';

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

const samplePost = {
  id: '1',
  type: 'post' as const,
  title: 'Hello World',
  slug: 'hello-world',
  path: '/posts/hello-world',
  excerpt: 'An excerpt',
  content: '',
  contentFormat: 'wp_block_html',
  renderedContent: '<p>Body <strong>bold</strong></p>',
  toc: [{ level: 2, id: 'section', text: 'Section' }],
  featuredImage: null,
  seoTitle: 'SEO Title',
  seoDescription: 'SEO Desc',
  canonicalUrl: 'https://example.com/posts/hello-world',
  robots: 'index,follow',
  ogTitle: 'OG Title',
  ogDescription: 'OG Desc',
  publishedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  terms: {
    categories: [{ id: 'c1', name: 'Cat', slug: 'cat', path: '/category/cat' }],
    tags: [{ id: 't1', name: 'Tag', slug: 'tag', path: '/tag/tag' }],
  },
};

describe('post page', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders renderedContent HTML and terms', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(samplePost));
    const params = Promise.resolve({ slug: 'hello-world' });
    const searchParams = Promise.resolve({});
    const html = renderToStaticMarkup(await PostPage({ params, searchParams }));
    expect(html).toContain('Hello World');
    expect(html).toContain('<p>Body <strong>bold</strong></p>');
    expect(html).toContain('Cat');
    expect(html).toContain('Tag');
    // Structured data is emitted with the post, referencing the site graph.
    expect(html).toContain('application/ld+json');
    expect(html).toContain('BlogPosting');
    expect(html).toContain('BreadcrumbList');
  });

  it('emits Twitter card metadata alongside Open Graph', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(samplePost));
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'hello-world' }),
      searchParams: Promise.resolve({}),
    });
    expect(meta.twitter).toMatchObject({
      card: 'summary_large_image',
      title: 'OG Title',
      description: 'OG Desc',
    });
  });

  it('uses the WordPress single-post template without the legacy TOC', async () => {
    const post = {
      ...samplePost,
      toc: [
        { level: 2, id: 'a', text: 'A' },
        { level: 3, id: 'b', text: 'B' },
      ],
    };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(post));
    const params = Promise.resolve({ slug: 'hello-world' });
    const searchParams = Promise.resolve({});
    const html = renderToStaticMarkup(await PostPage({ params, searchParams }));
    expect(html).toContain('Hello World');
    expect(html).toContain('<p>Body <strong>bold</strong></p>');
    expect(html).not.toContain('On this page');
  });

  it('renders the featured image with the 1200 derivative and its alt text', async () => {
    const post = {
      ...samplePost,
      featuredImage: {
        id: 'm1',
        url: '/api/media/m1/abc.webp',
        width: 1600,
        height: 900,
        altText: 'Hero image',
        derivatives: { '1200': '/api/media/m1/abc-1200.webp' },
      },
    };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(post));
    const params = Promise.resolve({ slug: 'hello-world' });
    const searchParams = Promise.resolve({});
    const html = renderToStaticMarkup(await PostPage({ params, searchParams }));
    expect(html).toContain('abc-1200.webp');
    expect(html).toContain('Hero image');
  });

  it('generateMetadata emits an absolute og:image from the featured image', async () => {
    const post = {
      ...samplePost,
      featuredImage: {
        id: 'm1',
        url: '/api/media/m1/abc.webp',
        width: 1600,
        height: 900,
        altText: 'Hero image',
        derivatives: {},
      },
    };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(post));
    const params = Promise.resolve({ slug: 'hello-world' });
    const searchParams = Promise.resolve({});
    const meta = await generateMetadata({ params, searchParams });
    const images = meta.openGraph?.images as Array<{ url: string; alt?: string }> | undefined;
    expect(images?.[0]?.url).toMatch(/^http/);
    expect(images?.[0]?.url).toContain('/api/media/m1/abc.webp');
    expect(images?.[0]?.alt).toBe('Hero image');
  });

  it('throws on 404', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({ error: { code: 'NOT_FOUND' } }, 404),
    );
    const params = Promise.resolve({ slug: 'missing' });
    const searchParams = Promise.resolve({});
    await expect(PostPage({ params, searchParams })).rejects.toThrow();
  });

  it('generateMetadata uses seoTitle when present', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(samplePost));
    const params = Promise.resolve({ slug: 'hello-world' });
    const searchParams = Promise.resolve({});
    const meta = await generateMetadata({ params, searchParams });
    expect(meta.title).toBe('SEO Title');
    expect(meta.description).toBe('SEO Desc');
    expect(meta.robots).toBe('index,follow');
    expect(meta.alternates?.canonical).toBe('https://example.com/posts/hello-world');
    expect(meta.openGraph?.title).toBe('OG Title');
    expect(meta.openGraph?.description).toBe('OG Desc');
  });

  it('generateMetadata falls back to title when seoTitle absent', async () => {
    const post = {
      ...samplePost,
      seoTitle: null,
      seoDescription: null,
      ogTitle: null,
      ogDescription: null,
      canonicalUrl: null,
      robots: null,
    };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(post));
    const params = Promise.resolve({ slug: 'hello-world' });
    const searchParams = Promise.resolve({});
    const meta = await generateMetadata({ params, searchParams });
    expect(meta.title).toBe('Hello World');
    expect(meta.robots).toBeUndefined();
    // WordPress always emits a canonical; the default is derived from the slug.
    expect(meta.alternates?.canonical).toBe('http://localhost:3000/posts/hello-world');
  });
  it('uses the canonical path supplied by the API under a custom structure', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({
        ...samplePost,
        canonicalUrl: null,
        path: '/2026/01/hello-world',
        featuredImage: null,
      }),
    );
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'hello-world' }),
      searchParams: Promise.resolve({}),
    });
    expect(meta.alternates?.canonical).toBe('http://localhost:3000/2026/01/hello-world');
  });

  it('a per-post robots value cannot re-enable indexing when the site is offline', async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/public/site')) {
        return jsonResponse({ siteTitle: 'Site', siteUrl: '', blogPublic: false });
      }
      return jsonResponse(samplePost);
    });
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: 'hello-world' }),
      searchParams: Promise.resolve({}),
    });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });
});

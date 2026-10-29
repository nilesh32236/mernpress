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
  excerpt: 'An excerpt',
  content: '',
  contentFormat: 'wp_block_html',
  renderedContent: '<p>Body <strong>bold</strong></p>',
  toc: [{ level: 2, id: 'section', text: 'Section' }],
  seoTitle: 'SEO Title',
  seoDescription: 'SEO Desc',
  canonicalUrl: 'https://example.com/posts/hello-world',
  robots: 'index,follow',
  ogTitle: 'OG Title',
  ogDescription: 'OG Desc',
  publishedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  terms: {
    categories: [{ id: 'c1', name: 'Cat', slug: 'cat' }],
    tags: [{ id: 't1', name: 'Tag', slug: 'tag' }],
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
    const html = renderToStaticMarkup(await PostPage({ params }));
    expect(html).toContain('Hello World');
    expect(html).toContain('<p>Body <strong>bold</strong></p>');
    expect(html).toContain('Cat');
    expect(html).toContain('Tag');
  });

  it('renders toc aside when more than one entry', async () => {
    const post = {
      ...samplePost,
      toc: [
        { level: 2, id: 'a', text: 'A' },
        { level: 3, id: 'b', text: 'B' },
      ],
    };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(post));
    const params = Promise.resolve({ slug: 'hello-world' });
    const html = renderToStaticMarkup(await PostPage({ params }));
    expect(html).toContain('On this page');
  });

  it('throws on 404', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({ error: { code: 'NOT_FOUND' } }, 404),
    );
    const params = Promise.resolve({ slug: 'missing' });
    await expect(PostPage({ params })).rejects.toThrow();
  });

  it('generateMetadata uses seoTitle when present', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(samplePost));
    const params = Promise.resolve({ slug: 'hello-world' });
    const meta = await generateMetadata({ params });
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
    const meta = await generateMetadata({ params });
    expect(meta.title).toBe('Hello World');
    expect(meta.robots).toBeUndefined();
    expect(meta.alternates).toBeUndefined();
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import SearchPage from '../app/search/page';
import CategoryArchive from '../app/category/[slug]/page';
import TagArchive from '../app/tag/[slug]/page';

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

const post = {
  id: '1',
  type: 'post',
  title: 'Hello World',
  slug: 'hello-world',
  excerpt: 'An excerpt',
  content: '',
  contentFormat: 'wp_block_html',
  renderedContent: '<p>Body</p>',
  toc: [],
  seoTitle: null,
  seoDescription: null,
  canonicalUrl: null,
  robots: null,
  ogTitle: null,
  ogDescription: null,
  publishedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  terms: {
    categories: [{ id: 'c1', name: 'Cat', slug: 'cat' }],
    tags: [{ id: 't1', name: 'Tag', slug: 'tag' }],
  },
};

function page(overrides: Record<string, unknown> = {}) {
  return {
    items: [post],
    pagination: { page: 1, perPage: 10, total: 1, totalPages: 1 },
    ...overrides,
  };
}

describe('public archives', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('searches posts with the WordPress s filter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(page()));
    vi.stubGlobal('fetch', fetchMock);
    const html = renderToStaticMarkup(
      await SearchPage({ searchParams: Promise.resolve({ q: 'hello' }) }),
    );
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('search=hello');
    expect(html).toContain('Search results for');
    expect(html).toContain('/posts/hello-world');
  });

  it('renders a category archive with a linkable term', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(page()));
    vi.stubGlobal('fetch', fetchMock);
    const html = renderToStaticMarkup(
      await CategoryArchive({
        params: Promise.resolve({ slug: 'cat' }),
        searchParams: Promise.resolve({}),
      }),
    );
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('category=cat');
    expect(html).toContain('Category: Cat');
    expect(html).toContain('/posts/hello-world');
  });

  it('renders a tag archive', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(page()));
    vi.stubGlobal('fetch', fetchMock);
    const html = renderToStaticMarkup(
      await TagArchive({
        params: Promise.resolve({ slug: 'tag' }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('tag=tag');
    expect(html).toContain('Tag: Tag');
  });

  it('shows a friendly message when the archive API is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const html = renderToStaticMarkup(
      await SearchPage({ searchParams: Promise.resolve({ q: 'hello' }) }),
    );
    expect(html).toContain('temporarily unavailable');
  });
});

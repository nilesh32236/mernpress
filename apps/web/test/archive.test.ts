import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SearchPage from '../app/search/page';
import CategoryArchive from '../app/category/[slug]/page';
import TagArchive from '../app/tag/[slug]/page';

/**
 * Public archive pages: WordPress `s`, category_name and tag filters reach the
 * API, and an unavailable API degrades to a readable status rather than a
 * blank page. The pages resolve the term through `/api/public/terms/*` before
 * listing posts, so the mock is URL-aware.
 */
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

const page = {
  items: [post],
  pagination: { page: 1, perPage: 10, total: 1, totalPages: 1 },
};

function mockApi({ termName = 'Cat', failPosts = false } = {}) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (failPosts && url.includes('/api/public/posts')) throw new Error('down');
    if (url.includes('/api/public/terms/')) {
      return jsonResponse({ id: 't1', name: termName, slug: 'cat', description: 'A term' });
    }
    if (url.includes('/api/public/site')) return jsonResponse({});
    return jsonResponse(page);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('public archives', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('searches posts with the WordPress s filter', async () => {
    const fetchMock = mockApi();
    const html = renderToStaticMarkup(
      await SearchPage({ searchParams: Promise.resolve({ q: 'hello' }) }),
    );
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('search=hello'))).toBe(true);
    expect(html).toContain('Search results for');
    expect(html).toContain('/posts/hello-world');
  });

  it('renders a category archive with the real term name', async () => {
    const fetchMock = mockApi({ termName: 'Category One' });
    const html = renderToStaticMarkup(
      await CategoryArchive({
        params: Promise.resolve({ slug: 'cat' }),
        searchParams: Promise.resolve({}),
      }),
    );
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('category=cat'))).toBe(true);
    expect(html).toContain('Category One');
    expect(html).toContain('/posts/hello-world');
  });

  it('renders a tag archive', async () => {
    const fetchMock = mockApi({ termName: 'Tag One' });
    const html = renderToStaticMarkup(
      await TagArchive({
        params: Promise.resolve({ slug: 'tag' }),
        searchParams: Promise.resolve({}),
      }),
    );
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('tag=tag'))).toBe(true);
    expect(html).toContain('Tag One');
  });

  it('shows a friendly message when the search API is down', async () => {
    mockApi({ failPosts: true });
    const html = renderToStaticMarkup(
      await SearchPage({ searchParams: Promise.resolve({ q: 'hello' }) }),
    );
    expect(html).toContain('try again later');
    expect(html).toContain('role="status"');
  });
});

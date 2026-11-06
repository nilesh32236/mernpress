import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import HomePage from '../app/page';

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

describe('home page', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists posts from the API', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: '1',
            type: 'post',
            title: 'Hello World',
            slug: 'hello-world',
            path: '/2026/01/hello-world',
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
            terms: { categories: [], tags: [] },
          },
        ],
        pagination: { page: 1, perPage: 10, total: 1, totalPages: 1 },
      }),
    );
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('Blog');
    expect(html).toContain('Hello World');
    expect(html).toContain('An excerpt');
    expect(html).toContain('/2026/01/hello-world');
  });

  it('renders empty state when no posts', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({
        items: [],
        pagination: { page: 1, perPage: 10, total: 0, totalPages: 1 },
      }),
    );
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('Sorry, but nothing was found');
  });

  it('renders friendly message when API is down', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('down'));
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('temporarily unavailable');
  });

  it('renders the configured static front page instead of the blog', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/public/site')) {
        return jsonResponse({
          siteTitle: 'Example',
          showOnFront: 'page',
          pageOnFrontSlug: 'welcome-home',
        });
      }
      if (url.includes('/api/public/posts/welcome-home')) {
        return jsonResponse({
          id: 'p1',
          type: 'page',
          title: 'Welcome home',
          slug: 'welcome-home',
          path: '/welcome-home',
          excerpt: null,
          content: '',
          contentFormat: 'wp_block_html',
          renderedContent: '<p>HomePage body</p>',
          toc: [],
          seoTitle: null,
          seoDescription: null,
          canonicalUrl: null,
          robots: null,
          ogTitle: null,
          ogDescription: null,
          publishedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          commentStatus: 'closed',
          sticky: false,
          passwordProtected: false,
          format: 'standard',
          language: 'en',
          terms: { categories: [], tags: [] },
          featuredImage: null,
          author: null,
        });
      }
      return jsonResponse({
        items: [],
        pagination: { page: 1, perPage: 10, total: 0, totalPages: 1 },
      });
    });
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('Welcome home');
    expect(html).toContain('HomePage body');
    expect(html).not.toContain('Sorry, but nothing was found');
  });
});

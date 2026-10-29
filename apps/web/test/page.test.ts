import { createElement } from 'react';
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
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain('MERNPress');
    expect(html).toContain('Hello World');
    expect(html).toContain('An excerpt');
    expect(html).toContain('/posts/hello-world');
  });

  it('renders empty state when no posts', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({
        items: [],
        pagination: { page: 1, perPage: 10, total: 0, totalPages: 1 },
      }),
    );
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain('No posts published yet');
  });

  it('renders friendly message when API is down', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('down'));
    const html = renderToStaticMarkup(await HomePage());
    expect(html).toContain('temporarily unavailable');
  });
});

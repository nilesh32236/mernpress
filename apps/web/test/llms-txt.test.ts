import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '../app/llms.txt/route';

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
  excerpt: 'An <excerpt>',
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
  publishedAt: '2026-01-01T00:00:00.000Z',
  commentStatus: 'open',
  sticky: false,
  updatedAt: '2026-01-01T00:00:00.000Z',
  terms: { categories: [], tags: [] },
  author: {
    id: 'u1',
    username: 'admin',
    displayName: null,
    bio: null,
    website: null,
  },
};

describe('llms.txt', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists published posts and pages with canonical links', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/public/site')) {
        return jsonResponse({
          siteTitle: 'Example Site',
          tagline: 'A quiet blog',
          permalinkBase: 'posts',
          blogPublic: true,
        });
      }
      if (url.includes('type=post')) {
        return jsonResponse({
          items: [post],
          pagination: { page: 1, perPage: 100, total: 1, totalPages: 1 },
        });
      }
      return jsonResponse({
        items: [{ ...post, id: 'p1', type: 'page', title: 'About', slug: 'about' }],
        pagination: { page: 1, perPage: 100, total: 1, totalPages: 1 },
      });
    });

    const response = await GET();
    expect(response.headers.get('content-type')).toContain('text/plain');
    const text = await response.text();
    expect(text).toContain('# Example Site');
    expect(text).toContain('> A quiet blog');
    expect(text).toContain(
      '- [Hello World](http://localhost:3000/posts/hello-world): An <excerpt>',
    );
    expect(text).toContain('- [About](http://localhost:3000/about)');
    expect(text).toContain('[RSS feed](http://localhost:3000/feed)');
    expect(text).toContain('[Sitemap](http://localhost:3000/sitemap.xml)');
    expect(text).toContain('not a\npermissions file');
  });

  it('publishes nothing but a no-public note when the blog is private', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({ siteTitle: 'Private', blogPublic: false }),
    );
    const text = await (await GET()).text();
    expect(text).toContain('not public');
    expect(text).not.toContain('hello-world');
  });
});

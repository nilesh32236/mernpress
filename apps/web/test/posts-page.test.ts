import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PageBySlug from '../app/[slug]/page';

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

const blogPage = {
  id: 'p2',
  type: 'page',
  title: 'Blog',
  slug: 'blog',
  path: '/blog',
  excerpt: null,
  content: '',
  contentFormat: 'wp_block_html',
  renderedContent: '<p>The blog page body is replaced by the loop.</p>',
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
  translationGroup: 'group-1',
  terms: { categories: [], tags: [] },
  featuredImage: null,
  author: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('posts page', () => {
  it('shows the blog loop when the page is the configured posts page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input) => {
        const url = String(input);
        if (url.includes('/api/public/site')) {
          return jsonResponse({ siteTitle: 'Example', pageForPostsSlug: 'blog' });
        }
        if (url.includes('/api/public/posts/blog')) return jsonResponse(blogPage);
        if (url.includes('/api/public/posts?type=post')) {
          return jsonResponse({
            items: [
              {
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
                seoTitle: null,
                seoDescription: null,
                canonicalUrl: null,
                robots: null,
                ogTitle: null,
                ogDescription: null,
                publishedAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
                terms: { categories: [], tags: [] },
                featuredImage: null,
                author: null,
              },
            ],
            pagination: { page: 1, perPage: 10, total: 1, totalPages: 1 },
          });
        }
        return jsonResponse({
          items: [],
          pagination: { page: 1, perPage: 1, total: 0, totalPages: 1 },
        });
      }),
    );

    const html = renderToStaticMarkup(
      await PageBySlug({
        params: Promise.resolve({ slug: 'blog' }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(html).toContain('blog-title');
    expect(html).toContain('Blog');
    expect(html).toContain('Hello World');
    expect(html).toContain('href="/posts/hello-world"');
    // The page's own body is not rendered in this mode.
    expect(html).not.toContain('The blog page body is replaced by the loop.');
  });
});

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

function jsonResponse(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

const site = {
  siteTitle: 'MERNPress',
  tagline: 'Notes',
  blogPublic: true,
  categoryBase: 'category',
  tagBase: 'tag',
};

describe('archive metadata', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('home and blog emit a canonical URL', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(site));
    const { generateMetadata: homeMeta } = await import('../app/page');
    const { generateMetadata: blogMeta } = await import('../app/posts/page');
    expect((await homeMeta()).alternates?.canonical).toBe('http://localhost:3000');
    expect((await blogMeta()).alternates?.canonical).toBe('http://localhost:3000/posts');
  });

  it('category and tag archives emit term canonicals', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/public/site')) return jsonResponse(site);
        if (url.includes('/api/public/terms/category/news')) {
          return jsonResponse({ name: 'News', slug: 'news', description: null });
        }
        if (url.includes('/api/public/terms/tag/demo')) {
          return jsonResponse({ name: 'Demo', slug: 'demo', description: 'Demo things' });
        }
        return jsonResponse(null, 404);
      },
    );
    const { generateMetadata: categoryMeta } = await import('../app/category/[slug]/page');
    const { generateMetadata: tagMeta } = await import('../app/tag/[slug]/page');
    const category = await categoryMeta({ params: Promise.resolve({ slug: 'news' }) });
    expect(category.title).toBe('Category: News');
    expect(category.alternates?.canonical).toBe('http://localhost:3000/category/news');
    const tag = await tagMeta({ params: Promise.resolve({ slug: 'demo' }) });
    expect(tag.title).toBe('Tag: Demo');
    expect(tag.alternates?.canonical).toBe('http://localhost:3000/tag/demo');
  });

  it('a missing term is noindexed instead of indexed as an empty archive', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/public/site')) return jsonResponse(site);
        return jsonResponse(null, 404);
      },
    );
    const { generateMetadata: categoryMeta } = await import('../app/category/[slug]/page');
    const meta = await categoryMeta({ params: Promise.resolve({ slug: 'gone' }) });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it('author archives emit a canonical URL', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(site));
    const { generateMetadata } = await import('../app/author/[username]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ username: 'admin' }) });
    expect(meta.alternates?.canonical).toBe('http://localhost:3000/author/admin');
  });

  it('search results are noindex but keep a canonical base URL', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(site));
    const { generateMetadata } = await import('../app/search/page');
    const meta = await generateMetadata({ searchParams: Promise.resolve({ q: 'secret' }) });
    expect(meta.robots).toEqual({ index: false, follow: true });
    expect(meta.alternates?.canonical).toBe('http://localhost:3000/search');
    expect(meta.title).toContain('Search results for');
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import PreviewPage, { generateMetadata } from '../app/preview/[token]/page';

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

const token = 'a'.repeat(64);

const sampleDraft = {
  id: '1',
  type: 'post' as const,
  title: 'Draft Preview',
  slug: 'draft-preview',
  path: '/posts/draft-preview',
  excerpt: null,
  content: '',
  contentFormat: 'wp_block_html',
  renderedContent: '<p>Unpublished body</p>',
  toc: [],
  seoTitle: null,
  seoDescription: null,
  canonicalUrl: null,
  robots: null,
  ogTitle: null,
  ogDescription: null,
  publishedAt: null,
  updatedAt: '2026-01-02T00:00:00.000Z',
  terms: { categories: [], tags: [] },
};

describe('preview page', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the draft with a preview banner and no-store fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(sampleDraft));
    vi.stubGlobal('fetch', fetchMock);

    const element = await PreviewPage({ params: Promise.resolve({ token }) });
    const html = renderToStaticMarkup(element);
    expect(html).toContain('Unpublished body');
    expect(html).toContain('preview of unpublished content');

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain(`/api/public/preview/${token}`);
    expect((init as { cache?: string }).cache).toBe('no-store');
  });

  it('rejects malformed tokens without calling the API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(sampleDraft));
    vi.stubGlobal('fetch', fetchMock);

    await expect(PreviewPage({ params: Promise.resolve({ token: 'short' }) })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('marks previews noindex', async () => {
    const metadata = await generateMetadata();
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});

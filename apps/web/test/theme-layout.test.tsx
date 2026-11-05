import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RootLayout from '../app/layout';

vi.mock('next/font/google', () => ({
  Manrope: () => ({ variable: '--font-manrope' }),
}));

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('theme application', () => {
  it('applies the active theme tokens and layout to the document', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input) => {
        const url = String(input);
        if (url.includes('/api/public/site')) {
          return jsonResponse({
            siteTitle: 'Example',
            tagline: 'Writing',
            blogPublic: true,
            postsPerRss: 10,
            rssUseExcerpt: false,
            permalinkBase: 'posts',
            showAvatars: true,
            theme: {
              id: 'journal',
              name: 'MERNPress Journal',
              layout: 'journal',
              tokens: {
                background: '#f7f2e8',
                surface: '#fffdf8',
                text: '#1f1b16',
                muted: '#6b6157',
                accent: '#8a3b2e',
                headingFont: "Georgia, 'Times New Roman', serif",
                bodyFont: 'Manrope, sans-serif',
                contentWidth: '700px',
                radius: '10px',
                headerAlign: 'center',
              },
            },
          });
        }
        return jsonResponse({
          items: [],
          pagination: { page: 1, perPage: 6, total: 0, totalPages: 0 },
        });
      }),
    );
    const html = renderToStaticMarkup(
      await RootLayout({ children: <main id="main-content">Hello</main> }),
    );
    expect(html).toContain('data-theme="journal"');
    expect(html).toContain('data-layout="journal"');
    expect(html).toContain('--site-bg:#f7f2e8');
    expect(html).toContain('--content-width:700px');
    expect(html).toContain('--site-accent:#8a3b2e');
    expect(html).toContain('Hello');
  });

  it('keeps the default document when the API has no theme', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({}) as never),
    );
    const html = renderToStaticMarkup(
      await RootLayout({ children: <main id="main-content">Hello</main> }),
    );
    expect(html).not.toContain('data-theme=');
    expect(html).toContain('MERNPress');
  });
});

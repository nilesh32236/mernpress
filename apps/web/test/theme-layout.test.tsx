import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RootLayout from '../app/layout';
import { COLOR_SCHEME_COOKIE } from '../lib/color-scheme';

vi.mock('next/font/google', () => ({
  Manrope: () => ({ variable: '--font-manrope' }),
}));

// The root layout reads the visitor's colour-scheme choice from the request
// cookies and the request language from the request headers.
const mocks = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: (name: string) => {
      const value = mocks.cookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
  }),
}));

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

/** Site settings payload with the theme the tests need. */
const lightTokens = {
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
};

const darkTokens = {
  background: '#15120f',
  surface: '#221d19',
  text: '#f4efe7',
  muted: '#a89e91',
  accent: '#e0a196',
};

/** Stub the public API with the given site settings. */
function stubSite(settings: Record<string, unknown>) {
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
          ...settings,
        });
      }
      return jsonResponse({
        items: [],
        pagination: { page: 1, perPage: 6, total: 0, totalPages: 0 },
      });
    }),
  );
}

async function renderLayout() {
  return renderToStaticMarkup(await RootLayout({ children: <main id="main-content">Hello</main> }));
}

beforeEach(() => {
  mocks.cookies.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('theme application', () => {
  it('applies the active theme tokens and layout to the document', async () => {
    stubSite({
      theme: {
        id: 'journal',
        name: 'MERNPress Journal',
        layout: 'journal',
        tokens: lightTokens,
      },
    });
    const html = await renderLayout();
    expect(html).toContain('data-theme="journal"');
    expect(html).toContain('data-layout="journal"');
    // The palette is published as light/dark custom properties; the stylesheet
    // maps them onto the semantic `--site-*` names with `light-dark()`.
    expect(html).toContain('--theme-light-bg:#f7f2e8');
    expect(html).toContain('--theme-light-surface:#fffdf8');
    expect(html).toContain('--theme-light-text:#1f1b16');
    expect(html).toContain('--theme-light-muted:#6b6157');
    expect(html).toContain('--theme-light-accent:#8a3b2e');
    expect(html).toContain('--content-width:700px');
    expect(html).toContain('--site-radius:10px');
    expect(html).toContain('Hello');
  });

  it('keeps the default document when the API has no theme', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({}) as never),
    );
    const html = await renderLayout();
    expect(html).not.toContain('data-theme=');
    expect(html).toContain('MERNPress');
  });

  it('applies customizer colours, menu and Additional CSS', async () => {
    stubSite({
      siteTitle: 'Custom Site',
      customColors: { background: '#101010', accent: '#ff0066' },
      customMenu: [
        { label: 'About', url: '/about' },
        { label: 'Docs', url: 'https://example.com/docs' },
      ],
      customCss: '.site-title { letter-spacing: 1px; }',
      showOnFront: 'posts',
      pageOnFrontSlug: null,
      pageForPostsSlug: null,
      theme: {
        id: 'journal',
        name: 'MERNPress Journal',
        layout: 'journal',
        tokens: { ...lightTokens, headingFont: 'Georgia, serif' },
      },
    });
    const html = await renderLayout();
    // Custom colours override the theme tokens, unset tokens keep the theme.
    expect(html).toContain('--theme-light-bg:#101010');
    expect(html).toContain('--theme-light-accent:#ff0066');
    expect(html).toContain('--theme-light-text:#1f1b16');
    // Additional CSS is injected raw into a dedicated style element.
    expect(html).toContain('id="customizer-css"');
    expect(html).toContain('.site-title { letter-spacing: 1px; }');
    // The custom menu replaces the published-page links.
    expect(html).toContain('href="/about"');
    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('Custom Site');
  });

  it('publishes the dark palette when the theme defines one', async () => {
    stubSite({
      theme: {
        id: 'journal',
        name: 'MERNPress Journal',
        layout: 'journal',
        tokens: { ...lightTokens, dark: darkTokens },
      },
    });
    const html = await renderLayout();
    expect(html).toContain('--theme-light-bg:#f7f2e8');
    expect(html).toContain('--theme-dark-bg:#15120f');
    expect(html).toContain('--theme-dark-surface:#221d19');
    expect(html).toContain('--theme-dark-text:#f4efe7');
    expect(html).toContain('--theme-dark-muted:#a89e91');
    expect(html).toContain('--theme-dark-accent:#e0a196');
  });

  it('publishes no dark palette when the theme has none', async () => {
    stubSite({
      theme: {
        id: 'journal',
        name: 'MERNPress Journal',
        layout: 'journal',
        tokens: lightTokens,
      },
    });
    const html = await renderLayout();
    expect(html).toContain('--theme-light-bg:#f7f2e8');
    expect(html).not.toContain('--theme-dark-');
  });

  it('renders the colour-scheme toggle in the header', async () => {
    stubSite({
      theme: {
        id: 'journal',
        name: 'MERNPress Journal',
        layout: 'journal',
        tokens: lightTokens,
      },
    });
    const html = await renderLayout();
    expect(html).toContain('data-testid="theme-toggle"');
    expect(html).toContain('class="theme-toggle"');
    expect(html).toContain('aria-label="Switch to dark mode"');
    expect(html).toContain('data-scheme="light"');
  });
});

describe('public colour scheme', () => {
  it('pins the dark scheme when the cookie asks for it', async () => {
    mocks.cookies.set(COLOR_SCHEME_COOKIE, 'dark');
    stubSite({
      theme: {
        id: 'journal',
        name: 'MERNPress Journal',
        layout: 'journal',
        tokens: { ...lightTokens, dark: darkTokens },
      },
    });
    const html = await renderLayout();
    expect(html).toContain('data-color-scheme="dark"');
    // The toggle knows the server-side scheme and offers the opposite one.
    expect(html).toContain('data-scheme="dark"');
    expect(html).toContain('aria-label="Switch to light mode"');
  });

  it('pins the light scheme when the cookie asks for it', async () => {
    mocks.cookies.set(COLOR_SCHEME_COOKIE, 'light');
    stubSite({
      theme: {
        id: 'journal',
        name: 'MERNPress Journal',
        layout: 'journal',
        tokens: { ...lightTokens, dark: darkTokens },
      },
    });
    const html = await renderLayout();
    expect(html).toContain('data-color-scheme="light"');
    expect(html).toContain('data-scheme="light"');
    expect(html).toContain('aria-label="Switch to dark mode"');
  });

  it('follows the operating system when there is no cookie', async () => {
    stubSite({
      theme: {
        id: 'journal',
        name: 'MERNPress Journal',
        layout: 'journal',
        tokens: { ...lightTokens, dark: darkTokens },
      },
    });
    const html = await renderLayout();
    expect(html).not.toContain('data-color-scheme');
  });

  it('ignores an unknown cookie value', async () => {
    mocks.cookies.set(COLOR_SCHEME_COOKIE, 'blue');
    stubSite({
      theme: {
        id: 'journal',
        name: 'MERNPress Journal',
        layout: 'journal',
        tokens: { ...lightTokens, dark: darkTokens },
      },
    });
    const html = await renderLayout();
    expect(html).not.toContain('data-color-scheme');
  });
});

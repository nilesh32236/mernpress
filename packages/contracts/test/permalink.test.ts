import { describe, expect, it } from 'vitest';
import {
  matchPostPath,
  normalizePattern,
  postPath,
  previewPostPath,
  termPath,
  validatePattern,
} from '../src/index.js';

const post = {
  id: '01a1ac1b-a62d-76e1-b89e-7fcb0952facc',
  slug: 'hello-world',
  publishedAt: '2026-01-15T09:30:45.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  categorySlug: 'news',
};

describe('permalink structures', () => {
  it('generates each WordPress preset', () => {
    expect(postPath('', post)).toBe(`/?p=${post.id}`);
    expect(postPath('/%year%/%monthnum%/%day%/%postname%/', post)).toBe('/2026/01/15/hello-world');
    expect(postPath('/%year%/%monthnum%/%postname%/', post)).toBe('/2026/01/hello-world');
    expect(postPath('/archives/%post_id%/', post)).toBe(`/archives/${post.id}`);
    expect(postPath('/%postname%/', post)).toBe('/hello-world');
    expect(postPath('/%category%/%postname%/', post)).toBe('/news/hello-world');
    expect(postPath('/blog/%postname%/', post)).toBe('/blog/hello-world');
  });

  it('uses UTC and falls back to createdAt without a publish date', () => {
    expect(postPath('/%year%/%monthnum%/%postname%/', { ...post, publishedAt: null })).toBe(
      '/2026/01/hello-world',
    );
    expect(
      postPath('/%year%/%monthnum%/%day%/%postname%/', {
        ...post,
        publishedAt: '2026-03-04T23:59:59.000Z',
      }),
    ).toBe('/2026/03/04/hello-world');
  });

  it('matches paths and captures slug, id, category and date parts', () => {
    expect(
      matchPostPath('/%year%/%monthnum%/%day%/%postname%/', '/2026/01/15/hello-world/'),
    ).toEqual({
      path: '/2026/01/15/hello-world/',
      year: '2026',
      month: '01',
      day: '15',
      slug: 'hello-world',
    });
    expect(matchPostPath('/archives/%post_id%/', `/archives/${post.id}`)).toMatchObject({
      id: post.id,
    });
    expect(matchPostPath('/%category%/%postname%/', '/news/hello-world')).toMatchObject({
      category: 'news',
      slug: 'hello-world',
    });
    expect(matchPostPath('/%postname%/', '/hello-world')).toMatchObject({ slug: 'hello-world' });
    expect(matchPostPath('/%postname%/', '/2026/01/hello-world')).toBeNull();
    expect(matchPostPath('/blog/%postname%/', '/news/hello-world')).toBeNull();
  });

  it('validates custom patterns', () => {
    expect(validatePattern('/%year%/%postname%/')).toEqual({
      ok: true,
      pattern: '/%year%/%postname%/',
    });
    expect(validatePattern('blog/%postname%')).toEqual({
      ok: true,
      pattern: '/blog/%postname%/',
    });
    expect(validatePattern('/%category%/%postname%/')).toEqual({
      ok: true,
      pattern: '/%category%/%postname%/',
    });
    expect(validatePattern('/%year%/').ok).toBe(false);
    expect(validatePattern('/%foo%/%postname%/').ok).toBe(false);
    expect(validatePattern('/%postname%/%post_id%/').ok).toBe(false);
    expect(validatePattern('/Bad Segment/%postname%/').ok).toBe(false);
    expect(normalizePattern('  //blog//%postname%// ')).toBe('/blog/%postname%/');
  });

  it('builds term paths with configurable bases and a preview', () => {
    expect(termPath('category', 'news')).toBe('/category/news');
    expect(termPath('tag', 'demo', { tagBase: 'topics' })).toBe('/topics/demo');
    expect(termPath('category', 'news', { categoryBase: 'sections' })).toBe('/sections/news');
    expect(previewPostPath('/%year%/%monthnum%/%postname%/')).toBe('/2026/01/sample-post');
  });
});

describe('admin colour schemes', () => {
  it('lists the nine WordPress choices and validates ids', async () => {
    const { ADMIN_COLOR_SCHEMES, DEFAULT_ADMIN_COLOR_SCHEME, isAdminColorScheme } =
      await import('../src/admin-colors.js');
    expect(ADMIN_COLOR_SCHEMES).toHaveLength(9);
    expect(ADMIN_COLOR_SCHEMES.map((scheme) => scheme.id)).toEqual([
      'fresh',
      'light',
      'modern',
      'blue',
      'coffee',
      'ectoplasm',
      'midnight',
      'ocean',
      'sunrise',
    ]);
    expect(DEFAULT_ADMIN_COLOR_SCHEME).toBe('fresh');
    expect(isAdminColorScheme('midnight')).toBe(true);
    expect(isAdminColorScheme('default')).toBe(false);
    expect(isAdminColorScheme(null)).toBe(false);
  });
});

describe('screen options', () => {
  it('normalizes unknown screens, columns and panels away', async () => {
    const { normalizeScreenOptions, DEFAULT_SCREEN_OPTIONS } =
      await import('../src/screen-options.js');
    expect(normalizeScreenOptions(null)).toEqual(DEFAULT_SCREEN_OPTIONS);

    const state = normalizeScreenOptions({
      perPage: { posts: 25, pages: 0, nope: 50 },
      hiddenColumns: {
        posts: ['author', 'author', 'bad id!', 7],
        unknown: ['date'],
      },
      viewMode: { posts: 'compact', pages: 'huge' },
      dashboardHidden: ['events', 'events', 'evil'],
      dashboardColumns: 4,
      editorHiddenPanels: ['format', 'format', 'nope'],
    });
    expect(state).toEqual({
      perPage: { posts: 25 },
      hiddenColumns: { posts: ['author'] },
      viewMode: { posts: 'compact' },
      dashboardHidden: ['events'],
      dashboardColumns: 4,
      editorHiddenPanels: ['format'],
    });
  });

  it('clamps dashboard columns and ignores non-integers', async () => {
    const { normalizeScreenOptions } = await import('../src/screen-options.js');
    expect(normalizeScreenOptions({ dashboardColumns: 9 }).dashboardColumns).toBe(2);
    expect(normalizeScreenOptions({ dashboardColumns: '3' }).dashboardColumns).toBe(2);
    expect(normalizeScreenOptions({ perPage: { posts: 3.5 } }).perPage).toEqual({});
  });
});

describe('consent contract', () => {
  it('normalizes config and validates stored choices', async () => {
    const {
      DEFAULT_CONSENT,
      normalizeConsentConfig,
      parseConsentChoice,
      consentChoiceIsCurrent,
      consentAllows,
    } = await import('../src/consent.js');

    expect(normalizeConsentConfig(null)).toEqual(DEFAULT_CONSENT);
    const config = normalizeConsentConfig({
      enabled: true,
      version: 3,
      title: '  Cookies  ',
      analyticsEnabled: false,
      marketingEnabled: true,
      analyticsRequired: true,
    });
    expect(config).toMatchObject({
      enabled: true,
      version: 3,
      title: 'Cookies',
      analyticsEnabled: false,
      analyticsRequired: true,
    });

    const choice = parseConsentChoice(
      JSON.stringify({ version: 3, analytics: true, marketing: false, decidedAt: 'x' }),
    );
    expect(choice).toMatchObject({ version: 3, analytics: true, marketing: false });
    expect(parseConsentChoice('nope')).toBeNull();
    expect(consentChoiceIsCurrent(config, choice)).toBe(true);
    expect(consentChoiceIsCurrent(config, { ...choice!, version: 2 })).toBe(false);
    // Analytics is disabled in this config, so a stored grant does not count.
    expect(consentAllows(config, choice, 'analytics')).toBe(false);
    expect(consentAllows(config, choice, 'marketing')).toBe(false);
    expect(consentAllows({ ...config, enabled: false }, null, 'marketing')).toBe(true);
  });
});

describe('language contract', () => {
  it('normalizes enabled languages and keeps the default', async () => {
    const { DEFAULT_LANGUAGES, normalizeLanguageConfig, isLanguageCode, isLanguageEnabled } =
      await import('../src/languages.js');

    expect(normalizeLanguageConfig(null)).toEqual(DEFAULT_LANGUAGES);
    expect(
      normalizeLanguageConfig({ default: 'hi', enabled: ['hi', 'en', 'bad code', 'hi'] }),
    ).toEqual({ default: 'hi', enabled: ['hi', 'en'] });
    // An invalid default falls back to en, and the default is always enabled.
    expect(normalizeLanguageConfig({ default: 'xx1', enabled: ['hi'] })).toEqual({
      default: 'en',
      enabled: ['en', 'hi'],
    });
    expect(isLanguageCode('pt-br')).toBe(true);
    expect(isLanguageCode('e')).toBe(false);
    expect(isLanguageEnabled({ default: 'en', enabled: ['en', 'hi'] }, 'hi')).toBe(true);
  });

  it('prefixes only non-default languages and strips prefixes safely', async () => {
    const { languagePath, stripLanguagePrefix } = await import('../src/languages.js');
    const config = { default: 'en', enabled: ['en', 'hi'] };

    expect(languagePath(config, 'en', '/posts/hello')).toBe('/posts/hello');
    expect(languagePath(config, 'hi', '/posts/hello')).toBe('/hi/posts/hello');
    expect(languagePath(config, 'hi', '/')).toBe('/hi');
    expect(stripLanguagePrefix(config, '/hi/posts/hello')).toEqual({
      language: 'hi',
      path: '/posts/hello',
      prefixed: true,
    });
    expect(stripLanguagePrefix(config, '/posts/hello')).toEqual({
      language: 'en',
      path: '/posts/hello',
      prefixed: false,
    });
    // A disabled language is an ordinary first segment.
    expect(stripLanguagePrefix(config, '/fr/hello')).toEqual({
      language: 'en',
      path: '/fr/hello',
      prefixed: false,
    });
  });

  it('builds hreflang alternates with x-default', async () => {
    const { hreflangAlternates } = await import('../src/languages.js');
    const alternates = hreflangAlternates(
      { default: 'en', enabled: ['en', 'hi'] },
      [{ language: 'hi', path: '/hi/posts/hello' }],
      { language: 'en', path: '/posts/hello' },
      (path) => `https://example.com${path}`,
    );
    expect(alternates).toEqual({
      en: 'https://example.com/posts/hello',
      hi: 'https://example.com/hi/posts/hello',
      'x-default': 'https://example.com/posts/hello',
    });

    // When the default-language variant is unpublished, x-default is the site
    // root (matching the sitemap helper) rather than an arbitrary variant.
    const noDefault = hreflangAlternates(
      { default: 'en', enabled: ['en', 'hi'] },
      [{ language: 'hi', path: '/hi/posts/hello' }],
      { language: 'hi', path: '/hi/posts/hello' },
      (path) => `https://example.com${path}`,
    );
    expect(noDefault['x-default']).toBe('https://example.com/');
  });
});

describe('theme strings contract', () => {
  it('normalizes overrides and merges with defaults', async () => {
    const {
      DEFAULT_THEME_STRINGS,
      normalizeThemeStringOverrides,
      normalizeThemeStringsByLanguage,
      themeStringsFor,
    } = await import('../src/theme-strings.js');

    expect(normalizeThemeStringOverrides(null)).toEqual({});
    expect(
      normalizeThemeStringOverrides({
        blog: '  ब्लॉग  ',
        search: '   ',
        unknown: 'ignored',
        home: 42,
      }),
    ).toEqual({ blog: 'ब्लॉग' });
    expect(
      normalizeThemeStringsByLanguage({
        en: { home: 'Start' },
        hi: { blog: 'ब्लॉग' },
        'bad code': { home: 'Nope' },
        fr: {},
      }),
    ).toEqual({ en: { home: 'Start' }, hi: { blog: 'ब्लॉग' } });

    const merged = themeStringsFor({ en: { home: 'Start' }, hi: { blog: 'ब्लॉग' } }, 'hi', 'en');
    expect(merged.home).toBe('Start');
    expect(merged.blog).toBe('ब्लॉग');
    expect(merged.search).toBe(DEFAULT_THEME_STRINGS.search);
    // Unknown/null maps fall back to the built-ins.
    expect(themeStringsFor(null, 'hi', 'en')).toEqual(DEFAULT_THEME_STRINGS);
    // 404 copy is part of the same contract and falls back to English.
    expect(DEFAULT_THEME_STRINGS.notFoundTitle).toBe('Page not found');
    expect(
      normalizeThemeStringOverrides({
        notFoundTitle: '  पृष्ठ नहीं मिला  ',
        notFoundText: 'यह पृष्ठ मौजूद नहीं है।',
        notFoundImageAlt: 'पेड़',
      }),
    ).toEqual({
      notFoundTitle: 'पृष्ठ नहीं मिला',
      notFoundText: 'यह पृष्ठ मौजूद नहीं है।',
      notFoundImageAlt: 'पेड़',
    });
  });
});

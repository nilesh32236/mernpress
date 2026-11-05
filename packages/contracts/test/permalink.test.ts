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

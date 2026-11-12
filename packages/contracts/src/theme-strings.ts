/**
 * Per-language theme strings.
 *
 * The theme's chrome (skip link, footer links, navigation labels) is visible on
 * every page, including translated posts. The layout looks these strings up for
 * the language of the current request; missing keys fall back to the default
 * language's overrides and then to the built-in English defaults.
 */
export const THEME_STRING_KEYS = [
  { key: 'skipToContent', label: 'Skip link', fallback: 'Skip to content', max: 80 },
  { key: 'search', label: 'Search link / label', fallback: 'Search', max: 60 },
  { key: 'searchPlaceholder', label: 'Search placeholder', fallback: 'Type here...', max: 80 },
  { key: 'searchButton', label: 'Search button', fallback: 'Search', max: 60 },
  { key: 'blog', label: 'Blog link', fallback: 'Blog', max: 40 },
  { key: 'home', label: 'Home link', fallback: 'Home', max: 40 },
  { key: 'feed', label: 'Feed link', fallback: 'Feed', max: 40 },
  { key: 'primaryNav', label: 'Primary navigation label', fallback: 'Primary', max: 60 },
  { key: 'footerNav', label: 'Footer navigation label', fallback: 'Footer', max: 60 },
  {
    key: 'toggleDarkMode',
    label: 'Colour scheme: switch to dark',
    fallback: 'Switch to dark mode',
    max: 60,
  },
  {
    key: 'toggleLightMode',
    label: 'Colour scheme: switch to light',
    fallback: 'Switch to light mode',
    max: 60,
  },
  { key: 'dateLocale', label: 'Date locale (BCP 47)', fallback: 'en-US', max: 35 },
  { key: 'writtenBy', label: 'Post meta: written by', fallback: 'Written by', max: 60 },
  { key: 'minRead', label: 'Post meta: read time suffix', fallback: 'min read', max: 40 },
  { key: 'inCategory', label: 'Post meta: category connector', fallback: 'in', max: 40 },
  { key: 'uncategorized', label: 'Post meta: no category', fallback: 'Uncategorized', max: 60 },
  { key: 'postNavigation', label: 'Post navigation label', fallback: 'Post navigation', max: 60 },
  { key: 'languagesLabel', label: 'Language switcher label', fallback: 'Languages', max: 40 },
  { key: 'aboutAuthor', label: 'Author box heading', fallback: 'About the author', max: 80 },
  { key: 'visitWebsite', label: 'Author box website link', fallback: 'Visit website', max: 80 },
  { key: 'relatedPosts', label: 'Related posts heading', fallback: 'Related posts', max: 60 },
  { key: 'morePosts', label: 'More posts heading', fallback: 'More posts', max: 60 },
  { key: 'comments', label: 'Comments heading (empty)', fallback: 'Comments', max: 60 },
  { key: 'thoughtOn', label: 'Comments heading (one)', fallback: 'thought on', max: 40 },
  { key: 'thoughtsOn', label: 'Comments heading (many)', fallback: 'thoughts on', max: 40 },
  { key: 'loadingComments', label: 'Comments loading', fallback: 'Loading comments…', max: 80 },
  {
    key: 'commentsUnavailable',
    label: 'Comments unavailable',
    fallback: 'We couldn’t load comments right now.',
    max: 120,
  },
  { key: 'reply', label: 'Reply link', fallback: 'Reply', max: 40 },
  { key: 'replyTo', label: 'Reply-to heading prefix', fallback: 'Reply to', max: 40 },
  { key: 'leaveReply', label: 'Comment form heading', fallback: 'Leave a Reply', max: 60 },
  { key: 'cancelReply', label: 'Cancel reply', fallback: 'Cancel reply', max: 40 },
  {
    key: 'commentNotes',
    label: 'Comment form notes',
    fallback: 'Your email address will not be published. Required fields are marked *.',
    max: 200,
  },
  { key: 'nameLabel', label: 'Comment form: name', fallback: 'Name *', max: 40 },
  { key: 'emailLabel', label: 'Comment form: email', fallback: 'Email *', max: 40 },
  { key: 'websiteLabel', label: 'Comment form: website', fallback: 'Website', max: 40 },
  { key: 'commentLabel', label: 'Comment form: comment', fallback: 'Comment *', max: 40 },
  { key: 'posting', label: 'Comment submit (busy)', fallback: 'Posting…', max: 40 },
  { key: 'postComment', label: 'Comment submit', fallback: 'Post Comment', max: 40 },
  {
    key: 'commentPosted',
    label: 'Comment posted notice',
    fallback: 'Your comment has been posted.',
    max: 120,
  },
  {
    key: 'commentPending',
    label: 'Comment moderation notice',
    fallback: 'Your comment is awaiting moderation.',
    max: 120,
  },
  {
    key: 'commentsClosed',
    label: 'Comment error: comments closed',
    fallback: 'Comments are closed.',
    max: 120,
  },
  {
    key: 'commentLoginRequired',
    label: 'Comment error: login required',
    fallback: 'You must be logged in to comment.',
    max: 120,
  },
  {
    key: 'commentNameRequired',
    label: 'Comment error: name required',
    fallback: 'Please enter your name.',
    max: 120,
  },
  {
    key: 'commentEmailRequired',
    label: 'Comment error: email invalid',
    fallback: 'Please enter a valid email address.',
    max: 120,
  },
  {
    key: 'commentContentRequired',
    label: 'Comment error: comment required',
    fallback: 'Please write a comment.',
    max: 120,
  },
  {
    key: 'commentContentTooLong',
    label: 'Comment error: comment too long',
    fallback: 'Your comment is too long.',
    max: 120,
  },
  {
    key: 'commentUrlInvalid',
    label: 'Comment error: website invalid',
    fallback: 'Please enter a valid website URL.',
    max: 120,
  },
  {
    key: 'commentReplyMissing',
    label: 'Comment error: reply target missing',
    fallback: 'The comment you replied to is no longer available.',
    max: 160,
  },
  {
    key: 'commentTooFast',
    label: 'Comment error: posting too quickly',
    fallback: 'You are posting comments too quickly. Please wait a moment.',
    max: 160,
  },
  {
    key: 'commentFailed',
    label: 'Comment failure fallback',
    fallback: 'We could not post your comment.',
    max: 120,
  },
  { key: 'previousPage', label: 'Pagination previous', fallback: 'Previous page', max: 60 },
  { key: 'nextPage', label: 'Pagination next', fallback: 'Next page', max: 60 },
  { key: 'paginationLabel', label: 'Pagination label', fallback: 'Posts pagination', max: 60 },
  {
    key: 'noResults',
    label: 'Empty archive/search text',
    fallback: 'Sorry, but nothing was found. Please try a search with different keywords.',
    max: 200,
  },
  {
    key: 'noPosts',
    label: 'Empty blog text',
    fallback: 'No posts published yet. Nothing to read yet.',
    max: 200,
  },
  {
    key: 'searchResultsFor',
    label: 'Search results heading',
    fallback: 'Search results for',
    max: 60,
  },
  {
    key: 'searchHint',
    label: 'Search page hint',
    fallback: 'Type a question above to search the site.',
    max: 160,
  },
  {
    key: 'searchError',
    label: 'Search error text',
    fallback: 'We couldn’t run that search right now. Please try again later.',
    max: 160,
  },
  { key: 'categoryArchive', label: 'Category archive prefix', fallback: 'Category', max: 40 },
  { key: 'tagArchive', label: 'Tag archive prefix', fallback: 'Tag', max: 40 },
  { key: 'authorArchive', label: 'Author archive prefix', fallback: 'Author', max: 40 },
  { key: 'notFoundTitle', label: '404 title', fallback: 'Page not found', max: 120 },
  {
    key: 'notFoundText',
    label: '404 description',
    fallback:
      'The page you are looking for doesn’t exist, or it has been moved. Please try searching using the form below.',
    max: 300,
  },
  {
    key: 'notFoundImageAlt',
    label: '404 image alt text',
    fallback: 'Small totara tree on ridge above Long Point',
    max: 160,
  },
] as const;

export type ThemeStringKey = (typeof THEME_STRING_KEYS)[number]['key'];

/**
 * Presentation groups for the theme strings. Kept next to the keys so the
 * admin and any future editor share one grouping instead of maintaining a
 * second hand-written list.
 */
export const THEME_STRING_GROUPS = [
  {
    label: 'Header and navigation',
    keys: [
      'skipToContent',
      'search',
      'searchPlaceholder',
      'searchButton',
      'blog',
      'home',
      'feed',
      'primaryNav',
      'footerNav',
      'languagesLabel',
      'toggleDarkMode',
      'toggleLightMode',
    ],
  },
  {
    label: 'Posts and author',
    keys: [
      'dateLocale',
      'writtenBy',
      'minRead',
      'inCategory',
      'uncategorized',
      'postNavigation',
      'aboutAuthor',
      'visitWebsite',
      'relatedPosts',
      'morePosts',
    ],
  },
  {
    label: 'Comments',
    keys: [
      'comments',
      'thoughtOn',
      'thoughtsOn',
      'loadingComments',
      'commentsUnavailable',
      'reply',
      'replyTo',
      'leaveReply',
      'cancelReply',
      'commentNotes',
      'nameLabel',
      'emailLabel',
      'websiteLabel',
      'commentLabel',
      'posting',
      'postComment',
      'commentPosted',
      'commentPending',
      'commentFailed',
      'commentsClosed',
      'commentLoginRequired',
      'commentNameRequired',
      'commentEmailRequired',
      'commentContentRequired',
      'commentContentTooLong',
      'commentUrlInvalid',
      'commentReplyMissing',
      'commentTooFast',
    ],
  },
  {
    label: 'Archives, search and pagination',
    keys: [
      'previousPage',
      'nextPage',
      'paginationLabel',
      'noResults',
      'noPosts',
      'searchResultsFor',
      'searchHint',
      'searchError',
      'categoryArchive',
      'tagArchive',
      'authorArchive',
    ],
  },
  {
    label: 'Not found',
    keys: ['notFoundTitle', 'notFoundText', 'notFoundImageAlt'],
  },
] as const satisfies ReadonlyArray<{
  label: string;
  keys: ReadonlyArray<ThemeStringKey>;
}>;

export type ThemeStrings = Record<ThemeStringKey, string>;

/** Only the keys a site may override (partial, language-specific). */
export type ThemeStringOverrides = Partial<ThemeStrings>;

export type ThemeStringsByLanguage = Record<string, ThemeStringOverrides>;

const KEY_SET = new Set<string>(THEME_STRING_KEYS.map((entry) => entry.key));

export const DEFAULT_THEME_STRINGS: ThemeStrings = Object.fromEntries(
  THEME_STRING_KEYS.map((entry) => [entry.key, entry.fallback]),
) as ThemeStrings;

function maxFor(key: ThemeStringKey): number {
  return THEME_STRING_KEYS.find((entry) => entry.key === key)?.max ?? 80;
}

/** Coerce one language's overrides; unknown keys and empty values are dropped. */
export function normalizeThemeStringOverrides(value: unknown): ThemeStringOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const result: ThemeStringOverrides = {};
  for (const [key, raw] of Object.entries(input)) {
    if (!KEY_SET.has(key)) continue;
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim().slice(0, maxFor(key as ThemeStringKey));
    // A date locale must look like a language tag; a malformed value would
    // throw in Intl at render time, so drop it and keep the default.
    if (key === 'dateLocale' && !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(trimmed)) continue;
    if (trimmed.length > 0) result[key as ThemeStringKey] = trimmed;
  }
  return result;
}

function isLanguageShape(value: string): boolean {
  return /^[a-z]{2,3}(?:-[a-z]{2})?$/.test(value);
}

/** Coerce the stored per-language map; drops invalid languages/empty maps. */
export function normalizeThemeStringsByLanguage(value: unknown): ThemeStringsByLanguage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const result: ThemeStringsByLanguage = {};
  for (const [language, overrides] of Object.entries(input)) {
    if (!isLanguageShape(language)) continue;
    const normalized = normalizeThemeStringOverrides(overrides);
    if (Object.keys(normalized).length > 0) result[language] = normalized;
  }
  return result;
}

/**
 * Effective strings for a request language: built-ins, then the default
 * language's overrides, then the request language's overrides.
 */
export function themeStringsFor(
  byLanguage: ThemeStringsByLanguage | null | undefined,
  language: string,
  defaultLanguage = 'en',
): ThemeStrings {
  return {
    ...DEFAULT_THEME_STRINGS,
    ...(byLanguage?.[defaultLanguage] ?? {}),
    ...(byLanguage?.[language] ?? {}),
  };
}

/**
 * WordPress-style permalink structures.
 *
 * A structure is stored as a pattern of `/`-separated segments. Allowed tokens
 * are whole segments such as `%year%` or `%postname%`; a pattern must contain
 * exactly one of `%postname%` or `%post_id%`. Pretty URLs are generated without
 * a trailing slash (the existing MERNPress convention); incoming paths are
 * matched with or without one.
 */
export type PermalinkPreset = 'plain' | 'day' | 'month' | 'numeric' | 'postname' | 'custom';

export interface PermalinkPresetDefinition {
  id: Exclude<PermalinkPreset, 'custom'>;
  label: string;
  /** Empty for Plain (query-string permalinks). */
  pattern: string;
}

export const PERMALINK_PRESETS: readonly PermalinkPresetDefinition[] = [
  { id: 'plain', label: 'Plain', pattern: '' },
  { id: 'day', label: 'Day and name', pattern: '/%year%/%monthnum%/%day%/%postname%/' },
  { id: 'month', label: 'Month and name', pattern: '/%year%/%monthnum%/%postname%/' },
  { id: 'numeric', label: 'Numeric', pattern: '/archives/%post_id%/' },
  { id: 'postname', label: 'Post name', pattern: '/%postname%/' },
];

export const PERMALINK_TOKENS = [
  '%year%',
  '%monthnum%',
  '%day%',
  '%hour%',
  '%minute%',
  '%second%',
  '%post_id%',
  '%postname%',
  '%category%',
] as const;

export type PermalinkToken = (typeof PERMALINK_TOKENS)[number];

const TOKEN_SET = new Set<string>(PERMALINK_TOKENS);
const STATIC_SEGMENT = /^[a-z0-9][a-z0-9_-]*$/;

export function presetPattern(preset: PermalinkPreset, customPattern = ''): string {
  if (preset === 'custom') return normalizePattern(customPattern);
  return PERMALINK_PRESETS.find((entry) => entry.id === preset)?.pattern ?? '';
}

/** Leading/trailing slash, collapsed separators, lower-case static segments. */
export function normalizePattern(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return '';
  const segments = trimmed
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .map((segment) => (TOKEN_SET.has(segment) ? segment : segment.toLowerCase()));
  return segments.length === 0 ? '' : `/${segments.join('/')}/`;
}

export type PatternValidation = { ok: true; pattern: string } | { ok: false; reason: string };

/** Validate a custom structure. Plain is represented by an empty pattern. */
export function validatePattern(value: string): PatternValidation {
  const pattern = normalizePattern(value);
  if (pattern === '') {
    return { ok: false, reason: 'A custom structure needs at least one segment.' };
  }
  if (pattern.length > 200) {
    return { ok: false, reason: 'The structure is too long.' };
  }
  const segments = pattern.slice(1, -1).split('/');
  let postToken: string | null = null;
  for (const segment of segments) {
    if (segment.includes('%')) {
      if (!TOKEN_SET.has(segment)) {
        return { ok: false, reason: `Unknown or mixed token in segment “${segment}”.` };
      }
      if (segment === '%postname%' || segment === '%post_id%') {
        if (postToken) {
          return { ok: false, reason: 'Use exactly one of %postname% or %post_id%.' };
        }
        postToken = segment;
      }
      continue;
    }
    if (!STATIC_SEGMENT.test(segment)) {
      return {
        ok: false,
        reason: `Segment “${segment}” must be lowercase letters, numbers, hyphens or underscores.`,
      };
    }
  }
  if (!postToken) {
    return { ok: false, reason: 'The structure must contain %postname% or %post_id%.' };
  }
  return { ok: true, pattern };
}

/** Accept a plain slug for the category/tag bases. */
export function validateTermBase(value: string, fallback: string): string {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) return fallback;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(trimmed)) {
    throw new Error('The base must be a short URL slug.');
  }
  return trimmed;
}

export function termPath(
  taxonomy: 'category' | 'tag',
  slug: string,
  bases: { categoryBase?: string; tagBase?: string } = {},
): string {
  const base =
    taxonomy === 'category'
      ? validateTermBase(bases.categoryBase ?? '', 'category')
      : validateTermBase(bases.tagBase ?? '', 'tag');
  return `/${base}/${encodeURIComponent(slug)}`;
}

export function pagePath(slug: string): string {
  return `/${encodeURIComponent(slug)}`;
}

export interface PathPost {
  id: string;
  slug: string;
  publishedAt: string | Date | null;
  createdAt?: string | Date;
  /** Primary category slug, used by %category%. */
  categorySlug?: string | null;
}

function datePart(value: string | Date | undefined | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function tokenValue(token: PermalinkToken, post: PathPost): string {
  const date = datePart(post.publishedAt) ?? datePart(post.createdAt) ?? new Date(0);
  switch (token) {
    case '%year%':
      return String(date.getUTCFullYear());
    case '%monthnum%':
      return pad(date.getUTCMonth() + 1);
    case '%day%':
      return pad(date.getUTCDate());
    case '%hour%':
      return pad(date.getUTCHours());
    case '%minute%':
      return pad(date.getUTCMinutes());
    case '%second%':
      return pad(date.getUTCSeconds());
    case '%post_id%':
      return encodeURIComponent(post.id);
    case '%postname%':
      return encodeURIComponent(post.slug);
    case '%category%':
      return encodeURIComponent(post.categorySlug ?? 'uncategorized');
  }
}

/** Relative public URL for a post under the given structure. */
export function postPath(pattern: string, post: PathPost): string {
  if (pattern === '') return `/?p=${encodeURIComponent(post.id)}`;
  const segments = pattern
    .slice(1, -1)
    .split('/')
    .map((segment) =>
      TOKEN_SET.has(segment) ? tokenValue(segment as PermalinkToken, post) : segment,
    );
  return `/${segments.join('/')}`;
}

export interface MatchedPath {
  /** Normalised request path, no trailing slash. */
  path: string;
  slug?: string;
  id?: string;
  category?: string;
  year?: string;
  month?: string;
  day?: string;
  hour?: string;
  minute?: string;
  second?: string;
}

function normalizePath(pathname: string): string {
  let path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  path = path.replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  if (path.length > 1) path += '/';
  return path;
}

/**
 * Match a request path against the structure. Returns the captured tokens, or
 * null when the path does not have the structure's shape. Values are decoded;
 * the caller must still verify the post exists and the date/category match.
 */
export function matchPostPath(pattern: string, pathname: string): MatchedPath | null {
  if (pattern === '') return null;
  const normalized = normalizePattern(pattern);
  if (normalized === '') return null;
  const path = normalizePath(pathname).replace(/^\//, '').replace(/\/$/, '');
  const patternSegments = normalized.slice(1, -1).split('/');
  const pathSegments = path === '' ? [] : path.split('/');
  if (patternSegments.length !== pathSegments.length) return null;
  const matched: MatchedPath = { path: normalizePath(pathname) };
  for (let index = 0; index < patternSegments.length; index += 1) {
    const spec = patternSegments[index]!;
    const raw = pathSegments[index]!;
    if (TOKEN_SET.has(spec)) {
      let value: string;
      try {
        value = decodeURIComponent(raw);
      } catch {
        return null;
      }
      if (value.length === 0) return null;
      switch (spec) {
        case '%postname%':
          matched.slug = value;
          break;
        case '%post_id%':
          matched.id = value;
          break;
        case '%category%':
          matched.category = value;
          break;
        case '%year%':
          matched.year = value;
          break;
        case '%monthnum%':
          matched.month = value;
          break;
        case '%day%':
          matched.day = value;
          break;
        case '%hour%':
          matched.hour = value;
          break;
        case '%minute%':
          matched.minute = value;
          break;
        case '%second%':
          matched.second = value;
          break;
        default:
          return null;
      }
      continue;
    }
    if (spec !== raw.toLowerCase()) return null;
  }
  return matched;
}

/** True when the path is exactly the canonical generated path. */
export function isCanonicalPostPath(pattern: string, pathname: string, post: PathPost): boolean {
  const canonical = postPath(pattern, post);
  const normalized = normalizePath(pathname);
  return canonical === normalized || canonical === normalized.replace(/\/$/, '');
}

/** Useful for tests and the settings preview. */
export function previewPostPath(pattern: string): string {
  return postPath(pattern, {
    id: '00000000-0000-7000-8000-000000000000',
    slug: 'sample-post',
    publishedAt: new Date(Date.UTC(2026, 0, 15, 9, 30)),
    createdAt: new Date(Date.UTC(2026, 0, 15, 9, 30)),
    categorySlug: 'news',
  });
}

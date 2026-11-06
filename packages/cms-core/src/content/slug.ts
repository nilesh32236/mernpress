import { randomBytes } from 'node:crypto';

export const SLUG_MAX_LENGTH = 200;

/**
 * Reserved top-level slugs that cannot be used for content. From the content
 * model doc §5.4. Rejected with SLUG_RESERVED for explicit input.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'login',
  'logout',
  'preview',
  'uploads',
  '_next',
  'sitemap',
  'robots',
  'feed',
  'rss',
  'search',
  'posts',
  'author',
  'category',
  'tag',
  'llms',
  'trash',
  'new',
  'edit',
  'settings',
  'users',
  'media',
]);

/**
 * Normalize a raw title/slug into a URL-safe slug (ADR 0003, D-3):
 * NFKC → trim → lowercase → ASCII transliteration (strip combining marks) →
 * whitespace/underscore to `-` → collapse runs → strip edge `-` → drop unsafe
 * chars → cap at 200 chars. Returns the empty string when nothing usable
 * remains; callers decide the fallback.
 */
export function normalizeSlug(input: string): string {
  let slug = input.normalize('NFKC');
  // ASCII transliteration: decompose and drop combining marks (é→e, ü→u, …).
  slug = slug.normalize('NFKD').replace(/\p{M}/gu, '');
  slug = slug.trim().toLowerCase();
  // Whitespace and underscores become dashes.
  slug = slug.replace(/[\s_]+/g, '-');
  // Keep only URL-safe slug characters.
  slug = slug.replace(/[^a-z0-9-]/g, '');
  // Collapse dash runs and strip edge dashes.
  slug = slug.replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  return truncateSlug(slug);
}

/** Cap at 200 characters, preferring to cut at a dash boundary. */
export function truncateSlug(slug: string): string {
  if (slug.length <= SLUG_MAX_LENGTH) {
    return slug;
  }
  let cut = slug.slice(0, SLUG_MAX_LENGTH);
  const lastDash = cut.lastIndexOf('-');
  if (lastDash > 0) {
    cut = cut.slice(0, lastDash);
  }
  return cut.replace(/-+$/g, '');
}

/** Fallback when a derived slug is empty: `untitled-<short-id>`. */
export function fallbackSlug(): string {
  return `untitled-${randomBytes(4).toString('hex')}`;
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

export type SlugCheck =
  { ok: true; slug: string } | { ok: false; reason: 'reserved' | 'invalid'; slug: string };

/**
 * Validate an explicitly user-supplied slug. Reserved slugs and slugs that
 * normalize to empty are rejected; everything else is returned normalized.
 */
export function validateExplicitSlug(input: string): SlugCheck {
  const slug = normalizeSlug(input);
  if (slug.length === 0) {
    return { ok: false, reason: 'invalid', slug };
  }
  if (isReservedSlug(slug)) {
    return { ok: false, reason: 'reserved', slug };
  }
  return { ok: true, slug };
}

/**
 * Derive a slug from a title for a missing explicit slug. Empty derivation
 * falls back to `untitled-<short-id>`. Reserved derivations get a `-2`-style
 * suffix appended by the caller's uniqueness loop, so they are usable.
 */
export function deriveSlugFromTitle(title: string): string {
  const slug = normalizeSlug(title);
  return slug.length === 0 ? fallbackSlug() : slug;
}

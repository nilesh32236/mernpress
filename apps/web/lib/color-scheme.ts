/**
 * Public light/dark colour scheme.
 *
 * The visitor's choice lives in a cookie so the server can render the right
 * palette on the first byte (no flash of the wrong theme) and the client can
 * flip it without a reload. Without a cookie the site follows the operating
 * system preference, which the browser exposes to CSS through
 * `prefers-color-scheme`.
 */

/** Cookie that stores the explicit visitor choice. */
export const COLOR_SCHEME_COOKIE = 'mernpress_color_scheme';

/** Attribute on `<html>` that pins the scheme (`data-color-scheme`). */
export const COLOR_SCHEME_ATTRIBUTE = 'data-color-scheme';

export type ColorScheme = 'light' | 'dark';

/** One year, in seconds — the choice is a durable site preference. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isColorScheme(value: unknown): value is ColorScheme {
  return value === 'light' || value === 'dark';
}

/**
 * Read the explicit choice from a raw `Cookie` header. Returns null when the
 * cookie is missing or holds an unknown value, which means "follow the
 * operating system".
 */
export function parseColorSchemeCookie(header: string | undefined | null): ColorScheme | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    const name = part.slice(0, separator).trim();
    if (name !== COLOR_SCHEME_COOKIE) continue;
    const raw = part.slice(separator + 1).trim();
    let value: string;
    try {
      value = decodeURIComponent(raw);
    } catch {
      // A malformed percent-encoding must not throw; the value is compared
      // literally below and rejected as an unknown scheme.
      value = raw;
    }
    return isColorScheme(value) ? value : null;
  }
  return null;
}

/** Read the explicit choice from `document.cookie` (browser only). */
export function readColorSchemeCookie(): ColorScheme | null {
  if (typeof document === 'undefined') return null;
  return parseColorSchemeCookie(document.cookie);
}

/**
 * Persist the explicit choice. The cookie is deliberately readable by scripts
 * (it carries no secret) so the toggle can update it without a round trip.
 */
export function writeColorSchemeCookie(scheme: ColorScheme): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${COLOR_SCHEME_COOKIE}=${scheme}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
}

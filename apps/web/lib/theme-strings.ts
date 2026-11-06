import { DEFAULT_THEME_STRINGS, themeStringsFor, type ThemeStrings } from '@mernpress/contracts';
import { headers } from 'next/headers';
import { getSiteSettings, type SiteSettings } from './api';

/**
 * Theme strings for the language of the current request.
 *
 * The middleware sets `x-mn-language` (preserved across the internal rewrite
 * hop); the site settings carry the per-language overrides. When the helper is
 * called outside a request (unit tests) or the API is unavailable, the built-in
 * English defaults are used.
 */
export async function requestThemeStrings(settings?: SiteSettings | null): Promise<ThemeStrings> {
  try {
    const [requestHeaders, site] = await Promise.all([
      headers(),
      settings === undefined ? getSiteSettings().catch(() => null) : Promise.resolve(settings),
    ]);
    const defaultLanguage = site?.languages?.default ?? 'en';
    const language = requestHeaders.get('x-mn-language') ?? defaultLanguage;
    return themeStringsFor(site?.themeStrings ?? null, language, defaultLanguage);
  } catch {
    return DEFAULT_THEME_STRINGS;
  }
}

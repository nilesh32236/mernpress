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
  { key: 'search', label: 'Search link', fallback: 'Search', max: 40 },
  { key: 'blog', label: 'Blog link', fallback: 'Blog', max: 40 },
  { key: 'home', label: 'Home link', fallback: 'Home', max: 40 },
  { key: 'feed', label: 'Feed link', fallback: 'Feed', max: 40 },
  { key: 'primaryNav', label: 'Primary navigation label', fallback: 'Primary', max: 60 },
  { key: 'footerNav', label: 'Footer navigation label', fallback: 'Footer', max: 60 },
] as const;

export type ThemeStringKey = (typeof THEME_STRING_KEYS)[number]['key'];

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

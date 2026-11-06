/**
 * Multilingual content contract.
 *
 * MERNPress keeps translations as ordinary posts in the same `posts` table,
 * linked by `translation_group` and distinguished by `language`. The default
 * language keeps unprefixed public paths; every other enabled language is
 * served under `/<language>/<path>`.
 *
 * Isomorphic: the API validates config and resolves paths, the admin edits the
 * language list and per-post language, and the public site builds language
 * links and hreflang alternates.
 */
export interface LanguageOption {
  /** Lowercase BCP-47-ish code (`en`, `hi`, `pt-br`). */
  code: string;
  /** English display name, used by the admin and language links. */
  label: string;
}

export const AVAILABLE_LANGUAGES: readonly LanguageOption[] = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ar', label: 'Arabic' },
];

export interface LanguageConfig {
  /** Default language: unprefixed paths, the x-default hreflang target. */
  default: string;
  /** Enabled languages, always including the default. */
  enabled: string[];
}

export const DEFAULT_LANGUAGES: LanguageConfig = { default: 'en', enabled: ['en'] };

const CODE_PATTERN = /^[a-z]{2,3}(?:-[a-z]{2})?$/;

/** True for a supported language-code shape (`en`, `pt-br`). */
export function isLanguageCode(value: string): boolean {
  return CODE_PATTERN.test(value);
}

export function languageLabel(code: string): string {
  return AVAILABLE_LANGUAGES.find((entry) => entry.code === code)?.label ?? code;
}

/**
 * Coerce untrusted JSON into a valid config. Unknown/invalid codes are dropped;
 * the default is kept in `enabled`; an empty list collapses to the default.
 */
export function normalizeLanguageConfig(value: unknown): LanguageConfig {
  const input =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const requestedDefault = typeof input['default'] === 'string' ? input['default'] : '';
  const defaultLanguage = isLanguageCode(requestedDefault)
    ? requestedDefault
    : DEFAULT_LANGUAGES.default;
  const rawEnabled = Array.isArray(input['enabled']) ? input['enabled'] : [];
  const enabled = [
    defaultLanguage,
    ...rawEnabled.filter(
      (entry): entry is string => typeof entry === 'string' && isLanguageCode(entry),
    ),
  ].filter((code, index, list) => list.indexOf(code) === index);
  return { default: defaultLanguage, enabled };
}

/** True when a language may be assigned to a post. */
export function isLanguageEnabled(config: LanguageConfig, code: string): boolean {
  return config.enabled.includes(code);
}

/**
 * Public path for a language. The default language is unprefixed; other
 * languages sit under `/<language>` (never doubling the slash).
 */
export function languagePath(config: LanguageConfig, language: string, path: string): string {
  if (language === config.default) return path;
  const suffix = path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
  return `/${language}${suffix}`;
}

export interface StrippedLanguagePath {
  /** Language named by the prefix, or the default when there is none. */
  language: string;
  /** Path with the language prefix removed. */
  path: string;
  /** True when a non-default language prefix was present. */
  prefixed: boolean;
}

/**
 * Split a public pathname into language + inner path. Only enabled, non-default
 * first segments count as a prefix, so `/hi` alone is a page slug called "hi"
 * unless "hi" is an enabled non-default language.
 */
export function stripLanguagePrefix(
  config: LanguageConfig,
  pathname: string,
): StrippedLanguagePath {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const [first, ...rest] = path.split('/').filter(Boolean);
  if (first && first !== config.default && config.enabled.includes(first)) {
    const inner = rest.length > 0 ? `/${rest.join('/')}` : '/';
    return { language: first, path: inner, prefixed: true };
  }
  return { language: config.default, path, prefixed: false };
}

/** Build the `alternates.languages` map for hreflang metadata. */
export function hreflangAlternates(
  config: LanguageConfig,
  translations: ReadonlyArray<{ language: string; path: string }>,
  self: { language: string; path: string },
  absolute: (path: string) => string,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of [self, ...translations]) {
    if (!config.enabled.includes(entry.language)) continue;
    map[entry.language] = absolute(entry.path);
  }
  const defaultEntry = [self, ...translations].find((entry) => entry.language === config.default);
  map['x-default'] = absolute(defaultEntry?.path ?? self.path);
  return map;
}

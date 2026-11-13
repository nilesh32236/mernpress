import {
  ADMIN_COLOR_SCHEMES,
  DEFAULT_ADMIN_COLOR_SCHEME,
  isAdminColorScheme,
  type AdminColorScheme,
  type AdminColorSchemeOption,
} from '@mernpress/contracts';

/**
 * WordPress admin colour schemes.
 *
 * The authoritative choice is stored per user (`users.admin_color`, exposed by
 * the session and profile APIs). `localStorage` is only a cache so the correct
 * chrome paints before the session request returns; `App` replaces it with the
 * server value as soon as the session arrives.
 */
export type ColorScheme = AdminColorScheme;
export type ColorSchemeOption = AdminColorSchemeOption;
export const COLOR_SCHEMES = ADMIN_COLOR_SCHEMES;
export { DEFAULT_ADMIN_COLOR_SCHEME };

const STORAGE_KEY = 'mernpress.colorScheme';

/** The palette that darkens the whole admin (chrome and content). */
export const DARK_SCHEME: ColorScheme = 'dark';

/** The palette to return to when the dark theme is switched off again. */
const BASE_STORAGE_KEY = 'mernpress.colorScheme.base';

export function getColorScheme(): ColorScheme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    // "default" was the pre-7.1 alias for the Modern scheme.
    if (stored === 'default') {
      return 'fresh';
    }
    if (isAdminColorScheme(stored)) {
      return stored;
    }
  } catch {
    // Storage is optional.
  }
  return DEFAULT_ADMIN_COLOR_SCHEME;
}

export function applyColorScheme(id: ColorScheme): void {
  document.documentElement.dataset['colorScheme'] = id;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Storage is optional.
  }
}

/** The palette the visitor uses besides the dark admin theme. */
export function getBaseColorScheme(
  fallback: ColorScheme = DEFAULT_ADMIN_COLOR_SCHEME,
): ColorScheme {
  try {
    const stored = window.localStorage.getItem(BASE_STORAGE_KEY);
    if (stored && isAdminColorScheme(stored) && stored !== DARK_SCHEME) return stored;
  } catch {
    // Storage is optional.
  }
  return fallback;
}

/**
 * Switch between the dark admin theme and the palette in use.
 *
 * The palette that was in use is remembered so switching the dark theme off
 * again returns to it instead of the default.
 */
export function toggleColorScheme(current: ColorScheme): ColorScheme {
  if (current === DARK_SCHEME) {
    return getBaseColorScheme();
  }
  try {
    window.localStorage.setItem(BASE_STORAGE_KEY, current);
  } catch {
    // Storage is optional.
  }
  return DARK_SCHEME;
}

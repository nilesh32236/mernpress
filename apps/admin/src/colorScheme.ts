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

const STORAGE_KEY = 'mernpress.colorScheme';

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

/**
 * WordPress admin color schemes.
 *
 * The choice is a per-browser preference (WordPress stores it per user; this
 * build has no user-meta store for it yet) persisted in `localStorage` and
 * applied as a `data-color-scheme` attribute on the document root. The scheme
 * palettes live in `styles.css`.
 */

export type ColorScheme =
  | 'modern'
  | 'fresh'
  | 'light'
  | 'blue'
  | 'coffee'
  | 'ectoplasm'
  | 'midnight'
  | 'ocean'
  | 'sunrise';

export interface ColorSchemeOption {
  id: ColorScheme;
  label: string;
  /** Four representative colors: bar, sidebar, active item, link. */
  swatch: string[];
}

export const COLOR_SCHEMES: ColorSchemeOption[] = [
  // WordPress 7.1's default is the "Modern" scheme; "Fresh" is its classic
  // predecessor and remains selectable in the profile picker.
  { id: 'modern', label: 'Default', swatch: ['#1e1e1e', '#3858e9', '#7b90ff'] },
  { id: 'fresh', label: 'Fresh', swatch: ['#1d2327', '#2c3338', '#2271b1', '#72aee6'] },
  { id: 'light', label: 'Light', swatch: ['#e5e5e5', '#6a6a6a', '#c64606', '#007cba'] },
  { id: 'blue', label: 'Blue', swatch: ['#183751', '#245278', '#437aa8', '#e1a948'] },
  { id: 'coffee', label: 'Coffee', swatch: ['#46403c', '#59524c', '#c7a589', '#9ea476'] },
  { id: 'ectoplasm', label: 'Ectoplasm', swatch: ['#403b30', '#4a4539', '#a3b745', '#d46f15'] },
  { id: 'midnight', label: 'Midnight', swatch: ['#232a2e', '#333c42', '#69a8bb', '#cf4339'] },
  { id: 'ocean', label: 'Ocean', swatch: ['#627c83', '#738e96', '#9ebaa0', '#aa9d88'] },
  { id: 'sunrise', label: 'Sunrise', swatch: ['#1d2327', '#2c3338', '#dd823b', '#ccaf0b'] },
];

const STORAGE_KEY = 'mernpress.colorScheme';
const VALID = new Set<ColorScheme>(COLOR_SCHEMES.map((scheme) => scheme.id));

export function getColorScheme(): ColorScheme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    // "default" was the pre-7.1 alias for the Modern scheme.
    if (stored === 'default') {
      return 'fresh';
    }
    if (stored !== null && VALID.has(stored as ColorScheme)) {
      return stored as ColorScheme;
    }
  } catch {
    // Storage is optional.
  }
  return 'fresh';
}

export function applyColorScheme(id: ColorScheme): void {
  document.documentElement.dataset['colorScheme'] = id;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Storage is optional.
  }
}

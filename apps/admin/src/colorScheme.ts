/**
 * WordPress admin color schemes.
 *
 * The choice is a per-browser preference (WordPress stores it per user; this
 * build has no user-meta store for it yet) persisted in `localStorage` and
 * applied as a `data-color-scheme` attribute on the document root. The scheme
 * palettes live in `styles.css`.
 */

export type ColorScheme =
  | 'default'
  | 'light'
  | 'modern'
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
  swatch: [string, string, string, string];
}

export const COLOR_SCHEMES: ColorSchemeOption[] = [
  { id: 'default', label: 'Default', swatch: ['#1d2327', '#2c3338', '#2271b1', '#72aee6'] },
  { id: 'light', label: 'Light', swatch: ['#f0f0f1', '#ffffff', '#2271b1', '#dcdcde'] },
  { id: 'modern', label: 'Modern', swatch: ['#1e1e1e', '#3858e9', '#3858e9', '#7b90ff'] },
  { id: 'blue', label: 'Blue', swatch: ['#096484', '#4796b3', '#4796b3', '#52accc'] },
  { id: 'coffee', label: 'Coffee', swatch: ['#46403c', '#c7a589', '#c7a589', '#9ea476'] },
  { id: 'ectoplasm', label: 'Ectoplasm', swatch: ['#403b30', '#a3b745', '#a3b745', '#d46f15'] },
  { id: 'midnight', label: 'Midnight', swatch: ['#1e1e1e', '#e14d43', '#e14d43', '#69a8bb'] },
  { id: 'ocean', label: 'Ocean', swatch: ['#627c83', '#9ebaa0', '#9ebaa0', '#aa9d88'] },
  { id: 'sunrise', label: 'Sunrise', swatch: ['#1d2327', '#dd823b', '#dd823b', '#ccaf0b'] },
];

const STORAGE_KEY = 'mernpress.colorScheme';
const VALID = new Set<ColorScheme>(COLOR_SCHEMES.map((scheme) => scheme.id));

export function getColorScheme(): ColorScheme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored !== null && VALID.has(stored as ColorScheme)) {
      return stored as ColorScheme;
    }
  } catch {
    // Storage is optional.
  }
  return 'default';
}

export function applyColorScheme(id: ColorScheme): void {
  document.documentElement.dataset['colorScheme'] = id;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Storage is optional.
  }
}

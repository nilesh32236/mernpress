/**
 * WordPress administration colour schemes.
 *
 * Isomorphic: the API validates the stored value, the admin renders the picker
 * and applies the palette, and both read the same list. The palettes themselves
 * live in the admin stylesheet, keyed by `data-color-scheme`.
 */
export type AdminColorScheme =
  | 'modern'
  | 'fresh'
  | 'light'
  | 'blue'
  | 'coffee'
  | 'ectoplasm'
  | 'midnight'
  | 'ocean'
  | 'sunrise'
  /** MERNPress addition: the whole admin (chrome *and* content) in dark. */
  | 'dark';

export interface AdminColorSchemeOption {
  id: AdminColorScheme;
  label: string;
  /** Representative colours: bar, sidebar, active item, link. */
  swatch: string[];
}

export const ADMIN_COLOR_SCHEMES: readonly AdminColorSchemeOption[] = [
  // WordPress keys its default scheme `fresh` and labels it "Default"; the
  // newer `modern` palette is a separate choice.
  { id: 'fresh', label: 'Default', swatch: ['#1d2327', '#2c3338', '#2271b1', '#72aee6'] },
  { id: 'light', label: 'Light', swatch: ['#e5e5e5', '#6a6a6a', '#c64606', '#007cba'] },
  { id: 'modern', label: 'Modern', swatch: ['#1e1e1e', '#3858e9', '#7b90ff'] },
  { id: 'blue', label: 'Blue', swatch: ['#183751', '#245278', '#437aa8', '#e1a948'] },
  { id: 'coffee', label: 'Coffee', swatch: ['#46403c', '#59524c', '#c7a589', '#9ea476'] },
  { id: 'ectoplasm', label: 'Ectoplasm', swatch: ['#403b30', '#4a4539', '#a3b745', '#d46f15'] },
  { id: 'midnight', label: 'Midnight', swatch: ['#232a2e', '#333c42', '#69a8bb', '#cf4339'] },
  { id: 'ocean', label: 'Ocean', swatch: ['#627c83', '#738e96', '#9ebaa0', '#aa9d88'] },
  { id: 'sunrise', label: 'Sunrise', swatch: ['#1d2327', '#2c3338', '#dd823b', '#ccaf0b'] },
  // MERNPress addition: a full dark admin, not only a dark chrome.
  { id: 'dark', label: 'Dark', swatch: ['#14181c', '#1c2126', '#e2e4e6', '#72aee6'] },
];

export const ADMIN_COLOR_SCHEME_IDS: readonly AdminColorScheme[] = ADMIN_COLOR_SCHEMES.map(
  (scheme) => scheme.id,
);

export const DEFAULT_ADMIN_COLOR_SCHEME: AdminColorScheme = 'fresh';

export function isAdminColorScheme(value: unknown): value is AdminColorScheme {
  return typeof value === 'string' && (ADMIN_COLOR_SCHEME_IDS as readonly string[]).includes(value);
}

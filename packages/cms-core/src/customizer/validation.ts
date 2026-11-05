import { ContentError } from '../content/errors.js';

/** Appearance settings edited by Appearance → Customize. */
export const CUSTOM_COLOR_KEYS = ['background', 'surface', 'text', 'muted', 'accent'] as const;
export type CustomColorKey = (typeof CUSTOM_COLOR_KEYS)[number];
export type CustomColors = Partial<Record<CustomColorKey, string>>;

export interface CustomMenuItem {
  label: string;
  url: string;
}

export interface CustomizerSettings {
  colors: CustomColors | null;
  menu: CustomMenuItem[] | null;
  css: string | null;
  showOnFront: 'posts' | 'page';
  pageOnFront: string | null;
  pageForPosts: string | null;
}

const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const CSS_MAX = 20_000;
const MENU_MAX_ITEMS = 20;
const MENU_LABEL_MAX = 80;
const MENU_URL_MAX = 2048;

function invalid(message: string): never {
  throw new ContentError('VALIDATION_ERROR', message, 400);
}

/** Hex colours only: they are unambiguous and safe inside a style attribute. */
export function validateColors(value: unknown): CustomColors | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    invalid('Colors must be an object or null.');
  }
  const input = value as Record<string, unknown>;
  const result: CustomColors = {};
  for (const key of CUSTOM_COLOR_KEYS) {
    const color = input[key];
    if (color === undefined || color === null || color === '') continue;
    if (typeof color !== 'string' || !HEX_COLOR.test(color)) {
      invalid(`${key} must be a hex colour (for example #1d2327).`);
    }
    result[key] = color;
  }
  return Object.keys(result).length === 0 ? null : result;
}

function validMenuUrl(value: string): boolean {
  if (value.startsWith('/') && !value.startsWith('//')) {
    return !/[\s<>"']/.test(value);
  }
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateMenu(value: unknown): CustomMenuItem[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) invalid('The menu must be a list or null.');
  if (value.length > MENU_MAX_ITEMS) {
    invalid(`A menu can contain at most ${MENU_MAX_ITEMS} items.`);
  }
  return value.map((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      invalid('Each menu item needs a label and a URL.');
    }
    const record = item as Record<string, unknown>;
    const label = typeof record['label'] === 'string' ? record['label'].trim() : '';
    const url = typeof record['url'] === 'string' ? record['url'].trim() : '';
    if (!label || label.length > MENU_LABEL_MAX) {
      invalid(`Menu labels must be 1–${MENU_LABEL_MAX} characters.`);
    }
    if (!url || url.length > MENU_URL_MAX || !validMenuUrl(url)) {
      invalid('Menu URLs must be a site path (/about) or an http(s) URL.');
    }
    return { label, url };
  });
}

/**
 * Additional CSS is injected into a `<style>` element. Reject constructs that
 * escape the element, execute script in legacy engines, or fetch third-party
 * resources. It is CSS, not a script sandbox: the rules only affect styling.
 */
export function validateCustomCss(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') invalid('Additional CSS must be text or null.');
  const css = value;
  if (css.length > CSS_MAX) invalid(`Additional CSS is limited to ${CSS_MAX} characters.`);
  for (const character of css) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      invalid('Additional CSS contains control characters.');
    }
  }
  const forbidden = [
    /<\/style/i,
    /<script/i,
    /<!--/,
    /expression\s*\(/i,
    /javascript:/i,
    /@import/i,
    /behavior\s*:/i,
    /-moz-binding/i,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(css)) {
      invalid('Additional CSS contains a disallowed construct.');
    }
  }
  return css.trim().length === 0 ? null : css;
}

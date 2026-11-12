import { describe, expect, it } from 'vitest';
import {
  COLOR_SCHEME_ATTRIBUTE,
  COLOR_SCHEME_COOKIE,
  isColorScheme,
  parseColorSchemeCookie,
} from '../lib/color-scheme';

describe('colour scheme constants', () => {
  it('pins the cookie name and the document attribute', () => {
    expect(COLOR_SCHEME_COOKIE).toBe('mernpress_color_scheme');
    expect(COLOR_SCHEME_ATTRIBUTE).toBe('data-color-scheme');
  });
});

describe('isColorScheme', () => {
  it('accepts the two supported schemes', () => {
    expect(isColorScheme('light')).toBe(true);
    expect(isColorScheme('dark')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isColorScheme('blue')).toBe(false);
    expect(isColorScheme(null)).toBe(false);
    expect(isColorScheme(undefined)).toBe(false);
    expect(isColorScheme('LIGHT')).toBe(false);
    expect(isColorScheme('')).toBe(false);
  });
});

describe('parseColorSchemeCookie', () => {
  it('returns null when the header is missing or empty', () => {
    expect(parseColorSchemeCookie(undefined)).toBeNull();
    expect(parseColorSchemeCookie(null)).toBeNull();
    expect(parseColorSchemeCookie('')).toBeNull();
  });

  it('reads the explicit choice from the cookie header', () => {
    expect(parseColorSchemeCookie('mernpress_color_scheme=dark')).toBe('dark');
    expect(parseColorSchemeCookie('mernpress_color_scheme=light')).toBe('light');
  });

  it('returns null for an unknown value', () => {
    expect(parseColorSchemeCookie('mernpress_color_scheme=blue')).toBeNull();
  });

  it('finds the cookie among other cookies', () => {
    expect(parseColorSchemeCookie('a=1; mernpress_color_scheme=dark; b=2')).toBe('dark');
  });

  it('ignores surrounding whitespace', () => {
    expect(parseColorSchemeCookie(' mernpress_color_scheme = light ')).toBe('light');
  });

  it('returns null when the cookie is absent', () => {
    expect(parseColorSchemeCookie('a=1; b=2')).toBeNull();
    expect(parseColorSchemeCookie('mernpress_color_scheme_other=dark')).toBeNull();
  });

  it('does not throw on a malformed percent-encoding', () => {
    // A stray "%" would make decodeURIComponent throw; the value is then
    // rejected as an unknown scheme instead of breaking the page.
    expect(parseColorSchemeCookie('mernpress_color_scheme=%')).toBeNull();
    expect(parseColorSchemeCookie('mernpress_color_scheme=%zz')).toBeNull();
    expect(parseColorSchemeCookie('mernpress_color_scheme=%64ark')).toBe('dark');
  });
});

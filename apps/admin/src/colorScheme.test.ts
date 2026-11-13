import { afterEach, describe, expect, it } from 'vitest';
import { ADMIN_COLOR_SCHEMES, isAdminColorScheme } from '@mernpress/contracts';
import {
  DARK_SCHEME,
  getBaseColorScheme,
  getColorScheme,
  toggleColorScheme,
} from './colorScheme.js';

afterEach(() => {
  window.localStorage.clear();
});

describe('admin colour schemes', () => {
  it('offers the dark palette in the shared scheme list', () => {
    expect(isAdminColorScheme(DARK_SCHEME)).toBe(true);
    expect(ADMIN_COLOR_SCHEMES.some((scheme) => scheme.id === 'dark')).toBe(true);
    // The dark palette must be the only one that is not a WordPress chrome
    // palette: the rest keep a light content area.
    expect(ADMIN_COLOR_SCHEMES.filter((scheme) => scheme.id === 'dark')).toHaveLength(1);
  });

  it('switches to the dark theme and remembers the palette in use', () => {
    expect(toggleColorScheme('fresh')).toBe('dark');
    // The palette to return to was stored while the dark theme is on.
    expect(getBaseColorScheme()).toBe('fresh');
  });

  it('returns to the remembered palette when the dark theme is switched off', () => {
    toggleColorScheme('light');
    expect(toggleColorScheme('dark')).toBe('light');
  });

  it('falls back to the default palette when nothing was remembered', () => {
    expect(getBaseColorScheme()).toBe('fresh');
    expect(getColorScheme()).toBe('fresh');
  });

  it('never remembers the dark theme as the palette to return to', () => {
    window.localStorage.setItem('mernpress.colorScheme.base', 'dark');
    expect(getBaseColorScheme()).toBe('fresh');
  });
});

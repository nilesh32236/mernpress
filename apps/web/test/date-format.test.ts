import { describe, expect, it } from 'vitest';
import { formatPublicDate, safeDateLocale } from '../lib/date';

describe('public date formatting', () => {
  it('formats a UTC long date in the requested locale', () => {
    const iso = '2026-11-06T00:00:00.000Z';
    expect(formatPublicDate(iso, 'en-US')).toBe('November 6, 2026');
    expect(formatPublicDate(iso, 'hi-IN')).toContain('नवंबर');
    expect(formatPublicDate(iso, 'ar-EG')).not.toContain('November');
  });

  it('rejects malformed locales and invalid instants', () => {
    expect(safeDateLocale('hi-IN')).toBe('hi-IN');
    expect(safeDateLocale('pt-BR')).toBe('pt-BR');
    expect(safeDateLocale('not a locale')).toBe('en-US');
    expect(safeDateLocale('')).toBe('en-US');
    expect(safeDateLocale(null)).toBe('en-US');
    // A bad locale must not throw; it falls back to the default.
    expect(formatPublicDate('2026-11-06T00:00:00.000Z', 'bad locale')).toBe('November 6, 2026');
    expect(formatPublicDate(null)).toBeNull();
    expect(formatPublicDate('not-a-date')).toBeNull();
  });
});

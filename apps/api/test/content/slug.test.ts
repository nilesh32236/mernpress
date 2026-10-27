import { describe, expect, it } from 'vitest';
import {
  deriveSlugFromTitle,
  fallbackSlug,
  isReservedSlug,
  normalizeSlug,
  RESERVED_SLUGS,
  SLUG_MAX_LENGTH,
  truncateSlug,
  validateExplicitSlug,
} from '@mernpress/cms-core';

describe('normalizeSlug', () => {
  it('lowercases and trims input', () => {
    expect(normalizeSlug('  Hello World  ')).toBe('hello-world');
  });

  it('applies NFKC normalization (full-width and compatibility characters)', () => {
    // Full-width Latin letters fold to ASCII under NFKC.
    expect(normalizeSlug('Ｈｅｌｌｏ')).toBe('hello');
    // Ligature decomposes under NFKC.
    expect(normalizeSlug('ﬁsh')).toBe('fish');
  });

  it('transliterates accented characters (é→e, ü→u)', () => {
    expect(normalizeSlug('Café Über')).toBe('cafe-uber');
    expect(normalizeSlug('naïve façade')).toBe('naive-facade');
  });

  it('converts whitespace and underscores to dashes', () => {
    expect(normalizeSlug('a b\tc')).toBe('a-b-c');
    expect(normalizeSlug('a_b__c')).toBe('a-b-c');
  });

  it('collapses dash runs and strips edge dashes', () => {
    expect(normalizeSlug('a--b---c')).toBe('a-b-c');
    expect(normalizeSlug('--hello--')).toBe('hello');
    expect(normalizeSlug(' - - ')).toBe('');
  });

  it('drops characters that are not URL-safe', () => {
    expect(normalizeSlug('hello, world! (2026)')).toBe('hello-world-2026');
    expect(normalizeSlug('a/b\\c:d')).toBe('abcd');
  });

  it('keeps digits and existing dashes', () => {
    expect(normalizeSlug('post-2-part-10')).toBe('post-2-part-10');
  });

  it('returns an empty string when nothing usable remains', () => {
    expect(normalizeSlug('!!!')).toBe('');
    expect(normalizeSlug('   ')).toBe('');
    expect(normalizeSlug('')).toBe('');
    // Non-transliterable scripts leave nothing.
    expect(normalizeSlug('日本語')).toBe('');
  });

  it('caps the result at 200 characters', () => {
    const long = 'a'.repeat(300);
    expect(normalizeSlug(long)).toHaveLength(SLUG_MAX_LENGTH);
  });
});

describe('truncateSlug', () => {
  it('leaves short slugs untouched', () => {
    expect(truncateSlug('hello')).toBe('hello');
    expect(truncateSlug('a'.repeat(SLUG_MAX_LENGTH))).toHaveLength(SLUG_MAX_LENGTH);
  });

  it('cuts at the last dash boundary when possible', () => {
    const input = `${'a'.repeat(150)}-${'b'.repeat(100)}`;
    const out = truncateSlug(input);
    expect(out).toBe('a'.repeat(150));
    expect(out.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
  });

  it('hard-cuts when there is no dash boundary', () => {
    const out = truncateSlug('a'.repeat(250));
    expect(out).toBe('a'.repeat(SLUG_MAX_LENGTH));
  });

  it('strips trailing dashes left by the cut', () => {
    const input = `${'a'.repeat(199)}--${'b'.repeat(50)}`;
    const out = truncateSlug(input);
    expect(out).toBe('a'.repeat(199));
    expect(out.endsWith('-')).toBe(false);
  });
});

describe('fallbackSlug', () => {
  it('returns untitled-<hex> and is unique across calls', () => {
    const a = fallbackSlug();
    const b = fallbackSlug();
    expect(a).toMatch(/^untitled-[0-9a-f]{8}$/);
    expect(b).toMatch(/^untitled-[0-9a-f]{8}$/);
    expect(a).not.toBe(b);
  });
});

describe('isReservedSlug', () => {
  it('detects reserved slugs exactly', () => {
    expect(isReservedSlug('admin')).toBe(true);
    expect(isReservedSlug('api')).toBe(true);
    expect(isReservedSlug('uploads')).toBe(true);
    expect(isReservedSlug('_next')).toBe(true);
  });

  it('does not match lookalikes or different casing', () => {
    expect(isReservedSlug('administrator')).toBe(false);
    expect(isReservedSlug('Admin')).toBe(false);
    expect(isReservedSlug('admin-panel')).toBe(false);
    expect(isReservedSlug('hello')).toBe(false);
  });

  it('covers every entry in RESERVED_SLUGS', () => {
    for (const slug of RESERVED_SLUGS) {
      expect(isReservedSlug(slug)).toBe(true);
    }
  });
});

describe('validateExplicitSlug', () => {
  it('accepts and normalizes a good slug', () => {
    expect(validateExplicitSlug('My Post')).toEqual({ ok: true, slug: 'my-post' });
    expect(validateExplicitSlug('already-good')).toEqual({ ok: true, slug: 'already-good' });
  });

  it('rejects input that normalizes to empty as invalid', () => {
    const result = validateExplicitSlug('!!!');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid');
    }
    expect(validateExplicitSlug('').ok).toBe(false);
    expect(validateExplicitSlug('---').ok).toBe(false);
  });

  it('rejects reserved slugs', () => {
    const result = validateExplicitSlug('Admin');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('reserved');
      expect(result.slug).toBe('admin');
    }
  });
});

describe('deriveSlugFromTitle', () => {
  it('derives a slug from the title', () => {
    expect(deriveSlugFromTitle('Hello World')).toBe('hello-world');
    expect(deriveSlugFromTitle('Café Opening Day!')).toBe('cafe-opening-day');
  });

  it('falls back to untitled-* when the title yields nothing', () => {
    expect(deriveSlugFromTitle('!!!')).toMatch(/^untitled-[0-9a-f]{8}$/);
    expect(deriveSlugFromTitle('')).toMatch(/^untitled-[0-9a-f]{8}$/);
  });
});

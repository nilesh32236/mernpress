import { describe, expect, it } from 'vitest';
import { shouldPrerender, speculationRules } from '../src/speculation.js';

const entry = (
  metric: string,
  samples: number,
  rating: 'good' | 'needs-improvement' | 'poor' | null,
) => ({
  metric,
  samples,
  rating,
});

const thin = [entry('lcp', 1, 'good'), entry('inp', 1, 'good')];
const ready = [entry('lcp', 120, 'needs-improvement'), entry('inp', 130, 'good')];
const readyPoor = [entry('lcp', 120, 'good'), entry('inp', 400, 'poor')];
const strong = [entry('lcp', 500, 'good'), entry('inp', 500, 'good')];

describe('speculative loading gate', () => {
  it('requires 100+ samples in both LCP and INP', () => {
    expect(shouldPrerender(thin)).toBe(false);
    expect(shouldPrerender([entry('lcp', 100, 'poor'), entry('inp', 99, 'poor')])).toBe(false);
    expect(shouldPrerender(ready)).toBe(true);
    expect(shouldPrerender(readyPoor)).toBe(true);
  });

  it('needs a needs-improvement or poor rating in either metric', () => {
    expect(shouldPrerender(strong)).toBe(false);
    expect(shouldPrerender([entry('lcp', 200, null), entry('inp', 200, null)])).toBe(false);
  });

  it('builds rules only for enabled modes, with a prefetch fallback', () => {
    expect(speculationRules('off', ready)).toBeNull();
    expect(speculationRules('unknown', ready)).toBeNull();
    expect(speculationRules(undefined, ready)).toBeNull();
    expect(speculationRules('prefetch', thin)).toEqual({
      prefetch: [{ eagerness: 'moderate' }],
    });
    // Prerender without enough data must not prerender.
    expect(speculationRules('prerender', thin)).toEqual({
      prefetch: [{ eagerness: 'moderate' }],
    });
    expect(speculationRules('prerender', ready)).toEqual({
      prerender: [{ selector: 'a[href^="/posts/"]', eagerness: 'conservative' }],
    });
  });
});

import { describe, expect, it } from 'vitest';
import { formatWebVital, histogramP75, webVitalBucket, webVitalRating } from '../src/web-vitals.js';

describe('web vitals contract', () => {
  it('buckets values to the next upper bound and clamps the overflow', () => {
    expect(webVitalBucket('lcp', 0)).toBe(100);
    expect(webVitalBucket('lcp', 2000)).toBe(2000);
    expect(webVitalBucket('lcp', 2001)).toBe(2500);
    expect(webVitalBucket('lcp', 10_000_000)).toBe(60000);
    expect(webVitalBucket('cls', 120)).toBe(150);
    expect(webVitalBucket('inp', 200)).toBe(200);
  });

  it('rates p75 against the web.dev thresholds', () => {
    expect(webVitalRating('lcp', 2500)).toBe('good');
    expect(webVitalRating('lcp', 2501)).toBe('needs-improvement');
    expect(webVitalRating('lcp', 4001)).toBe('poor');
    expect(webVitalRating('cls', 100)).toBe('good');
    expect(webVitalRating('cls', 251)).toBe('poor');
    expect(webVitalRating('inp', 200)).toBe('good');
    expect(webVitalRating('ttfb', 801)).toBe('needs-improvement');
  });

  it('computes p75 from a histogram', () => {
    expect(histogramP75([])).toBeNull();
    expect(
      histogramP75([
        { bucket: 2000, count: 3 },
        { bucket: 3000, count: 1 },
      ]),
    ).toBe(2000);
    expect(
      histogramP75([
        { bucket: 3000, count: 2 },
        { bucket: 2000, count: 2 },
      ]),
    ).toBe(3000);
    expect(histogramP75([{ bucket: 500, count: 10 }], 0.98)).toBe(500);
  });

  it('formats milliseconds and CLS scores for display', () => {
    expect(formatWebVital('lcp', 2000)).toBe('2 s');
    expect(formatWebVital('lcp', 1500)).toBe('1.5 s');
    expect(formatWebVital('fcp', 800)).toBe('800 ms');
    expect(formatWebVital('cls', 120)).toBe('0.12');
  });
});

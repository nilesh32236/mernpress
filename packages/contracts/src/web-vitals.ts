/**
 * Core Web Vitals field metrics (ADR 0057).
 *
 * Values are stored as integers so a daily aggregate table can bucket them:
 * milliseconds for time metrics, and CLS scaled by 1000 ("milli-score") so a
 * score of 0.12 is stored as 120. Thresholds follow web.dev's good /
 * needs-improvement / poor boundaries.
 */
export const WEB_VITAL_METRICS = ['lcp', 'inp', 'cls', 'fcp', 'ttfb'] as const;

export type WebVitalMetric = (typeof WEB_VITAL_METRICS)[number];
export type WebVitalRating = 'good' | 'needs-improvement' | 'poor';

export interface WebVitalDefinition {
  key: WebVitalMetric;
  label: string;
  /** `ms` or `score` (score values are stored ×1000). */
  unit: 'ms' | 'score';
  /** Inclusive good boundary in stored units. */
  good: number;
  /** Inclusive needs-improvement boundary; above is poor. */
  poor: number;
  /** Ascending upper bounds; values above the last are clamped to it. */
  buckets: readonly number[];
  /** Largest accepted stored value (validation guard). */
  max: number;
}

const TIME_BUCKETS = [
  100, 200, 300, 500, 800, 1000, 1200, 1500, 1800, 2000, 2500, 3000, 4000, 5000, 6000, 8000, 10000,
  15000, 20000, 30000, 60000,
] as const;

export const WEB_VITALS: Record<WebVitalMetric, WebVitalDefinition> = {
  lcp: {
    key: 'lcp',
    label: 'Largest Contentful Paint',
    unit: 'ms',
    good: 2500,
    poor: 4000,
    buckets: TIME_BUCKETS,
    max: 600000,
  },
  inp: {
    key: 'inp',
    label: 'Interaction to Next Paint',
    unit: 'ms',
    good: 200,
    poor: 500,
    buckets: [50, 100, 150, 200, 300, 400, 500, 750, 1000, 1500, 2000, 3000, 5000, 10000],
    max: 600000,
  },
  cls: {
    key: 'cls',
    label: 'Cumulative Layout Shift',
    unit: 'score',
    good: 100,
    poor: 250,
    buckets: [10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 2000, 5000],
    max: 100000,
  },
  fcp: {
    key: 'fcp',
    label: 'First Contentful Paint',
    unit: 'ms',
    good: 1800,
    poor: 3000,
    buckets: TIME_BUCKETS,
    max: 600000,
  },
  ttfb: {
    key: 'ttfb',
    label: 'Time to First Byte',
    unit: 'ms',
    good: 800,
    poor: 1800,
    buckets: TIME_BUCKETS,
    max: 600000,
  },
};

export const WEB_VITAL_ORDER: readonly WebVitalMetric[] = WEB_VITAL_METRICS;

/** Bucket upper bound for a stored value; values above the last bucket clamp. */
export function webVitalBucket(metric: WebVitalMetric, value: number): number {
  const buckets = WEB_VITALS[metric].buckets;
  for (const bucket of buckets) {
    if (value <= bucket) return bucket;
  }
  return buckets[buckets.length - 1]!;
}

/** Rating for a p75 value in stored units. */
export function webVitalRating(metric: WebVitalMetric, value: number): WebVitalRating {
  const definition = WEB_VITALS[metric];
  if (value <= definition.good) return 'good';
  if (value <= definition.poor) return 'needs-improvement';
  return 'poor';
}

/** Format a stored value for display, e.g. `2.5 s`, `180 ms`, `0.12`. */
export function formatWebVital(metric: WebVitalMetric, value: number): string {
  const definition = WEB_VITALS[metric];
  if (definition.unit === 'score') return (value / 1000).toFixed(2);
  if (value >= 1000) return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)} s`;
  return `${Math.round(value)} ms`;
}

/**
 * Approximate p75 from a histogram: the smallest bucket whose cumulative count
 * reaches 75 % of the samples. Bucket upper bounds are the reported resolution.
 */
export function histogramP75(
  counts: ReadonlyArray<{ bucket: number; count: number }>,
  percentile = 0.75,
): number | null {
  const total = counts.reduce((sum, entry) => sum + entry.count, 0);
  if (total <= 0) return null;
  const target = Math.ceil(total * percentile);
  const sorted = [...counts].sort((left, right) => left.bucket - right.bucket);
  let cumulative = 0;
  for (const entry of sorted) {
    cumulative += entry.count;
    if (cumulative >= target) return entry.bucket;
  }
  return sorted[sorted.length - 1]?.bucket ?? null;
}

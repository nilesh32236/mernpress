/**
 * Speculative loading gate (ADR 0060).
 *
 * The public site already prefetches with Next's `<Link prefetch="auto">`.
 * Speculation rules add an extra browser-level layer: `prefetch` (conservative
 * resource hints) or `prerender` (full page renders for likely navigations).
 * Prerender is only allowed when field data shows a real need: at least 100
 * samples in both LCP and INP over the window, with either metric rated
 * needs-improvement or poor. Otherwise prerender falls back to prefetch.
 */

import type { WebVitalRating } from './web-vitals.js';

export type SpeculationMode = 'off' | 'prefetch' | 'prerender';

export interface SpeculationVitalsEntry {
  metric: string;
  samples: number;
  rating: WebVitalRating | null;
}

export interface SpeculationRules {
  prefetch?: Array<{ eagerness: 'moderate' }>;
  prerender?: Array<{ selector: string; eagerness: 'conservative' }>;
}

export const SPECULATION_MIN_SAMPLES = 100;

/** Field-data gate for prerender (ADR 0059 triggers, ADR 0060 implementation). */
export function shouldPrerender(vitals: readonly SpeculationVitalsEntry[]): boolean {
  const byMetric = new Map(vitals.map((entry) => [entry.metric, entry]));
  const lcp = byMetric.get('lcp');
  const inp = byMetric.get('inp');
  if (!lcp || !inp) return false;
  if (lcp.samples < SPECULATION_MIN_SAMPLES || inp.samples < SPECULATION_MIN_SAMPLES) {
    return false;
  }
  const needsWork = (rating: WebVitalRating | null): boolean =>
    rating === 'needs-improvement' || rating === 'poor';
  return needsWork(lcp.rating) || needsWork(inp.rating);
}

/**
 * Build the speculation-rules document, or null when disabled. Prerender mode
 * without enough field data falls back to prefetch rules so a saved setting
 * never produces an unbounded prerender stampede.
 */
export function speculationRules(
  mode: SpeculationMode | string | null | undefined,
  vitals: readonly SpeculationVitalsEntry[] = [],
): SpeculationRules | null {
  if (mode === 'prefetch') {
    return { prefetch: [{ eagerness: 'moderate' }] };
  }
  if (mode === 'prerender') {
    if (shouldPrerender(vitals)) {
      return {
        prerender: [{ selector: 'a[href^="/posts/"]', eagerness: 'conservative' }],
      };
    }
    return { prefetch: [{ eagerness: 'moderate' }] };
  }
  return null;
}

'use client';

import { useEffect } from 'react';
import type { ConsentConfig } from '@mernpress/contracts';
import { hasConsent } from '../lib/consent';

/**
 * Field Core Web Vitals beacon (ADR 0057).
 *
 * Reports five aggregate measurements from the visitor's own browser: LCP,
 * INP, CLS, FCP and TTFB. No path, cookie, visitor id, user agent or IP is sent,
 * and the API only stores a daily histogram bucket. Do-Not-Track and the
 * analytics consent category are honoured exactly like the page-view beacon.
 */

type Metric = 'lcp' | 'inp' | 'cls' | 'fcp' | 'ttfb';

/** p98 of interaction durations, matching the web-vitals INP approximation. */
export function interactionPercentile(durations: readonly number[]): number | null {
  if (durations.length === 0) return null;
  const sorted = [...durations].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.98) - 1);
  return sorted[Math.max(0, index)] ?? null;
}

export function shouldTrackVitals(
  doNotTrack: string | null | undefined,
  consent: ConsentConfig | undefined,
): boolean {
  if (doNotTrack === '1' || doNotTrack === 'yes') return false;
  if (consent?.enabled && consent.analyticsRequired && !hasConsent(consent, 'analytics')) {
    return false;
  }
  return true;
}

function send(metric: Metric, value: number): void {
  if (!Number.isFinite(value) || value < 0) return;
  void fetch('/api/public/vitals', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ metric, value }),
    keepalive: true,
    cache: 'no-store',
  }).catch(() => {
    // A blocked beacon must never affect the page.
  });
}

export function WebVitals({ consent }: { consent?: ConsentConfig }) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let lcp: number | null = null;
    let cls = 0;
    const interactions: number[] = [];
    let fcp: number | null = null;
    let sent = false;

    const observe = (type: string, handler: (entries: PerformanceEntry[]) => void) => {
      try {
        const observer = new PerformanceObserver((list) => handler(list.getEntries()));
        observer.observe({ type, buffered: true } as PerformanceObserverInit);
        return observer;
      } catch {
        return null;
      }
    };

    const observers = [
      observe('largest-contentful-paint', (entries) => {
        const last = entries[entries.length - 1];
        if (last) lcp = last.startTime;
      }),
      observe('layout-shift', (entries) => {
        for (const entry of entries) {
          const shift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
          if (!shift.hadRecentInput) cls += shift.value ?? 0;
        }
      }),
      observe('event', (entries) => {
        for (const entry of entries) {
          const event = entry as PerformanceEntry & { interactionId?: number };
          if ((event.interactionId ?? 0) > 0) interactions.push(event.duration);
        }
      }),
      observe('paint', (entries) => {
        for (const entry of entries) {
          if (entry.name === 'first-contentful-paint') fcp = entry.startTime;
        }
      }),
    ].filter((observer): observer is PerformanceObserver => observer !== null);

    const navigation = performance.getEntriesByType('navigation')[0] as
      PerformanceNavigationTiming | undefined;
    const ttfb = navigation?.responseStart ?? null;

    const flush = () => {
      if (sent) return;
      // Consent can be granted after load. Measurements are kept in memory
      // only; nothing leaves the browser until this check passes.
      if (!shouldTrackVitals(navigator.doNotTrack, consent)) return;
      sent = true;
      for (const observer of observers) observer.disconnect();
      const inp = interactionPercentile(interactions);
      if (lcp !== null) send('lcp', lcp);
      if (inp !== null) send('inp', inp);
      // CLS is 0 for a page with no shifts; that is a valid measurement.
      send('cls', cls);
      if (fcp !== null) send('fcp', fcp);
      if (ttfb !== null && ttfb > 0) send('ttfb', ttfb);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      for (const observer of observers) observer.disconnect();
    };
  }, [consent]);

  return null;
}

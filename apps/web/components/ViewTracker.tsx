'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { CONSENT_EVENT, type ConsentConfig } from '@mernpress/contracts';
import { hasConsent } from '../lib/consent';

/**
 * Privacy-first page-view beacon.
 *
 * Sends only the path and the referrer host (the API extracts the host); no
 * cookies, visitor ids or IP addresses are stored. Do-Not-Track is honoured, and
 * API/admin paths are skipped before the request is made.
 */
export function shouldTrackView(pathname: string, doNotTrack: string | null | undefined): boolean {
  if (doNotTrack === '1' || doNotTrack === 'yes') return false;
  if (!pathname.startsWith('/')) return false;
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return false;
  if (pathname === '/api' || pathname.startsWith('/api/')) return false;
  return true;
}

export function ViewTracker({ consent }: { consent?: ConsentConfig }) {
  const pathname = usePathname();
  const sent = useRef<Set<string>>(new Set());

  const send = useCallback(() => {
    if (!shouldTrackView(pathname, navigator.doNotTrack)) return;
    if (consent?.enabled && consent.analyticsRequired && !hasConsent(consent, 'analytics')) {
      return;
    }
    if (sent.current.has(pathname)) return;
    sent.current.add(pathname);
    const body = JSON.stringify({
      path: pathname,
      referrer: typeof document !== 'undefined' && document.referrer ? document.referrer : null,
    });
    void fetch('/api/public/views', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
      cache: 'no-store',
    }).catch(() => {
      // A blocked beacon must never affect the page.
    });
  }, [pathname, consent]);

  useEffect(() => {
    send();
  }, [send]);

  useEffect(() => {
    const onConsent = () => send();
    window.addEventListener(CONSENT_EVENT, onConsent);
    return () => window.removeEventListener(CONSENT_EVENT, onConsent);
  }, [send]);

  return null;
}

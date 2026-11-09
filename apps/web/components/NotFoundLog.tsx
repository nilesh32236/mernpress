'use client';

import { useEffect } from 'react';
import { logNotFound } from '@/lib/not-found-log';

/**
 * Client-side 404 recorder (ADR 0064).
 *
 * Rendering this component has no effect until React mounts it, which only
 * happens when the not-found boundary is actually shown. See
 * `lib/not-found-log.ts` for why the log cannot run during the server render.
 */
export default function NotFoundLog() {
  useEffect(() => {
    void logNotFound();
  }, []);
  return null;
}

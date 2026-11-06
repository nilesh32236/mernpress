'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { ConsentCategory, ConsentConfig } from '@mernpress/contracts';
import { hasConsent } from '../lib/consent';

/**
 * Renders `children` only after the visitor grants `category`. Use this for
 * third-party embeds or optional analytics/marketing code in themes and
 * components; consent is read from localStorage and updates live.
 */
export function ConsentGate({
  config,
  category,
  children,
  fallback = null,
}: {
  config: ConsentConfig | undefined;
  category: ConsentCategory;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const sync = () => setAllowed(hasConsent(config, category));
    sync();
    window.addEventListener('mernpress:consent', sync);
    return () => window.removeEventListener('mernpress:consent', sync);
  }, [config, category]);

  return <>{allowed ? children : fallback}</>;
}

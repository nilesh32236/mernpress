'use client';

import {
  CONSENT_EVENT,
  CONSENT_STORAGE_KEY,
  consentAllows,
  consentChoiceIsCurrent,
  parseConsentChoice,
  type ConsentCategory,
  type ConsentChoice,
  type ConsentConfig,
} from '@mernpress/contracts';

/**
 * Browser-only consent helpers. The choice never leaves the device; the API
 * only serves the banner configuration.
 */
export function readConsentChoice(): ConsentChoice | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseConsentChoice(window.localStorage.getItem(CONSENT_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeConsentChoice(choice: ConsentChoice): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(choice));
  } catch {
    // Storage can be unavailable (private mode); the banner simply reappears.
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: choice }));
}

export function hasConsent(config: ConsentConfig | undefined, category: ConsentCategory): boolean {
  if (!config || !config.enabled) return true;
  return consentAllows(config, readConsentChoice(), category);
}

export function currentConsentChoice(config: ConsentConfig): ConsentChoice | null {
  const choice = readConsentChoice();
  return consentChoiceIsCurrent(config, choice) ? choice : null;
}

/**
 * Cookie-consent configuration and storage contract.
 *
 * Isomorphic: the API validates/serves the config, the admin edits it, and the
 * public site renders the banner and stores the visitor's choice locally. No
 * consent data is sent to the server.
 */
export type ConsentCategory = 'analytics' | 'marketing';

export interface ConsentConfig {
  enabled: boolean;
  /** Bump to ask every visitor again (stored with the choice). */
  version: number;
  title: string;
  message: string;
  acceptLabel: string;
  rejectLabel: string;
  saveLabel: string;
  /** Show the analytics category in the preferences panel. */
  analyticsEnabled: boolean;
  /** Show the marketing category in the preferences panel. */
  marketingEnabled: boolean;
  /**
   * When true, the local analytics beacon waits for analytics consent. When
   * false (default), the cookieless aggregate beacon runs without a choice.
   */
  analyticsRequired: boolean;
}

export interface ConsentChoice {
  version: number;
  analytics: boolean;
  marketing: boolean;
  decidedAt: string;
}

export const CONSENT_STORAGE_KEY = 'mernpress.consent';
export const CONSENT_EVENT = 'mernpress:consent';

export const DEFAULT_CONSENT: ConsentConfig = {
  enabled: false,
  version: 1,
  title: 'We value your privacy',
  message:
    'We use necessary cookies to run this site. With your permission we may also use analytics and marketing storage.',
  acceptLabel: 'Accept all',
  rejectLabel: 'Reject non-essential',
  saveLabel: 'Save preferences',
  analyticsEnabled: true,
  marketingEnabled: true,
  analyticsRequired: false,
};

function text(value: unknown, fallback: string, max: number): string {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim().slice(0, max)
    : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Coerce untrusted storage/JSON into the current shape (never throws). */
export function normalizeConsentConfig(value: unknown): ConsentConfig {
  const input =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const version =
    typeof input['version'] === 'number' &&
    Number.isInteger(input['version']) &&
    input['version'] >= 1 &&
    input['version'] <= 1000
      ? input['version']
      : DEFAULT_CONSENT.version;
  return {
    enabled: bool(input['enabled'], DEFAULT_CONSENT.enabled),
    version,
    title: text(input['title'], DEFAULT_CONSENT.title, 120),
    message: text(input['message'], DEFAULT_CONSENT.message, 500),
    acceptLabel: text(input['acceptLabel'], DEFAULT_CONSENT.acceptLabel, 40),
    rejectLabel: text(input['rejectLabel'], DEFAULT_CONSENT.rejectLabel, 40),
    saveLabel: text(input['saveLabel'], DEFAULT_CONSENT.saveLabel, 40),
    analyticsEnabled: bool(input['analyticsEnabled'], DEFAULT_CONSENT.analyticsEnabled),
    marketingEnabled: bool(input['marketingEnabled'], DEFAULT_CONSENT.marketingEnabled),
    analyticsRequired: bool(input['analyticsRequired'], DEFAULT_CONSENT.analyticsRequired),
  };
}

/** Validate a stored/browser JSON string; returns null when unusable. */
export function parseConsentChoice(raw: string | null | undefined): ConsentChoice | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const value = parsed as Record<string, unknown>;
    if (
      typeof value['version'] !== 'number' ||
      !Number.isInteger(value['version']) ||
      typeof value['analytics'] !== 'boolean' ||
      typeof value['marketing'] !== 'boolean'
    ) {
      return null;
    }
    return {
      version: value['version'],
      analytics: value['analytics'],
      marketing: value['marketing'],
      decidedAt:
        typeof value['decidedAt'] === 'string' ? value['decidedAt'] : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

/** True when the stored choice is for the current config version. */
export function consentChoiceIsCurrent(
  config: ConsentConfig,
  choice: ConsentChoice | null,
): boolean {
  return choice !== null && choice.version === config.version;
}

export function consentAllows(
  config: ConsentConfig,
  choice: ConsentChoice | null,
  category: ConsentCategory,
): boolean {
  if (!config.enabled) return true;
  // Necessary storage is always allowed; the two optional categories need a
  // current, explicit grant.
  if (!consentChoiceIsCurrent(config, choice)) return false;
  if (category === 'analytics') return consentAllowedByChoice(config, choice, 'analytics');
  return consentAllowedByChoice(config, choice, 'marketing');
}

function consentAllowedByChoice(
  config: ConsentConfig,
  choice: ConsentChoice | null,
  category: ConsentCategory,
): boolean {
  if (!choice) return false;
  if (category === 'analytics') return config.analyticsEnabled && choice.analytics;
  return config.marketingEnabled && choice.marketing;
}

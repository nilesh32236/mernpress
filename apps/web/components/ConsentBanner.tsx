'use client';

import { useEffect, useState } from 'react';
import type { ConsentChoice, ConsentConfig } from '@mernpress/contracts';
import { currentConsentChoice, readConsentChoice, writeConsentChoice } from '../lib/consent';

/**
 * Cookie-consent banner. Renders only when consent is enabled and the visitor
 * has no current choice. Accept/reject/preferences write a local choice; the
 * server receives no consent data.
 */
export function ConsentBanner({ config }: { config: ConsentConfig }) {
  const [mounted, setMounted] = useState(false);
  const [choice, setChoice] = useState<ConsentChoice | null>(null);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = currentConsentChoice(config);
    setChoice(stored);
    setAnalytics(stored?.analytics ?? false);
    setMarketing(stored?.marketing ?? false);
    const sync = () => {
      const next = currentConsentChoice(config);
      setChoice(next);
      setAnalytics(next?.analytics ?? false);
      setMarketing(next?.marketing ?? false);
    };
    window.addEventListener('mernpress:consent', sync);
    return () => window.removeEventListener('mernpress:consent', sync);
  }, [config]);

  if (!mounted || !config.enabled || choice) return null;

  function decide(nextAnalytics: boolean, nextMarketing: boolean): void {
    writeConsentChoice({
      version: config.version,
      analytics: nextAnalytics,
      marketing: nextMarketing,
      decidedAt: new Date().toISOString(),
    });
    setPreferencesOpen(false);
  }

  return (
    <div className="consent-banner" role="region" aria-label="Cookie consent">
      <div className="consent-banner-text">
        <strong>{config.title}</strong>
        <p>{config.message}</p>
        {preferencesOpen ? (
          <fieldset className="consent-preferences">
            <legend>Choose categories</legend>
            <label>
              <input type="checkbox" checked readOnly disabled />
              <span>Necessary (always on)</span>
            </label>
            {config.analyticsEnabled ? (
              <label>
                <input
                  type="checkbox"
                  checked={analytics}
                  onChange={(event) => setAnalytics(event.target.checked)}
                />
                <span>Analytics</span>
              </label>
            ) : null}
            {config.marketingEnabled ? (
              <label>
                <input
                  type="checkbox"
                  checked={marketing}
                  onChange={(event) => setMarketing(event.target.checked)}
                />
                <span>Marketing</span>
              </label>
            ) : null}
          </fieldset>
        ) : null}
      </div>
      <div className="consent-banner-actions">
        <button
          type="button"
          className="consent-button secondary"
          onClick={() => decide(false, false)}
        >
          {config.rejectLabel}
        </button>
        {preferencesOpen ? (
          <button
            type="button"
            className="consent-button secondary"
            onClick={() => decide(analytics, marketing)}
          >
            {config.saveLabel}
          </button>
        ) : (
          <button
            type="button"
            className="consent-button secondary"
            onClick={() => setPreferencesOpen(true)}
          >
            Preferences
          </button>
        )}
        <button type="button" className="consent-button primary" onClick={() => decide(true, true)}>
          {config.acceptLabel}
        </button>
      </div>
    </div>
  );
}

/** Small launcher to reopen the banner after a decision has been stored. */
export function ConsentSettingsButton({ config }: { config: ConsentConfig }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const sync = () => setVisible(Boolean(config.enabled && currentConsentChoice(config)));
    sync();
    window.addEventListener('mernpress:consent', sync);
    return () => window.removeEventListener('mernpress:consent', sync);
  }, [config]);
  if (!visible) return null;
  return (
    <button
      type="button"
      className="consent-settings-button"
      onClick={() => {
        // Clearing the stored choice makes the banner render again.
        try {
          window.localStorage.removeItem('mernpress.consent');
        } catch {
          // Ignore storage errors.
        }
        window.dispatchEvent(new CustomEvent('mernpress:consent', { detail: readConsentChoice() }));
      }}
    >
      Cookie settings
    </button>
  );
}

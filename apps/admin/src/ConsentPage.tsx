import { useEffect, useState, type FormEvent } from 'react';
import { DEFAULT_CONSENT, type ConsentConfig } from '@mernpress/contracts';
import { actionErrorMessage, fetchConsent, updateConsent } from './api.js';
import { ErrorState, Notice, PageHeader, Skeleton, type NoticeMessage } from './components.js';

/**
 * Settings → Consent.
 *
 * Configures the public cookie banner. Visitor choices are stored only in their
 * browser; this screen edits text/categories and the version that re-asks.
 */
export function ConsentPage() {
  const [config, setConfig] = useState<ConsentConfig>(DEFAULT_CONSENT);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    fetchConsent()
      .then((loaded) => {
        if (active) setConfig(loaded);
      })
      .catch((caught) => {
        if (active) setLoadError(actionErrorMessage(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  function update<K extends keyof ConsentConfig>(key: K, value: ConsentConfig[K]): void {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saving) return;
    setError(null);
    if (config.title.trim().length === 0 || config.message.trim().length === 0) {
      setError('A title and message are required.');
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const saved = await updateConsent(config);
      setConfig(saved);
      setNotice({ tone: 'success', text: 'Consent settings saved.' });
    } catch (caught) {
      setError(actionErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="consent-settings">
      <PageHeader
        title="Consent"
        description="Configure the cookie banner shown on the public site."
      />
      <p className="consent-intro">
        Consent is stored in the visitor&apos;s browser only. The server keeps this configuration
        and nothing about the visitor; bump the version to ask everyone again.
      </p>
      {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}
      {loadError ? (
        <ErrorState
          title="Consent settings are unavailable"
          message={loadError}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : loading ? (
        <Skeleton lines={8} />
      ) : (
        <form className="settings-panel consent-form" onSubmit={(event) => void save(event)}>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="field">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(event) => update('enabled', event.target.checked)}
                disabled={saving}
              />
              <span>Show the cookie banner on the public site</span>
            </label>
            <p className="field-help">
              When off, no banner is rendered and consent gates allow their content (the site
              currently ships no third-party scripts).
            </p>
          </div>
          <div className="field">
            <label htmlFor="consent-title">Title</label>
            <input
              id="consent-title"
              type="text"
              maxLength={120}
              value={config.title}
              onChange={(event) => update('title', event.target.value)}
              disabled={saving}
            />
          </div>
          <div className="field">
            <label htmlFor="consent-message">Message</label>
            <textarea
              id="consent-message"
              rows={3}
              maxLength={500}
              value={config.message}
              onChange={(event) => update('message', event.target.value)}
              disabled={saving}
            />
          </div>
          <div className="consent-labels">
            <div className="field">
              <label htmlFor="consent-accept">Accept button</label>
              <input
                id="consent-accept"
                type="text"
                maxLength={40}
                value={config.acceptLabel}
                onChange={(event) => update('acceptLabel', event.target.value)}
                disabled={saving}
              />
            </div>
            <div className="field">
              <label htmlFor="consent-reject">Reject button</label>
              <input
                id="consent-reject"
                type="text"
                maxLength={40}
                value={config.rejectLabel}
                onChange={(event) => update('rejectLabel', event.target.value)}
                disabled={saving}
              />
            </div>
            <div className="field">
              <label htmlFor="consent-save">Save button</label>
              <input
                id="consent-save"
                type="text"
                maxLength={40}
                value={config.saveLabel}
                onChange={(event) => update('saveLabel', event.target.value)}
                disabled={saving}
              />
            </div>
          </div>
          <fieldset className="consent-categories">
            <legend>Categories</legend>
            <label className="checkbox-row is-disabled">
              <input type="checkbox" checked readOnly disabled />
              <span>Necessary — always on (session, CSRF, consent choice)</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={config.analyticsEnabled}
                onChange={(event) => update('analyticsEnabled', event.target.checked)}
                disabled={saving}
              />
              <span>Analytics</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={config.marketingEnabled}
                onChange={(event) => update('marketingEnabled', event.target.checked)}
                disabled={saving}
              />
              <span>Marketing</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={config.analyticsRequired}
                onChange={(event) => update('analyticsRequired', event.target.checked)}
                disabled={saving}
              />
              <span>Require analytics consent before the local page-view beacon runs</span>
            </label>
            <p className="field-help">
              The local beacon is cookieless and aggregate. Leave this off to keep counting without
              a choice; turn it on if your policy treats even cookieless analytics as optional.
            </p>
          </fieldset>
          <div className="field consent-version">
            <label htmlFor="consent-version">Consent version</label>
            <input
              id="consent-version"
              type="number"
              min={1}
              max={1000}
              value={config.version}
              onChange={(event) => update('version', Number(event.target.value) || 1)}
              disabled={saving}
            />
            <p className="field-help">
              Increase this after changing the categories or wording; stored choices with an older
              version no longer count and the banner appears again.
            </p>
          </div>
          <section className="consent-preview" aria-label="Banner preview">
            <h2>Preview</h2>
            <div className="consent-preview-card">
              <strong>{config.title}</strong>
              <p>{config.message}</p>
              <div className="consent-preview-actions">
                <span className="button secondary-button">{config.rejectLabel}</span>
                <span className="button secondary-button">{config.saveLabel}</span>
                <span className="button primary-button">{config.acceptLabel}</span>
              </div>
            </div>
          </section>
          <div className="field actions">
            <button
              type="submit"
              className="button primary-button"
              disabled={saving}
              aria-busy={saving}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

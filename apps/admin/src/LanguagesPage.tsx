import { useEffect, useState, type FormEvent } from 'react';
import {
  AVAILABLE_LANGUAGES,
  isLanguageCode,
  normalizeLanguageConfig,
  type LanguageConfig,
} from '@mernpress/contracts';
import { actionErrorMessage, fetchLanguages, updateLanguages } from './api.js';
import { ErrorState, Notice, PageHeader, Skeleton, type NoticeMessage } from './components.js';

/**
 * Settings → Languages.
 *
 * The default language keeps unprefixed paths; every other enabled language is
 * served under `/<language>/`. Changing the default re-prefixes every post of
 * the old language (paths are computed, nothing is rewritten).
 */
export function LanguagesPage() {
  const [config, setConfig] = useState<LanguageConfig>({ default: 'en', enabled: ['en'] });
  const [customCode, setCustomCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    fetchLanguages()
      .then((loaded) => {
        if (active) setConfig(normalizeLanguageConfig(loaded));
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

  function toggle(code: string, enabled: boolean): void {
    setConfig((current) => ({
      ...current,
      enabled: enabled
        ? [...current.enabled, code].filter((entry, index, list) => list.indexOf(entry) === index)
        : current.enabled.filter((entry) => entry !== code),
    }));
  }

  function addCustom(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const code = customCode.trim().toLowerCase();
    if (!isLanguageCode(code)) {
      setError('Use a language code such as “pt-br” or “hi”.');
      return;
    }
    setError(null);
    setConfig((current) => ({
      ...current,
      enabled: [...current.enabled, code].filter(
        (entry, index, list) => list.indexOf(entry) === index,
      ),
    }));
    setCustomCode('');
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saving) return;
    setError(null);
    if (config.enabled.length === 0) {
      setError('Enable at least the default language.');
      return;
    }
    if (!config.enabled.includes(config.default)) {
      setError('The default language must be enabled.');
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const saved = await updateLanguages(config);
      setConfig(normalizeLanguageConfig(saved));
      setNotice({ tone: 'success', text: 'Language settings saved.' });
    } catch (caught) {
      setError(actionErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  const known = AVAILABLE_LANGUAGES.filter((entry) => !config.enabled.includes(entry.code));
  const extra = config.enabled.filter(
    (code) => !AVAILABLE_LANGUAGES.some((entry) => entry.code === code),
  );

  return (
    <div className="languages-settings">
      <PageHeader
        title="Languages"
        description="Enable content languages and choose the default."
      />
      <p className="languages-intro">
        Each translation is a normal post linked in a translation group. The default language keeps
        unprefixed URLs; other languages use <code>/&lt;language&gt;/…</code> and advertise hreflang
        alternates. Archives stay default-language only.
      </p>
      {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}
      {loadError ? (
        <ErrorState
          title="Language settings are unavailable"
          message={loadError}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : loading ? (
        <Skeleton lines={8} />
      ) : (
        <form className="settings-panel languages-form" onSubmit={(event) => void save(event)}>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <fieldset className="field languages-enabled">
            <legend>Enabled languages</legend>
            {[
              ...AVAILABLE_LANGUAGES.filter((entry) => config.enabled.includes(entry.code)),
              ...extra.map((code) => ({ code, label: code })),
            ].map((entry) => (
              <label key={entry.code} className="checkbox-row">
                <input
                  type="checkbox"
                  checked
                  onChange={(event) => toggle(entry.code, event.target.checked)}
                  disabled={saving || entry.code === config.default}
                />
                <span>
                  {entry.label} <code>{entry.code}</code>
                  {entry.code === config.default ? ' — default' : ''}
                </span>
              </label>
            ))}
          </fieldset>

          <div className="field">
            <label htmlFor="language-default">Default language</label>
            <select
              id="language-default"
              value={config.default}
              onChange={(event) =>
                setConfig((current) => ({ ...current, default: event.target.value }))
              }
              disabled={saving}
            >
              {config.enabled.map((code) => (
                <option key={code} value={code}>
                  {AVAILABLE_LANGUAGES.find((entry) => entry.code === code)?.label ?? code} ({code})
                </option>
              ))}
            </select>
            <p className="field-help">
              Changing the default makes the old default language move under its own prefix. No
              content is rewritten.
            </p>
          </div>

          {known.length > 0 ? (
            <fieldset className="field languages-available">
              <legend>Add a language</legend>
              <div className="languages-chips">
                {known.map((entry) => (
                  <button
                    key={entry.code}
                    type="button"
                    className="button secondary-button"
                    onClick={() => toggle(entry.code, true)}
                    disabled={saving}
                  >
                    {entry.label} ({entry.code})
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}

          <div className="field">
            <label htmlFor="language-custom">Custom language code</label>
            <div className="languages-custom">
              <input
                id="language-custom"
                type="text"
                value={customCode}
                maxLength={10}
                placeholder="pt-br"
                onChange={(event) => setCustomCode(event.target.value)}
                disabled={saving}
              />
              <button
                type="submit"
                className="button secondary-button"
                onClick={(event) => {
                  event.preventDefault();
                  addCustom(event as unknown as FormEvent<HTMLFormElement>);
                }}
                disabled={saving || customCode.trim().length === 0}
              >
                Add code
              </button>
            </div>
            <p className="field-help">Two or three letters, optionally a region (`pt-br`).</p>
          </div>

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

import { useEffect, useState, type FormEvent } from 'react';
import {
  AVAILABLE_LANGUAGES,
  isLanguageCode,
  normalizeLanguageConfig,
  type LanguageConfig,
} from '@mernpress/contracts';
import {
  actionErrorMessage,
  fetchLanguageMenus,
  fetchLanguages,
  fetchThemeStrings,
  updateLanguageMenus,
  updateLanguages,
  updateThemeStrings,
  type CustomizerMenuItem,
  type ThemeStringsPayload,
} from './api.js';
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
  // Only saved languages can be edited for strings/menus; enabling one must be
  // saved first (the API rejects disabled languages).
  const [persisted, setPersisted] = useState<LanguageConfig>({
    default: 'en',
    enabled: ['en'],
  });

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    fetchLanguages()
      .then((loaded) => {
        if (!active) return;
        const normalized = normalizeLanguageConfig(loaded);
        setConfig(normalized);
        setPersisted(normalized);
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
      const saved = normalizeLanguageConfig(await updateLanguages(config));
      setConfig(saved);
      setPersisted(saved);
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
      {!loading && !loadError ? <LanguageExtras config={persisted} onNotice={setNotice} /> : null}
    </div>
  );
}

/**
 * Per-language chrome: theme strings for every enabled language and a menu
 * override for non-default languages (the default menu stays in
 * Appearance → Customize → Menus).
 */
function LanguageExtras({
  config,
  onNotice,
}: {
  config: LanguageConfig;
  onNotice: (notice: NoticeMessage | null) => void;
}) {
  const [payload, setPayload] = useState<ThemeStringsPayload | null>(null);
  const [stringsByLanguage, setStringsByLanguage] = useState<
    Record<string, Record<string, string>>
  >({});
  const [stringLanguage, setStringLanguage] = useState(config.default);
  const [stringDraft, setStringDraft] = useState<Record<string, string>>({});
  const [menus, setMenus] = useState<Record<string, CustomizerMenuItem[]>>({});
  const nonDefault = config.enabled.filter((code) => code !== config.default);
  const [menuLanguage, setMenuLanguage] = useState(nonDefault[0] ?? '');
  const [menuDraft, setMenuDraft] = useState<CustomizerMenuItem[]>([]);
  const [busy, setBusy] = useState<'strings' | 'menu' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([fetchThemeStrings(), fetchLanguageMenus()])
      .then(([strings, menuPayload]) => {
        if (!active) return;
        setPayload(strings);
        setStringsByLanguage(strings.strings);
        setMenus(menuPayload.menus ?? {});
        setMenuDraft(menuPayload.menus?.[menuLanguage] ?? []);
      })
      .catch((caught) => {
        if (active) setError(actionErrorMessage(caught));
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setStringDraft(stringsByLanguage[stringLanguage] ?? {});
  }, [stringLanguage, stringsByLanguage]);

  useEffect(() => {
    setMenuDraft(menus[menuLanguage] ?? []);
    // Only react to switching language; a background menu load must not clobber
    // rows the user is editing (the load path sets the draft separately).
  }, [menuLanguage]);

  useEffect(() => {
    if (!config.enabled.includes(stringLanguage)) setStringLanguage(config.default);
    if (menuLanguage !== '' && !config.enabled.includes(menuLanguage)) {
      setMenuLanguage(config.enabled.find((code) => code !== config.default) ?? '');
    }
  }, [config]);

  async function saveStrings(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    setBusy('strings');
    setError(null);
    try {
      const saved = await updateThemeStrings(
        stringLanguage,
        Object.fromEntries(
          Object.entries(stringDraft).filter(([, value]) => value.trim().length > 0),
        ),
      );
      setStringsByLanguage(saved.strings);
      onNotice({ tone: 'success', text: 'Theme strings saved.' });
    } catch (caught) {
      setError(actionErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function saveMenu(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy || menuLanguage === '') return;
    setBusy('menu');
    setError(null);
    try {
      const cleaned = menuDraft
        .map((item) => ({ label: item.label.trim(), url: item.url.trim() }))
        .filter((item) => item.label.length > 0 && item.url.length > 0);
      const saved = await updateLanguageMenus(menuLanguage, cleaned);
      setMenus(saved.menus ?? {});
      onNotice({ tone: 'success', text: 'Language menu saved.' });
    } catch (caught) {
      setError(actionErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <form
        className="settings-panel languages-extras"
        onSubmit={(event) => void saveStrings(event)}
        aria-label="Theme strings"
      >
        <h2>Theme strings</h2>
        <p className="field-help">
          Used by the header and footer on pages in that language. Empty fields fall back to the
          default language and then to the built-in English text.
        </p>
        <div className="field">
          <label htmlFor="theme-strings-language">Language</label>
          <select
            id="theme-strings-language"
            value={stringLanguage}
            onChange={(event) => setStringLanguage(event.target.value)}
            disabled={busy !== null}
          >
            {config.enabled.map((code) => (
              <option key={code} value={code}>
                {AVAILABLE_LANGUAGES.find((entry) => entry.code === code)?.label ?? code} ({code})
              </option>
            ))}
          </select>
        </div>
        <div className="languages-strings-grid">
          {(payload?.keys ?? []).map((entry) => (
            <div className="field" key={entry.key}>
              <label htmlFor={`theme-string-${entry.key}`}>{entry.label}</label>
              <input
                id={`theme-string-${entry.key}`}
                type="text"
                maxLength={entry.max}
                value={stringDraft[entry.key] ?? ''}
                placeholder={payload?.defaults[entry.key] ?? entry.fallback}
                onChange={(event) =>
                  setStringDraft((current) => ({ ...current, [entry.key]: event.target.value }))
                }
                disabled={busy !== null}
              />
            </div>
          ))}
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="field actions">
          <button type="submit" className="button primary-button" disabled={busy !== null}>
            {busy === 'strings' ? 'Saving…' : 'Save strings'}
          </button>
        </div>
      </form>

      <form
        className="settings-panel languages-extras"
        onSubmit={(event) => void saveMenu(event)}
        aria-label="Language menu"
      >
        <h2>Language menu</h2>
        {nonDefault.length === 0 ? (
          <p className="field-help">
            Enable another language to give it its own header menu. The default language menu is
            edited in Appearance → Customize → Menus.
          </p>
        ) : (
          <>
            <p className="field-help">
              Links shown in the header for that language. Use language-prefixed paths such as
              `/hi/posts`. The default language menu stays in Appearance → Customize.
            </p>
            <div className="field">
              <label htmlFor="language-menu-language">Language</label>
              <select
                id="language-menu-language"
                value={menuLanguage}
                onChange={(event) => setMenuLanguage(event.target.value)}
                disabled={busy !== null}
              >
                {nonDefault.map((code) => (
                  <option key={code} value={code}>
                    {AVAILABLE_LANGUAGES.find((entry) => entry.code === code)?.label ?? code} (
                    {code})
                  </option>
                ))}
              </select>
            </div>
            <ol className="customize-menu-list">
              {menuDraft.map((item, index) => (
                <li key={index} className="customize-menu-item">
                  <div className="field">
                    <label htmlFor={`language-menu-label-${index}`}>Label {index + 1}</label>
                    <input
                      id={`language-menu-label-${index}`}
                      type="text"
                      maxLength={80}
                      value={item.label}
                      onChange={(event) =>
                        setMenuDraft((current) =>
                          current.map((entry, position) =>
                            position === index ? { ...entry, label: event.target.value } : entry,
                          ),
                        )
                      }
                      disabled={busy !== null}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`language-menu-url-${index}`}>URL {index + 1}</label>
                    <input
                      id={`language-menu-url-${index}`}
                      type="text"
                      maxLength={2048}
                      value={item.url}
                      onChange={(event) =>
                        setMenuDraft((current) =>
                          current.map((entry, position) =>
                            position === index ? { ...entry, url: event.target.value } : entry,
                          ),
                        )
                      }
                      disabled={busy !== null}
                    />
                  </div>
                  <button
                    type="button"
                    className="button-link is-danger"
                    onClick={() =>
                      setMenuDraft((current) => current.filter((_, position) => position !== index))
                    }
                    disabled={busy !== null}
                  >
                    Remove item {index + 1}
                  </button>
                </li>
              ))}
            </ol>
            <button
              type="button"
              className="button secondary-button"
              onClick={() => setMenuDraft((current) => [...current, { label: '', url: '' }])}
              disabled={busy !== null || menuDraft.length >= 20}
            >
              Add menu item
            </button>
            <div className="field actions">
              <button type="submit" className="button primary-button" disabled={busy !== null}>
                {busy === 'menu' ? 'Saving…' : 'Save menu'}
              </button>
            </div>
          </>
        )}
      </form>
    </>
  );
}

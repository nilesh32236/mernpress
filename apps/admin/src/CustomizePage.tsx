import { useEffect, useState, type FormEvent } from 'react';
import { actionErrorMessage, fetchOptions, updateOptions } from './api.js';
import { Notice, Skeleton, type NoticeMessage } from './components.js';
import { navigate } from './router.js';

/**
 * Appearance → Customize (site identity).
 *
 * WordPress's Customizer is a separate app for classic themes; block themes
 * customize through the Site Editor. MERNPress's public theme reads its site
 * title and tagline from the General options, so this screen edits exactly
 * those values with a live preview of the public site.
 */
/** The public site origin: same origin in production, the web dev server locally. */
function publicSiteUrl(): string {
  const configured = import.meta.env.VITE_SITE_URL;
  if (configured) return configured.replace(/\/+$/, '');
  return import.meta.env.DEV ? 'http://127.0.0.1:3000' : '';
}

export function CustomizePage() {
  const [title, setTitle] = useState('');
  const [tagline, setTagline] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const previewUrl = publicSiteUrl();

  useEffect(() => {
    let active = true;
    fetchOptions('general')
      .then((values) => {
        if (!active) return;
        setTitle(typeof values.site_title === 'string' ? values.site_title : '');
        setTagline(typeof values.site_tagline === 'string' ? values.site_tagline : '');
      })
      .catch((caught) => {
        if (active) setError(actionErrorMessage(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      await updateOptions('general', { site_title: title, site_tagline: tagline });
      setDirty(false);
      setPreviewKey((value) => value + 1);
      setNotice({ tone: 'success', text: 'Site identity saved.' });
    } catch (caught) {
      setError(actionErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="customize-screen">
      <header className="customize-header">
        <h1>Customizing: MERNPress</h1>
        <div className="customize-header-actions">
          <button
            type="button"
            className="button secondary-button"
            onClick={() => setPreviewKey((value) => value + 1)}
          >
            Refresh preview
          </button>
          <button
            type="button"
            className="customize-close"
            aria-label="Close the Customizer"
            onClick={() => navigate('/themes')}
          >
            ×
          </button>
        </div>
      </header>

      <div className="customize-body">
        <aside className="customize-panel" aria-label="Customizer controls">
          <h2>Site Identity</h2>
          {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          {loading ? (
            <Skeleton label="Loading site identity…" lines={3} />
          ) : (
            <form onSubmit={save} aria-label="Site identity">
              <div className="field">
                <label htmlFor="customize-site-title">Site Title</label>
                <input
                  id="customize-site-title"
                  type="text"
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setDirty(true);
                  }}
                  disabled={saving}
                />
              </div>
              <div className="field">
                <label htmlFor="customize-site-tagline">Tagline</label>
                <input
                  id="customize-site-tagline"
                  type="text"
                  value={tagline}
                  onChange={(event) => {
                    setTagline(event.target.value);
                    setDirty(true);
                  }}
                  disabled={saving}
                />
                <p className="field-help">In a few words, explain what this site is about.</p>
              </div>
              <div className="customize-actions">
                <button type="submit" className="button primary-button" disabled={saving || !dirty}>
                  {saving ? 'Saving…' : 'Save & Publish'}
                </button>
              </div>
            </form>
          )}
        </aside>

        <div className="customize-preview">
          <iframe
            key={previewKey}
            title="Site preview"
            src={previewUrl}
            className="customize-preview-frame"
          />
        </div>
      </div>
    </div>
  );
}

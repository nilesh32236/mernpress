import { useEffect, useState } from 'react';
import {
  actionErrorMessage,
  activateTheme,
  fetchThemes,
  setThemeAutoUpdates,
  type AdminTheme,
  type AuthUser,
} from './api.js';
import {
  EmptyState,
  ErrorState,
  Notice,
  PageHeader,
  Skeleton,
  type NoticeMessage,
} from './components.js';
import { navigate } from './router.js';
import { canSwitchThemes } from './roles.js';

/** Theme screenshots live in the admin public dir (served under /admin/). */
function themeAsset(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}

/**
 * Appearance → Themes (WordPress 7.1 layout): a 3-up card grid, a count bubble,
 * "Add Theme" and a search box. Each card shows the screenshot with a dark
 * name bar; the active card gets "Active:" and a Customize button, other cards
 * expose Activate / Theme Details on hover.
 */
export function ThemesPage({ user }: { user: AuthUser }) {
  const [themes, setThemes] = useState<AdminTheme[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [details, setDetails] = useState<AdminTheme | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    fetchThemes()
      .then((result) => {
        if (active) setThemes(result.themes);
      })
      .catch((caught) => {
        if (active) setError(actionErrorMessage(caught));
      });
    return () => {
      active = false;
    };
  }, []);

  const allowed = canSwitchThemes(user);

  async function activate(theme: AdminTheme) {
    if (busyId) return;
    setBusyId(theme.id);
    setNotice(null);
    try {
      const result = await activateTheme(theme.id);
      setThemes(result.themes);
      setDetails(null);
      setNotice({ tone: 'success', text: `New theme activated: ${theme.name}.` });
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setBusyId(null);
    }
  }

  async function toggleAutoUpdates(theme: AdminTheme) {
    if (busyId) return;
    setBusyId(theme.id);
    try {
      const result = await setThemeAutoUpdates(!theme.autoUpdates);
      setThemes(result.themes);
      setDetails((current) =>
        current ? { ...current, autoUpdates: !current.autoUpdates } : current,
      );
      setNotice({
        tone: 'success',
        text: result.themes[0]?.autoUpdates
          ? 'Automatic theme update preference saved.'
          : 'Automatic theme update preference removed.',
      });
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setBusyId(null);
    }
  }

  const visible = (themes ?? []).filter((theme) =>
    search.trim() ? theme.name.toLowerCase().includes(search.trim().toLowerCase()) : true,
  );

  return (
    <>
      <PageHeader
        title="Themes"
        count={themes?.length}
        actions={
          <button
            type="button"
            className="button page-title-action"
            onClick={() => navigate('/themes/new')}
          >
            Add Theme
          </button>
        }
      />
      {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}

      <div className="themes-screen">
        {themes ? (
          <div className="themes-header">
            <label className="themes-search">
              <span className="themes-search-label">Search installed themes</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          </div>
        ) : null}

        {error ? (
          <ErrorState title="Themes unavailable" message={error} />
        ) : themes === null ? (
          <Skeleton label="Loading themes…" lines={6} />
        ) : visible.length === 0 ? (
          <EmptyState title="No themes found." message="Try a different search." />
        ) : (
          <div className="theme-browser">
            {visible.map((theme) => (
              <div
                key={theme.id}
                className={`theme${theme.active ? ' active' : ''}`}
                data-theme={theme.id}
              >
                <div className="theme-screenshot">
                  <img src={themeAsset(theme.screenshot)} alt="" />
                </div>
                <div className="theme-name-bar">
                  <span className="theme-name">
                    {theme.active ? `Active: ${theme.name}` : theme.name}
                  </span>
                  <div className="theme-actions">
                    {theme.active ? (
                      <button
                        type="button"
                        className="button primary-button"
                        onClick={() => navigate('/themes/customize')}
                      >
                        Customize
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="button primary-button"
                          onClick={() => void activate(theme)}
                          disabled={!allowed || busyId === theme.id}
                        >
                          {busyId === theme.id ? 'Activating…' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          className="button-link theme-details-link"
                          onClick={() => setDetails(theme)}
                        >
                          Theme Details
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {theme.active ? (
                  <div className="theme-active-actions">
                    <button
                      type="button"
                      className="button-link theme-details-link"
                      onClick={() => setDetails(theme)}
                    >
                      Theme Details
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
            <button type="button" className="theme-add-new" onClick={() => navigate('/themes/new')}>
              <span className="theme-add-new-icon" aria-hidden="true">
                +
              </span>
              <span>Add Theme</span>
            </button>
          </div>
        )}
      </div>

      {details ? (
        <div className="theme-overlay" role="dialog" aria-modal="true" aria-label={details.name}>
          <div className="theme-overlay-bar">
            <button
              type="button"
              className="theme-overlay-close"
              onClick={() => setDetails(null)}
              aria-label="Close details dialog"
            >
              ×
            </button>
          </div>
          <div className="theme-overlay-body">
            <div className="theme-overlay-preview">
              <img src={themeAsset(details.screenshot)} alt="" />
            </div>
            <div className="theme-overlay-info">
              {details.active ? <span className="active-theme-badge">Active Theme</span> : null}
              <h2 className="theme-overlay-name">
                {details.name}{' '}
                <span className="theme-overlay-version">Version: {details.version}</span>
              </h2>
              <p className="theme-overlay-author">
                By <strong>{details.author.name}</strong>
              </p>
              <button
                type="button"
                className="button-link"
                onClick={() => void toggleAutoUpdates(details)}
                disabled={!allowed}
              >
                {details.autoUpdates ? 'Disable auto-updates' : 'Enable auto-updates'}
              </button>
              <p className="theme-overlay-description">{details.description}</p>
              <p className="theme-overlay-tags">
                <span>Tags: </span>
                {details.tags.join(', ')}
              </p>
              {details.features.length > 0 ? (
                <p className="theme-overlay-tags">
                  <span>Features: </span>
                  {details.features.join(', ')}
                </p>
              ) : null}
            </div>
          </div>
          <div className="theme-overlay-actions">
            {details.active ? (
              <button
                type="button"
                className="button primary-button"
                onClick={() => {
                  setDetails(null);
                  navigate('/themes/customize');
                }}
              >
                Customize
              </button>
            ) : (
              <button
                type="button"
                className="button primary-button"
                onClick={() => void activate(details)}
                disabled={!allowed}
              >
                Activate
              </button>
            )}
            <button
              type="button"
              className="button secondary-button"
              onClick={() => setDetails(null)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

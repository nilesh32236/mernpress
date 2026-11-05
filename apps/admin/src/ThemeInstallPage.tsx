import { useEffect, useState } from 'react';
import {
  actionErrorMessage,
  activateTheme,
  fetchThemes,
  type AdminTheme,
  type AuthUser,
} from './api.js';
import { Notice, PageHeader, Skeleton, type NoticeMessage } from './components.js';
import { navigate } from './router.js';
import { canSwitchThemes } from './roles.js';

/** Theme screenshots live in the admin public dir (served under /admin/). */
function themeAsset(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}

/**
 * Appearance → Add Themes.
 *
 * WordPress browses and installs themes from WordPress.org. MERNPress ships
 * trusted theme packages in the repository (ADR 0011), so remote browsing,
 * ZIP uploads and installation are not possible in this build. The screen
 * keeps the WordPress chrome and lists what is actually installed instead of
 * pretending a marketplace exists.
 */
export function ThemeInstallPage({ user }: { user: AuthUser }) {
  const [themes, setThemes] = useState<AdminTheme[] | null>(null);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const allowed = canSwitchThemes(user);

  useEffect(() => {
    let active = true;
    fetchThemes()
      .then((result) => {
        if (active) setThemes(result.themes);
      })
      .catch(() => {
        if (active) setThemes([]);
      });
    return () => {
      active = false;
    };
  }, []);

  async function activate(theme: AdminTheme) {
    if (busyId) return;
    setBusyId(theme.id);
    try {
      const result = await activateTheme(theme.id);
      setThemes(result.themes);
      setNotice({ tone: 'success', text: `New theme activated: ${theme.name}.` });
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
        title="Add Themes"
        actions={
          <button type="button" className="button page-title-action" disabled>
            Upload Theme
          </button>
        }
      />
      {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}
      <div className="theme-install-screen">
        <div className="wp-filter">
          {themes ? (
            <span className="theme-count" aria-label={`${themes.length} installed theme(s)`}>
              {themes.length}
            </span>
          ) : null}
          <ul className="filter-links" aria-label="Theme directory">
            {['Popular', 'Latest', 'Block Themes', 'Favorites'].map((label) => (
              <li key={label}>
                <span
                  className="filter-link is-disabled"
                  aria-disabled="true"
                  title="The WordPress Theme Directory is not enabled in this build"
                >
                  {label}
                </span>
              </li>
            ))}
          </ul>
          <form className="search-form" role="search" onSubmit={(event) => event.preventDefault()}>
            <label htmlFor="theme-install-search" className="screen-reader-text">
              Search Themes
            </label>
            <input
              id="theme-install-search"
              type="search"
              placeholder="Search Themes"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </form>
        </div>
        <div className="notice notice-info" role="status">
          <p>
            This build installs themes from the repository on disk. Browsing WordPress.org,
            uploading a ZIP file and installing new themes are not enabled, so no remote theme list
            is shown.
          </p>
        </div>
        <h2 className="theme-install-heading">Installed</h2>
        {themes === null ? (
          <Skeleton label="Loading themes…" lines={4} />
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
                  <span className="theme-name">{theme.name}</span>
                  <div className="theme-actions">
                    {theme.active ? (
                      <span className="theme-activated">Activated</span>
                    ) : (
                      <button
                        type="button"
                        className="button primary-button"
                        onClick={() => void activate(theme)}
                        disabled={!allowed || busyId === theme.id}
                      >
                        {busyId === theme.id ? 'Activating…' : 'Activate'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="button-link theme-details-link"
                      onClick={() => navigate('/themes')}
                    >
                      Details &amp; Preview
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

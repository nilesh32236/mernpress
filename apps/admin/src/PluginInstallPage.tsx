import { useEffect, useState } from 'react';
import {
  actionErrorMessage,
  activatePlugin,
  fetchPlugins,
  type AdminPlugin,
  type AuthUser,
} from './api.js';
import { Notice, PageHeader, Skeleton, type NoticeMessage } from './components.js';
import { canManagePlugins } from './roles.js';

/**
 * Plugins → Add Plugins.
 *
 * WordPress searches and installs plugins from WordPress.org. MERNPress ships
 * plugins in the repository and has no runtime installer, so this screen keeps
 * the WordPress chrome and reports the boundary instead of faking a directory.
 */
export function PluginInstallPage({ user }: { user: AuthUser }) {
  const [plugins, setPlugins] = useState<AdminPlugin[] | null>(null);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const allowed = canManagePlugins(user);

  useEffect(() => {
    let active = true;
    fetchPlugins()
      .then((result) => {
        if (active) setPlugins(result.plugins);
      })
      .catch(() => {
        if (active) setPlugins([]);
      });
    return () => {
      active = false;
    };
  }, []);

  async function activate(plugin: AdminPlugin) {
    if (busyId) return;
    setBusyId(plugin.id);
    try {
      const result = await activatePlugin(plugin.id);
      setPlugins(result.plugins);
      setNotice({ tone: 'success', text: `Plugin activated: ${plugin.name}.` });
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setBusyId(null);
    }
  }

  const visible = (plugins ?? []).filter((plugin) =>
    search.trim() ? plugin.name.toLowerCase().includes(search.trim().toLowerCase()) : true,
  );

  return (
    <>
      <PageHeader
        title="Add Plugins"
        count={plugins?.length}
        actions={
          <button type="button" className="button page-title-action" disabled>
            Upload Plugin
          </button>
        }
      />
      {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}
      <div className="plugins-install-screen">
        <div className="notice notice-info" role="status">
          <p>
            Plugins are trusted packages in this repository. Browsing WordPress.org, uploading a ZIP
            file and installing plugins at runtime are not enabled, so no plugin directory is shown.
          </p>
        </div>
        <div className="list-top">
          <form className="search-form" role="search" onSubmit={(event) => event.preventDefault()}>
            <label htmlFor="plugin-install-search" className="screen-reader-text">
              Search plugins
            </label>
            <input
              id="plugin-install-search"
              type="search"
              placeholder="Search plugins"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </form>
        </div>
        <h2 className="plugin-install-heading">Installed</h2>
        {plugins === null ? (
          <Skeleton label="Loading plugins…" lines={3} />
        ) : visible.length === 0 ? (
          <p className="plugins-empty">No plugins found matching your search.</p>
        ) : (
          <table className="content-table widefat fixed striped plugins">
            <caption className="screen-reader-text">Installed plugins</caption>
            <tbody>
              {visible.map((plugin) => (
                <tr key={plugin.id} className={plugin.active ? 'active' : undefined}>
                  <td className="plugin-install-name">
                    <strong>{plugin.name}</strong>
                    <p className="plugin-version">
                      Version {plugin.version} <span aria-hidden="true">|</span> By {plugin.author}
                    </p>
                  </td>
                  <td className="plugin-install-action">
                    {plugin.active ? (
                      <span className="plugin-activated">Activated</span>
                    ) : (
                      <button
                        type="button"
                        className="button secondary-button"
                        onClick={() => void activate(plugin)}
                        disabled={!allowed || busyId === plugin.id}
                      >
                        {busyId === plugin.id ? 'Activating…' : 'Activate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

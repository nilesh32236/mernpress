import { useEffect, useState } from 'react';
import {
  actionErrorMessage,
  activatePlugin,
  deactivatePlugin,
  deletePlugin,
  fetchPlugins,
  setPluginAutoUpdates,
  type AdminPlugin,
  type AuthUser,
  type PluginListResult,
} from './api.js';
import {
  ErrorState,
  Modal,
  Notice,
  PageHeader,
  Skeleton,
  type NoticeMessage,
} from './components.js';
import { navigate } from './router.js';
import { canManagePlugins } from './roles.js';
import {
  SCREEN_COLUMNS_EVENT,
  SCREEN_OPTIONS_EVENT,
  screenHiddenColumns,
} from './screenOptions.js';

type Filter = 'all' | 'active' | 'inactive';

/**
 * Plugins → Installed Plugins (WordPress 7.1): status links, search, a bulk
 * actions row and a list table with the plugin name + row actions, description,
 * version/author line and the Automatic Updates column. Active rows carry the
 * WordPress blue edge.
 */
export function PluginsPage({ user }: { user: AuthUser }) {
  const [data, setData] = useState<PluginListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'activate' | 'deactivate' | ''>('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState(() => screenHiddenColumns('plugins'));
  const [details, setDetails] = useState<AdminPlugin | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminPlugin | null>(null);

  useEffect(() => {
    let active = true;
    fetchPlugins()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((caught) => {
        if (active) setError(actionErrorMessage(caught));
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const sync = () => setHiddenColumns(screenHiddenColumns('plugins'));
    window.addEventListener(SCREEN_COLUMNS_EVENT, sync);
    window.addEventListener(SCREEN_OPTIONS_EVENT, sync);
    return () => {
      window.removeEventListener(SCREEN_COLUMNS_EVENT, sync);
      window.removeEventListener(SCREEN_OPTIONS_EVENT, sync);
    };
  }, []);

  const allowed = canManagePlugins(user);
  const showDescription = !hiddenColumns.has('description');
  const showAutoUpdates = !hiddenColumns.has('auto-updates');

  async function toggle(plugin: AdminPlugin) {
    if (busyId) return;
    setBusyId(plugin.id);
    setNotice(null);
    try {
      const result = plugin.active
        ? await deactivatePlugin(plugin.id)
        : await activatePlugin(plugin.id);
      setData(result);
      setNotice({
        tone: 'success',
        text: plugin.active
          ? `Plugin deactivated: ${plugin.name}.`
          : `Plugin activated: ${plugin.name}.`,
      });
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setBusyId(null);
    }
  }

  async function toggleAutoUpdates(plugin: AdminPlugin) {
    if (busyId) return;
    setBusyId(plugin.id);
    try {
      const result = await setPluginAutoUpdates(!plugin.autoUpdates);
      setData(result);
      setNotice({
        tone: 'success',
        text: result.plugins[0]?.autoUpdates
          ? 'Automatic plugin update preference saved.'
          : 'Automatic plugin update preference removed.',
      });
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setBusyId(null);
    }
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((current) =>
      current.size === visible.length ? new Set() : new Set(visible.map((plugin) => plugin.id)),
    );
  }

  async function applyBulk() {
    if (!bulkAction || selected.size === 0 || bulkBusy) return;
    setBulkBusy(true);
    setNotice(null);
    try {
      let result: PluginListResult | null = null;
      for (const id of selected) {
        result = bulkAction === 'activate' ? await activatePlugin(id) : await deactivatePlugin(id);
      }
      if (result) setData(result);
      setNotice({
        tone: 'success',
        text: `${selected.size} plugin${selected.size === 1 ? '' : 's'} ${
          bulkAction === 'activate' ? 'activated' : 'deactivated'
        }.`,
      });
      setSelected(new Set());
      setBulkAction('');
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setBulkBusy(false);
    }
  }

  async function remove(plugin: AdminPlugin) {
    if (busyId) return;
    setBusyId(plugin.id);
    setNotice(null);
    try {
      const result = await deletePlugin(plugin.id);
      setData(result);
      setPendingDelete(null);
      setSelected((current) => {
        const next = new Set(current);
        next.delete(plugin.id);
        return next;
      });
      setNotice({ tone: 'success', text: `Plugin deleted: ${plugin.name}.` });
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setBusyId(null);
    }
  }

  const plugins = data?.plugins ?? [];
  const visible = plugins.filter((plugin) => {
    if (filter === 'active' && !plugin.active) return false;
    if (filter === 'inactive' && plugin.active) return false;
    return search.trim() ? plugin.name.toLowerCase().includes(search.trim().toLowerCase()) : true;
  });

  const counts = data?.counts ?? { all: 0, active: 0, inactive: 0 };

  return (
    <>
      <PageHeader
        title="Plugins"
        count={data?.counts.all}
        actions={
          <button
            type="button"
            className="button page-title-action"
            onClick={() => navigate('/plugins/new')}
          >
            Add Plugin
          </button>
        }
      />
      {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}

      <div className="wp-list-screen plugins-screen">
        <div className="list-top">
          <ul className="subsubsub" aria-label="Plugin status">
            {[
              { id: 'all' as const, label: 'All', count: counts.all },
              { id: 'active' as const, label: 'Active', count: counts.active },
              { id: 'inactive' as const, label: 'Inactive', count: counts.inactive },
            ].map((tab, index) => (
              <li key={tab.id}>
                {index > 0 ? <span className="subsubsub-sep">|</span> : null}
                <button
                  type="button"
                  className={`subsubsub-tab${filter === tab.id ? ' is-current' : ''}`}
                  onClick={() => setFilter(tab.id)}
                >
                  {tab.label} <span className="subsubsub-count">({tab.count})</span>
                </button>
              </li>
            ))}
          </ul>
          <form className="search-form" role="search" onSubmit={(event) => event.preventDefault()}>
            <label htmlFor="plugin-search" className="plugins-search-label">
              Search installed plugins
            </label>
            <input
              id="plugin-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </form>
        </div>

        <div className="tablenav">
          <div className="alignleft actions bulkactions">
            <label htmlFor="bulk-action-selector-top" className="screen-reader-text">
              Select bulk action
            </label>
            <select
              id="bulk-action-selector-top"
              value={bulkAction}
              onChange={(event) =>
                setBulkAction(event.target.value as 'activate' | 'deactivate' | '')
              }
            >
              <option value="">Bulk actions</option>
              <option value="activate">Activate</option>
              <option value="deactivate">Deactivate</option>
            </select>
            <button
              type="button"
              className="button"
              onClick={() => void applyBulk()}
              disabled={!bulkAction || selected.size === 0 || bulkBusy}
            >
              Apply
            </button>
          </div>
          <span className="displaying-num">
            {data?.counts.all ?? 0} {data?.counts.all === 1 ? 'item' : 'items'}
          </span>
        </div>

        {error ? (
          <ErrorState title="Plugins unavailable" message={error} />
        ) : data === null ? (
          <Skeleton label="Loading plugins…" lines={5} />
        ) : visible.length === 0 ? (
          <p className="plugins-empty">
            {search.trim()
              ? 'No plugins found matching your search.'
              : filter === 'all'
                ? 'No plugins installed.'
                : `No ${filter} plugins.`}
          </p>
        ) : (
          <div className="table-scroll">
            <table className="content-table widefat fixed striped plugins">
              <caption className="screen-reader-text">Installed plugins</caption>
              <thead>
                <tr>
                  <th scope="col" className="check-column">
                    <input
                      type="checkbox"
                      aria-label="Select all plugins"
                      checked={visible.length > 0 && selected.size === visible.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th scope="col" className="column-plugin">
                    Plugin
                  </th>
                  {showDescription ? (
                    <th scope="col" className="column-description">
                      Description
                    </th>
                  ) : null}
                  {showAutoUpdates ? (
                    <th scope="col" className="column-auto-updates">
                      Automatic Updates
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {visible.map((plugin) => (
                  <tr key={plugin.id} className={plugin.active ? 'active' : undefined}>
                    <th scope="row" className="check-column">
                      <input
                        type="checkbox"
                        aria-label={`Select ${plugin.name}`}
                        checked={selected.has(plugin.id)}
                        onChange={() => toggleSelected(plugin.id)}
                      />
                    </th>
                    <td className="plugin-title column-plugin">
                      <strong>{plugin.name}</strong>
                      <div className="row-actions">
                        {allowed ? (
                          <button
                            type="button"
                            className="row-action-link"
                            onClick={() => void toggle(plugin)}
                            disabled={busyId === plugin.id}
                          >
                            {plugin.active ? 'Deactivate' : 'Activate'}
                          </button>
                        ) : null}
                        {allowed && !plugin.active ? (
                          <>
                            <span className="row-action-sep" aria-hidden="true">
                              |
                            </span>
                            <button
                              type="button"
                              className="row-action-link is-danger"
                              onClick={() => setPendingDelete(plugin)}
                              disabled={busyId === plugin.id}
                            >
                              Delete
                            </button>
                          </>
                        ) : null}
                        <span className="row-action-sep" aria-hidden="true">
                          |
                        </span>
                        <button
                          type="button"
                          className="row-action-link"
                          onClick={() => setDetails(plugin)}
                        >
                          View details
                        </button>
                      </div>
                    </td>
                    {showDescription ? (
                      <td className="column-description">
                        <p className="plugin-description">{plugin.description}</p>
                        <p className="plugin-version">
                          Version {plugin.version} <span aria-hidden="true">|</span> By{' '}
                          {plugin.author}
                        </p>
                      </td>
                    ) : null}
                    {showAutoUpdates ? (
                      <td className="column-auto-updates">
                        <button
                          type="button"
                          className="button-link"
                          onClick={() => void toggleAutoUpdates(plugin)}
                          disabled={!allowed || busyId === plugin.id}
                        >
                          {plugin.autoUpdates ? 'Disable auto-updates' : 'Enable auto-updates'}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="col" className="check-column">
                    <input
                      type="checkbox"
                      aria-label="Select all plugins"
                      checked={visible.length > 0 && selected.size === visible.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th scope="col" className="column-plugin">
                    Plugin
                  </th>
                  {showDescription ? (
                    <th scope="col" className="column-description">
                      Description
                    </th>
                  ) : null}
                  {showAutoUpdates ? (
                    <th scope="col" className="column-auto-updates">
                      Automatic Updates
                    </th>
                  ) : null}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {details ? (
        <Modal title={details.name} onClose={() => setDetails(null)}>
          <div className="plugin-details">
            <p className="plugin-details-meta">
              Version {details.version} <span aria-hidden="true">|</span> By {details.author}
            </p>
            <p>{details.description}</p>
            <p className="plugin-details-note">{details.details}</p>
            <p className="plugin-details-auto">
              Automatic updates are {details.autoUpdates ? 'enabled' : 'disabled'} for this plugin
              set.
            </p>
          </div>
          <div className="plugin-modal-actions">
            <button
              type="button"
              className="button primary-button"
              onClick={() => setDetails(null)}
            >
              Close
            </button>
          </div>
        </Modal>
      ) : null}

      {pendingDelete ? (
        <Modal title="Delete plugin" onClose={() => setPendingDelete(null)}>
          <p>
            Are you sure you want to delete <strong>{pendingDelete.name}</strong>? Its data and
            settings will be removed. This permanently deletes the plugin package from the server
            and cannot be undone.
          </p>
          <div className="plugin-modal-actions">
            <button
              type="button"
              className="button secondary-button"
              onClick={() => setPendingDelete(null)}
              disabled={busyId === pendingDelete.id}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button is-danger"
              onClick={() => void remove(pendingDelete)}
              disabled={busyId === pendingDelete.id}
            >
              {busyId === pendingDelete.id ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

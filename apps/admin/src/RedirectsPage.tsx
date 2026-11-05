import { useEffect, useState, type FormEvent } from 'react';
import {
  actionErrorMessage,
  createRedirect,
  deleteRedirect,
  dismissNotFound,
  fetchRedirects,
  updateRedirect,
  type NotFoundEntry,
  type RedirectItem,
  type RedirectListResult,
} from './api.js';
import { ErrorState, Notice, PageHeader, Skeleton, type NoticeMessage } from './components.js';
import { formatDateTime } from './format.js';

/**
 * Tools → Redirects: an admin-managed redirect table plus the aggregated 404
 * log, with one-click "Redirect" and "Dismiss" actions. Redirects are applied
 * by the public site's middleware.
 */
export function RedirectsPage() {
  const [data, setData] = useState<RedirectListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fromPath, setFromPath] = useState('');
  const [toPath, setToPath] = useState('');
  const [statusCode, setStatusCode] = useState<'301' | '302'>('301');

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchRedirects()
      .then((result) => {
        if (!active) return;
        setData(result);
        setLoading(false);
      })
      .catch((caught) => {
        if (!active) return;
        setError(actionErrorMessage(caught));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  function resetForm() {
    setEditingId(null);
    setFromPath('');
    setToPath('');
    setStatusCode('301');
  }

  function startEdit(item: RedirectItem) {
    setEditingId(item.id);
    setFromPath(item.fromPath);
    setToPath(item.toPath);
    setStatusCode(item.statusCode === 302 ? '302' : '301');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!fromPath.trim() || !toPath.trim()) {
      setNotice({ tone: 'error', text: 'Enter both a source path and a destination.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    const payload = {
      fromPath: fromPath.trim(),
      toPath: toPath.trim(),
      statusCode: Number(statusCode) === 302 ? (302 as const) : (301 as const),
    };
    try {
      const result = editingId
        ? await updateRedirect(editingId, payload)
        : await createRedirect(payload);
      setData(result);
      setNotice({
        tone: 'success',
        text: editingId ? 'Redirect updated.' : 'Redirect added.',
      });
      resetForm();
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: RedirectItem) {
    if (busy) return;
    if (!window.confirm(`Delete the redirect from ${item.fromPath}?`)) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await deleteRedirect(item.id);
      setData(result);
      if (editingId === item.id) resetForm();
      setNotice({ tone: 'success', text: 'Redirect deleted.' });
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setBusy(false);
    }
  }

  async function dismiss(entry: NotFoundEntry) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await dismissNotFound(entry.id);
      setData(result);
      setNotice({ tone: 'success', text: '404 entry dismissed.' });
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setBusy(false);
    }
  }

  function redirect404(entry: NotFoundEntry) {
    setEditingId(null);
    setFromPath(entry.path);
    setToPath('');
    setStatusCode('301');
  }

  return (
    <>
      <PageHeader title="Redirects" />
      {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}

      {error ? (
        <ErrorState
          title="Could not load redirects"
          message={error}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : loading ? (
        <Skeleton label="Loading redirects…" lines={4} />
      ) : data ? (
        <>
          <section className="settings-panel" aria-labelledby="redirect-form-heading">
            <h2 id="redirect-form-heading">{editingId ? 'Edit redirect' : 'Add redirect'}</h2>
            <form className="redirect-form" onSubmit={(event) => void submit(event)}>
              <div className="field">
                <label htmlFor="redirect-from">From path</label>
                <input
                  id="redirect-from"
                  type="text"
                  value={fromPath}
                  onChange={(event) => setFromPath(event.target.value)}
                  placeholder="/old-post"
                  maxLength={2048}
                  required
                  disabled={busy}
                />
              </div>
              <div className="field">
                <label htmlFor="redirect-to">To path or URL</label>
                <input
                  id="redirect-to"
                  type="text"
                  value={toPath}
                  onChange={(event) => setToPath(event.target.value)}
                  placeholder="/posts/new-post"
                  maxLength={2048}
                  required
                  disabled={busy}
                />
              </div>
              <div className="field">
                <label htmlFor="redirect-status">Status</label>
                <select
                  id="redirect-status"
                  value={statusCode}
                  onChange={(event) => setStatusCode(event.target.value === '302' ? '302' : '301')}
                  disabled={busy}
                >
                  <option value="301">301 Moved Permanently</option>
                  <option value="302">302 Found (temporary)</option>
                </select>
              </div>
              <p className="redirect-form-actions">
                <button type="submit" className="button primary-button" disabled={busy}>
                  {busy ? 'Saving…' : editingId ? 'Update Redirect' : 'Add Redirect'}
                </button>
                {editingId ? (
                  <button
                    type="button"
                    className="button secondary-button"
                    onClick={resetForm}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                ) : null}
              </p>
            </form>
          </section>

          <section className="settings-panel" aria-labelledby="redirects-heading">
            <h2 id="redirects-heading">Redirects ({data.redirects.length})</h2>
            {data.redirects.length === 0 ? (
              <p className="redirect-empty">No redirects yet.</p>
            ) : (
              <div className="table-scroll">
                <table className="content-table widefat fixed striped redirects-table">
                  <caption className="screen-reader-text">Redirects</caption>
                  <thead>
                    <tr>
                      <th scope="col">From</th>
                      <th scope="col">To</th>
                      <th scope="col">Status</th>
                      <th scope="col">Hits</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.redirects.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <code>{item.fromPath}</code>
                        </td>
                        <td>
                          <code>{item.toPath}</code>
                        </td>
                        <td>{item.statusCode}</td>
                        <td>{item.hits}</td>
                        <td className="redirect-actions">
                          <button
                            type="button"
                            className="button-link"
                            onClick={() => startEdit(item)}
                            disabled={busy}
                          >
                            Edit
                          </button>
                          <span aria-hidden="true"> | </span>
                          <button
                            type="button"
                            className="button-link is-danger"
                            onClick={() => void remove(item)}
                            disabled={busy}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="settings-panel" aria-labelledby="not-found-heading">
            <h2 id="not-found-heading">404s ({data.notFound.length})</h2>
            <p className="field-help">
              Paths that returned 404 on the public site. Aggregated by path; no IP addresses are
              stored.
            </p>
            {data.notFound.length === 0 ? (
              <p className="redirect-empty">No 404s logged.</p>
            ) : (
              <div className="table-scroll">
                <table className="content-table widefat fixed striped redirects-table">
                  <caption className="screen-reader-text">404 log</caption>
                  <thead>
                    <tr>
                      <th scope="col">Path</th>
                      <th scope="col">Hits</th>
                      <th scope="col">Last seen</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.notFound.map((entry) => (
                      <tr key={entry.id}>
                        <td>
                          <code>{entry.path}</code>
                        </td>
                        <td>{entry.hits}</td>
                        <td>{formatDateTime(entry.lastSeenAt)}</td>
                        <td className="redirect-actions">
                          <button
                            type="button"
                            className="button-link"
                            onClick={() => redirect404(entry)}
                            disabled={busy}
                          >
                            Redirect
                          </button>
                          <span aria-hidden="true"> | </span>
                          <button
                            type="button"
                            className="button-link is-danger"
                            onClick={() => void dismiss(entry)}
                            disabled={busy}
                          >
                            Dismiss
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}

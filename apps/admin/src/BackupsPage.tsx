import { useEffect, useState } from 'react';
import {
  actionErrorMessage,
  createBackup,
  deleteBackup,
  fetchBackups,
  type BackupListResult,
} from './api.js';
import { ErrorState, Notice, PageHeader, Skeleton, type NoticeMessage } from './components.js';
import { formatDateTime } from './format.js';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Tools → Backups.
 *
 * Creates a single `.tar.gz` with a plain SQL dump, the media directory and a
 * manifest. Restore is deliberately CLI-only; this screen never overwrites live
 * data.
 */
export function BackupsPage() {
  const [data, setData] = useState<BackupListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchBackups()
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

  async function create() {
    if (creating) return;
    setCreating(true);
    setNotice(null);
    try {
      const result = await createBackup();
      setData(result);
      setNotice({
        tone: 'success',
        text: `Backup created: ${result.backups[0]?.fileName ?? 'download ready'}.`,
      });
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setCreating(false);
    }
  }

  async function remove(fileName: string) {
    if (deleting) return;
    if (!window.confirm(`Delete ${fileName}? This cannot be undone.`)) return;
    setDeleting(fileName);
    setNotice(null);
    try {
      const result = await deleteBackup(fileName);
      setData(result);
      setNotice({ tone: 'success', text: 'Backup deleted.' });
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setDeleting(null);
    }
  }

  return (
    <>
      <PageHeader title="Backups" />
      {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}

      <section className="settings-panel" aria-labelledby="backup-create-heading">
        <h2 id="backup-create-heading">Create a backup</h2>
        <p>
          A backup is one <code>.tar.gz</code> containing a plain SQL dump of the database, the
          media library and a manifest. Files are stored on the server; credentials are never
          written to the archive.
        </p>
        <p className="field-help">
          Restoring is a command-line procedure documented in
          <code> docs/operations/backup-restore.md</code>. This screen never overwrites live data,
          and downloading a backup gives you a copy of your database and uploads — store it
          somewhere private.
        </p>
        <p>
          <button
            type="button"
            className="button primary-button"
            onClick={() => void create()}
            disabled={creating}
            aria-busy={creating}
          >
            {creating ? 'Creating backup… this can take a moment' : 'Create backup'}
          </button>
        </p>
      </section>

      {error ? (
        <ErrorState
          title="Could not load backups"
          message={error}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : loading ? (
        <Skeleton label="Loading backups…" lines={3} />
      ) : data ? (
        <section className="settings-panel" aria-labelledby="backup-list-heading">
          <h2 id="backup-list-heading">Stored backups ({data.backups.length})</h2>
          <p className="field-help">
            Only the newest {data.retention} backups are kept; older files are removed
            automatically.
          </p>
          {data.backups.length === 0 ? (
            <p className="backup-empty">No backups yet.</p>
          ) : (
            <div className="table-scroll">
              <table className="content-table widefat fixed striped backups-table">
                <caption className="screen-reader-text">Backup files</caption>
                <thead>
                  <tr>
                    <th scope="col">File</th>
                    <th scope="col">Size</th>
                    <th scope="col">Created</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.backups.map((backup) => (
                    <tr key={backup.fileName}>
                      <td>
                        <code>{backup.fileName}</code>
                      </td>
                      <td>{formatBytes(backup.sizeBytes)}</td>
                      <td>{formatDateTime(backup.createdAt)}</td>
                      <td className="backup-actions">
                        <a
                          className="button-link"
                          href={`/api/admin/backups/${encodeURIComponent(backup.fileName)}/download`}
                        >
                          Download
                        </a>
                        <span aria-hidden="true"> | </span>
                        <button
                          type="button"
                          className="button-link is-danger"
                          onClick={() => void remove(backup.fileName)}
                          disabled={deleting !== null}
                        >
                          {deleting === backup.fileName ? 'Deleting…' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </>
  );
}

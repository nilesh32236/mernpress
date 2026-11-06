import { useEffect, useState } from 'react';
import {
  actionErrorMessage,
  clearMailLog,
  fetchMailLog,
  fetchMailStatus,
  type MailLogEntry,
  type MailStatus,
} from './api.js';
import { Notice, Skeleton, type NoticeMessage } from './components.js';
import { formatDateTime } from './format.js';

/**
 * Settings → Discussion: outbound mail status and delivery log.
 *
 * The log stores recipient, subject, status and reason only — never bodies,
 * tokens or credentials. It answers the common "did the email actually send?"
 * question that WordPress leaves to plugins.
 */
export function MailLogPanel() {
  const [status, setStatus] = useState<MailStatus | null>(null);
  const [entries, setEntries] = useState<MailLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([fetchMailStatus(), fetchMailLog()])
      .then(([nextStatus, nextEntries]) => {
        if (!active) return;
        setStatus(nextStatus);
        setEntries(nextEntries);
      })
      .catch((caught) => {
        if (active) setError(actionErrorMessage(caught));
      });
    return () => {
      active = false;
    };
  }, []);

  async function clear() {
    if (clearing) return;
    if (!window.confirm('Delete every entry in the mail log? This cannot be undone.')) return;
    setClearing(true);
    setNotice(null);
    try {
      await clearMailLog();
      setEntries([]);
      setNotice({ tone: 'success', text: 'Mail log cleared.' });
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setClearing(false);
    }
  }

  return (
    <section className="settings-panel mail-log-panel" aria-labelledby="mail-log-heading">
      <h2 id="mail-log-heading">Mail delivery</h2>
      {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {status ? (
        <div className="mail-log-status">
          <p>
            <strong>Transport:</strong>{' '}
            {status.configured
              ? status.transport === 'smtp'
                ? 'SMTP'
                : 'In-memory sink (development/test)'
              : 'Not configured'}
          </p>
          {status.from ? (
            <p>
              <strong>From:</strong> {status.from}
            </p>
          ) : null}
          {status.configured ? (
            <p className="field-help">
              Deliveries are queued as durable <code>mail.send</code> jobs and sent by the
              background worker. This log records the delivery outcome; job progress and failures
              are visible in Tools → Scheduled Actions.
            </p>
          ) : (
            <p className="field-help">
              Outbound mail is disabled until SMTP is configured on the server. Comment and
              password-reset notifications are not sent; the log records nothing for them.
            </p>
          )}
        </div>
      ) : null}

      {entries === null ? (
        <Skeleton label="Loading mail log…" lines={3} />
      ) : (
        <>
          <div className="mail-log-actions">
            <p className="field-help">
              The last {entries.length === 0 ? 'deliveries' : `${entries.length} deliveries`}.
              Bodies, tokens and credentials are never stored.
            </p>
            <button
              type="button"
              className="button secondary-button"
              onClick={() => void clear()}
              disabled={clearing || entries.length === 0}
            >
              {clearing ? 'Clearing…' : 'Clear log'}
            </button>
          </div>
          {entries.length === 0 ? (
            <p className="mail-log-empty">No mail has been sent yet.</p>
          ) : (
            <div className="table-scroll">
              <table className="content-table widefat fixed striped mail-log-table">
                <caption className="screen-reader-text">Mail delivery log</caption>
                <thead>
                  <tr>
                    <th scope="col">Time</th>
                    <th scope="col">Recipient</th>
                    <th scope="col">Subject</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatDateTime(entry.createdAt)}</td>
                      <td>{entry.recipient || '—'}</td>
                      <td>{entry.subject || '—'}</td>
                      <td>
                        <span
                          className={`status-badge ${
                            entry.status === 'sent' ? 'mail-status-sent' : 'mail-status-failed'
                          }`}
                        >
                          {entry.status === 'sent' ? 'Sent' : 'Failed'}
                        </span>
                        {entry.reason ? (
                          <span className="mail-log-reason"> ({entry.reason})</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

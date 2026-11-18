import { useEffect, useState } from 'react';
import {
  ApiError,
  actionErrorMessage,
  fetchAuditEvents,
  type AdminAuditEvent,
  type Paged,
} from './api.js';
import { EmptyState, ErrorState, PageHeader, Skeleton } from './components.js';
import { pluralize } from './format.js';

const PER_PAGE = 20;

/** The 14 recorded auth and user event types (D-154). */
const AUDIT_EVENT_TYPES = [
  'auth.bootstrap',
  'auth.manual_test_account.created',
  'auth.login.success',
  'auth.login.failure',
  'auth.login.rate_limited',
  'auth.logout',
  'auth.session.revoked',
  'user.created',
  'user.role.changed',
  'user.status.changed',
  'user.password.reset',
  'user.deleted',
  'user.profile.updated',
  'user.password.changed',
] as const;

/**
 * Metadata keys the audit DTO is allowed to expose. Rendering is driven by this
 * allow-list (not by whatever the response contains) so ipHash, identifierHash
 * and any future sensitive key can never reach the DOM, even if a backend
 * regression leaks one into the payload.
 */
const SAFE_METADATA_KEYS = [
  'role',
  'reason',
  'fromRole',
  'toRole',
  'fromStatus',
  'toStatus',
  'revokedSessionCount',
] as const;

const UTC_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function formatUtc(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return `${UTC_FORMAT.format(date)} UTC`;
}

/** Actor/target ids are opaque; show a short prefix, never a username. */
function shortId(id: string | null): string {
  if (!id) {
    return '—';
  }
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function safeMetadata(
  metadata: Record<string, string | number>,
): Array<{ key: string; value: string }> {
  const entries: Array<{ key: string; value: string }> = [];
  for (const key of SAFE_METADATA_KEYS) {
    const value = metadata[key];
    if (typeof value === 'string' || typeof value === 'number') {
      entries.push({ key, value: String(value) });
    }
  }
  return entries;
}

export function AuditLogPage() {
  const [eventType, setEventType] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<AdminAuditEvent> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetchAuditEvents({ ...(eventType ? { eventType } : {}), page, perPage: PER_PAGE })
      .then((result) => {
        if (!active) return;
        setData(result);
        setLoading(false);
      })
      .catch((caught) => {
        if (!active) return;
        if (caught instanceof ApiError && caught.status === 403) {
          setDenied(true);
        } else {
          setError(actionErrorMessage(caught));
        }
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [eventType, page, reloadKey]);

  if (denied) {
    return (
      <>
        <PageHeader eyebrow="Administration" title="Audit Log" />
        <EmptyState
          title="No audit log access"
          message="Your account does not have permission to view the audit log."
        />
      </>
    );
  }

  const total = data?.pagination.total ?? 0;
  const totalPages = Math.max(1, data?.pagination.totalPages ?? 1);

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Audit Log"
        description="Security-relevant authentication and user events. Times are shown in UTC."
      />

      <div className="tablenav">
        <div className="alignleft">
          <span className="displaying-num">{pluralize(total, 'event')}</span>
        </div>
        <div className="alignright">
          <div className="field audit-filter">
            <label htmlFor="audit-event-type">Event type</label>
            <select
              id="audit-event-type"
              value={eventType}
              onChange={(event) => {
                setEventType(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All event types</option>
              {AUDIT_EVENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error ? (
        <ErrorState
          title="Could not load audit events"
          message={error}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : loading ? (
        <Skeleton label="Loading audit events…" lines={5} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="No audit events found"
          message={
            eventType
              ? 'No events of the selected type were recorded.'
              : 'No security events have been recorded yet.'
          }
        />
      ) : (
        <>
          <div className="table-scroll">
            <table className="content-table widefat fixed striped audit">
              <caption className="screen-reader-text">Audit log</caption>
              <thead>
                <tr>
                  <th scope="col">Time (UTC)</th>
                  <th scope="col">Event</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Target</th>
                  <th scope="col">Details</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => {
                  const metadata = safeMetadata(item.metadata);
                  return (
                    <tr key={item.id}>
                      <td className="column-time">{formatUtc(item.createdAt)}</td>
                      <td className="column-event">
                        <span className="row-title">{item.eventType}</span>
                      </td>
                      <td className="column-actor">{shortId(item.actorUserId)}</td>
                      <td className="column-target">{shortId(item.targetUserId)}</td>
                      <td className="column-details">
                        {metadata.length === 0 ? (
                          '—'
                        ) : (
                          <span className="audit-meta">
                            {metadata.map((entry) => (
                              <span key={entry.key} className="audit-meta-item">
                                {entry.key}: {entry.value}
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <nav className="pagination" aria-label="Audit log pagination">
            <div className="tablenav-pages">
              <span className="displaying-num">{pluralize(total, 'event')}</span>
              <span className="pagination-links">
                <button
                  type="button"
                  className="button secondary-button pagination-button prev"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  « Previous
                </button>
                <span className="page-numbers current">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  className="button secondary-button pagination-button next"
                  disabled={page >= totalPages}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next »
                </button>
              </span>
            </div>
          </nav>
        </>
      )}
    </>
  );
}

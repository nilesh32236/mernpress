import { useEffect, useState, type FormEvent } from 'react';
import {
  actionErrorMessage,
  cancelJob,
  fetchJobs,
  runJob,
  type JobListResult,
  type JobStatus,
} from './api.js';
import {
  ErrorState,
  Notice,
  PageHeader,
  Pagination,
  Skeleton,
  type NoticeMessage,
} from './components.js';
import { formatDateTime } from './format.js';

const STATUSES: Array<{ value: JobStatus | ''; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'RUNNING', label: 'Running' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const STATUS_CLASS: Record<JobStatus, string> = {
  PENDING: 'is-pending',
  RUNNING: 'is-running',
  COMPLETED: 'is-completed',
  FAILED: 'is-failed',
  CANCELLED: 'is-cancelled',
};

/**
 * Tools → Scheduled Actions (ADR 0054).
 *
 * Durable background jobs such as the notes/analytics retention sweeps. The
 * worker runs due jobs every ~15 s; "Run now" reschedules a job immediately and
 * "Cancel" stops a pending/failed job.
 */
export function JobsPage() {
  const [data, setData] = useState<JobListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [status, setStatus] = useState<JobStatus | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchJobs({ status, search, page, perPage: 20 })
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
  }, [status, search, page, reloadKey]);

  function applyFilters(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  async function reschedule(id: string): Promise<void> {
    if (busy) return;
    setBusy(id);
    setNotice(null);
    try {
      await runJob(id);
      setNotice({ tone: 'success', text: 'Job rescheduled; the worker will pick it up shortly.' });
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setBusy(null);
    }
  }

  async function cancel(id: string): Promise<void> {
    if (busy) return;
    setBusy(id);
    setNotice(null);
    try {
      await cancelJob(id);
      setNotice({ tone: 'success', text: 'Job cancelled.' });
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="wp-list-screen">
      <PageHeader title="Scheduled Actions" />
      <p className="jobs-intro">
        Background jobs run in the API worker with retries and a durable queue. Retention sweeps are
        scheduled automatically; “Run now” reschedules a job for the next worker tick.
      </p>
      {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}

      <form className="tablenav jobs-toolbar" onSubmit={applyFilters}>
        <div className="alignleft">
          <label htmlFor="jobs-status" className="screen-reader-text">
            Filter by status
          </label>
          <select
            id="jobs-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as JobStatus | '');
              setPage(1);
            }}
          >
            {STATUSES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
          <label htmlFor="jobs-search" className="screen-reader-text">
            Search by hook
          </label>
          <input
            id="jobs-search"
            type="search"
            placeholder="Search hook…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <button type="submit" className="button secondary-button">
            Filter
          </button>
        </div>
        <div className="alignright">
          <span className="displaying-num">
            {data ? `${data.pagination.total} scheduled action(s)` : ''}
          </span>
        </div>
      </form>

      {loading && data === null ? (
        <Skeleton lines={5} />
      ) : error ? (
        <ErrorState
          title="Scheduled actions are unavailable"
          message={error}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : data ? (
        <>
          <div className="table-scroll">
            <table className="content-table widefat fixed striped jobs-table jobs">
              <caption className="screen-reader-text">Background jobs</caption>
              <thead>
                <tr>
                  <th scope="col" className="column-hook">
                    Hook
                  </th>
                  <th scope="col" className="column-status">
                    Status
                  </th>
                  <th scope="col" className="column-attempts">
                    Attempts
                  </th>
                  <th scope="col" className="column-scheduled">
                    Scheduled
                  </th>
                  <th scope="col" className="column-error">
                    Last error
                  </th>
                  <th scope="col" className="column-actions">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No scheduled actions match this filter.</td>
                  </tr>
                ) : (
                  data.items.map((job) => (
                    <tr key={job.id}>
                      <td className="column-hook">
                        <code>{job.type}</code>
                      </td>
                      <td className="column-status">
                        <span className={`job-status ${STATUS_CLASS[job.status]}`}>
                          {job.status.toLowerCase()}
                        </span>
                      </td>
                      <td className="column-attempts">
                        {job.attempts}/{job.maxAttempts}
                      </td>
                      <td className="column-scheduled">{formatDateTime(job.scheduledAt)}</td>
                      <td className="column-error jobs-error" title={job.lastError ?? undefined}>
                        {job.lastError ?? '—'}
                      </td>
                      <td className="column-actions">
                        <div className="job-actions">
                          <button
                            type="button"
                            className="button-link"
                            onClick={() => void reschedule(job.id)}
                            disabled={busy !== null || job.status === 'RUNNING'}
                            aria-label={`Run now: ${job.type}`}
                          >
                            Run now
                          </button>
                          {job.status === 'PENDING' || job.status === 'FAILED' ? (
                            <button
                              type="button"
                              className="button-link is-danger"
                              onClick={() => void cancel(job.id)}
                              disabled={busy !== null}
                              aria-label={`Cancel: ${job.type}`}
                            >
                              Cancel
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            total={data.pagination.total}
            singular="scheduled action"
            plural="scheduled actions"
            ariaLabel="Scheduled actions pagination"
            onChange={setPage}
          />
        </>
      ) : null}
    </div>
  );
}

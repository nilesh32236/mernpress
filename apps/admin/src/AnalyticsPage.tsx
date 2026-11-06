import { useEffect, useState } from 'react';
import { actionErrorMessage, fetchAnalytics, type AnalyticsSummary } from './api.js';
import { ErrorState, PageHeader, Skeleton } from './components.js';

/** `?days=30` is shareable/bookmarkable; anything else falls back to 7. */
export function analyticsDaysFromLocation(search: string): 7 | 30 {
  return new URLSearchParams(search).get('days') === '30' ? 30 : 7;
}

/** Keep the period in the URL without adding a history entry per switch. */
function writeDaysToLocation(days: 7 | 30): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  params.set('days', String(days));
  window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
}

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

function dayLabel(day: string): string {
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? day : dayFormatter.format(parsed);
}

/** Only same-site absolute paths become links; stored paths are untrusted input. */
function isSitePath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//');
}

function isHostname(host: string): boolean {
  return /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?$/i.test(host);
}

/**
 * Dashboard → Analytics.
 *
 * Own-site aggregate page views: no cookies, no visitor ids, no IP addresses.
 * The numbers come from the public beacon and are intentionally directional.
 * The selected period lives in `?days=`, and switching it keeps the previous
 * numbers visible while the new window loads.
 */
export function AnalyticsPage() {
  const [days, setDays] = useState<7 | 30>(() =>
    analyticsDaysFromLocation(typeof window === 'undefined' ? '' : window.location.search),
  );
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchAnalytics(days)
      .then((summary) => {
        if (active) setData(summary);
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
  }, [days, reloadKey]);

  function chooseDays(next: 7 | 30): void {
    setDays(next);
    writeDaysToLocation(next);
  }

  const maxDaily = Math.max(1, ...(data?.daily.map((entry) => entry.views) ?? [1]));
  const initialLoading = loading && data === null;
  const unavailable = error !== null && data === null;

  return (
    <div className="analytics-screen">
      <PageHeader title="Analytics" />
      <p className="analytics-privacy">
        Aggregate only: no cookies, no visitor identifiers and no stored IP addresses. API, admin
        and static-file requests are not recorded, and Do-Not-Track is honoured by the beacon. Old
        aggregate rows may be pruned according to Settings → Privacy.
      </p>

      <div className="analytics-toolbar">
        <label className="analytics-range">
          <span>Period</span>
          <select
            aria-label="Analytics period"
            value={days}
            onChange={(event) => chooseDays(Number(event.target.value) === 30 ? 30 : 7)}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        </label>
        {loading && data !== null ? (
          <span className="analytics-updating" role="status">
            Updating…
          </span>
        ) : null}
      </div>

      {initialLoading ? (
        <Skeleton lines={6} />
      ) : unavailable ? (
        <ErrorState
          title="Analytics are unavailable"
          message={error ?? 'Analytics are unavailable.'}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : data ? (
        <div className="analytics-content" aria-busy={loading}>
          {error ? (
            <p className="form-error analytics-inline-error" role="alert">
              {error}{' '}
              <button
                type="button"
                className="button-link"
                onClick={() => setReloadKey((value) => value + 1)}
              >
                Retry
              </button>
            </p>
          ) : null}

          <div className="analytics-cards">
            <section className="analytics-card" aria-label="Views">
              <span className="analytics-card-label">Views</span>
              <strong>{data.totalViews.toLocaleString()}</strong>
              <span className="analytics-card-help">in the last {data.days} days</span>
            </section>
            <section className="analytics-card" aria-label="Pages viewed">
              <span className="analytics-card-label">Pages viewed</span>
              <strong>{data.uniquePaths.toLocaleString()}</strong>
              <span className="analytics-card-help">distinct paths</span>
            </section>
            <section className="analytics-card" aria-label="Daily average">
              <span className="analytics-card-label">Daily average</span>
              <strong>{Math.round(data.totalViews / data.days).toLocaleString()}</strong>
              <span className="analytics-card-help">views per day</span>
            </section>
          </div>

          <div className="analytics-grid">
            <section
              className="analytics-panel analytics-panel-wide"
              aria-labelledby="analytics-daily-heading"
            >
              <h2 id="analytics-daily-heading">Views per day</h2>
              {data.totalViews === 0 ? (
                <p className="field-help">No page views in this period.</p>
              ) : (
                <ol className="analytics-bars">
                  {data.daily.map((entry) => (
                    <li key={entry.day}>
                      <span className="analytics-bar-day">{dayLabel(entry.day)}</span>
                      <span className="analytics-bar-track">
                        <span
                          className="analytics-bar-fill"
                          style={{ width: `${Math.round((entry.views / maxDaily) * 100)}%` }}
                        />
                      </span>
                      <span className="analytics-bar-value">{entry.views.toLocaleString()}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="analytics-panel" aria-labelledby="analytics-paths-heading">
              <h2 id="analytics-paths-heading">Top pages</h2>
              {data.topPaths.length === 0 ? (
                <p className="field-help">No page views in this period.</p>
              ) : (
                <table className="analytics-table">
                  <caption className="screen-reader-text">Top pages by views</caption>
                  <thead>
                    <tr>
                      <th scope="col">Path</th>
                      <th scope="col">Views</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topPaths.map((entry) => (
                      <tr key={entry.path}>
                        <td title={entry.path}>
                          {isSitePath(entry.path) ? (
                            <a href={entry.path}>{entry.path}</a>
                          ) : (
                            entry.path
                          )}
                        </td>
                        <td>{entry.views.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="analytics-panel" aria-labelledby="analytics-refs-heading">
              <h2 id="analytics-refs-heading">Referrers</h2>
              {data.topReferrers.length === 0 ? (
                <p className="field-help">No external referrers in this period.</p>
              ) : (
                <table className="analytics-table">
                  <caption className="screen-reader-text">External referrers by views</caption>
                  <thead>
                    <tr>
                      <th scope="col">Host</th>
                      <th scope="col">Views</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topReferrers.map((entry) => (
                      <tr key={entry.host}>
                        <td>
                          {isHostname(entry.host) ? (
                            <a
                              href={`https://${entry.host}`}
                              target="_blank"
                              rel="noreferrer noopener"
                            >
                              {entry.host}
                            </a>
                          ) : (
                            entry.host
                          )}
                        </td>
                        <td>{entry.views.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}

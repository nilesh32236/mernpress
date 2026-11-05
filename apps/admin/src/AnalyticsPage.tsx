import { useEffect, useState } from 'react';
import { actionErrorMessage, fetchAnalytics, type AnalyticsSummary } from './api.js';
import { ErrorState, PageHeader, Skeleton } from './components.js';

/**
 * Dashboard → Analytics.
 *
 * Own-site aggregate page views: no cookies, no visitor ids, no IP addresses.
 * The numbers come from the public beacon and are intentionally directional.
 */
export function AnalyticsPage() {
  const [days, setDays] = useState<7 | 30>(7);
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

  const maxDaily = Math.max(1, ...(data?.daily.map((entry) => entry.views) ?? [1]));

  return (
    <div className="analytics-screen">
      <PageHeader
        title="Analytics"
        actions={
          <label className="analytics-range">
            <span>Period</span>
            <select
              aria-label="Analytics period"
              value={days}
              onChange={(event) => setDays(Number(event.target.value) === 30 ? 30 : 7)}
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
            </select>
          </label>
        }
      />
      <p className="analytics-privacy">
        Aggregate only: no cookies, no visitor identifiers and no stored IP addresses. API, admin
        and static-file requests are not recorded, and Do-Not-Track is honoured by the beacon.
      </p>

      {loading ? (
        <Skeleton lines={6} />
      ) : error ? (
        <ErrorState
          title="Analytics are unavailable"
          message={error}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : data ? (
        <>
          <div className="analytics-cards">
            <section className="analytics-card" aria-label="Views">
              <span className="analytics-card-label">Views</span>
              <strong>{data.totalViews.toLocaleString()}</strong>
              <span className="analytics-card-help">in the last {data.days} days</span>
            </section>
            <section className="analytics-card" aria-label="Pages">
              <span className="analytics-card-label">Pages viewed</span>
              <strong>{data.uniquePaths.toLocaleString()}</strong>
              <span className="analytics-card-help">distinct paths</span>
            </section>
            <section className="analytics-card" aria-label="Average">
              <span className="analytics-card-label">Daily average</span>
              <strong>{Math.round(data.totalViews / data.days).toLocaleString()}</strong>
              <span className="analytics-card-help">views per day</span>
            </section>
          </div>

          <div className="analytics-grid">
            <section className="analytics-panel" aria-labelledby="analytics-daily-heading">
              <h2 id="analytics-daily-heading">Views per day</h2>
              {data.totalViews === 0 ? (
                <p className="field-help">No page views recorded yet.</p>
              ) : (
                <ol className="analytics-bars">
                  {data.daily.map((entry) => (
                    <li key={entry.day}>
                      <span className="analytics-bar-day">{entry.day.slice(5)}</span>
                      <span className="analytics-bar-track">
                        <span
                          className="analytics-bar-fill"
                          style={{ width: `${Math.round((entry.views / maxDaily) * 100)}%` }}
                        />
                      </span>
                      <span className="analytics-bar-value">{entry.views}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="analytics-panel" aria-labelledby="analytics-paths-heading">
              <h2 id="analytics-paths-heading">Top pages</h2>
              {data.topPaths.length === 0 ? (
                <p className="field-help">Nothing recorded yet.</p>
              ) : (
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th>Path</th>
                      <th>Views</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topPaths.map((entry) => (
                      <tr key={entry.path}>
                        <td title={entry.path}>{entry.path}</td>
                        <td>{entry.views}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="analytics-panel" aria-labelledby="analytics-refs-heading">
              <h2 id="analytics-refs-heading">Referrers</h2>
              {data.topReferrers.length === 0 ? (
                <p className="field-help">No external referrers recorded.</p>
              ) : (
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th>Host</th>
                      <th>Views</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topReferrers.map((entry) => (
                      <tr key={entry.host}>
                        <td>{entry.host}</td>
                        <td>{entry.views}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}

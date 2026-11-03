import { useEffect, useState } from 'react';
import {
  actionErrorMessage,
  fetchPosts,
  fetchSiteHealth,
  type AdminPost,
  type SiteHealth,
} from './api.js';
import { Notice, PageHeader, type NoticeMessage } from './components.js';
import { useLocation } from './router.js';

interface ExportItem {
  id: string;
  type: string;
  title: string;
  slug: string;
  status: string;
  excerpt: string | null;
  content: string;
  publishedAt: string | null;
  updatedAt: string;
}

export function ToolsPage() {
  const location = useLocation();
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [health, setHealth] = useState<SiteHealth | null>(null);

  useEffect(() => {
    let active = true;
    fetchSiteHealth()
      .then((result) => {
        if (active) setHealth(result);
      })
      .catch(() => {
        if (active) setHealth(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const section = new URLSearchParams(location.search).get('section');
    if (section) {
      window.setTimeout(() => {
        document.getElementById(section)?.scrollIntoView({ block: 'start' });
      }, 0);
    }
  }, [location.search]);

  async function exportContent(): Promise<void> {
    if (exporting) return;
    setExporting(true);
    setNotice(null);
    try {
      const items: ExportItem[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const result = await fetchPosts({ page, perPage: 100 });
        items.push(
          ...result.items.map((post: AdminPost) => ({
            id: post.id,
            type: post.type,
            title: post.title,
            slug: post.slug,
            status: post.status,
            excerpt: post.excerpt,
            content: post.content,
            publishedAt: post.publishedAt,
            updatedAt: post.updatedAt,
          })),
        );
        totalPages = result.pagination.totalPages;
        page += 1;
      } while (page <= totalPages && page <= 50);

      const blob = new Blob(
        [JSON.stringify({ exportedAt: new Date().toISOString(), items }, null, 2)],
        { type: 'application/json' },
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mernpress-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice({ tone: 'success', text: `Exported ${items.length} item(s).` });
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageHeader title="Tools" />
      {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}

      <section id="export" className="content-card tools-section" aria-labelledby="export-heading">
        <h2 id="export-heading">Export</h2>
        <p className="lede">
          Export your posts and pages as a JSON file. The export includes canonical block markup so
          it can be archived or imported elsewhere.
        </p>
        <fieldset className="tools-choice">
          <legend>Choose what to export</legend>
          <label className="checkbox-row">
            <input type="radio" name="export-content" value="all" defaultChecked />
            <span>All content</span>
          </label>
        </fieldset>
        <p>
          <button
            type="button"
            className="button primary-button"
            onClick={() => void exportContent()}
            disabled={exporting}
            aria-busy={exporting}
          >
            {exporting ? 'Preparing export…' : 'Download Export File'}
          </button>
        </p>
      </section>

      <section id="health" className="content-card tools-section" aria-labelledby="health-heading">
        <h2 id="health-heading">Site Health</h2>
        <p className="lede">Server and storage checks for this installation.</p>
        {health === null ? (
          <p className="field-help">Health checks are unavailable.</p>
        ) : (
          <table className="widefat fixed striped tools-health">
            <tbody>
              <tr>
                <td>Database connection</td>
                <td>
                  <span className={health.database === 'ok' ? 'health-pass' : 'health-critical'}>
                    {health.database === 'ok' ? 'Good' : 'Critical'}
                  </span>
                </td>
              </tr>
              <tr>
                <td>Media storage writable</td>
                <td>
                  <span className={health.mediaWritable ? 'health-pass' : 'health-critical'}>
                    {health.mediaWritable ? 'Good' : 'Critical'}
                  </span>
                </td>
              </tr>
              <tr>
                <td>Scheduled publishing</td>
                <td>
                  <span className={health.schedulerEnabled ? 'health-pass' : 'health-warning'}>
                    {health.schedulerEnabled ? 'Good' : 'Disabled'}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

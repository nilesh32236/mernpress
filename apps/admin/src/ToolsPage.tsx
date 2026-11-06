import { useEffect, useState } from 'react';
import {
  actionErrorMessage,
  convertTerms,
  downloadExport,
  fetchSiteHealth,
  fetchTerms,
  fetchUsers,
  type AdminTerm,
  type AdminUser,
  type ExportFilters,
  type ExportScope,
  type ExportStatus,
  type SiteHealth,
  type TaxonomyType,
} from './api.js';
import { Notice, PageHeader, type NoticeMessage } from './components.js';
import { navigate, useLocation } from './router.js';

export function ToolsPage() {
  const location = useLocation();
  const [exporting, setExporting] = useState(false);
  const [exportScope, setExportScope] = useState<ExportScope>('all');
  const [exportAuthor, setExportAuthor] = useState('');
  const [exportCategory, setExportCategory] = useState('');
  const [exportStart, setExportStart] = useState('');
  const [exportEnd, setExportEnd] = useState('');
  const [exportStatus, setExportStatus] = useState<'' | ExportStatus>('');
  const [exportAuthors, setExportAuthors] = useState<AdminUser[]>([]);
  const [exportCategories, setExportCategories] = useState<AdminTerm[]>([]);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [health, setHealth] = useState<SiteHealth | null>(null);
  const [converting, setConverting] = useState(false);

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
    let active = true;
    fetchUsers({ perPage: 100 })
      .then((result) => {
        if (active) setExportAuthors(result.items);
      })
      .catch(() => {
        if (active) setExportAuthors([]);
      });
    fetchTerms({ taxonomy: 'category', perPage: 100 })
      .then((result) => {
        if (active) setExportCategories(result.items);
      })
      .catch(() => {
        if (active) setExportCategories([]);
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
    if (exportStart && exportEnd && exportStart > exportEnd) {
      setNotice({ tone: 'error', text: 'The start date must be on or before the end date.' });
      return;
    }
    const filters: ExportFilters = {};
    if (exportScope !== 'media') {
      if (exportAuthor) filters.author = exportAuthor;
      if (exportStart) filters.startDate = exportStart;
      if (exportEnd) filters.endDate = exportEnd;
      if (exportStatus) filters.status = exportStatus;
      if (exportCategory && exportScope !== 'pages') filters.category = exportCategory;
    }
    setExporting(true);
    setNotice(null);
    try {
      await downloadExport(exportScope, filters);
      setNotice({ tone: 'success', text: 'Export file downloaded.' });
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setExporting(false);
    }
  }

  async function convert(from: TaxonomyType): Promise<void> {
    if (converting) return;
    const label = from === 'category' ? 'categories to tags' : 'tags to categories';
    if (!window.confirm(`Convert all ${label}? This cannot be undone.`)) {
      return;
    }
    setConverting(true);
    setNotice(null);
    try {
      const result = await convertTerms(from);
      setNotice({
        tone: 'success',
        text: `Converted ${result.converted} ${from === 'category' ? 'categories' : 'tags'} to ${from === 'category' ? 'tags' : 'categories'} (${result.movedPosts} post links moved).`,
      });
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setConverting(false);
    }
  }

  const section = new URLSearchParams(location.search).get('section');

  if (section !== 'export' && section !== 'health') {
    return (
      <>
        <PageHeader title="Tools" />
        {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}
        <div className="wp-tools-grid">
          <section className="card" aria-labelledby="tool-export-heading">
            <h2 id="tool-export-heading">Export</h2>
            <p>
              Download your content as a WordPress eXtended RSS (WXR) XML file. It can be imported
              into WordPress or back into MERNPress.
            </p>
            <p>
              <button
                type="button"
                className="button"
                onClick={() => navigate('/tools?section=export')}
              >
                Open Export
              </button>
            </p>
          </section>
          <section className="card" aria-labelledby="tool-redirects-heading">
            <h2 id="tool-redirects-heading">Redirects</h2>
            <p>Manage 301/302 redirects and review paths that returned 404 on the public site.</p>
            <p>
              <button type="button" className="button" onClick={() => navigate('/tools/redirects')}>
                Open Redirects
              </button>
            </p>
          </section>
          <section className="card" aria-labelledby="tool-jobs-heading">
            <h2 id="tool-jobs-heading">Scheduled Actions</h2>
            <p>
              Inspect the durable background queue, retry a failed retention sweep or cancel a
              pending job.
            </p>
            <p>
              <button type="button" className="button" onClick={() => navigate('/tools/jobs')}>
                Open Scheduled Actions
              </button>
            </p>
          </section>

          <section className="card" aria-labelledby="tool-backups-heading">
            <h2 id="tool-backups-heading">Backups</h2>
            <p>
              Create a database and media archive, download it, and review the retention policy.
              Restore is a documented command-line procedure.
            </p>
            <p>
              <button type="button" className="button" onClick={() => navigate('/tools/backups')}>
                Open Backups
              </button>
            </p>
          </section>
          <section className="card" aria-labelledby="tool-health-heading">
            <h2 id="tool-health-heading">Site Health</h2>
            <p>Server and storage checks for this installation.</p>
            <p>
              <button
                type="button"
                className="button"
                onClick={() => navigate('/tools?section=health')}
              >
                Open Site Health
              </button>
            </p>
          </section>
          <section className="card" aria-labelledby="tool-convert-heading">
            <h2 id="tool-convert-heading">Categories and Tags Converter</h2>
            <p>
              Convert all categories to tags or all tags to categories. Posts keep their content.
            </p>
            <p>
              <button
                type="button"
                className="button"
                disabled={converting}
                onClick={() => void convert('category')}
              >
                Convert categories to tags
              </button>
            </p>
            <p>
              <button
                type="button"
                className="button"
                disabled={converting}
                onClick={() => void convert('tag')}
              >
                Convert tags to categories
              </button>
            </p>
          </section>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={section === 'export' ? 'Export' : 'Site Health'} />
      {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}

      <section
        id="export"
        className="content-card tools-section"
        aria-labelledby="export-heading"
        hidden={section !== 'export'}
      >
        <p>
          When you click the button below MERNPress will create an XML file for you to save to your
          computer.
        </p>
        <p>
          This format, which is called WordPress eXtended RSS or WXR, will contain your posts,
          pages, comments, categories and tags. Media attachments are included when you export all
          content or media.
        </p>
        <p>
          Once you&rsquo;ve saved the download file, you can use the Import function in another
          MERNPress or WordPress installation to import the content from this site.
        </p>
        <h2 id="export-heading">Choose what to export</h2>
        <fieldset className="tools-choice">
          <legend>Content to export</legend>
          <label className="checkbox-row">
            <input
              type="radio"
              name="export-content"
              value="all"
              checked={exportScope === 'all'}
              onChange={() => setExportScope('all')}
            />
            <span>All content</span>
          </label>
          {exportScope === 'all' ? (
            <p className="field-help">
              This will contain all of your posts, pages, comments, custom fields, terms, navigation
              menus, and custom posts.
            </p>
          ) : null}
          {(
            [
              ['posts', 'Posts'],
              ['pages', 'Pages'],
              ['media', 'Media'],
            ] as const
          ).map(([value, label]) => (
            <label className="checkbox-row" key={value}>
              <input
                type="radio"
                name="export-content"
                value={value}
                checked={exportScope === value}
                onChange={() => setExportScope(value)}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
        {exportScope !== 'media' ? (
          <fieldset className="tools-choice export-filters">
            <legend>
              {exportScope === 'posts'
                ? 'Posts'
                : exportScope === 'pages'
                  ? 'Pages'
                  : 'Posts and pages'}
            </legend>
            <div className="export-filter-grid">
              <label className="export-filter">
                <span>Authors</span>
                <select
                  value={exportAuthor}
                  onChange={(event) => setExportAuthor(event.target.value)}
                >
                  <option value="">All authors</option>
                  {exportAuthors.map((author) => (
                    <option key={author.id} value={author.id}>
                      {author.displayName?.trim() || author.username}
                    </option>
                  ))}
                </select>
              </label>
              {exportScope !== 'pages' ? (
                <label className="export-filter">
                  <span>Categories</span>
                  <select
                    value={exportCategory}
                    onChange={(event) => setExportCategory(event.target.value)}
                  >
                    <option value="">All categories</option>
                    {exportCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="export-filter">
                <span>Start date</span>
                <input
                  type="date"
                  value={exportStart}
                  onChange={(event) => setExportStart(event.target.value)}
                />
              </label>
              <label className="export-filter">
                <span>End date</span>
                <input
                  type="date"
                  value={exportEnd}
                  onChange={(event) => setExportEnd(event.target.value)}
                />
              </label>
              <label className="export-filter">
                <span>Status</span>
                <select
                  value={exportStatus}
                  onChange={(event) => setExportStatus(event.target.value as '' | ExportStatus)}
                >
                  <option value="">All statuses</option>
                  <option value="publish">Published</option>
                  <option value="draft">Drafts</option>
                  <option value="private">Private</option>
                  <option value="future">Scheduled</option>
                </select>
              </label>
            </div>
            <p className="field-help">
              Filters apply to the posts and pages in this export. Dates are UTC; the category
              filter applies to posts only.
            </p>
          </fieldset>
        ) : null}
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

      <section
        id="health"
        className="content-card tools-section"
        aria-labelledby="health-heading"
        hidden={section !== 'health'}
      >
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

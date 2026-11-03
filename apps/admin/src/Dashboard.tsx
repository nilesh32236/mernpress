import { useEffect, useState } from 'react';
import {
  createPost,
  fetchPosts,
  fetchSiteHealth,
  type AdminPost,
  type AuthUser,
  type ContentType,
  type PostStatus,
  type SiteHealth,
} from './api.js';
import { EmptyState, ErrorState, Skeleton } from './components.js';
import { canCreateContent, canManageTerms, canReadContent } from './roles.js';
import { editContentPath, listPath, navigate, newContentPath } from './router.js';

type Counts = Record<ContentType, Record<PostStatus, number>>;

const EMPTY_COUNTS: Counts = {
  post: { DRAFT: 0, PUBLISHED: 0, TRASHED: 0 },
  page: { DRAFT: 0, PUBLISHED: 0, TRASHED: 0 },
};

const STATUSES: PostStatus[] = ['PUBLISHED', 'DRAFT', 'TRASHED'];

function ChipIcon({ kind }: { kind: string }) {
  const props = {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  } as const;
  switch (kind) {
    case 'published':
      return (
        <svg {...props}>
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      );
    case 'draft':
      return (
        <svg {...props}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      );
    case 'trash':
      return (
        <svg {...props}>
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      );
    case 'pages':
      return (
        <svg {...props}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
    case 'clock':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
  }
}

export function Dashboard({ user }: { user: AuthUser }) {
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [recent, setRecent] = useState<AdminPost[]>([]);
  const [health, setHealth] = useState<SiteHealth | null>(null);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickBody, setQuickBody] = useState('');
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickNotice, setQuickNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const allowed = canReadContent(user);
  const creator = canCreateContent(user);
  const termer = canManageTerms(user);

  useEffect(() => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);

    const requests = (['post', 'page'] as ContentType[]).flatMap((type) =>
      STATUSES.map((status) =>
        fetchPosts({
          type,
          status,
          page: 1,
          // One query doubles as the Activity feed: the newest published posts.
          perPage: type === 'post' && status === 'PUBLISHED' ? 5 : 1,
          ...(type === 'post' && status === 'PUBLISHED'
            ? { sort: 'publishedAt' as const, order: 'desc' as const }
            : {}),
        }).then((result) => ({
          type,
          status,
          total: result.pagination.total,
          items: result.items,
        })),
      ),
    );

    Promise.all(requests)
      .then((results) => {
        if (!active) return;
        const next: Counts = {
          post: { DRAFT: 0, PUBLISHED: 0, TRASHED: 0 },
          page: { DRAFT: 0, PUBLISHED: 0, TRASHED: 0 },
        };
        for (const result of results) {
          next[result.type][result.status] = result.total;
          if (result.type === 'post' && result.status === 'PUBLISHED') {
            setRecent(result.items);
          }
        }
        setCounts(next);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError('Could not load content counts. Check the API connection and try again.');
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [allowed, reloadKey]);

  useEffect(() => {
    if (!allowed) return;
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
  }, [allowed]);

  function escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function saveQuickDraft(): Promise<void> {
    const title = quickTitle.trim();
    if (!title || quickBusy) return;
    setQuickBusy(true);
    setQuickNotice(null);
    try {
      const body = quickBody.trim();
      const content = body
        ? `<!-- wp:paragraph -->\n<p>${escapeHtml(body)}</p>\n<!-- /wp:paragraph -->`
        : '';
      const created = await createPost({ type: 'post', title, content });
      setQuickTitle('');
      setQuickBody('');
      navigate(`/posts/${created.id}/edit`);
    } catch {
      setQuickNotice('Could not save the draft. Try again.');
    } finally {
      setQuickBusy(false);
    }
  }

  if (!allowed) {
    return (
      <>
        <div className="dash-title-row">
          <span className="title-badge" aria-hidden="true">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="7" height="9" />
              <rect x="14" y="3" width="7" height="5" />
              <rect x="14" y="12" width="7" height="9" />
              <rect x="3" y="16" width="7" height="5" />
            </svg>
          </span>
          <h1>Dashboard</h1>
        </div>
        <EmptyState
          title="No content access"
          message="Subscribers cannot read or manage content. Ask an administrator if you need an editorial role."
        />
      </>
    );
  }

  const postTotal = counts.post.DRAFT + counts.post.PUBLISHED + counts.post.TRASHED;
  const pageTotal = counts.page.DRAFT + counts.page.PUBLISHED + counts.page.TRASHED;

  return (
    <>
      <div className="dash-title-row">
        <span className="title-badge" aria-hidden="true">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="7" height="9" />
            <rect x="14" y="3" width="7" height="5" />
            <rect x="14" y="12" width="7" height="9" />
            <rect x="3" y="16" width="7" height="5" />
          </svg>
        </span>
        <h1>Dashboard</h1>
      </div>

      <section className="welcome-banner" aria-labelledby="welcome-heading">
        <h2 id="welcome-heading">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3l1.9 5.8 5.8 1.9-5.8 1.9L12 18.4l-1.9-5.8L4.3 10.7l5.8-1.9z" />
            <path d="M19 15l.9 2.6 2.6.9-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z" />
          </svg>
          Welcome to MERNPress!
        </h2>
        <p>
          We&apos;ve assembled some links to get you started — write your first post with the block
          editor.
        </p>
        <div className="welcome-ctas">
          {creator ? (
            <>
              <a
                className="button primary-button"
                href={newContentPath('post')}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(newContentPath('post'));
                }}
              >
                <span aria-hidden="true">+</span> Add New Post
              </a>
              <a
                className="button primary-button"
                href={newContentPath('page')}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(newContentPath('page'));
                }}
              >
                <span aria-hidden="true">+</span> Add New Page
              </a>
            </>
          ) : null}
          <a
            className="button secondary-button"
            href={listPath('post')}
            onClick={(event) => {
              event.preventDefault();
              navigate(listPath('post'));
            }}
          >
            Manage Posts
          </a>
          {termer ? (
            <a
              className="button secondary-button"
              href="/terms"
              onClick={(event) => {
                event.preventDefault();
                navigate('/terms');
              }}
            >
              Categories &amp; Tags
            </a>
          ) : null}
        </div>
      </section>

      {error ? (
        <ErrorState
          title="Counts unavailable"
          message={error}
          onRetry={() => setReloadKey((key) => key + 1)}
        />
      ) : loading ? (
        <Skeleton label="Loading dashboard…" lines={6} />
      ) : (
        <div className="dash-grid">
          <section className="dash-card" aria-labelledby="at-a-glance-heading">
            <div className="dash-card-head">
              <h2 id="at-a-glance-heading">
                <ChipIcon kind="post" />
                At a Glance
              </h2>
            </div>
            <div className="dash-card-body glance-chips">
              <a
                className="glance-chip"
                href={listPath('post')}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(listPath('post'));
                }}
              >
                <ChipIcon kind="post" />
                <strong>{postTotal}</strong> Posts
              </a>
              <span className="glance-chip">
                <span className="chip-published" aria-hidden="true">
                  <ChipIcon kind="published" />
                </span>
                <strong>{counts.post.PUBLISHED}</strong> Published
              </span>
              <span className="glance-chip">
                <span className="chip-draft" aria-hidden="true">
                  <ChipIcon kind="draft" />
                </span>
                <strong>{counts.post.DRAFT}</strong> Drafts
              </span>
              <span className="glance-chip">
                <span className="chip-trash" aria-hidden="true">
                  <ChipIcon kind="trash" />
                </span>
                <strong>{counts.post.TRASHED}</strong> Trashed
              </span>
              <a
                className="glance-chip"
                href={listPath('page')}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(listPath('page'));
                }}
              >
                <ChipIcon kind="pages" />
                <strong>{pageTotal}</strong> Pages
              </a>
              <span className="glance-chip">
                <ChipIcon kind="published" />
                <strong>{counts.page.PUBLISHED}</strong> Pages Published
              </span>
              <span className="glance-chip">
                <ChipIcon kind="draft" />
                <strong>{counts.page.DRAFT}</strong> Pages Draft
              </span>
              <span className="glance-chip">
                <span className="chip-trash" aria-hidden="true">
                  <ChipIcon kind="trash" />
                </span>
                <strong>{counts.page.TRASHED}</strong> Pages Trashed
              </span>
            </div>
            <p className="dash-card-note">
              <ChipIcon kind="clock" />
              Site-wide totals, updated live.
            </p>
          </section>

          <section className="dash-card" aria-labelledby="activity-heading">
            <div className="dash-card-head">
              <h2 id="activity-heading">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
                Activity
              </h2>
              <a
                className="dash-card-action"
                href={listPath('post')}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(listPath('post'));
                }}
              >
                All posts <span aria-hidden="true">→</span>
              </a>
            </div>
            <div className="dash-card-body">
              {recent.length === 0 ? (
                <p className="activity-text">
                  Nothing published yet. Publish your first post to see it here.
                </p>
              ) : (
                <ul className="activity-list">
                  {recent.map((post) => (
                    <li key={post.id}>
                      <a
                        className="activity-link"
                        href={editContentPath('post', post.id)}
                        onClick={(event) => {
                          event.preventDefault();
                          navigate(editContentPath('post', post.id));
                        }}
                      >
                        {post.title}
                      </a>
                      <span className="activity-meta">
                        <span className="status-badge status-published">Published</span>
                        <time dateTime={post.publishedAt ?? undefined}>
                          {post.publishedAt
                            ? new Date(post.publishedAt).toLocaleDateString(undefined, {
                                dateStyle: 'medium',
                              })
                            : ''}
                        </time>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="dash-card" aria-labelledby="quick-draft-heading">
            <div className="dash-card-head">
              <h2 id="quick-draft-heading">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
                Quick Draft
              </h2>
            </div>
            <div className="dash-card-body quick-draft">
              <label htmlFor="quick-draft-title" className="screen-reader-text">
                Draft title
              </label>
              <input
                id="quick-draft-title"
                type="text"
                placeholder="Title"
                maxLength={300}
                value={quickTitle}
                onChange={(event) => setQuickTitle(event.target.value)}
              />
              <label htmlFor="quick-draft-body" className="screen-reader-text">
                Draft content
              </label>
              <textarea
                id="quick-draft-body"
                rows={4}
                placeholder="What's on your mind?"
                value={quickBody}
                onChange={(event) => setQuickBody(event.target.value)}
              />
              <div className="quick-draft-actions">
                <button
                  type="button"
                  className="button primary-button"
                  disabled={quickBusy || quickTitle.trim().length === 0}
                  onClick={() => void saveQuickDraft()}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M22 2 11 13" />
                    <path d="M22 2 15 22l-4-9-9-4Z" />
                  </svg>
                  {quickBusy ? 'Saving…' : 'Save Draft'}
                </button>
              </div>
              {quickNotice ? (
                <p className="field-error" role="alert">
                  {quickNotice}
                </p>
              ) : null}
            </div>
          </section>

          <section className="dash-card" aria-labelledby="site-health-heading">
            <div className="dash-card-head">
              <h2 id="site-health-heading">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
                Site Health
              </h2>
            </div>
            <div className="dash-card-body site-health">
              {health === null ? (
                <p className="field-help">Health checks are unavailable.</p>
              ) : (
                <>
                  <p className="health-overall">
                    Overall status:{' '}
                    <span
                      className={`health-pill ${
                        health.database === 'ok' && health.mediaWritable ? 'is-pass' : 'is-critical'
                      }`}
                    >
                      {health.database === 'ok' && health.mediaWritable
                        ? 'Good'
                        : 'Needs attention'}
                    </span>
                  </p>
                  <ul className="health-list">
                    <li>
                      <span>Database connection</span>
                      <span
                        className={`health-pill ${health.database === 'ok' ? 'is-pass' : 'is-critical'}`}
                      >
                        {health.database === 'ok' ? 'Pass' : 'Critical'}
                      </span>
                    </li>
                    <li>
                      <span>Media storage writable</span>
                      <span
                        className={`health-pill ${health.mediaWritable ? 'is-pass' : 'is-critical'}`}
                      >
                        {health.mediaWritable ? 'Pass' : 'Critical'}
                      </span>
                    </li>
                    <li>
                      <span>Scheduled publishing</span>
                      <span
                        className={`health-pill ${health.schedulerEnabled ? 'is-pass' : 'is-recommended'}`}
                      >
                        {health.schedulerEnabled ? 'Pass' : 'Disabled'}
                      </span>
                    </li>
                  </ul>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

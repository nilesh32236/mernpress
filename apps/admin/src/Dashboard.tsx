import { useEffect, useState, type ReactNode } from 'react';
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
import {
  DASHBOARD_COLUMNS_EVENT,
  DASHBOARD_WIDGETS_EVENT,
  dashboardColumns,
  dashboardHiddenWidgets,
  type DashboardColumns,
} from './screenOptions.js';

type Counts = Record<ContentType, Record<PostStatus, number>>;

const EMPTY_COUNTS: Counts = {
  post: { DRAFT: 0, PUBLISHED: 0, TRASHED: 0 },
  page: { DRAFT: 0, PUBLISHED: 0, TRASHED: 0 },
};

const STATUSES: PostStatus[] = ['PUBLISHED', 'DRAFT', 'TRASHED'];

type WidgetKey = 'siteHealth' | 'glance' | 'activity' | 'quickDraft';

const WIDGET_IDS: Record<WidgetKey, string> = {
  siteHealth: 'dashboard_site_health',
  glance: 'dashboard_right_now',
  activity: 'dashboard_activity',
  quickDraft: 'dashboard_quick_press',
};

const WIDGET_TITLES: Record<WidgetKey, string> = {
  siteHealth: 'Site Health Status',
  glance: 'At a Glance',
  activity: 'Activity',
  quickDraft: 'Quick Draft',
};

function formatActivityDate(value: string | null): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const now = new Date();
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const hours12 = hours % 12 === 0 ? 12 : hours % 12;
  const time = `${hours12}:${minutes} ${hours < 12 ? 'am' : 'pm'}`;
  if (date.toDateString() === now.toDateString()) {
    return `Today, ${time}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday, ${time}`;
  }
  const day = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
  return `${day}, ${time}`;
}

function Postbox({
  id,
  title,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  children,
}: {
  id: string;
  title: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div id={id} className={`postbox${open ? '' : ' closed'}`}>
      <div className="postbox-header">
        <h2 className="hndle">{title}</h2>
        <div className="handle-actions hide-if-no-js">
          <button
            type="button"
            className="handle-order-higher"
            aria-disabled={!canMoveUp}
            aria-label={`Move ${title} box up`}
            onClick={canMoveUp ? onMoveUp : undefined}
          >
            <span className="dashicons dashicons-arrow-up-alt2" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="handle-order-lower"
            aria-disabled={!canMoveDown}
            aria-label={`Move ${title} box down`}
            onClick={canMoveDown ? onMoveDown : undefined}
          >
            <span className="dashicons dashicons-arrow-down-alt2" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="handlediv"
            aria-expanded={open}
            aria-label={`Toggle panel: ${title}`}
            onClick={() => setOpen((value) => !value)}
          >
            <span
              className={`dashicons ${open ? 'dashicons-arrow-up' : 'dashicons-arrow-down'}`}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
      {open ? <div className="inside">{children}</div> : null}
    </div>
  );
}

export function Dashboard({ user }: { user: AuthUser }) {
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [recent, setRecent] = useState<AdminPost[]>([]);
  const [health, setHealth] = useState<SiteHealth | null>(null);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickBody, setQuickBody] = useState('');
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickNotice, setQuickNotice] = useState<string | null>(null);
  const [welcomeDismissed, setWelcomeDismissed] = useState(() => {
    try {
      return window.localStorage.getItem('mernpress-welcome-dismissed') === '1';
    } catch {
      return false;
    }
  });
  const [leftOrder, setLeftOrder] = useState<WidgetKey[]>(['siteHealth', 'glance', 'activity']);
  const [rightOrder] = useState<WidgetKey[]>(['quickDraft']);
  const [hiddenWidgets, setHiddenWidgets] = useState(() => dashboardHiddenWidgets());
  const [columns, setColumns] = useState<DashboardColumns>(() => dashboardColumns());

  useEffect(() => {
    const sync = () => {
      setHiddenWidgets(dashboardHiddenWidgets());
      setColumns(dashboardColumns());
    };
    window.addEventListener(DASHBOARD_WIDGETS_EVENT, sync);
    window.addEventListener(DASHBOARD_COLUMNS_EVENT, sync);
    return () => {
      window.removeEventListener(DASHBOARD_WIDGETS_EVENT, sync);
      window.removeEventListener(DASHBOARD_COLUMNS_EVENT, sync);
    };
  }, []);
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
    const title = quickTitle.trim() || 'Auto Draft';
    if (quickBusy) return;
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

  function moveWidget(index: number, delta: number): void {
    setLeftOrder((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) {
        return current;
      }
      const next = [...current];
      const item = next[index]!;
      next[index] = next[target]!;
      next[target] = item;
      return next;
    });
  }

  function renderWidget(key: WidgetKey): ReactNode {
    switch (key) {
      case 'siteHealth':
        return health === null ? (
          <div className="health-check-widget">
            <div className="health-check-widget-title-section">
              <div className="site-health-progress-label">No information yet…</div>
            </div>
            <div className="site-health-details">
              <p>Health checks will run periodically to gather information about your site.</p>
            </div>
          </div>
        ) : (
          <div className="health-check-widget">
            <div className="health-check-widget-title-section">
              <div className="site-health-progress">
                <svg viewBox="0 0 200 200" aria-hidden="true">
                  <circle className="site-health-progress-track" r="90" cx="100" cy="100" />
                  <circle
                    className={`site-health-progress-bar${health.database === 'ok' && health.mediaWritable ? '' : ' is-warning'}`}
                    r="90"
                    cx="100"
                    cy="100"
                    strokeDashoffset={
                      565.48 *
                      (1 -
                        [
                          health.database === 'ok',
                          health.mediaWritable,
                          health.schedulerEnabled,
                        ].filter(Boolean).length /
                          3)
                    }
                  />
                </svg>
              </div>
              <div className="site-health-progress-label">
                {health.database === 'ok' && health.mediaWritable ? 'Good' : 'Should be improved'}
              </div>
            </div>
            <div className="site-health-details">
              <ul>
                <li>
                  Database connection:{' '}
                  <span className={health.database === 'ok' ? 'health-pass' : 'health-critical'}>
                    {health.database === 'ok' ? 'Pass' : 'Critical'}
                  </span>
                </li>
                <li>
                  Media storage:{' '}
                  <span className={health.mediaWritable ? 'health-pass' : 'health-critical'}>
                    {health.mediaWritable ? 'Pass' : 'Critical'}
                  </span>
                </li>
                <li>
                  Scheduled publishing:{' '}
                  <span className={health.schedulerEnabled ? 'health-pass' : 'health-warning'}>
                    {health.schedulerEnabled ? 'Pass' : 'Disabled'}
                  </span>
                </li>
              </ul>
            </div>
          </div>
        );
      case 'glance':
        return (
          <div className="main">
            <ul>
              <li className="post-count">
                <a
                  href={`${listPath('post')}?status=PUBLISHED`}
                  onClick={(event) => {
                    event.preventDefault();
                    navigate(`${listPath('post')}?status=PUBLISHED`);
                  }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                    className="glance-icon"
                  >
                    <path
                      d="M14.5 3.5 17 6l-2 .7-2.8 2.8L10 7.3l2.8-2.8.7-2zM8.3 9.6l2.1 2.1-2.9 2.9 7 2.1-2.1-7-2.9 2.9z"
                      fill="currentColor"
                    />
                  </svg>
                  {counts.post.PUBLISHED}{' '}
                  {counts.post.PUBLISHED === 1 ? 'Published post' : 'Published posts'}
                </a>
              </li>
              <li className="page-count">
                <a
                  href={`${listPath('page')}?status=PUBLISHED`}
                  onClick={(event) => {
                    event.preventDefault();
                    navigate(`${listPath('page')}?status=PUBLISHED`);
                  }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                    className="glance-icon"
                  >
                    <path d="M5 2.5h7.5L16 6v11.5H5V2.5zm7 1.2V6.7h3L12 3.7z" fill="currentColor" />
                  </svg>
                  {counts.page.PUBLISHED}{' '}
                  {counts.page.PUBLISHED === 1 ? 'Published page' : 'Published pages'}
                </a>
              </li>
            </ul>
            <p id="wp-version-message">
              <span>MERNPress 0.1.0.</span>
            </p>
          </div>
        );
      case 'activity':
        return (
          <div id="activity-widget">
            <div id="published-posts" className="activity-block">
              <h3>Recently Published</h3>
              {recent.length === 0 ? (
                <p className="no-activity">Nothing published yet.</p>
              ) : (
                <ul>
                  {recent.map((post) => (
                    <li key={post.id}>
                      <span>{formatActivityDate(post.publishedAt)}</span>{' '}
                      <a
                        href={editContentPath('post', post.id)}
                        aria-label={`Edit ${post.title}`}
                        onClick={(event) => {
                          event.preventDefault();
                          navigate(editContentPath('post', post.id));
                        }}
                      >
                        {post.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
      case 'quickDraft':
        return (
          <form
            className="initial-form"
            onSubmit={(event) => {
              event.preventDefault();
              void saveQuickDraft();
            }}
          >
            <div className="input-text-wrap">
              <label htmlFor="quick-draft-title">Title</label>
              <input
                id="quick-draft-title"
                type="text"
                autoComplete="off"
                maxLength={300}
                value={quickTitle}
                onChange={(event) => setQuickTitle(event.target.value)}
              />
            </div>
            <div className="textarea-wrap">
              <label htmlFor="quick-draft-body">Content</label>
              <textarea
                id="quick-draft-body"
                rows={3}
                placeholder="What’s on your mind?"
                value={quickBody}
                onChange={(event) => setQuickBody(event.target.value)}
              />
            </div>
            <p className="submit">
              <button type="submit" className="button primary-button" disabled={quickBusy}>
                {quickBusy ? 'Saving…' : 'Save Draft'}
              </button>
            </p>
            {quickNotice ? (
              <p className="field-error" role="alert">
                {quickNotice}
              </p>
            ) : null}
          </form>
        );
    }
  }

  return (
    <>
      <div className="dash-title-row">
        <h1>Dashboard</h1>
      </div>

      {welcomeDismissed || hiddenWidgets.has('welcome') ? null : (
        <section className="welcome-panel" aria-labelledby="welcome-heading">
          <button
            type="button"
            className="welcome-panel-close"
            aria-label="Dismiss the welcome panel"
            onClick={() => {
              setWelcomeDismissed(true);
              try {
                window.localStorage.setItem('mernpress-welcome-dismissed', '1');
              } catch {
                // Storage is optional.
              }
            }}
          >
            Dismiss
          </button>
          <div className="welcome-panel-content">
            <div className="welcome-panel-header">
              <div className="welcome-panel-header-image" aria-hidden="true">
                <svg
                  preserveAspectRatio="xMidYMin slice"
                  fill="none"
                  viewBox="0 0 1232 240"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path fill="#151515" d="M0 0h1232v240H0z" />
                  <ellipse cx="616" cy="232" fill="#3858E9" opacity=".05" rx="1497" ry="249" />
                  <defs>
                    <linearGradient
                      id="wp-hero-blue"
                      x1="387.5"
                      x2="387.5"
                      y1="20"
                      y2="1655"
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop stopColor="#3858E9" stopOpacity="0" />
                      <stop offset=".297" stopColor="#3858E9" />
                      <stop offset=".734" stopColor="#3858E9" />
                      <stop offset="1" stopColor="#3858E9" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient
                      id="wp-hero-yellow"
                      x1="560"
                      x2="560"
                      y1="20"
                      y2="1655"
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop stopColor="#FFFCB5" stopOpacity="0" />
                      <stop offset=".297" stopColor="#FFFCB5" />
                      <stop offset=".734" stopColor="#FFFCB5" />
                      <stop offset="1" stopColor="#FFFCB5" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient
                      id="wp-hero-green"
                      x1="732.5"
                      x2="732.5"
                      y1="20"
                      y2="1655"
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop stopColor="#C7FFDB" stopOpacity="0" />
                      <stop offset=".297" stopColor="#C7FFDB" />
                      <stop offset=".693" stopColor="#C7FFDB" />
                      <stop offset="1" stopColor="#C7FFDB" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient
                      id="wp-hero-coral"
                      x1="905"
                      x2="905"
                      y1="20"
                      y2="1655"
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop stopColor="#FFB7A7" stopOpacity="0" />
                      <stop offset=".297" stopColor="#FFB7A7" />
                      <stop offset=".734" stopColor="#FFB7A7" />
                      <stop offset="1" stopColor="#FFB7A7" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient
                      id="wp-hero-violet"
                      x1="1077.5"
                      x2="1077.5"
                      y1="20"
                      y2="1655"
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop stopColor="#7B90FF" stopOpacity="0" />
                      <stop offset=".297" stopColor="#7B90FF" />
                      <stop offset=".734" stopColor="#7B90FF" />
                      <stop offset="1" stopColor="#7B90FF" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <g strokeWidth="2">
                    <path stroke="url(#wp-hero-blue)" d="M387 20v1635" />
                    <path stroke="url(#wp-hero-yellow)" d="M559.5 20v1635" />
                    <path stroke="url(#wp-hero-green)" d="M732 20v1635" />
                    <path stroke="url(#wp-hero-coral)" d="M904.5 20v1635" />
                    <path stroke="url(#wp-hero-violet)" d="M1077 20v1635" />
                  </g>
                </svg>
              </div>
              <h2 id="welcome-heading">Welcome to MERNPress!</h2>
              <p>
                <a
                  href={listPath('post')}
                  onClick={(event) => {
                    event.preventDefault();
                    navigate(listPath('post'));
                  }}
                >
                  Learn more about the block editor.
                </a>
              </p>
            </div>
            <div className="welcome-panel-column-container">
              <div className="welcome-panel-column">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
                  <rect width="48" height="48" rx="4" fill="#1E1E1E" />
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M32.0668 17.0854L28.8221 13.9454L18.2008 24.671L16.8983 29.0827L21.4257 27.8309L32.0668 17.0854ZM16 32.75H24V31.25H16V32.75Z"
                    fill="white"
                  />
                </svg>
                <div className="welcome-panel-column-content">
                  <h3>Author rich content with blocks and patterns</h3>
                  <p>
                    Block patterns are pre-configured block layouts. Use them to get inspired or
                    create new pages in a flash.
                  </p>
                  {creator ? (
                    <a
                      href={newContentPath('page')}
                      onClick={(event) => {
                        event.preventDefault();
                        navigate(newContentPath('page'));
                      }}
                    >
                      Add a new page
                    </a>
                  ) : null}
                </div>
              </div>
              <div className="welcome-panel-column">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
                  <rect width="48" height="48" rx="4" fill="#1E1E1E" />
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M18 16h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H18a2 2 0 0 1-2-2V18a2 2 0 0 1 2-2zm12 1.5H18a.5.5 0 0 0-.5.5v3h13v-3a.5.5 0 0 0-.5-.5zm.5 5H22v8h8a.5.5 0 0 0 .5-.5v-7.5zm-10 0h-3V30a.5.5 0 0 0 .5.5h2.5v-8z"
                    fill="#fff"
                  />
                </svg>
                <div className="welcome-panel-column-content">
                  <h3>Customize your entire site with block themes</h3>
                  <p>
                    Design everything on your site — from the header down to the footer, all using
                    blocks and patterns.
                  </p>
                  <a
                    href="/pages"
                    onClick={(event) => {
                      event.preventDefault();
                      navigate('/pages');
                    }}
                  >
                    Manage your pages
                  </a>
                </div>
              </div>
              <div className="welcome-panel-column">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
                  <rect width="48" height="48" rx="4" fill="#1E1E1E" />
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M31 24a7 7 0 0 1-7 7V17a7 7 0 0 1 7 7zm-7-8a8 8 0 1 1 0 16 8 8 0 0 1 0-16z"
                    fill="#fff"
                  />
                </svg>
                <div className="welcome-panel-column-content">
                  <h3>Switch up your site&apos;s look &amp; feel with Styles</h3>
                  <p>
                    Tweak your site, or give it a whole new look! Site-wide options such as title
                    and tagline live in Settings.
                  </p>
                  {termer ? (
                    <a
                      href="/settings"
                      onClick={(event) => {
                        event.preventDefault();
                        navigate('/settings');
                      }}
                    >
                      Open settings
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {error ? (
        <ErrorState
          title="Counts unavailable"
          message={error}
          onRetry={() => setReloadKey((key) => key + 1)}
        />
      ) : loading ? (
        <Skeleton label="Loading dashboard…" lines={6} />
      ) : (
        <div id="dashboard-widgets-wrap">
          <div id="dashboard-widgets" className={`columns-${columns}`}>
            {(() => {
              const visibleLeft = leftOrder.filter((key) => !hiddenWidgets.has(key));
              const visibleRight = rightOrder.filter((key) => !hiddenWidgets.has(key));
              const allVisible = [...visibleLeft, ...visibleRight];
              const columnWidgets: WidgetKey[][] =
                columns === 2
                  ? [visibleLeft, visibleRight]
                  : columns === 1
                    ? [allVisible]
                    : Array.from({ length: columns }, (_, columnIndex) =>
                        allVisible.filter((_, index) => index % columns === columnIndex),
                      );

              return columnWidgets.map((keys, columnIndex) => (
                <div
                  key={columnIndex}
                  id={`postbox-container-${columnIndex + 1}`}
                  className="postbox-container"
                >
                  <div className="meta-box-sortables">
                    {keys.map((key, index) => {
                      const canReorder = columns === 2 && columnIndex === 0;
                      return (
                        <Postbox
                          key={key}
                          id={WIDGET_IDS[key]}
                          title={WIDGET_TITLES[key]}
                          canMoveUp={canReorder && index > 0}
                          canMoveDown={canReorder && index < keys.length - 1}
                          onMoveUp={canReorder ? () => moveWidget(index, -1) : () => undefined}
                          onMoveDown={canReorder ? () => moveWidget(index, 1) : () => undefined}
                        >
                          {renderWidget(key)}
                        </Postbox>
                      );
                    })}
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}
    </>
  );
}

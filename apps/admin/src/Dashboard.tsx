import { useEffect, useState } from 'react';
import { fetchPosts, type AuthUser, type ContentType, type PostStatus } from './api.js';
import { EmptyState, ErrorState, PageHeader, Skeleton } from './components.js';
import { canReadContent } from './roles.js';
import { listPath, navigate } from './router.js';

type Counts = Record<ContentType, Record<PostStatus, number>>;

const EMPTY_COUNTS: Counts = {
  post: { DRAFT: 0, PUBLISHED: 0, TRASHED: 0 },
  page: { DRAFT: 0, PUBLISHED: 0, TRASHED: 0 },
};

const STATUSES: PostStatus[] = ['DRAFT', 'PUBLISHED', 'TRASHED'];
const STATUS_LABELS: Record<PostStatus, string> = {
  DRAFT: 'Drafts',
  PUBLISHED: 'Published',
  TRASHED: 'Trashed',
};

export function Dashboard({ user }: { user: AuthUser }) {
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const allowed = canReadContent(user);

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
        fetchPosts({ type, status, page: 1, perPage: 1 }).then((result) => ({
          type,
          status,
          total: result.pagination.total,
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

  if (!allowed) {
    return (
      <>
        <PageHeader
          eyebrow="Dashboard"
          title="Content overview"
          description="Your account does not have access to the content administration API."
        />
        <EmptyState
          title="No content access"
          message="Subscribers cannot read or manage content. Ask an administrator if you need an editorial role."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Dashboard"
        title="Content overview"
        description="Counts come directly from the content API and respect your role and ownership visibility."
      />

      {error ? (
        <ErrorState
          title="Counts unavailable"
          message={error}
          onRetry={() => setReloadKey((key) => key + 1)}
        />
      ) : loading ? (
        <Skeleton label="Loading content counts…" lines={6} />
      ) : (
        <div className="dashboard-sections">
          {(['post', 'page'] as ContentType[]).map((type) => (
            <section key={type} className="dashboard-section" aria-labelledby={`${type}-counts`}>
              <div className="section-heading">
                <h2 id={`${type}-counts`}>{type === 'post' ? 'Posts' : 'Pages'}</h2>
                <a className="text-link" href={listPath(type)}>
                  Open all {type === 'post' ? 'posts' : 'pages'}
                </a>
              </div>
              <div className="stat-grid">
                {STATUSES.map((status) => (
                  <a
                    key={status}
                    className="stat-card"
                    href={listPath(type, { status })}
                    aria-label={`${counts[type][status]} ${STATUS_LABELS[status]} ${type === 'post' ? 'posts' : 'pages'}`}
                    onClick={(event) => {
                      event.preventDefault();
                      navigate(listPath(type, { status }));
                    }}
                  >
                    <span className="stat-value">{counts[type][status]}</span>
                    <span className="stat-label">{STATUS_LABELS[status]}</span>
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <section className="dashboard-help" aria-labelledby="dashboard-help-heading">
        <h2 id="dashboard-help-heading">What you can do here</h2>
        <p>
          Create posts and pages, edit drafts, publish or unpublish saved content, move content to
          the trash, restore it, and assign existing categories and tags. The block editor and media
          library are later phases.
        </p>
      </section>
    </>
  );
}

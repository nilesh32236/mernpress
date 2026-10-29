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

const STATUSES: PostStatus[] = ['PUBLISHED', 'DRAFT', 'TRASHED'];

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
          title="Dashboard"
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
        title="Dashboard"
        description="At a glance summary of your content, straight from the content API."
      />

      {error ? (
        <ErrorState
          title="Counts unavailable"
          message={error}
          onRetry={() => setReloadKey((key) => key + 1)}
        />
      ) : loading ? (
        <Skeleton label="Loading dashboard…" lines={6} />
      ) : (
        <>
          <section className="dashboard-at-a-glance" aria-labelledby="at-a-glance-heading">
            <h2 id="at-a-glance-heading" className="screen-reader-text">
              At a glance
            </h2>
            <table className="at-a-glance-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Published</th>
                  <th>Drafts</th>
                  <th>Trashed</th>
                </tr>
              </thead>
              <tbody>
                {(['post', 'page'] as ContentType[]).map((type) => {
                  const label = type === 'post' ? 'Posts' : 'Pages';
                  return (
                    <tr key={type}>
                      <th scope="row">{label}</th>
                      <td>
                        <a
                          className="at-a-glance-count"
                          href={listPath(type, { status: 'PUBLISHED' })}
                          onClick={(event) => {
                            event.preventDefault();
                            navigate(listPath(type, { status: 'PUBLISHED' }));
                          }}
                        >
                          {counts[type].PUBLISHED}
                        </a>
                      </td>
                      <td>
                        <a
                          className="at-a-glance-count"
                          href={listPath(type, { status: 'DRAFT' })}
                          onClick={(event) => {
                            event.preventDefault();
                            navigate(listPath(type, { status: 'DRAFT' }));
                          }}
                        >
                          {counts[type].DRAFT}
                        </a>
                      </td>
                      <td>
                        <a
                          className="at-a-glance-count"
                          href={listPath(type, { status: 'TRASHED' })}
                          onClick={(event) => {
                            event.preventDefault();
                            navigate(listPath(type, { status: 'TRASHED' }));
                          }}
                        >
                          {counts[type].TRASHED}
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="dashboard-help" aria-labelledby="dashboard-help-heading">
            <h2 id="dashboard-help-heading">What you can do here</h2>
            <p>
              Create posts and pages, edit drafts, publish or unpublish saved content, move content
              to the trash, restore it, and assign existing categories and tags. The block editor is
              available for posts and pages.
            </p>
          </section>
        </>
      )}
    </>
  );
}

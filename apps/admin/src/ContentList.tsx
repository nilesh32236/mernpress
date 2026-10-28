import { useEffect, useState, type FormEvent } from 'react';
import {
  actionErrorMessage,
  fetchPosts,
  transitionPost,
  type AdminPost,
  type AuthUser,
  type ContentType,
  type Paged,
  type PostStatus,
  type TransitionAction,
} from './api.js';
import {
  EmptyState,
  ErrorState,
  Notice,
  Skeleton,
  PageHeader,
  StatusBadge,
  type NoticeMessage,
} from './components.js';
import { formatDateTime } from './format.js';
import { availableTransitions, canCreateContent, canEditPost, canReadContent } from './roles.js';
import {
  editContentPath,
  listPath,
  navigate,
  newContentPath,
  replace,
  useLocation,
} from './router.js';

const PER_PAGE = 10;
const MAX_SEARCH_LENGTH = 200;
const TABS: Array<{ value: PostStatus | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'TRASHED', label: 'Trashed' },
];
const STATUS_OPTIONS: Array<{ value: PostStatus | ''; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'TRASHED', label: 'Trashed' },
];

function sanitizeStatus(value: string | null): PostStatus | '' {
  return value === 'DRAFT' || value === 'PUBLISHED' || value === 'TRASHED' ? value : '';
}

function sanitizeSearch(value: string | null): string {
  if (!value) return '';
  return value.trim().slice(0, MAX_SEARCH_LENGTH);
}

function sanitizePage(value: string | null): number {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 1;
}

const ACTION_LABELS: Record<TransitionAction, string> = {
  publish: 'Publish',
  unpublish: 'Unpublish',
  trash: 'Trash',
  restore: 'Restore',
};

const ACTION_SUCCESS: Record<TransitionAction, string> = {
  publish: 'Content published.',
  unpublish: 'Content returned to draft.',
  trash: 'Content moved to trash.',
  restore: 'Content restored.',
};

export function ContentList({ user, type }: { user: AuthUser; type: ContentType }) {
  const location = useLocation();
  const [status, setStatus] = useState<PostStatus | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<AdminPost> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [counts, setCounts] = useState<Record<PostStatus | '', number>>({
    '': 0,
    DRAFT: 0,
    PUBLISHED: 0,
    TRASHED: 0,
  });

  const label = type === 'post' ? 'Posts' : 'Pages';
  const allowed = canReadContent(user);

  // Sync filters from the URL (initial load, refresh, Back/Forward).
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const nextStatus = sanitizeStatus(params.get('status'));
    const nextSearch = sanitizeSearch(params.get('search'));
    const nextPage = sanitizePage(params.get('page'));
    setStatus(nextStatus);
    setSearch(nextSearch);
    setSearchInput(nextSearch);
    setPage(nextPage);
  }, [location.search]);

  useEffect(() => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);

    fetchPosts({
      type,
      ...(status ? { status } : {}),
      ...(search ? { search } : {}),
      page,
      perPage: PER_PAGE,
      sort: 'updatedAt',
      order: 'desc',
    })
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
  }, [allowed, type, status, search, page, reloadKey]);

  // Real server-computed status counts for the current type + search term.
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    const statuses: Array<PostStatus | ''> = ['', 'DRAFT', 'PUBLISHED', 'TRASHED'];
    Promise.all(
      statuses.map((statusFilter) =>
        fetchPosts({
          type,
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(search ? { search } : {}),
          page: 1,
          perPage: 1,
        }),
      ),
    )
      .then((results) => {
        if (!active) return;
        const next: Record<PostStatus | '', number> = {
          '': 0,
          DRAFT: 0,
          PUBLISHED: 0,
          TRASHED: 0,
        };
        statuses.forEach((statusFilter, index) => {
          const result = results[index];
          next[statusFilter] = result ? result.pagination.total : 0;
        });
        setCounts(next);
      })
      .catch(() => {
        if (!active) return;
      });

    return () => {
      active = false;
    };
  }, [allowed, type, search, reloadKey]);

  function applyFilters(nextStatus = status, nextSearch = search, nextPage = 1) {
    setStatus(nextStatus);
    setSearch(nextSearch);
    setPage(nextPage);
    replace(
      listPath(type, {
        ...(nextStatus ? { status: nextStatus } : {}),
        ...(nextSearch ? { search: nextSearch } : {}),
        page: nextPage,
      }),
    );
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applyFilters(status, searchInput.trim(), 1);
  }

  async function runAction(post: AdminPost, action: TransitionAction) {
    if (action === 'trash' && !window.confirm(`Move “${post.title}” to the trash?`)) {
      return;
    }
    const key = `${post.id}:${action}`;
    setPendingAction(key);
    setNotice(null);
    try {
      await transitionPost(post.id, action, post.version);
      setNotice({ tone: 'success', text: ACTION_SUCCESS[action] });
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setPendingAction(null);
    }
  }

  if (!allowed) {
    return (
      <>
        <PageHeader eyebrow="Content" title={label} />
        <EmptyState
          title="No content access"
          message="Your account does not have permission to read the content administration API."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Content"
        title={label}
        description={
          type === 'post'
            ? 'Create and manage posts. Only content you may read is listed.'
            : 'Create and manage pages. Only content you may read is listed.'
        }
        actions={
          canCreateContent(user) ? (
            <a
              className="button primary-button"
              href={newContentPath(type)}
              onClick={(event) => {
                event.preventDefault();
                navigate(newContentPath(type));
              }}
            >
              New {type === 'post' ? 'post' : 'page'}
            </a>
          ) : null
        }
      />

      {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}

      <div className="status-tabs" role="tablist" aria-label={`${label} status`}>
        {TABS.map((tab) => (
          <button
            key={tab.value || 'all'}
            type="button"
            role="tab"
            aria-selected={status === tab.value}
            className={`button small-button ${status === tab.value ? 'primary-button' : 'secondary-button'}`}
            onClick={() => applyFilters(tab.value, search, 1)}
          >
            {tab.label} ({counts[tab.value] ?? 0})
          </button>
        ))}
      </div>

      <form className="list-filters" onSubmit={handleSearch} role="search">
        <div className="field">
          <label htmlFor={`${type}-search`}>Search {label.toLowerCase()}</label>
          <input
            id={`${type}-search`}
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Title or excerpt"
          />
        </div>
        <div className="field">
          <label htmlFor={`${type}-status`}>Status</label>
          <select
            id={`${type}-status`}
            value={status}
            onChange={(event) => {
              const next = event.target.value as PostStatus | '';
              applyFilters(next, search, 1);
            }}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="button secondary-button">
          Search
        </button>
      </form>

      {error ? (
        <ErrorState
          title={`Could not load ${label.toLowerCase()}`}
          message={error}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : loading ? (
        <Skeleton label={`Loading ${label.toLowerCase()}…`} lines={5} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title={search || status ? 'No matching content' : `No ${label.toLowerCase()} yet`}
          message={
            search || status
              ? 'Try a different search term or status filter.'
              : `Create your first ${type} to get started.`
          }
          action={
            canCreateContent(user) ? (
              <a
                className="button primary-button"
                href={newContentPath(type)}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(newContentPath(type));
                }}
              >
                New {type === 'post' ? 'post' : 'page'}
              </a>
            ) : null
          }
        />
      ) : (
        <>
          <div className="table-scroll">
            <table className="content-table">
              <caption className="visually-hidden">{label}</caption>
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Status</th>
                  <th scope="col">Slug</th>
                  <th scope="col">Updated</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((post) => {
                  const transitions = availableTransitions(user, post);
                  const editable = canEditPost(user, post);
                  return (
                    <tr key={post.id}>
                      <td data-label="Title">
                        <a
                          className="row-title"
                          href={editContentPath(type, post.id)}
                          onClick={(event) => {
                            event.preventDefault();
                            navigate(editContentPath(type, post.id));
                          }}
                        >
                          {post.title}
                        </a>
                        {post.excerpt ? <p className="row-excerpt">{post.excerpt}</p> : null}
                      </td>
                      <td data-label="Status">
                        <StatusBadge status={post.status} />
                      </td>
                      <td data-label="Slug">
                        <code>{post.slug}</code>
                      </td>
                      <td data-label="Updated">{formatDateTime(post.updatedAt)}</td>
                      <td data-label="Actions">
                        <div className="row-actions">
                          <a
                            className="text-link"
                            href={editContentPath(type, post.id)}
                            onClick={(event) => {
                              event.preventDefault();
                              navigate(editContentPath(type, post.id));
                            }}
                          >
                            {editable ? 'Edit' : 'View'}
                          </a>
                          {transitions.map((action) => {
                            const key = `${post.id}:${action}`;
                            return (
                              <button
                                key={action}
                                type="button"
                                className="button small-button"
                                disabled={pendingAction !== null}
                                aria-busy={pendingAction === key}
                                onClick={() => void runAction(post, action)}
                              >
                                {pendingAction === key
                                  ? `${ACTION_LABELS[action]}…`
                                  : ACTION_LABELS[action]}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <nav className="pagination" aria-label={`${label} pagination`}>
            <button
              type="button"
              className="button secondary-button"
              disabled={page <= 1}
              onClick={() => applyFilters(status, search, page - 1)}
            >
              Previous
            </button>
            <p>
              Page {data.pagination.page} of {Math.max(data.pagination.totalPages, 1)} ·{' '}
              {data.pagination.total} total
            </p>
            <button
              type="button"
              className="button secondary-button"
              disabled={page >= Math.max(data.pagination.totalPages, 1)}
              onClick={() => applyFilters(status, search, page + 1)}
            >
              Next
            </button>
          </nav>
        </>
      )}
    </>
  );
}

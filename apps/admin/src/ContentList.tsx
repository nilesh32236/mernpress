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
  const [, setPendingAction] = useState<string | null>(null);
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

  const totalPages = Math.max(data?.pagination.totalPages ?? 1, 1);

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
              Add New {type === 'post' ? 'Post' : 'Page'}
            </a>
          ) : null
        }
      />

      {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}

      <div className="list-filters">
        <form className="search-form" onSubmit={handleSearch} role="search">
          <label htmlFor={`${type}-search`}>Search {label}</label>
          <input
            id={`${type}-search`}
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={`Search ${label}`}
          />
          <button type="submit" className="button secondary-button">
            Search
          </button>
        </form>
        <div className="status-filter">
          <label htmlFor={`${type}-status-filter`}>Filter by status</label>
          <select
            id={`${type}-status-filter`}
            value={status}
            onChange={(event) => {
              applyFilters(sanitizeStatus(event.target.value), search, 1);
            }}
          >
            {TABS.map((tab) => (
              <option key={tab.value} value={tab.value}>
                {tab.label} ({counts[tab.value] ?? 0})
              </option>
            ))}
          </select>
        </div>
      </div>

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
                Add New {type === 'post' ? 'Post' : 'Page'}
              </a>
            ) : null
          }
        />
      ) : (
        <>
          <div className="bulk-actions">
            <label htmlFor="bulk-action">Bulk actions</label>
            <select id="bulk-action">
              <option value="">Bulk actions</option>
              <option value="trash">Move to Trash</option>
            </select>
            <button type="button" className="button secondary-button bulk-apply">
              Apply
            </button>
          </div>

          <div className="table-scroll">
            <table className="content-table widefat fixed striped posts">
              <caption className="screen-reader-text">{label}</caption>
              <thead>
                <tr>
                  <th scope="col" className="check-column">
                    <input type="checkbox" />
                  </th>
                  <th scope="col">Title</th>
                  <th scope="col">Status</th>
                  <th scope="col">Author</th>
                  <th scope="col">{type === 'post' ? 'Categories' : ''}</th>
                  <th scope="col">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((post) => {
                  const transitions = availableTransitions(user, post);
                  const editable = canEditPost(user, post);
                  return (
                    <tr key={post.id}>
                      <th scope="row" className="check-column">
                        <input type="checkbox" />
                      </th>
                      <td className="title column-title">
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
                        <div className="row-actions">
                          {editable ? (
                            <a
                              className="edit-link"
                              href={editContentPath(type, post.id)}
                              onClick={(event) => {
                                event.preventDefault();
                                navigate(editContentPath(type, post.id));
                              }}
                            >
                              Edit
                            </a>
                          ) : null}
                          {transitions.includes('trash') ? (
                            <>
                              {editable ? <span> | </span> : null}
                              <button
                                type="button"
                                className="delete-link"
                                onClick={(event) => {
                                  event.preventDefault();
                                  void runAction(post, 'trash');
                                }}
                              >
                                Trash
                              </button>
                            </>
                          ) : null}
                          {transitions.includes('restore') ? (
                            <>
                              <span> | </span>
                              <button
                                type="button"
                                className="delete-link"
                                onClick={(event) => {
                                  event.preventDefault();
                                  void runAction(post, 'restore');
                                }}
                              >
                                Restore
                              </button>
                            </>
                          ) : null}
                          {(post.status === 'PUBLISHED' ||
                            transitions.includes('publish') ||
                            transitions.includes('unpublish')) && (
                            <>
                              {(editable ||
                                transitions.includes('trash') ||
                                transitions.includes('restore')) && <span> | </span>}
                              <a
                                className="view-link"
                                href={editContentPath(type, post.id)}
                                onClick={(event) => {
                                  event.preventDefault();
                                  navigate(editContentPath(type, post.id));
                                }}
                              >
                                View
                              </a>
                            </>
                          )}
                          {!editable &&
                            transitions.length === 0 &&
                            !(
                              post.status === 'PUBLISHED' ||
                              transitions.includes('publish') ||
                              transitions.includes('unpublish')
                            ) && <span className="no-row-actions">—</span>}
                        </div>
                      </td>
                      <td className="status column-status">
                        <StatusBadge status={post.status} />
                      </td>
                      <td className="author column-author">
                        {post.authorId === user.id ? 'You' : 'Another user'}
                      </td>
                      <td className="categories column-categories">
                        {post.terms.categories.map((term) => (
                          <span key={term.id} className="term-link">
                            {term.name}
                          </span>
                        ))}
                        {post.terms.categories.length === 0 && <span className="no-terms">—</span>}
                      </td>
                      <td className="date column-date">{formatDateTime(post.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <nav className="pagination" aria-label={`${label} pagination`}>
            <div className="tablenav-pages">
              <span className="displaying-num">
                {`${data.pagination.total} ${data.pagination.total === 1 ? label.slice(0, -1) : label}`}
              </span>
              <span className="pagination-links">
                <button
                  type="button"
                  className="button secondary-button pagination-button prev"
                  disabled={page <= 1}
                  onClick={() => applyFilters(status, search, page - 1)}
                >
                  « Previous
                </button>
                <span className="page-numbers current">{page}</span>
                <button
                  type="button"
                  className="button secondary-button pagination-button next"
                  disabled={page >= totalPages}
                  onClick={() => applyFilters(status, search, page + 1)}
                >
                  Next »
                </button>
              </span>
            </div>
          </nav>
        </>
      )}
    </>
  );
}

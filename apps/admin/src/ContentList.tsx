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
  LoadingState,
  Notice,
  PageHeader,
  StatusBadge,
  type NoticeMessage,
} from './components.js';
import { formatDateTime } from './format.js';
import { availableTransitions, canCreateContent, canEditPost, canReadContent } from './roles.js';
import { editContentPath, listPath, navigate, newContentPath, replace } from './router.js';

const PER_PAGE = 10;
const STATUS_OPTIONS: Array<{ value: PostStatus | ''; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'TRASHED', label: 'Trashed' },
];

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

function initialSearch(): string {
  return new URLSearchParams(window.location.search).get('search') ?? '';
}

function initialStatus(): PostStatus | '' {
  const value = new URLSearchParams(window.location.search).get('status');
  return value === 'DRAFT' || value === 'PUBLISHED' || value === 'TRASHED' ? value : '';
}

function initialPage(): number {
  const value = Number(new URLSearchParams(window.location.search).get('page') ?? '1');
  return Number.isInteger(value) && value > 0 ? value : 1;
}

export function ContentList({ user, type }: { user: AuthUser; type: ContentType }) {
  const [status, setStatus] = useState<PostStatus | ''>(initialStatus);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch);
  const [page, setPage] = useState(initialPage);
  const [data, setData] = useState<Paged<AdminPost> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const label = type === 'post' ? 'Posts' : 'Pages';
  const allowed = canReadContent(user);

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
        <LoadingState label={`Loading ${label.toLowerCase()}…`} />
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

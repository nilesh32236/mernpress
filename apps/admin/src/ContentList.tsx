import { Fragment, useEffect, useState, type FormEvent } from 'react';
import {
  actionErrorMessage,
  bulkPosts,
  fetchPosts,
  fetchTerms,
  rotatePreviewToken,
  transitionPost,
  updatePost,
  type AdminPost,
  type AdminTerm,
  type AuthUser,
  type BulkAction,
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
  SortIndicator,
  type NoticeMessage,
  Pagination,
} from './components.js';
import { availableTransitions, canCreateContent, canEditPost, canReadContent } from './roles.js';
import {
  editContentPath,
  listPath,
  navigate,
  newContentPath,
  replace,
  useLocation,
} from './router.js';
import {
  SCREEN_COLUMNS_EVENT,
  SCREEN_OPTIONS_EVENT,
  SCREEN_VIEW_MODE_EVENT,
  screenHiddenColumns,
  screenPerPage,
  screenViewMode,
} from './screenOptions.js';
import { formatSettingsDate, formatSettingsTime } from './format.js';

const MAX_SEARCH_LENGTH = 200;
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

function formatWpDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  // WordPress list tables hard-code this column's format regardless of the
  // General Settings date/time format.
  return `${formatSettingsDate(date, 'Y/m/d')} at ${formatSettingsTime(date, 'g:i a')}`;
}

function monthOptions(): Array<{ value: string; label: string }> {
  const now = new Date();
  const options: Array<{ value: string; label: string }> = [];
  for (let i = 0; i < 12; i += 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const value = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    options.push({
      value,
      label: date.toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }),
    });
  }
  return options;
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
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<BulkAction | 'edit' | ''>('');
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditStatus, setBulkEditStatus] = useState<'DRAFT' | 'PUBLISHED'>('DRAFT');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [previewBusyId, setPreviewBusyId] = useState<string | null>(null);
  const screen = type === 'post' ? 'posts' : 'pages';
  const [hiddenColumns, setHiddenColumns] = useState(() => screenHiddenColumns(screen));
  const [viewMode, setViewMode] = useState(() => screenViewMode(screen));

  useEffect(() => {
    const sync = () => {
      setHiddenColumns(screenHiddenColumns(screen));
      setViewMode(screenViewMode(screen));
    };
    window.addEventListener(SCREEN_COLUMNS_EVENT, sync);
    window.addEventListener(SCREEN_VIEW_MODE_EVENT, sync);
    return () => {
      window.removeEventListener(SCREEN_COLUMNS_EVENT, sync);
      window.removeEventListener(SCREEN_VIEW_MODE_EVENT, sync);
    };
  }, [screen]);

  const showAuthor = !hiddenColumns.has('author');
  const showCategories = type === 'post' && !hiddenColumns.has('categories');
  const showTags = type === 'post' && !hiddenColumns.has('tags');
  const showComments = !hiddenColumns.has('comments');
  const showDate = !hiddenColumns.has('date');
  const visibleColumnCount =
    2 +
    (showAuthor ? 1 : 0) +
    (showCategories ? 1 : 0) +
    (showTags ? 1 : 0) +
    (showComments ? 1 : 0) +
    (showDate ? 1 : 0);
  const [sort, setSort] = useState<'updatedAt' | 'title'>('updatedAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [pendingCategory, setPendingCategory] = useState('');
  const [quickId, setQuickId] = useState<string | null>(null);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickSlug, setQuickSlug] = useState('');
  const [quickStatus, setQuickStatus] = useState<'DRAFT' | 'PUBLISHED'>('DRAFT');
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [perPage, setPerPage] = useState(() =>
    screenPerPage(type === 'post' ? 'posts' : 'pages', 10),
  );
  const [pendingMonth, setPendingMonth] = useState('');
  const [authorFilter, setAuthorFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [mine, setMine] = useState(false);
  const [mineCount, setMineCount] = useState(0);
  const [categories, setCategories] = useState<AdminTerm[]>([]);
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
    const authorParam = params.get('author');
    setMine(authorParam === 'me');
    setAuthorFilter(authorParam && authorParam !== 'me' ? authorParam : '');
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
      ...(categoryFilter ? { category: categoryFilter } : {}),
      ...(monthFilter ? { month: monthFilter } : {}),
      ...(tagFilter ? { tag: tagFilter } : {}),
      ...(mine ? { author: user.id } : authorFilter ? { author: authorFilter } : {}),
      page,
      perPage,
      sort,
      order,
    })
      .then((result) => {
        if (!active) return;
        setData(result);
        setSelected(new Set());
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
  }, [
    allowed,
    type,
    perPage,
    status,
    search,
    page,
    categoryFilter,
    monthFilter,
    tagFilter,
    authorFilter,
    mine,
    user.id,
    sort,
    order,
    reloadKey,
  ]);

  // Screen Options: "Number of items per page".
  useEffect(() => {
    function onOptions() {
      setPerPage(screenPerPage(type === 'post' ? 'posts' : 'pages', 10));
    }
    window.addEventListener(SCREEN_OPTIONS_EVENT, onOptions);
    return () => window.removeEventListener(SCREEN_OPTIONS_EVENT, onOptions);
  }, [type]);

  // Category filter options (posts only).
  useEffect(() => {
    if (!allowed || type !== 'post') return;
    let active = true;
    fetchTerms({ taxonomy: 'category', page: 1, perPage: 100 })
      .then((result) => {
        if (active) setCategories(result.items);
      })
      .catch(() => {
        // Filters are optional; failure must not block the list.
      });
    return () => {
      active = false;
    };
  }, [allowed, type]);

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

    fetchPosts({ type, author: user.id, page: 1, perPage: 1 })
      .then((result) => {
        if (active) setMineCount(result.pagination.total);
      })
      .catch(() => {
        // The Mine tab count is optional.
      });

    return () => {
      active = false;
    };
  }, [allowed, type, search, user.id, reloadKey]);

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

  function toggleSort(column: 'updatedAt' | 'title'): void {
    if (sort === column) {
      setOrder((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(column);
      setOrder(column === 'title' ? 'asc' : 'desc');
    }
    setPage(1);
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applyFilters(status, searchInput.trim(), 1);
  }

  function startQuickEdit(post: AdminPost): void {
    setQuickId(post.id);
    setQuickTitle(post.title);
    setQuickSlug(post.slug);
    setQuickStatus(post.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT');
    setQuickError(null);
  }

  async function saveQuickEdit(post: AdminPost): Promise<void> {
    if (quickBusy) return;
    const title = quickTitle.trim();
    if (!title) {
      setQuickError('Title is required.');
      return;
    }
    setQuickBusy(true);
    setQuickError(null);
    try {
      let updated = post;
      if (title !== post.title || quickSlug.trim() !== post.slug) {
        updated = await updatePost(post.id, {
          baseVersion: post.version,
          title,
          ...(quickSlug.trim() ? { slug: quickSlug.trim() } : {}),
        });
      }
      if (quickStatus !== updated.status) {
        updated = await transitionPost(
          updated.id,
          quickStatus === 'PUBLISHED' ? 'publish' : 'unpublish',
          updated.version,
        );
      }
      setQuickId(null);
      setNotice({ tone: 'success', text: 'Changes saved.' });
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setQuickError(actionErrorMessage(caught));
    } finally {
      setQuickBusy(false);
    }
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

  // Bulk actions operate on the same per-object rules as the row actions:
  // the API reports per-item outcomes, so a partial failure is shown as-is.
  const bulkOptions: Array<{ value: BulkAction | 'edit'; label: string }> =
    status === 'TRASHED'
      ? [
          { value: 'restore', label: 'Restore' },
          { value: 'delete', label: 'Delete permanently' },
        ]
      : [
          { value: 'edit', label: 'Edit' },
          { value: 'publish', label: 'Publish' },
          { value: 'unpublish', label: 'Move to Draft' },
          { value: 'trash', label: 'Move to Trash' },
        ];

  function toggleSelected(id: string): void {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll(): void {
    setSelected((current) => {
      if (!data) {
        return current;
      }
      const actionable = data.items.filter((post) => canEditPost(user, post));
      return actionable.length > 0 && actionable.every((post) => current.has(post.id))
        ? new Set()
        : new Set(actionable.map((post) => post.id));
    });
  }

  async function openPreview(post: AdminPost): Promise<void> {
    setPreviewBusyId(post.id);
    setNotice(null);
    try {
      const rotated = await rotatePreviewToken(post.id);
      const url = rotated.previewUrl ?? rotated.previewPath;
      if (!url) {
        throw new Error('No preview link was returned.');
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setPreviewBusyId(null);
    }
  }

  async function deleteForever(post: AdminPost): Promise<void> {
    if (!window.confirm(`Permanently delete “${post.title}”? This cannot be undone.`)) {
      return;
    }
    setPendingAction(`${post.id}:delete`);
    setNotice(null);
    try {
      await bulkPosts('delete', [{ id: post.id, baseVersion: post.version }]);
      setNotice({ tone: 'success', text: 'Deleted permanently.' });
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setPendingAction(null);
    }
  }

  async function runBulkAction(): Promise<void> {
    if (!data || bulkAction === '' || selected.size === 0) {
      return;
    }
    if (bulkAction === 'edit') {
      setBulkEditOpen(true);
      return;
    }
    if (
      bulkAction === 'delete' &&
      !window.confirm(`Permanently delete ${selected.size} item(s)? This cannot be undone.`)
    ) {
      return;
    }
    const items = data.items
      .filter((post) => selected.has(post.id) && canEditPost(user, post))
      .map((post) => ({ id: post.id, baseVersion: post.version }));
    if (items.length === 0) {
      return;
    }
    setBulkBusy(true);
    setNotice(null);
    try {
      const result = await bulkPosts(bulkAction, items);
      const failedCount = result.failed.length;
      setNotice({
        tone: failedCount === 0 ? 'success' : 'error',
        text:
          failedCount === 0
            ? `${result.succeeded.length} item(s) updated.`
            : `${result.succeeded.length} item(s) updated; ${failedCount} failed: ${result.failed
                .map((failure) => failure.error?.message ?? 'rejected')
                .join('; ')}`,
      });
      setSelected(new Set());
      setBulkAction('');
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setBulkBusy(false);
    }
  }

  async function runBulkEdit(): Promise<void> {
    if (!data || selected.size === 0) return;
    const targets = data.items.filter((post) => selected.has(post.id) && canEditPost(user, post));
    if (targets.length === 0) return;
    setBulkBusy(true);
    setNotice(null);
    try {
      let updated = 0;
      for (const post of targets) {
        if (post.status === bulkEditStatus) continue;
        await transitionPost(
          post.id,
          bulkEditStatus === 'PUBLISHED' ? 'publish' : 'unpublish',
          post.version,
        );
        updated += 1;
      }
      setNotice({ tone: 'success', text: `${updated} item(s) updated.` });
      setSelected(new Set());
      setBulkEditOpen(false);
      setBulkAction('');
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setBulkBusy(false);
    }
  }

  if (!allowed) {
    return (
      <>
        <PageHeader title={label} />
        <EmptyState
          title="No content access"
          message="Your account does not have permission to read the content administration API."
        />
      </>
    );
  }

  const totalPages = Math.max(data?.pagination.totalPages ?? 1, 1);

  return (
    <div className={`wp-list-screen${viewMode === 'compact' ? ' compact-view' : ''}`}>
      <div className="list-title-row">
        <h1>{label}</h1>
        {canCreateContent(user) ? (
          <a
            className="button page-title-action"
            href={newContentPath(type)}
            onClick={(event) => {
              event.preventDefault();
              navigate(newContentPath(type));
            }}
          >
            Add {type === 'post' ? 'Post' : 'Page'}
          </a>
        ) : null}
      </div>

      {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}

      <div className="list-top">
        <ul className="subsubsub" aria-label={`${label} status filter`}>
          <li>
            <button
              type="button"
              className="subsubsub-tab"
              aria-current={!status && !mine ? 'true' : undefined}
              onClick={() => {
                setMine(false);
                applyFilters('', search, 1);
              }}
            >
              All <span className="count">({counts[''] ?? 0})</span>
            </button>{' '}
            |
          </li>
          <li>
            <button
              type="button"
              className="subsubsub-tab"
              aria-current={mine ? 'true' : undefined}
              onClick={() => {
                setMine(true);
                applyFilters(status, search, 1);
              }}
            >
              Mine <span className="count">({mineCount})</span>
            </button>{' '}
            |
          </li>
          <li>
            <button
              type="button"
              className="subsubsub-tab"
              aria-current={!mine && status === 'PUBLISHED' ? 'true' : undefined}
              onClick={() => {
                setMine(false);
                applyFilters('PUBLISHED', search, 1);
              }}
            >
              Published <span className="count">({counts.PUBLISHED ?? 0})</span>
            </button>
          </li>
          {(counts.DRAFT ?? 0) > 0 || (!mine && status === 'DRAFT') ? (
            <li>
              {' '}
              |{' '}
              <button
                type="button"
                className="subsubsub-tab"
                aria-current={!mine && status === 'DRAFT' ? 'true' : undefined}
                onClick={() => {
                  setMine(false);
                  applyFilters('DRAFT', search, 1);
                }}
              >
                Drafts <span className="count">({counts.DRAFT ?? 0})</span>
              </button>
            </li>
          ) : null}
          {(counts.TRASHED ?? 0) > 0 || (!mine && status === 'TRASHED') ? (
            <li>
              {' '}
              |{' '}
              <button
                type="button"
                className="subsubsub-tab"
                aria-current={!mine && status === 'TRASHED' ? 'true' : undefined}
                onClick={() => {
                  setMine(false);
                  applyFilters('TRASHED', search, 1);
                }}
              >
                Trashed <span className="count">({counts.TRASHED ?? 0})</span>
              </button>
            </li>
          ) : null}
        </ul>

        <div className="search-row">
          <form className="search-form" onSubmit={handleSearch} role="search">
            <label htmlFor={`${type}-search`} className="screen-reader-text">
              Search {label}
            </label>
            <input
              id={`${type}-search`}
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder=""
            />
            <button type="submit" className="button secondary-button">
              Search {label}
            </button>
          </form>
        </div>
      </div>

      <div className="tablenav">
        <div className="alignleft">
          {data && data.items.length > 0 ? (
            <>
              <label htmlFor="bulk-action" className="screen-reader-text">
                Bulk actions
              </label>
              <select
                id="bulk-action"
                className="bulk-select"
                value={bulkAction}
                onChange={(event) => setBulkAction(event.target.value as BulkAction | 'edit' | '')}
              >
                <option value="">Bulk actions</option>
                {bulkOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="button secondary-button bulk-apply"
                disabled={bulkBusy}
                onClick={() => void runBulkAction()}
              >
                {bulkBusy ? 'Applying…' : 'Apply'}
              </button>
              <span className="bulk-selection-count" aria-live="polite">
                {selected.size > 0 ? `${selected.size} selected` : ''}
              </span>
            </>
          ) : null}
          <label htmlFor={`${type}-month-filter`} className="screen-reader-text">
            Filter by date
          </label>
          <select
            id={`${type}-month-filter`}
            className="bulk-select"
            value={pendingMonth}
            onChange={(event) => setPendingMonth(event.target.value)}
          >
            <option value="">All dates</option>
            {monthOptions().map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
          {type === 'post' ? (
            <>
              <label htmlFor={`${type}-category-filter`} className="screen-reader-text">
                Filter by category
              </label>
              <select
                id={`${type}-category-filter`}
                className="bulk-select"
                value={pendingCategory}
                onChange={(event) => setPendingCategory(event.target.value)}
              >
                <option value="">All Categories</option>
                {categories.map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.name}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          <button
            type="button"
            className="button secondary-button"
            onClick={() => {
              setCategoryFilter(pendingCategory);
              setMonthFilter(pendingMonth);
              setPage(1);
            }}
          >
            Filter
          </button>
        </div>
        <div className="alignright">
          <span className="displaying-num">
            {`${data?.pagination.total ?? 0} ${(data?.pagination.total ?? 0) === 1 ? 'item' : 'items'}`}
          </span>
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
          {bulkEditOpen ? (
            <div className="bulk-edit-panel">
              <h2>Bulk Edit</h2>
              <p className="bulk-edit-summary">{selected.size} item(s) selected</p>
              <label className="bulk-edit-field">
                <span>Status</span>
                <select
                  value={bulkEditStatus}
                  onChange={(event) =>
                    setBulkEditStatus(event.target.value as 'DRAFT' | 'PUBLISHED')
                  }
                  disabled={bulkBusy}
                >
                  <option value="DRAFT">Draft</option>
                  <option value="PUBLISHED">Published</option>
                </select>
              </label>
              <div className="bulk-edit-actions">
                <button
                  type="button"
                  className="button primary-button"
                  disabled={bulkBusy || selected.size === 0}
                  onClick={() => void runBulkEdit()}
                >
                  {bulkBusy ? 'Updating…' : 'Update'}
                </button>
                <button
                  type="button"
                  className="button secondary-button"
                  onClick={() => setBulkEditOpen(false)}
                  disabled={bulkBusy}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          <div className="table-scroll">
            <table
              className={`content-table widefat fixed striped ${type === 'page' ? 'pages' : 'posts'}`}
            >
              <caption className="screen-reader-text">{label}</caption>
              <thead>
                <tr>
                  <th scope="col" className="check-column">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={
                        data.items.filter((post) => canEditPost(user, post)).length > 0 &&
                        data.items
                          .filter((post) => canEditPost(user, post))
                          .every((post) => selected.has(post.id))
                      }
                      onChange={() => toggleSelectAll()}
                    />
                  </th>
                  <th scope="col" className="column-title">
                    <button
                      type="button"
                      className="sortable-column"
                      aria-label="Sort by title"
                      onClick={() => toggleSort('title')}
                    >
                      Title
                      <SortIndicator direction={sort === 'title' ? order : null} />
                    </button>
                  </th>
                  {showAuthor ? (
                    <th scope="col" className="column-author">
                      Author
                    </th>
                  ) : null}
                  {showCategories ? (
                    <th scope="col" className="column-categories">
                      Categories
                    </th>
                  ) : null}
                  {showTags ? (
                    <th scope="col" className="column-tags">
                      Tags
                    </th>
                  ) : null}
                  {showComments ? (
                    <th scope="col" className="column-comments">
                      <span className="screen-reader-text">Comments</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M4 4h16v12H8l-4 4V4z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                        />
                      </svg>
                    </th>
                  ) : null}
                  {showDate ? (
                    <th scope="col" className="column-date">
                      <button
                        type="button"
                        className="sortable-column"
                        aria-label={`Sort by date${sort === 'updatedAt' && order === 'desc' ? ', descending' : ''}`}
                        onClick={() => toggleSort('updatedAt')}
                      >
                        Date
                        <SortIndicator direction={sort === 'updatedAt' ? order : null} />
                      </button>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {data.items.map((post) => {
                  const transitions = availableTransitions(user, post);
                  const editable = canEditPost(user, post);
                  return (
                    <Fragment key={post.id}>
                      <tr>
                        <th scope="row" className="check-column">
                          <input
                            type="checkbox"
                            aria-label={`Select ${post.title}`}
                            checked={selected.has(post.id)}
                            disabled={!editable}
                            onChange={() => toggleSelected(post.id)}
                          />
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
                          <div className="row-actions">
                            {editable ? (
                              <a
                                className="row-action-link"
                                href={editContentPath(type, post.id)}
                                onClick={(event) => {
                                  event.preventDefault();
                                  navigate(editContentPath(type, post.id));
                                }}
                              >
                                Edit
                              </a>
                            ) : null}
                            {editable && post.status !== 'TRASHED' ? (
                              <>
                                <span className="row-action-sep" aria-hidden="true">
                                  {' '}
                                  |{' '}
                                </span>
                                <button
                                  type="button"
                                  className="row-action-link"
                                  onClick={() => startQuickEdit(post)}
                                >
                                  Quick Edit
                                </button>
                              </>
                            ) : null}
                            {transitions.includes('trash') ? (
                              <>
                                <span className="row-action-sep" aria-hidden="true">
                                  {' '}
                                  |{' '}
                                </span>
                                <button
                                  type="button"
                                  className="row-action-link is-danger"
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
                                <span className="row-action-sep" aria-hidden="true">
                                  {' '}
                                  |{' '}
                                </span>
                                <button
                                  type="button"
                                  className="row-action-link"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    void runAction(post, 'restore');
                                  }}
                                >
                                  Restore
                                </button>
                              </>
                            ) : null}
                            {post.status === 'TRASHED' && editable ? (
                              <>
                                <span className="row-action-sep" aria-hidden="true">
                                  {' '}
                                  |{' '}
                                </span>
                                <button
                                  type="button"
                                  className="row-action-link is-danger"
                                  aria-busy={pendingAction === `${post.id}:delete`}
                                  onClick={() => void deleteForever(post)}
                                >
                                  Delete Permanently
                                </button>
                              </>
                            ) : null}
                            {post.status === 'PUBLISHED' ? (
                              <>
                                <span className="row-action-sep" aria-hidden="true">
                                  {' '}
                                  |{' '}
                                </span>
                                <a
                                  className="row-action-link"
                                  href={`/${post.slug}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  View
                                </a>
                              </>
                            ) : post.status !== 'TRASHED' ? (
                              <>
                                <span className="row-action-sep" aria-hidden="true">
                                  {' '}
                                  |{' '}
                                </span>
                                <button
                                  type="button"
                                  className="row-action-link"
                                  aria-busy={previewBusyId === post.id}
                                  onClick={() => void openPreview(post)}
                                >
                                  Preview
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>
                        {showAuthor ? (
                          <td className="author column-author">
                            <button
                              type="button"
                              className="term-link"
                              onClick={() => {
                                if (!post.authorId) return;
                                setMine(false);
                                setAuthorFilter(post.authorId);
                                setPage(1);
                              }}
                            >
                              {post.author?.username ??
                                (post.authorId === user.id ? 'You' : 'Another user')}
                            </button>
                          </td>
                        ) : null}
                        {showCategories ? (
                          <td className="categories column-categories">
                            {post.terms.categories.map((term) => (
                              <button
                                key={term.id}
                                type="button"
                                className="term-link"
                                onClick={() => {
                                  setCategoryFilter(term.id);
                                  setPendingCategory(term.id);
                                  setPage(1);
                                }}
                              >
                                {term.name}
                              </button>
                            ))}
                            {post.terms.categories.length === 0 && (
                              <span className="no-terms">—</span>
                            )}
                          </td>
                        ) : null}
                        {showTags ? (
                          <td className="tags column-tags">
                            {post.terms.tags.map((term) => (
                              <button
                                key={term.id}
                                type="button"
                                className="term-link"
                                onClick={() => {
                                  setTagFilter(term.id);
                                  setPage(1);
                                }}
                              >
                                {term.name}
                              </button>
                            ))}
                            {post.terms.tags.length === 0 && <span className="no-terms">—</span>}
                          </td>
                        ) : null}
                        {showComments ? <td className="comments column-comments" /> : null}
                        {showDate ? (
                          <td className="date column-date">
                            <span className={`wp-status-prefix is-${post.status.toLowerCase()}`}>
                              {post.status === 'PUBLISHED'
                                ? 'Published'
                                : post.status === 'DRAFT'
                                  ? 'Draft'
                                  : 'Trashed'}
                            </span>
                            <br />
                            {formatWpDate(
                              post.status === 'PUBLISHED' ? post.publishedAt : post.updatedAt,
                            )}
                          </td>
                        ) : null}
                      </tr>
                      {quickId === post.id ? (
                        <tr className="quick-edit-row">
                          <td colSpan={visibleColumnCount} className="colspanchange">
                            <div
                              className="inline-edit-wrapper"
                              role="region"
                              aria-label={`Quick edit ${post.title}`}
                            >
                              <fieldset className="inline-edit-col-left">
                                <legend className="inline-edit-legend">Quick Edit</legend>
                                <div className="inline-edit-col">
                                  <label>
                                    <span className="title">Title</span>
                                    <span className="input-text-wrap">
                                      <input
                                        type="text"
                                        value={quickTitle}
                                        onChange={(event) => setQuickTitle(event.target.value)}
                                        disabled={quickBusy}
                                        required
                                      />
                                    </span>
                                  </label>
                                  <label>
                                    <span className="title">Slug</span>
                                    <span className="input-text-wrap">
                                      <input
                                        type="text"
                                        value={quickSlug}
                                        onChange={(event) => setQuickSlug(event.target.value)}
                                        disabled={quickBusy}
                                      />
                                    </span>
                                  </label>
                                </div>
                              </fieldset>
                              <fieldset className="inline-edit-col-right">
                                <div className="inline-edit-col">
                                  <label>
                                    <span className="title">Status</span>
                                    <span className="input-text-wrap">
                                      <select
                                        value={quickStatus}
                                        onChange={(event) =>
                                          setQuickStatus(
                                            event.target.value as 'DRAFT' | 'PUBLISHED',
                                          )
                                        }
                                        disabled={quickBusy}
                                      >
                                        {transitions.includes('unpublish') ||
                                        post.status === 'DRAFT' ? (
                                          <option value="DRAFT">Draft</option>
                                        ) : null}
                                        {transitions.includes('publish') ||
                                        post.status === 'PUBLISHED' ? (
                                          <option value="PUBLISHED">Published</option>
                                        ) : null}
                                      </select>
                                    </span>
                                  </label>
                                </div>
                              </fieldset>
                              <div className="inline-edit-save submit">
                                {quickError ? (
                                  <p className="form-error" role="alert">
                                    {quickError}
                                  </p>
                                ) : null}
                                <button
                                  type="button"
                                  className="button primary-button save"
                                  disabled={quickBusy}
                                  aria-busy={quickBusy}
                                  onClick={() => void saveQuickEdit(post)}
                                >
                                  {quickBusy ? 'Updating…' : 'Update'}
                                </button>
                                <button
                                  type="button"
                                  className="button secondary-button cancel"
                                  onClick={() => setQuickId(null)}
                                  disabled={quickBusy}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>

              <tfoot>
                <tr>
                  <th scope="col" className="check-column">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={
                        data.items.filter((post) => canEditPost(user, post)).length > 0 &&
                        data.items
                          .filter((post) => canEditPost(user, post))
                          .every((post) => selected.has(post.id))
                      }
                      onChange={() => toggleSelectAll()}
                    />
                  </th>
                  <th scope="col" className="column-title">
                    <button
                      type="button"
                      className="sortable-column"
                      aria-label="Sort by title"
                      onClick={() => toggleSort('title')}
                    >
                      Title
                      <SortIndicator direction={sort === 'title' ? order : null} />
                    </button>
                  </th>
                  {showAuthor ? (
                    <th scope="col" className="column-author">
                      Author
                    </th>
                  ) : null}
                  {showCategories ? (
                    <th scope="col" className="column-categories">
                      Categories
                    </th>
                  ) : null}
                  {showTags ? (
                    <th scope="col" className="column-tags">
                      Tags
                    </th>
                  ) : null}
                  {showComments ? (
                    <th scope="col" className="column-comments">
                      <span className="screen-reader-text">Comments</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M4 4h16v12H8l-4 4V4z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                        />
                      </svg>
                    </th>
                  ) : null}
                  {showDate ? (
                    <th scope="col" className="column-date">
                      <button
                        type="button"
                        className="sortable-column"
                        aria-label={`Sort by date${sort === 'updatedAt' && order === 'desc' ? ', descending' : ''}`}
                        onClick={() => toggleSort('updatedAt')}
                      >
                        Date
                        <SortIndicator direction={sort === 'updatedAt' ? order : null} />
                      </button>
                    </th>
                  ) : null}
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="tablenav bottom">
            <div className="alignleft">
              <label htmlFor={`${type}-bulk-action-bottom`} className="screen-reader-text">
                Bulk actions
              </label>
              <select
                id={`${type}-bulk-action-bottom`}
                className="bulk-select"
                value={bulkAction}
                onChange={(event) => setBulkAction(event.target.value as BulkAction | 'edit' | '')}
              >
                <option value="">Bulk actions</option>
                {bulkOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="button secondary-button bulk-apply"
                disabled={bulkBusy}
                onClick={() => void runBulkAction()}
              >
                {bulkBusy ? 'Applying…' : 'Apply'}
              </button>
            </div>
            <div className="alignright">
              <span className="displaying-num">
                {`${data.pagination.total} ${data.pagination.total === 1 ? 'item' : 'items'}`}
              </span>
            </div>
          </div>

          {totalPages > 1 ? (
            <Pagination
              page={page}
              totalPages={totalPages}
              total={data.pagination.total}
              singular="item"
              plural="items"
              ariaLabel={`${label} pagination`}
              onChange={(next) => applyFilters(status, search, next)}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

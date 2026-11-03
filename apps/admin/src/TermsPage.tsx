import { useEffect, useState, type FormEvent } from 'react';
import {
  actionErrorMessage,
  createTerm,
  deleteTerm,
  fetchTerms,
  updateTerm,
  type AdminTerm,
  type AuthUser,
  type Paged,
  type TaxonomyType,
} from './api.js';
import {
  EmptyState,
  ErrorState,
  Notice,
  Skeleton,
  PageHeader,
  SortIndicator,
  type NoticeMessage,
} from './components.js';
import { canManageTerms } from './roles.js';
import { replace, useLocation } from './router.js';
import { SCREEN_OPTIONS_EVENT, screenPerPage } from './screenOptions.js';

const DEFAULT_PER_PAGE = 10;

type TaxonomyTab = TaxonomyType;

function initialTaxonomy(): TaxonomyTab {
  const value = new URLSearchParams(window.location.search).get('taxonomy');
  return value === 'tag' ? 'tag' : 'category';
}

function initialSearch(): string {
  return new URLSearchParams(window.location.search).get('search') ?? '';
}

function initialPage(): number {
  const value = Number(new URLSearchParams(window.location.search).get('page') ?? '1');
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function taxonomyLabel(taxonomy: TaxonomyType): string {
  return taxonomy === 'category' ? 'Categories' : 'Tags';
}

function singularLabel(taxonomy: TaxonomyType): string {
  return taxonomy === 'category' ? 'Category' : 'Tag';
}

function taxonomyPlural(taxonomy: TaxonomyType): string {
  return taxonomy === 'category' ? 'Categories' : 'Tags';
}

export function TermsPage({ user }: { user: AuthUser }) {
  const allowed = canManageTerms(user);
  const location = useLocation();

  const [taxonomy, setTaxonomy] = useState<TaxonomyTab>(initialTaxonomy);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch);
  const [page, setPage] = useState(initialPage);
  const [data, setData] = useState<Paged<AdminTerm> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [perPage, setPerPage] = useState(() => screenPerPage('terms', DEFAULT_PER_PAGE));
  const [sort, setSort] = useState<
    'name' | 'description' | 'slug' | 'count' | 'createdAt' | 'updatedAt'
  >('name');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');

  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newParent, setNewParent] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  function applyState(nextTaxonomy: TaxonomyTab, nextSearch: string, nextPage: number) {
    setTaxonomy(nextTaxonomy);
    setSearch(nextSearch);
    setSearchInput(nextSearch);
    setPage(nextPage);
    const params = new URLSearchParams();
    if (nextTaxonomy !== 'category') {
      params.set('taxonomy', nextTaxonomy);
    }
    if (nextSearch) {
      params.set('search', nextSearch);
    }
    if (nextPage > 1) {
      params.set('page', String(nextPage));
    }
    replace(`/terms${params.toString() ? `?${params.toString()}` : ''}`);
  }

  // Keep Back/Forward and direct links in sync with the URL (taxonomy/search/page).
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const nextTaxonomy: TaxonomyTab = params.get('taxonomy') === 'tag' ? 'tag' : 'category';
    const nextSearch = params.get('search') ?? '';
    const rawPage = Number(params.get('page') ?? '1');
    const nextPage = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
    setTaxonomy(nextTaxonomy);
    setSearch(nextSearch);
    setSearchInput(nextSearch);
    setPage(nextPage);
  }, [location.search]);

  useEffect(() => {
    function onOptions() {
      setPerPage(screenPerPage('terms', DEFAULT_PER_PAGE));
    }
    window.addEventListener(SCREEN_OPTIONS_EVENT, onOptions);
    return () => window.removeEventListener(SCREEN_OPTIONS_EVENT, onOptions);
  }, []);

  useEffect(() => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);

    fetchTerms({
      taxonomy,
      ...(search ? { search } : {}),
      page,
      perPage,
      sort,
      order,
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
  }, [allowed, taxonomy, search, page, reloadKey]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applyState(taxonomy, searchInput.trim(), 1);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    const name = newName.trim();
    if (!name) {
      setCreateError('Name is required.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    setNotice(null);
    try {
      await createTerm({
        taxonomy,
        name,
        ...(newSlug.trim() ? { slug: newSlug.trim() } : {}),
        ...(newDescription.trim() ? { description: newDescription.trim() } : {}),
        ...(taxonomy === 'category' && newParent ? { parentId: newParent } : {}),
      });
      setNewName('');
      setNewSlug('');
      setNewDescription('');
      setNewParent('');
      setNotice({
        tone: 'success',
        text: `${taxonomy === 'category' ? 'Category' : 'Tag'} created.`,
      });
      setReloadKey((value) => value + 1);
    } catch (caught) {
      const message =
        caught instanceof Error && 'details' in caught
          ? ((caught as { details?: Array<{ message?: string }> }).details?.[0]?.message ??
            actionErrorMessage(caught))
          : actionErrorMessage(caught);
      setCreateError(message);
    } finally {
      setCreating(false);
    }
  }

  function startRename(term: AdminTerm) {
    setEditingId(term.id);
    setEditName(term.name);
    setEditError(null);
  }

  function cancelRename() {
    setEditingId(null);
    setEditName('');
    setEditError(null);
  }

  async function saveRename(term: AdminTerm) {
    const name = editName.trim();
    if (!name) {
      setEditError('Name is required.');
      return;
    }
    if (pendingAction !== null) return;
    setPendingAction(`rename:${term.id}`);
    setEditError(null);
    setNotice(null);
    try {
      await updateTerm(term.id, { name });
      setEditingId(null);
      setEditName('');
      setNotice({ tone: 'success', text: 'Term renamed.' });
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setEditError(actionErrorMessage(caught));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDelete(term: AdminTerm) {
    const confirmMessage = `Delete “${term.name}”? ${term.postCount} post(s) will be detached.`;
    if (!window.confirm(confirmMessage)) {
      return;
    }
    const key = `delete:${term.id}`;
    if (pendingAction !== null) return;
    setPendingAction(key);
    setNotice(null);
    try {
      const result = await deleteTerm(term.id);
      setNotice({
        tone: 'success',
        text: `Term deleted. ${result.detachedPostCount} post(s) detached.`,
      });
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
        <PageHeader title={taxonomy === 'category' ? 'Categories' : 'Tags'} />
        <EmptyState
          title="No term management access"
          message="Your account does not have permission to manage categories and tags."
        />
      </>
    );
  }

  const totalPages = Math.max(data?.pagination.totalPages ?? 1, 1);

  function toggleTerm(id: string): void {
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

  async function deleteSelected(): Promise<void> {
    if (!data || selected.size === 0) return;
    const targets = data.items.filter((term) => selected.has(term.id));
    if (targets.length === 0) return;
    if (!window.confirm(`Delete ${targets.length} ${taxonomyPlural(taxonomy).toLowerCase()}?`)) {
      return;
    }
    setBulkBusy(true);
    setNotice(null);
    try {
      for (const term of targets) {
        await deleteTerm(term.id);
      }
      setNotice({
        tone: 'success',
        text: `${targets.length} ${taxonomyPlural(taxonomy).toLowerCase()} deleted.`,
      });
      setSelected(new Set());
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="wp-list-screen">
      <div className="list-title-row">
        <h1>{taxonomy === 'category' ? 'Categories' : 'Tags'}</h1>
      </div>

      <div className="terms-search-row">
        <form className="search-form" onSubmit={handleSearch} role="search">
          <label htmlFor="term-search" className="screen-reader-text">
            Search {taxonomyPlural(taxonomy)}
          </label>
          <input
            id="term-search"
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            disabled={loading}
          />
          <button type="submit" className="button secondary-button" disabled={loading}>
            Search {taxonomyPlural(taxonomy)}
          </button>
        </form>
      </div>

      {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}

      <div className="terms-layout">
        {/* Left column: add term form */}
        <aside className="terms-add-panel">
          <form
            className="terms-add-form"
            onSubmit={handleCreate}
            aria-label={`Create ${singularLabel(taxonomy)}`}
          >
            <h2>Add {singularLabel(taxonomy)}</h2>
            <div className="field">
              <label htmlFor="term-new-name">Name</label>
              <input
                id="term-new-name"
                type="text"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                disabled={creating}
                required
              />
              <p className="field-help">The name is how it appears on your site.</p>
            </div>
            <div className="field">
              <label htmlFor="term-new-slug">Slug</label>
              <input
                id="term-new-slug"
                type="text"
                value={newSlug}
                onChange={(event) => setNewSlug(event.target.value)}
                disabled={creating}
              />
              <p className="field-help">
                The “slug” is the URL-friendly version of the name. It is usually all lowercase and
                contains only letters, numbers and hyphens.
              </p>
            </div>
            {taxonomy === 'category' ? (
              <div className="field">
                <label htmlFor="term-new-parent">Parent Category</label>
                <select
                  id="term-new-parent"
                  value={newParent}
                  onChange={(event) => setNewParent(event.target.value)}
                  disabled={creating}
                >
                  <option value="">None</option>
                  {(data?.items ?? []).map((term) => (
                    <option key={term.id} value={term.id}>
                      {term.name}
                    </option>
                  ))}
                </select>
                <p className="field-help">
                  Categories, unlike tags, can have a hierarchy. Totally optional.
                </p>
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="term-new-description">Description</label>
              <textarea
                id="term-new-description"
                value={newDescription}
                onChange={(event) => setNewDescription(event.target.value)}
                disabled={creating}
                rows={5}
              />
              <p className="field-help">
                The description is not prominent by default; however, some themes may show it.
              </p>
            </div>
            {createError ? (
              <p className="form-error" role="alert">
                {createError}
              </p>
            ) : null}
            <div className="field actions">
              <button
                type="submit"
                className="button primary-button"
                disabled={creating}
                aria-busy={creating}
              >
                {creating ? 'Creating…' : `Add ${singularLabel(taxonomy)}`}
              </button>
            </div>
          </form>
        </aside>

        {/* Right column: term list table */}
        <section className="terms-list">
          {error ? (
            <ErrorState
              title={`Could not load ${taxonomyLabel(taxonomy).toLowerCase()}`}
              message={error}
              onRetry={() => setReloadKey((value) => value + 1)}
            />
          ) : loading ? (
            <Skeleton label={`Loading ${taxonomyLabel(taxonomy).toLowerCase()}…`} lines={5} />
          ) : !data || data.items.length === 0 ? (
            <EmptyState
              title={
                search ? 'No matching terms' : `No ${taxonomyLabel(taxonomy).toLowerCase()} yet`
              }
              message={
                search
                  ? 'Try a different search term.'
                  : `Create your first ${singularLabel(taxonomy)} to get started.`
              }
              action={
                <button
                  className="button primary-button"
                  onClick={(event) => {
                    event.preventDefault();
                    document.getElementById('term-new-name')?.focus();
                  }}
                >
                  Add New {singularLabel(taxonomy)}
                </button>
              }
            />
          ) : (
            <>
              <div className="tablenav">
                <div className="alignleft">
                  <label htmlFor="terms-bulk-action" className="screen-reader-text">
                    Bulk actions
                  </label>
                  <select id="terms-bulk-action" className="bulk-select" defaultValue="">
                    <option value="">Bulk actions</option>
                    <option value="delete">Delete</option>
                  </select>
                  <button
                    type="button"
                    className="button secondary-button bulk-apply"
                    disabled={bulkBusy}
                    onClick={() => void deleteSelected()}
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

              <div className="table-scroll">
                <table className="content-table widefat fixed striped terms">
                  <caption className="screen-reader-text">{taxonomyPlural(taxonomy)}</caption>
                  <thead>
                    <tr>
                      <th scope="col" className="check-column">
                        <input
                          type="checkbox"
                          aria-label="Select all"
                          checked={
                            data.items.length > 0 &&
                            data.items.every((term) => selected.has(term.id))
                          }
                          onChange={() =>
                            setSelected((current) =>
                              data.items.every((term) => current.has(term.id))
                                ? new Set()
                                : new Set(data.items.map((term) => term.id)),
                            )
                          }
                        />
                      </th>
                      <th scope="col" className="column-name">
                        <button
                          type="button"
                          className="sortable-column"
                          aria-label={`Sort by name${order === 'asc' ? ', ascending' : ''}`}
                          onClick={() => {
                            setSort('name');
                            setOrder((value) => (value === 'asc' ? 'desc' : 'asc'));
                            setPage(1);
                          }}
                        >
                          Name
                          <SortIndicator direction={sort === 'name' ? order : null} />
                        </button>
                      </th>
                      <th scope="col">
                        <button
                          type="button"
                          className="sortable-column"
                          aria-label={`Sort by description${sort === 'description' ? (order === 'asc' ? ', descending' : ', ascending') : ''}`}
                          onClick={() => {
                            if (sort === 'description') {
                              setOrder((value) => (value === 'asc' ? 'desc' : 'asc'));
                            } else {
                              setSort('description');
                              setOrder('asc');
                            }
                            setPage(1);
                          }}
                        >
                          Description
                          <SortIndicator direction={sort === 'description' ? order : null} />
                        </button>
                      </th>
                      <th scope="col">
                        <button
                          type="button"
                          className="sortable-column"
                          aria-label={`Sort by slug${sort === 'slug' ? (order === 'asc' ? ', descending' : ', ascending') : ''}`}
                          onClick={() => {
                            if (sort === 'slug') {
                              setOrder((value) => (value === 'asc' ? 'desc' : 'asc'));
                            } else {
                              setSort('slug');
                              setOrder('asc');
                            }
                            setPage(1);
                          }}
                        >
                          Slug
                          <SortIndicator direction={sort === 'slug' ? order : null} />
                        </button>
                      </th>
                      <th scope="col">
                        <button
                          type="button"
                          className="sortable-column"
                          aria-label={`Sort by count${sort === 'count' ? (order === 'asc' ? ', descending' : ', ascending') : ''}`}
                          onClick={() => {
                            if (sort === 'count') {
                              setOrder((value) => (value === 'asc' ? 'desc' : 'asc'));
                            } else {
                              setSort('count');
                              setOrder('asc');
                            }
                            setPage(1);
                          }}
                        >
                          Count
                          <SortIndicator direction={sort === 'count' ? order : null} />
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((term) => {
                      const isEditing = editingId === term.id;
                      const isDeleting = pendingAction === `delete:${term.id}`;
                      return (
                        <tr key={term.id}>
                          <th scope="row" className="check-column">
                            <input
                              type="checkbox"
                              aria-label={`Select ${term.name}`}
                              checked={selected.has(term.id)}
                              onChange={() => toggleTerm(term.id)}
                            />
                          </th>
                          <td className="title column-name">
                            {isEditing ? (
                              <div className="field inline">
                                <input
                                  type="text"
                                  value={editName}
                                  onChange={(event) => setEditName(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault();
                                      void saveRename(term);
                                    }
                                    if (event.key === 'Escape') {
                                      cancelRename();
                                    }
                                  }}
                                  disabled={pendingAction !== null}
                                  aria-label={`Rename ${term.name}`}
                                />
                                <div className="row-actions" style={{ visibility: 'visible' }}>
                                  <button
                                    type="button"
                                    className="button small-button edit-link"
                                    disabled={pendingAction !== null}
                                    aria-busy={pendingAction === `rename:${term.id}`}
                                    onClick={() => void saveRename(term)}
                                  >
                                    {pendingAction === `rename:${term.id}` ? 'Saving…' : 'Save'}
                                  </button>
                                  <button
                                    type="button"
                                    className="button small-button delete-link"
                                    disabled={pendingAction !== null}
                                    onClick={cancelRename}
                                  >
                                    Cancel
                                  </button>
                                </div>
                                {editError ? (
                                  <p className="field-error" role="alert">
                                    {editError}
                                  </p>
                                ) : null}
                              </div>
                            ) : (
                              <>
                                <span className="row-title">{term.name}</span>
                                <div className="row-actions">
                                  <button
                                    type="button"
                                    className="row-action-link"
                                    disabled={pendingAction !== null}
                                    onClick={() => startRename(term)}
                                  >
                                    Edit
                                  </button>
                                  <span className="row-action-sep" aria-hidden="true">
                                    {' '}
                                    |{' '}
                                  </span>
                                  <button
                                    type="button"
                                    className="row-action-link is-danger"
                                    disabled={pendingAction !== null}
                                    aria-busy={isDeleting}
                                    onClick={() => void handleDelete(term)}
                                  >
                                    {isDeleting ? 'Deleting…' : 'Delete'}
                                  </button>
                                </div>
                              </>
                            )}
                          </td>
                          <td className="description column-description">
                            {term.description ?? '—'}
                          </td>
                          <td className="slug column-slug">
                            <code>{term.slug}</code>
                          </td>
                          <td className="posts column-posts">
                            <a
                              href={
                                taxonomy === 'category'
                                  ? `/posts?category=${term.id}`
                                  : `/posts?tag=${term.id}`
                              }
                              onClick={(event) => {
                                event.preventDefault();
                                window.location.assign(
                                  taxonomy === 'category'
                                    ? `/admin/posts?category=${term.id}`
                                    : `/admin/posts?tag=${term.id}`,
                                );
                              }}
                            >
                              {term.postCount}
                            </a>
                          </td>
                        </tr>
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
                            data.items.length > 0 &&
                            data.items.every((term) => selected.has(term.id))
                          }
                          onChange={() =>
                            setSelected((current) =>
                              data.items.every((term) => current.has(term.id))
                                ? new Set()
                                : new Set(data.items.map((term) => term.id)),
                            )
                          }
                        />
                      </th>
                      <th scope="col" className="column-name">
                        <button
                          type="button"
                          className="sortable-column"
                          aria-label={`Sort by name${order === 'asc' ? ', ascending' : ''}`}
                          onClick={() => {
                            setSort('name');
                            setOrder((value) => (value === 'asc' ? 'desc' : 'asc'));
                            setPage(1);
                          }}
                        >
                          Name
                          <SortIndicator direction={sort === 'name' ? order : null} />
                        </button>
                      </th>
                      <th scope="col">
                        <button
                          type="button"
                          className="sortable-column"
                          aria-label={`Sort by description${sort === 'description' ? (order === 'asc' ? ', descending' : ', ascending') : ''}`}
                          onClick={() => {
                            if (sort === 'description') {
                              setOrder((value) => (value === 'asc' ? 'desc' : 'asc'));
                            } else {
                              setSort('description');
                              setOrder('asc');
                            }
                            setPage(1);
                          }}
                        >
                          Description
                          <SortIndicator direction={sort === 'description' ? order : null} />
                        </button>
                      </th>
                      <th scope="col">
                        <button
                          type="button"
                          className="sortable-column"
                          aria-label={`Sort by slug${sort === 'slug' ? (order === 'asc' ? ', descending' : ', ascending') : ''}`}
                          onClick={() => {
                            if (sort === 'slug') {
                              setOrder((value) => (value === 'asc' ? 'desc' : 'asc'));
                            } else {
                              setSort('slug');
                              setOrder('asc');
                            }
                            setPage(1);
                          }}
                        >
                          Slug
                          <SortIndicator direction={sort === 'slug' ? order : null} />
                        </button>
                      </th>
                      <th scope="col">
                        <button
                          type="button"
                          className="sortable-column"
                          aria-label={`Sort by count${sort === 'count' ? (order === 'asc' ? ', descending' : ', ascending') : ''}`}
                          onClick={() => {
                            if (sort === 'count') {
                              setOrder((value) => (value === 'asc' ? 'desc' : 'asc'));
                            } else {
                              setSort('count');
                              setOrder('asc');
                            }
                            setPage(1);
                          }}
                        >
                          Count
                          <SortIndicator direction={sort === 'count' ? order : null} />
                        </button>
                      </th>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {totalPages > 1 ? (
                <nav className="pagination" aria-label={`${taxonomyPlural(taxonomy)} pagination`}>
                  <div className="tablenav-pages">
                    <span className="displaying-num">
                      {data.pagination.total}{' '}
                      {data.pagination.total === 1
                        ? taxonomyLabel(taxonomy)
                        : taxonomyPlural(taxonomy)}
                    </span>
                    <span className="pagination-links">
                      <button
                        type="button"
                        className="button secondary-button pagination-button"
                        aria-label="First page"
                        title="First page"
                        disabled={page <= 1}
                        onClick={() => applyState(taxonomy, search, 1)}
                      >
                        «
                      </button>
                      <button
                        type="button"
                        className="button secondary-button pagination-button"
                        aria-label="Previous page"
                        title="Previous page"
                        disabled={page <= 1}
                        onClick={() => applyState(taxonomy, search, page - 1)}
                      >
                        ‹
                      </button>
                      <span className="page-numbers current">
                        Page {page} of {totalPages}
                      </span>
                      <button
                        type="button"
                        className="button secondary-button pagination-button"
                        aria-label="Next page"
                        title="Next page"
                        disabled={page >= totalPages}
                        onClick={() => applyState(taxonomy, search, page + 1)}
                      >
                        ›
                      </button>
                      <button
                        type="button"
                        className="button secondary-button pagination-button"
                        aria-label="Last page"
                        title="Last page"
                        disabled={page >= totalPages}
                        onClick={() => applyState(taxonomy, search, totalPages)}
                      >
                        »
                      </button>
                    </span>
                  </div>
                </nav>
              ) : null}

              <div className="tablenav">
                <div className="alignleft">
                  <label htmlFor="terms-bulk-action-bottom" className="screen-reader-text">
                    Bulk actions
                  </label>
                  <select id="terms-bulk-action-bottom" className="bulk-select" defaultValue="">
                    <option value="">Bulk actions</option>
                    <option value="delete">Delete</option>
                  </select>
                  <button
                    type="button"
                    className="button secondary-button bulk-apply"
                    disabled={bulkBusy}
                    onClick={() => void deleteSelected()}
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

              {taxonomy === 'category' ? (
                <p className="term-note">
                  Deleting a category does not delete the posts in that category. Instead, posts
                  that were only assigned to the deleted category are set to the default category
                  <strong> Uncategorized</strong>. The default category cannot be deleted.
                </p>
              ) : (
                <p className="term-note">
                  Deleting a tag does not delete the posts with that tag. Posts that were only
                  assigned to the deleted tag remain published.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

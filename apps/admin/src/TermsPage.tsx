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
  type NoticeMessage,
} from './components.js';
import { canManageTerms } from './roles.js';
import { replace } from './router.js';

const PER_PAGE = 10;

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
  return taxonomy === 'category' ? 'category' : 'tag';
}

function taxonomyPlural(taxonomy: TaxonomyType): string {
  return taxonomy === 'category' ? 'categories' : 'tags';
}

export function TermsPage({ user }: { user: AuthUser }) {
  const allowed = canManageTerms(user);

  const [taxonomy, setTaxonomy] = useState<TaxonomyTab>(initialTaxonomy);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch);
  const [page, setPage] = useState(initialPage);
  const [data, setData] = useState<Paged<AdminTerm> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newDescription, setNewDescription] = useState('');
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
      perPage: PER_PAGE,
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
      });
      setNewName('');
      setNewSlug('');
      setNewDescription('');
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
        <PageHeader eyebrow="Taxonomy" title="Categories & Tags" />
        <EmptyState
          title="No term management access"
          message="Your account does not have permission to manage categories and tags."
        />
      </>
    );
  }

  const totalPages = Math.max(data?.pagination.totalPages ?? 1, 1);

  return (
    <>
      <PageHeader
        eyebrow="Taxonomy"
        title="Categories & Tags"
        description="Create, rename and delete categories and tags. Deleting a term detaches it from posts."
      />

      {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}

      <div className="taxonomy-tabs" role="tablist" aria-label="Taxonomy type">
        {(['category', 'tag'] as TaxonomyType[]).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={taxonomy === tab}
            className={`button small-button${taxonomy === tab ? ' nav-link-active' : ''}`}
            onClick={() => applyState(tab, '', 1)}
            disabled={pendingAction !== null}
          >
            {taxonomyLabel(tab)}
          </button>
        ))}
      </div>

      <div className="terms-layout">
        {/* Left column: add term form */}
        <aside className="terms-add-panel">
          <form
            className="terms-add-form"
            onSubmit={handleCreate}
            aria-label={`Create ${singularLabel(taxonomy)}`}
          >
            <h3>Add New {singularLabel(taxonomy)}</h3>
            <div className="field">
              <label htmlFor="term-new-name">New {singularLabel(taxonomy)} name</label>
              <input
                id="term-new-name"
                type="text"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Enter name"
                disabled={creating}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="term-new-slug">Slug</label>
              <input
                id="term-new-slug"
                type="text"
                value={newSlug}
                onChange={(event) => setNewSlug(event.target.value)}
                placeholder="Enter slug"
                disabled={creating}
              />
              <p className="field-help">
                The “slug” is the URL-friendly version of the name. It is usually all lowercase and
                contains only letters, numbers and hyphens.
              </p>
            </div>
            <div className="field">
              <label htmlFor="term-new-description">Description</label>
              <textarea
                id="term-new-description"
                value={newDescription}
                onChange={(event) => setNewDescription(event.target.value)}
                placeholder="Enter description"
                disabled={creating}
                rows={2}
              />
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
                {creating ? 'Creating…' : `Add New ${singularLabel(taxonomy)}`}
              </button>
            </div>
          </form>
        </aside>

        {/* Right column: term list table */}
        <section className="terms-list">
          <form className="list-filters" onSubmit={handleSearch} role="search">
            <div className="field">
              <label htmlFor="term-search">Search {taxonomyLabel(taxonomy).toLowerCase()}</label>
              <input
                id="term-search"
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Name or slug"
                disabled={loading}
              />
            </div>
            <button type="submit" className="button secondary-button" disabled={loading}>
              Search
            </button>
          </form>

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
              <div className="table-scroll">
                <table className="content-table widefat fixed striped terms">
                  <caption className="screen-reader-text">{taxonomyPlural(taxonomy)}</caption>
                  <thead>
                    <tr>
                      <th scope="col" className="check-column">
                        <input type="checkbox" />
                      </th>
                      <th scope="col">Name</th>
                      <th scope="col">Description</th>
                      <th scope="col">Slug</th>
                      <th scope="col">Posts</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((term) => {
                      const isEditing = editingId === term.id;
                      const isDeleting = pendingAction === `delete:${term.id}`;
                      return (
                        <tr key={term.id}>
                          <th scope="row" className="check-column">
                            <input type="checkbox" />
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
                                    className="button small-button edit-link"
                                    disabled={pendingAction !== null}
                                    onClick={() => startRename(term)}
                                  >
                                    Rename
                                  </button>
                                  <button
                                    type="button"
                                    className="button small-button delete-link"
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
                          <td className="posts column-posts">{term.postCount}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

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
                      className="button secondary-button pagination-button prev"
                      disabled={page <= 1}
                      onClick={() => applyState(taxonomy, search, page - 1)}
                    >
                      « Previous
                    </button>
                    <span className="page-numbers current">
                      Page {page} of {totalPages}
                    </span>
                    <button
                      type="button"
                      className="button secondary-button pagination-button next"
                      disabled={page >= totalPages}
                      onClick={() => applyState(taxonomy, search, page + 1)}
                    >
                      Next »
                    </button>
                  </span>
                </div>
              </nav>
            </>
          )}
        </section>
      </div>
    </>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import {
  actionErrorMessage,
  bulkSetCommentStatus,
  deleteComment,
  fetchComments,
  setCommentStatus,
  updateComment,
  type AdminComment,
  type CommentCounts,
  type CommentStatus,
  type AuthUser,
} from './api.js';
import {
  ErrorState,
  Modal,
  Notice,
  PageHeader,
  Skeleton,
  type NoticeMessage,
} from './components.js';
import { navigate } from './router.js';
import { canModerateComments } from './roles.js';
import {
  SCREEN_COLUMNS_EVENT,
  SCREEN_OPTIONS_EVENT,
  screenHiddenColumns,
  screenPerPage,
} from './screenOptions.js';

const STATUS_TABS: Array<{ id: CommentStatus | ''; label: string; countKey: keyof CommentCounts }> =
  [
    { id: '', label: 'All', countKey: 'all' },
    { id: 'PENDING', label: 'Pending', countKey: 'pending' },
    { id: 'APPROVED', label: 'Approved', countKey: 'approved' },
    { id: 'SPAM', label: 'Spam', countKey: 'spam' },
    { id: 'TRASHED', label: 'Trash', countKey: 'trashed' },
  ];

function formatCommentDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  let hours = date.getHours();
  const suffix = hours < 12 ? 'am' : 'pm';
  hours = hours % 12 || 12;
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${y}/${m}/${d} at ${hours}:${minutes} ${suffix}`;
}

function excerpt(text: string, length = 160): string {
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

function statusLabel(status: CommentStatus): string {
  switch (status) {
    case 'PENDING':
      return 'Pending';
    case 'APPROVED':
      return 'Approved';
    case 'SPAM':
      return 'Spam';
    case 'TRASHED':
      return 'Trash';
  }
}

export function CommentsPage({ user }: { user: AuthUser }) {
  const [postId] = useState(() => {
    if (typeof window === 'undefined') return undefined;
    return new URLSearchParams(window.location.search).get('post_id') ?? undefined;
  });
  const [status, setStatus] = useState<CommentStatus | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() => screenPerPage('comments', 20));
  const [reloadKey, setReloadKey] = useState(0);
  const [hiddenColumns, setHiddenColumns] = useState(() => screenHiddenColumns('comments'));
  const [data, setData] = useState<{
    items: AdminComment[];
    total: number;
    totalPages: number;
    counts: CommentCounts;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<CommentStatus | ''>('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminComment | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    const sync = () => {
      setPerPage(screenPerPage('comments', 20));
      setHiddenColumns(screenHiddenColumns('comments'));
    };
    window.addEventListener(SCREEN_OPTIONS_EVENT, sync);
    window.addEventListener(SCREEN_COLUMNS_EVENT, sync);
    return () => {
      window.removeEventListener(SCREEN_OPTIONS_EVENT, sync);
      window.removeEventListener(SCREEN_COLUMNS_EVENT, sync);
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchComments({
      ...(status ? { status } : {}),
      ...(postId ? { postId } : {}),
      ...(search ? { search } : {}),
      page,
      perPage,
    })
      .then((result) => {
        if (!active) return;
        setData(result);
        setSelected(new Set());
      })
      .catch((caught) => {
        if (!active) return;
        setError(actionErrorMessage(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [status, search, page, postId, perPage, reloadKey]);

  const counts = data?.counts;
  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;
  const moderator = canModerateComments(user);
  const showAuthor = !hiddenColumns.has('author');
  const showComment = !hiddenColumns.has('comment');
  const showResponse = !hiddenColumns.has('response');
  const showDate = !hiddenColumns.has('date');
  const commentColumnCount =
    1 + [showAuthor, showComment, showResponse, showDate].filter(Boolean).length;

  function changeTab(next: CommentStatus | '') {
    setStatus(next);
    setPage(1);
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((current) =>
      current.size === items.length ? new Set() : new Set(items.map((item) => item.id)),
    );
  }

  async function applyStatus(item: AdminComment, nextStatus: CommentStatus) {
    if (busyId) return;
    setBusyId(item.id);
    setNotice(null);
    try {
      await setCommentStatus(item.id, nextStatus);
      setNotice({ tone: 'success', text: `Comment ${statusLabel(nextStatus).toLowerCase()}.` });
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setBusyId(null);
    }
  }

  async function applyBulk() {
    if (!bulkAction || selected.size === 0) return;
    setNotice(null);
    try {
      await bulkSetCommentStatus([...selected], bulkAction);
      setNotice({
        tone: 'success',
        text: `${selected.size} comment${selected.size === 1 ? '' : 's'} updated.`,
      });
      setSelected(new Set());
      setBulkAction('');
      setPage(1);
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    }
  }

  async function remove(item: AdminComment) {
    if (!window.confirm(`Delete “${item.authorName}” permanently?`)) return;
    setBusyId(item.id);
    setNotice(null);
    try {
      await deleteComment(item.id);
      setNotice({ tone: 'success', text: 'Comment deleted permanently.' });
      setSelected(new Set());
      setPage(1);
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setBusyId(null);
    }
  }

  function openEdit(item: AdminComment) {
    setEditing(item);
    setEditName(item.authorName);
    setEditEmail(item.authorEmail);
    setEditUrl(item.authorUrl ?? '');
    setEditContent(item.content);
    setEditError(null);
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || savingEdit) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      const updated = await updateComment(editing.id, {
        authorName: editName,
        authorEmail: editEmail,
        authorUrl: editUrl.trim() ? editUrl.trim() : null,
        content: editContent,
      });
      setData((current) =>
        current
          ? {
              ...current,
              items: current.items.map((entry) => (entry.id === updated.id ? updated : entry)),
            }
          : current,
      );
      setNotice({ tone: 'success', text: 'Comment updated.' });
      setEditing(null);
    } catch (caught) {
      setEditError(actionErrorMessage(caught));
    } finally {
      setSavingEdit(false);
    }
  }

  const commentsTableHead = (
    <thead>
      <tr>
        <th scope="col" className="check-column">
          <input
            type="checkbox"
            aria-label="Select all comments"
            checked={items.length > 0 && selected.size === items.length}
            onChange={toggleSelectAll}
            disabled={!moderator}
          />
        </th>
        {showAuthor ? (
          <th scope="col" className="column-author">
            Author
          </th>
        ) : null}
        {showComment ? (
          <th scope="col" className="column-comment">
            Comment
          </th>
        ) : null}
        {showResponse ? (
          <th scope="col" className="column-response">
            In response to
          </th>
        ) : null}
        {showDate ? (
          <th scope="col" className="column-date">
            Submitted on
          </th>
        ) : null}
      </tr>
    </thead>
  );

  return (
    <>
      <PageHeader title="Comments" />
      {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}

      <div className="wp-list-screen comments-screen">
        <div className="list-top">
          <ul className="subsubsub" aria-label="Comment status">
            {STATUS_TABS.map((tab, index) => (
              <li key={tab.label}>
                {index > 0 ? <span className="subsubsub-sep">|</span> : null}
                <button
                  type="button"
                  className={`subsubsub-tab${status === tab.id ? ' is-current' : ''}`}
                  onClick={() => changeTab(tab.id)}
                >
                  {tab.label}{' '}
                  <span className="subsubsub-count">({counts ? counts[tab.countKey] : '—'})</span>
                </button>
              </li>
            ))}
          </ul>
          <form
            className="search-form"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(searchInput.trim());
              setPage(1);
            }}
          >
            <label htmlFor="comment-search" className="screen-reader-text">
              Search Comments
            </label>
            <input
              id="comment-search"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <button type="submit" className="button secondary-button">
              Search Comments
            </button>
          </form>
        </div>

        <div className="tablenav">
          <div className="alignleft actions bulkactions">
            <label htmlFor="bulk-action-selector-top" className="screen-reader-text">
              Select bulk action
            </label>
            <select
              id="bulk-action-selector-top"
              value={bulkAction}
              onChange={(event) => setBulkAction(event.target.value as CommentStatus | '')}
              disabled={!moderator}
            >
              <option value="">Bulk actions</option>
              <option value="APPROVED">Approve</option>
              <option value="PENDING">Unapprove</option>
              <option value="SPAM">Mark as spam</option>
              <option value="TRASHED">Move to Trash</option>
            </select>
            <button
              type="button"
              className="button"
              onClick={() => void applyBulk()}
              disabled={!bulkAction || selected.size === 0 || !moderator}
            >
              Apply
            </button>
          </div>
          <span className="displaying-num">
            {data?.total ?? 0} {data?.total === 1 ? 'item' : 'items'}
          </span>
        </div>

        {error ? (
          <ErrorState title="Comments unavailable" message={error} />
        ) : loading ? (
          <Skeleton label="Loading comments…" lines={6} />
        ) : items.length === 0 ? (
          <div className="table-scroll">
            <table className="content-table widefat fixed striped comments">
              <caption className="screen-reader-text">Comments</caption>
              {commentsTableHead}
              <tbody>
                <tr className="no-items">
                  <td colSpan={commentColumnCount}>No comments found.</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table className="content-table widefat fixed striped comments">
                <caption className="screen-reader-text">Comments</caption>
                {commentsTableHead}
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className={selected.has(item.id) ? 'is-selected' : undefined}>
                      <th scope="row" className="check-column">
                        <input
                          type="checkbox"
                          aria-label={`Select ${item.authorName}`}
                          checked={selected.has(item.id)}
                          onChange={() => toggleSelected(item.id)}
                          disabled={!moderator}
                        />
                      </th>
                      {showAuthor ? (
                        <td className="author column-author">
                          <span className="comment-avatar" aria-hidden="true">
                            {item.authorName.slice(0, 1).toUpperCase()}
                          </span>
                          <div className="comment-author-meta">
                            <strong>{item.authorName}</strong>
                            <a href={`mailto:${item.authorEmail}`}>{item.authorEmail}</a>
                            {item.authorUrl ? (
                              <a href={item.authorUrl} target="_blank" rel="noreferrer">
                                {item.authorUrl}
                              </a>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                      {showComment ? (
                        <td className="comment column-comment">
                          <span className={`comment-status is-${item.status.toLowerCase()}`}>
                            {statusLabel(item.status)}
                          </span>{' '}
                          {excerpt(item.content)}
                          <div className="row-actions">
                            {moderator ? (
                              <>
                                {item.status !== 'APPROVED' ? (
                                  <button
                                    type="button"
                                    className="row-action-link"
                                    onClick={() => void applyStatus(item, 'APPROVED')}
                                  >
                                    Approve
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="row-action-link"
                                    onClick={() => void applyStatus(item, 'PENDING')}
                                  >
                                    Unapprove
                                  </button>
                                )}
                                <span className="row-action-sep" aria-hidden="true">
                                  {' '}
                                  |{' '}
                                </span>
                                <button
                                  type="button"
                                  className="row-action-link"
                                  onClick={() => void applyStatus(item, 'SPAM')}
                                >
                                  Spam
                                </button>
                                <span className="row-action-sep" aria-hidden="true">
                                  {' '}
                                  |{' '}
                                </span>
                                <button
                                  type="button"
                                  className="row-action-link"
                                  onClick={() => void applyStatus(item, 'TRASHED')}
                                >
                                  Trash
                                </button>
                                <span className="row-action-sep" aria-hidden="true">
                                  {' '}
                                  |{' '}
                                </span>
                                <button
                                  type="button"
                                  className="row-action-link"
                                  onClick={() => openEdit(item)}
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
                                  onClick={() => void remove(item)}
                                  disabled={busyId === item.id}
                                >
                                  Delete Permanently
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                      {showResponse ? (
                        <td className="response column-response">
                          <a
                            href={`/posts/${item.postId}/edit`}
                            onClick={(event) => {
                              event.preventDefault();
                              navigate(`/posts/${item.postId}/edit`);
                            }}
                          >
                            {item.postTitle}
                          </a>
                        </td>
                      ) : null}
                      {showDate ? (
                        <td className="date column-date">{formatCommentDate(item.createdAt)}</td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 ? (
              <div className="tablenav bottom">
                <div className="tablenav-pages">
                  <button
                    type="button"
                    className="button"
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                    disabled={page <= 1}
                  >
                    ‹
                  </button>
                  <span className="paging-input">
                    {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    className="button"
                    onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                    disabled={page >= totalPages}
                  >
                    ›
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      {editing ? (
        <Modal title="Edit comment" onClose={() => setEditing(null)}>
          <form onSubmit={saveEdit} aria-label="Edit comment">
            <div className="field">
              <label htmlFor="comment-edit-name">Author</label>
              <input
                id="comment-edit-name"
                type="text"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                disabled={savingEdit}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="comment-edit-email">Email</label>
              <input
                id="comment-edit-email"
                type="email"
                value={editEmail}
                onChange={(event) => setEditEmail(event.target.value)}
                disabled={savingEdit}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="comment-edit-url">URL</label>
              <input
                id="comment-edit-url"
                type="url"
                value={editUrl}
                onChange={(event) => setEditUrl(event.target.value)}
                disabled={savingEdit}
              />
            </div>
            <div className="field">
              <label htmlFor="comment-edit-content">Comment</label>
              <textarea
                id="comment-edit-content"
                rows={6}
                value={editContent}
                onChange={(event) => setEditContent(event.target.value)}
                disabled={savingEdit}
                required
              />
            </div>
            {editError ? (
              <p className="form-error" role="alert">
                {editError}
              </p>
            ) : null}
            <div className="field actions">
              <button type="submit" className="button primary-button" disabled={savingEdit}>
                {savingEdit ? 'Saving…' : 'Update Comment'}
              </button>
              <button
                type="button"
                className="button secondary-button"
                onClick={() => setEditing(null)}
                disabled={savingEdit}
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}

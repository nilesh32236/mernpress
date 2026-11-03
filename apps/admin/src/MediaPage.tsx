import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  actionErrorMessage,
  deleteMedia,
  listMedia,
  updateMedia,
  uploadMedia,
  type AuthUser,
  type MediaItem,
  type Paged,
} from './api.js';
import { EmptyState, ErrorState, Notice, Skeleton, type NoticeMessage } from './components.js';
import { formatDateTime, pluralize } from './format.js';

const PER_PAGE = 24;
const MAX_SEARCH_LENGTH = 200;

/** Mirrors the server-side allow list (JPEG, PNG, WebP, GIF). */
const UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '—';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDimensions(item: MediaItem): string {
  return item.width && item.height ? `${item.width} × ${item.height}` : '—';
}

/** The 300px derivative when the server generated one, else the original. */
function thumbnailUrl(item: MediaItem): string {
  return item.derivatives['300'] ?? item.url;
}

function sanitizeSearch(value: string): string {
  return value.trim().slice(0, MAX_SEARCH_LENGTH);
}

function ImageIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

interface UploadJob {
  key: number;
  name: string;
  progress: number;
  status: 'uploading' | 'done' | 'error';
  error?: string;
}

interface MediaDrawerProps {
  item: MediaItem;
  onClose: () => void;
  onSaved: (item: MediaItem) => void;
  onDeleted: (item: MediaItem) => void;
}

/**
 * Right-side detail drawer: preview, editable metadata, file meta and delete.
 * It is an overlay (not a routed page) so the grid keeps its scroll position,
 * matching the editor sidebar's editing-in-place feel.
 */
function MediaDrawer({ item, onClose, onSaved, onDeleted }: MediaDrawerProps) {
  const titleId = useId();
  const drawerRef = useRef<HTMLElement>(null);
  const [altText, setAltText] = useState(item.altText);
  const [caption, setCaption] = useState(item.caption);
  const [description, setDescription] = useState(item.description);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Move focus into the panel (UsersPage dialogs behave the same way).
  useEffect(() => {
    drawerRef.current?.querySelector<HTMLElement>('input, textarea')?.focus();
  }, []);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || deleting) return;
    setSaving(true);
    setNotice(null);
    try {
      const updated = await updateMedia(item.id, { altText, caption, description });
      onSaved(updated);
      setNotice({ tone: 'success', text: 'Media details saved.' });
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (deleting || saving) return;
    if (!window.confirm(`Delete “${item.originalName}”? This cannot be undone.`)) {
      return;
    }
    setDeleting(true);
    setNotice(null);
    try {
      await deleteMedia(item.id);
      onDeleted(item);
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
      setDeleting(false);
    }
  }

  async function handleCopy() {
    const absolute =
      typeof window === 'undefined' ? item.url : new URL(item.url, window.location.origin).href;
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard is unavailable');
      }
      await navigator.clipboard.writeText(absolute);
      setNotice({ tone: 'success', text: 'URL copied to the clipboard.' });
    } catch {
      setNotice({
        tone: 'error',
        text: 'Could not copy the URL. Select it below and copy it manually.',
      });
    }
  }

  return (
    <div className="media-drawer-layer">
      <button
        type="button"
        className="media-drawer-backdrop"
        aria-label="Close media details"
        onClick={onClose}
      />
      <aside
        className="media-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={drawerRef}
      >
        <header className="media-drawer-head">
          <h2 id={titleId}>{item.originalName}</h2>
          <button type="button" className="media-drawer-close" onClick={onClose} aria-label="Close">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="media-drawer-preview">
          <img src={item.url} alt={item.altText || ''} />
        </div>

        {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}

        <form className="media-drawer-form" onSubmit={handleSave} aria-label="Media details">
          <div className="field">
            <label htmlFor="media-alt-text">Alt text</label>
            <input
              id="media-alt-text"
              type="text"
              value={altText}
              maxLength={500}
              onChange={(event) => setAltText(event.target.value)}
              disabled={saving || deleting}
            />
            <p className="field-help">Describe the image for screen readers and search engines.</p>
          </div>
          <div className="field">
            <label htmlFor="media-caption">Caption</label>
            <textarea
              id="media-caption"
              rows={3}
              value={caption}
              maxLength={2000}
              onChange={(event) => setCaption(event.target.value)}
              disabled={saving || deleting}
            />
          </div>
          <div className="field">
            <label htmlFor="media-description">Description</label>
            <textarea
              id="media-description"
              rows={4}
              value={description}
              maxLength={10000}
              onChange={(event) => setDescription(event.target.value)}
              disabled={saving || deleting}
            />
          </div>
          <div className="side-actions">
            <button
              type="submit"
              className="button primary-button"
              disabled={saving || deleting}
              aria-busy={saving}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="button secondary-button"
              onClick={() => void handleCopy()}
            >
              Copy URL
            </button>
          </div>
        </form>

        <div className="field">
          <label htmlFor="media-file-url">File URL</label>
          <input id="media-file-url" type="text" value={item.url} readOnly />
        </div>

        <dl className="media-meta-list">
          <div>
            <dt>File name</dt>
            <dd>{item.fileName}</dd>
          </div>
          <div>
            <dt>File type</dt>
            <dd>{item.mimeType}</dd>
          </div>
          <div>
            <dt>File size</dt>
            <dd>{formatBytes(item.sizeBytes)}</dd>
          </div>
          <div>
            <dt>Dimensions</dt>
            <dd>{formatDimensions(item)}</dd>
          </div>
          <div>
            <dt>Uploaded</dt>
            <dd>{formatDateTime(item.createdAt)}</dd>
          </div>
        </dl>

        <div className="media-drawer-danger">
          <button
            type="button"
            className="button secondary-button media-delete-button"
            onClick={() => void handleDelete()}
            disabled={deleting || saving}
            aria-busy={deleting}
          >
            {deleting ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </aside>
    </div>
  );
}

export function MediaPage({ user }: { user: AuthUser }) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<MediaItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest');
  // Media → Add New deep link opens the file picker once on mount.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('upload') === '1') {
      fileInputRef.current?.click();
    }
  }, []);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [uploads, setUploads] = useState<UploadJob[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadKey = useRef(0);
  const dataRef = useRef<Paged<MediaItem> | null>(null);

  const searchId = useId();

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    listMedia({
      page,
      perPage: PER_PAGE,
      type: 'image',
      ...(search ? { search } : {}),
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
  }, [page, search, reloadKey]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(sanitizeSearch(searchInput));
    setPage(1);
  }

  function openPicker() {
    fileInputRef.current?.click();
  }

  function patchUpload(key: number, patch: Partial<UploadJob>) {
    setUploads((current) => current.map((job) => (job.key === key ? { ...job, ...patch } : job)));
  }

  /** Insert a freshly uploaded item at the top of the grid and bump the count. */
  function insertMedia(item: MediaItem) {
    setData((current) => {
      if (!current) {
        return current;
      }
      const items = [item, ...current.items.filter((entry) => entry.id !== item.id)];
      const total = current.pagination.total + 1;
      return {
        items: items.slice(0, PER_PAGE),
        pagination: {
          ...current.pagination,
          total,
          totalPages: Math.ceil(total / PER_PAGE),
        },
      };
    });
  }

  async function startUpload(file: File) {
    uploadKey.current += 1;
    const key = uploadKey.current;
    setUploads((current) => [
      ...current,
      { key, name: file.name, progress: 0, status: 'uploading' },
    ]);

    try {
      const item = await uploadMedia(file, {
        onProgress: (percent) => patchUpload(key, { progress: percent }),
      });
      patchUpload(key, { progress: 100, status: 'done' });
      // Insert locally so the grid updates immediately; if the first page is
      // still loading there is nothing to insert into, so refetch instead.
      if (dataRef.current) {
        insertMedia(item);
      } else {
        setReloadKey((value) => value + 1);
      }
      setNotice({
        tone: 'success',
        text: `Uploaded “${item.originalName || file.name}”.`,
      });
    } catch (caught) {
      const message = actionErrorMessage(caught);
      patchUpload(key, { status: 'error', error: message });
      setNotice({ tone: 'error', text: message });
    }
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (files && files.length > 0) {
      for (const file of Array.from(files)) {
        void startUpload(file);
      }
    }
    // Reset so selecting the same file again fires another change event.
    event.target.value = '';
  }

  function handleSaved(updated: MediaItem) {
    setData((current) =>
      current
        ? {
            ...current,
            items: current.items.map((entry) => (entry.id === updated.id ? updated : entry)),
          }
        : current,
    );
    setSelected(updated);
  }

  function handleDeleted(removed: MediaItem) {
    setSelected(null);
    setData((current) => {
      if (!current) {
        return current;
      }
      const total = Math.max(0, current.pagination.total - 1);
      return {
        items: current.items.filter((entry) => entry.id !== removed.id),
        pagination: {
          ...current.pagination,
          total,
          totalPages: Math.ceil(total / PER_PAGE),
        },
      };
    });
    setNotice({ tone: 'success', text: `Deleted “${removed.originalName}”.` });
    if (data && data.items.length === 1 && page > 1) {
      setPage((value) => Math.max(1, value - 1));
    }
  }

  const total = data?.pagination.total ?? 0;
  const totalPages = Math.max(data?.pagination.totalPages ?? 1, 1);

  return (
    <>
      <div className="media-title-row">
        <span className="title-badge" aria-hidden="true">
          <ImageIcon size={17} />
        </span>
        <h1>Media Library ({total})</h1>
        <button
          type="button"
          className="button secondary-button media-add-new"
          onClick={openPicker}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Add New Media File
        </button>
        <input
          ref={fileInputRef}
          id="media-upload-input"
          className="visually-hidden"
          type="file"
          accept={UPLOAD_ACCEPT}
          multiple
          aria-label="Upload media files"
          onChange={handleFiles}
        />
      </div>

      <div className="users-subheader">
        <span className="sub-count">All Media ({total})</span>
        <span className="sub-sep" aria-hidden="true">
          |
        </span>
        <span className="sub-signed">Signed in as {user.username}</span>
      </div>

      {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}

      {uploads.length > 0 ? (
        <ul className="media-uploads" aria-label="Uploads">
          {uploads.map((job) => (
            <li key={job.key} className={`media-upload-job is-${job.status}`}>
              <span className="media-upload-name">{job.name}</span>
              {job.status === 'done' ? (
                <span className="media-upload-status">Uploaded</span>
              ) : job.status === 'error' ? (
                <span className="media-upload-status is-error" title={job.error}>
                  Upload failed
                </span>
              ) : (
                <>
                  <span
                    className="media-upload-track"
                    role="progressbar"
                    aria-label={`Uploading ${job.name}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={job.progress}
                  >
                    <span className="media-upload-fill" style={{ width: `${job.progress}%` }} />
                  </span>
                  <span className="media-upload-percent">{job.progress}%</span>
                </>
              )}
              <button
                type="button"
                className="media-upload-dismiss"
                aria-label={`Dismiss upload ${job.name}`}
                onClick={() =>
                  setUploads((current) => current.filter((entry) => entry.key !== job.key))
                }
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="tablenav media-toolbar">
        <div className="alignleft">
          <label htmlFor="media-type-filter" className="screen-reader-text">
            Filter by media type
          </label>
          <select
            id="media-type-filter"
            className="bulk-select"
            defaultValue="all"
            onChange={() => {
              // Only images exist in this phase; the filter mirrors the reference UI.
            }}
          >
            <option value="all">All media items</option>
            <option value="image">Images</option>
          </select>
          <label htmlFor="media-order" className="screen-reader-text">
            Sort order
          </label>
          <select
            id="media-order"
            className="bulk-select"
            value={order}
            onChange={(event) => {
              setOrder(event.target.value === 'oldest' ? 'oldest' : 'newest');
              setPage(1);
            }}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>
        <div className="alignright">
          <form className="search-form" onSubmit={handleSearch} role="search">
            <label htmlFor={searchId} className="screen-reader-text">
              Search Media
            </label>
            <span className="search-box">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                id={searchId}
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search media…"
              />
            </span>
            <button type="submit" className="button secondary-button">
              Search
            </button>
          </form>
          <span className="displaying-num media-count">{pluralize(total, 'item')}</span>
          <div className="media-view-toggle" role="group" aria-label="Media view">
            <button
              type="button"
              className={`view-toggle-button${view === 'grid' ? ' is-active' : ''}`}
              aria-pressed={view === 'grid'}
              onClick={() => setView('grid')}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
              Grid
            </button>
            <button
              type="button"
              className={`view-toggle-button${view === 'list' ? ' is-active' : ''}`}
              aria-pressed={view === 'list'}
              onClick={() => setView('list')}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
              List
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <ErrorState
          title="Could not load media"
          message={error}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : loading ? (
        <Skeleton label="Loading media…" lines={4} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title={search ? 'No matching media' : 'No media yet'}
          message={
            search ? 'Try a different search term.' : 'Upload your first image to get started.'
          }
          action={
            <button type="button" className="button primary-button" onClick={openPicker}>
              Upload Your First Image
            </button>
          }
        />
      ) : (
        <>
          {view === 'grid' ? (
            <ul className="media-grid" aria-label="Media items">
              {data.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="media-card"
                    onClick={() => setSelected(item)}
                    aria-label={`View ${item.originalName}`}
                  >
                    <span className="media-thumb">
                      <img src={thumbnailUrl(item)} alt={item.altText || ''} loading="lazy" />
                    </span>
                    <span className="media-card-body">
                      <span className="media-name" title={item.originalName}>
                        {item.originalName}
                      </span>
                      <span className="media-meta">
                        {formatDimensions(item)} · {formatBytes(item.sizeBytes)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="table-scroll">
              <table className="content-table widefat fixed striped media-list">
                <caption className="screen-reader-text">Media items</caption>
                <thead>
                  <tr>
                    <th scope="col">File</th>
                    <th scope="col">Type</th>
                    <th scope="col">Dimensions</th>
                    <th scope="col">Size</th>
                    <th scope="col">Date</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id}>
                      <td className="media-list-file">
                        <button
                          type="button"
                          className="media-list-open"
                          onClick={() => setSelected(item)}
                        >
                          <img src={thumbnailUrl(item)} alt="" loading="lazy" />
                          <span>{item.originalName}</span>
                        </button>
                      </td>
                      <td>{item.mimeType}</td>
                      <td>{formatDimensions(item)}</td>
                      <td>{formatBytes(item.sizeBytes)}</td>
                      <td>{formatDateTime(item.createdAt)}</td>
                      <td className="actions column-actions">
                        <button
                          type="button"
                          className="row-action-icon"
                          aria-label={`Edit ${item.originalName}`}
                          title="Edit"
                          onClick={() => setSelected(item)}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <nav className="pagination" aria-label="Media pagination">
            <div className="tablenav-pages">
              <span className="displaying-num">{pluralize(total, 'media item')}</span>
              <span className="pagination-links">
                <button
                  type="button"
                  className="button secondary-button pagination-button prev"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
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
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next »
                </button>
              </span>
            </div>
          </nav>
        </>
      )}

      {selected ? (
        <MediaDrawer
          key={selected.id}
          item={selected}
          onClose={() => setSelected(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      ) : null}
    </>
  );
}

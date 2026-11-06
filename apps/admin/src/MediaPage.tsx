import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from 'react';
import {
  SCREEN_COLUMNS_EVENT,
  SCREEN_OPTIONS_EVENT,
  screenHiddenColumns,
  screenPerPage,
} from './screenOptions.js';
import {
  actionErrorMessage,
  createMediaFolder,
  deleteMedia,
  deleteMediaFolder,
  listMedia,
  listMediaFolders,
  moveMediaFolder,
  regenerateMediaDerivatives,
  renameMediaFolder,
  updateMedia,
  uploadMedia,
  type AuthUser,
  type MediaFolder,
  type MediaItem,
  type Paged,
} from './api.js';
import {
  EmptyState,
  ErrorState,
  Notice,
  Skeleton,
  SortIndicator,
  type NoticeMessage,
  Pagination,
} from './components.js';
import { formatDateTime } from './format.js';
import { folderDescendants, folderTree, indentedFolder } from './mediaFolders.js';
import { MediaFolderTree } from './MediaFolderTree.js';
import { MediaImageEditor } from './MediaImageEditor.js';
import { INFINITE_SCROLL_EVENT, infiniteScrollEnabled } from './preferences.js';

const DEFAULT_PER_PAGE = 24;

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
function relativeMediaDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  // WordPress human_time_diff: minutes, hours (including "24 hours"),
  // then days/weeks/months/years, always followed by "ago".
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 3600) {
    const minutes = Math.max(1, Math.round(seconds / 60));
    return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  }
  if (seconds < 86400) {
    const hours = Math.round(seconds / 3600);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  const days = Math.round(seconds / 86400);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.round(days / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

function monthOptions(): Array<{ value: string; label: string }> {
  const now = new Date();
  const options: Array<{ value: string; label: string }> = [];
  for (let i = 0; i < 12; i += 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    options.push({
      value: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }),
    });
  }
  return options;
}

/** Edits keep the same file name but change the bytes; bust the immutable cache. */
function mediaVersion(item: MediaItem): string {
  return encodeURIComponent(item.editedAt ?? item.updatedAt);
}

function thumbnailUrl(item: MediaItem): string {
  return `${item.derivatives['300'] ?? item.url}?v=${mediaVersion(item)}`;
}

function fullMediaUrl(item: MediaItem): string {
  return `${item.url}?v=${mediaVersion(item)}`;
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
  folders: MediaFolder[];
  onClose: () => void;
  onSaved: (item: MediaItem) => void;
  onDeleted: (item: MediaItem) => void;
  onPrev?: (() => void) | undefined;
  onNext?: (() => void) | undefined;
}

/**
 * Right-side detail drawer: preview, editable metadata, file meta and delete.
 * It is an overlay (not a routed page) so the grid keeps its scroll position,
 * matching the editor sidebar's editing-in-place feel.
 */
function MediaDrawer({
  item,
  folders,
  onClose,
  onSaved,
  onDeleted,
  onPrev,
  onNext,
}: MediaDrawerProps) {
  const titleId = useId();
  const drawerRef = useRef<HTMLElement>(null);
  const [altText, setAltText] = useState(item.altText);
  const [caption, setCaption] = useState(item.caption);
  const [description, setDescription] = useState(item.description);
  const [folderId, setFolderId] = useState(item.folderId ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !editing) {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, editing]);

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
      const updated = await updateMedia(item.id, {
        altText,
        caption,
        description,
        folderId: folderId === '' ? null : folderId,
      });
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
          <h2 id={titleId}>Attachment details</h2>
          <div className="media-drawer-head-actions">
            <button
              type="button"
              className="media-drawer-nav"
              onClick={onPrev}
              disabled={!onPrev}
              aria-label="Edit previous media item"
              title="Previous"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path d="M14.5 6 8.5 12l6 6" />
              </svg>
            </button>
            <button
              type="button"
              className="media-drawer-nav"
              onClick={onNext}
              disabled={!onNext}
              aria-label="Edit next media item"
              title="Next"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path d="m9.5 6 6 6-6 6" />
              </svg>
            </button>
            <button
              type="button"
              className="media-drawer-close"
              onClick={onClose}
              aria-label="Close"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </header>

        <div className="media-drawer-body">
          <div className="media-drawer-preview">
            <img src={fullMediaUrl(item)} alt={item.altText || ''} />
            <p className="media-drawer-edit">
              <button
                type="button"
                className="button secondary-button"
                onClick={() => setEditing(true)}
              >
                Edit Image
              </button>
            </p>
          </div>

          <div className="media-drawer-sidebar">
            {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}

            <div className="media-meta-list">
              <div>
                <span>Uploaded on:</span> {formatDateTime(item.createdAt)}
              </div>
              <div>
                <span>Uploaded by:</span> —
              </div>
              <div>
                <span>File name:</span> {item.fileName}
              </div>
              <div>
                <span>File type:</span> {item.mimeType}
              </div>
              <div>
                <span>File size:</span> {formatBytes(item.sizeBytes)}
              </div>
              <div>
                <span>Dimensions:</span> {formatDimensions(item)}
              </div>
            </div>

            <form className="media-drawer-form" onSubmit={handleSave} aria-label="Media details">
              <div className="field">
                <label htmlFor="media-alt-text">Alternative Text</label>
                <textarea
                  id="media-alt-text"
                  rows={3}
                  value={altText}
                  maxLength={500}
                  onChange={(event) => setAltText(event.target.value)}
                  disabled={saving || deleting}
                />
                <p className="field-help">
                  Describe the purpose of the image. Leave empty if the image is purely decorative.
                </p>
              </div>
              <div className="field">
                <label htmlFor="media-caption">Image Caption</label>
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
              <div className="field">
                <label htmlFor="media-folder">Folder</label>
                <select
                  id="media-folder"
                  value={folderId}
                  onChange={(event) => setFolderId(event.target.value)}
                  disabled={saving || deleting}
                >
                  <option value="">Uncategorized</option>
                  {folderTree(folders).map(({ folder, depth }) => (
                    <option key={folder.id} value={folder.id}>
                      {indentedFolder(folder.name, depth)}
                    </option>
                  ))}
                </select>
                <p className="field-help">
                  Folders are virtual: files stay in the uploads directory and a media item belongs
                  to one folder. Counts in the folder bar show direct items only.
                </p>
              </div>
              <div className="field">
                <label htmlFor="media-file-url">File URL:</label>
                <input id="media-file-url" type="text" value={item.url} readOnly />
                <button
                  type="button"
                  className="button secondary-button media-copy-button"
                  onClick={() => void handleCopy()}
                >
                  Copy URL to clipboard
                </button>
              </div>
              <div className="media-drawer-actions">
                <button
                  type="submit"
                  className="button primary-button"
                  disabled={saving || deleting}
                  aria-busy={saving}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="button secondary-button" onClick={onClose}>
                  Cancel
                </button>
              </div>
            </form>

            <div className="media-drawer-links">
              <a href={item.url} target="_blank" rel="noreferrer">
                View media file
              </a>
              <span aria-hidden="true">|</span>
              <a href={item.url} download>
                Download file
              </a>
              <span aria-hidden="true">|</span>
              <button
                type="button"
                className="button-link-delete"
                onClick={() => void handleDelete()}
                disabled={deleting || saving}
                aria-busy={deleting}
              >
                {deleting ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      </aside>

      {editing ? (
        <MediaImageEditor
          item={item}
          onClose={() => setEditing(false)}
          onSaved={(updated, reason) => {
            onSaved(updated);
            setEditing(false);
            setNotice({
              tone: 'success',
              text: reason === 'restored' ? 'Original image restored.' : 'Image edited.',
            });
          }}
        />
      ) : null}
    </div>
  );
}

export function MediaPage({ user: _user }: { user: AuthUser }) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<MediaItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [monthFilter, setMonthFilter] = useState('');
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest');
  const [perPage, setPerPage] = useState(() => screenPerPage('media', DEFAULT_PER_PAGE));
  const [hiddenColumns, setHiddenColumns] = useState(() => screenHiddenColumns('media'));
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [folderFilter, setFolderFilter] = useState('');
  const [folderName, setFolderName] = useState('');
  const [folderParent, setFolderParent] = useState('');
  const [moveTarget, setMoveTarget] = useState('');
  const [folderBusy, setFolderBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    const sync = () => setHiddenColumns(screenHiddenColumns('media'));
    window.addEventListener(SCREEN_COLUMNS_EVENT, sync);
    return () => window.removeEventListener(SCREEN_COLUMNS_EVENT, sync);
  }, []);

  useEffect(() => {
    const sync = () => setInfiniteScrollState(infiniteScrollEnabled());
    window.addEventListener(INFINITE_SCROLL_EVENT, sync);
    return () => window.removeEventListener(INFINITE_SCROLL_EVENT, sync);
  }, []);

  async function refreshFolders(): Promise<void> {
    try {
      setFolders(await listMediaFolders());
    } catch {
      // The library still works without the folder list.
    }
  }

  useEffect(() => {
    void refreshFolders();
  }, []);

  async function createFolderAt(parentId: string | null, name: string): Promise<boolean> {
    if (folderBusy) return false;
    setFolderBusy(true);
    setNotice(null);
    try {
      const created = await createMediaFolder(name, parentId);
      setFolderName('');
      await refreshFolders();
      setFolderFilter(created.id);
      setNotice({ tone: 'success', text: `Folder “${created.name}” created.` });
      return true;
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
      return false;
    } finally {
      setFolderBusy(false);
    }
  }

  async function addFolder(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const name = folderName.trim();
    if (name.length === 0) return;
    await createFolderAt(folderParent === '' ? null : folderParent, name);
  }

  async function renameFolderById(id: string, name: string): Promise<boolean> {
    if (folderBusy) return false;
    setFolderBusy(true);
    setNotice(null);
    try {
      await renameMediaFolder(id, name);
      setRenaming(false);
      await refreshFolders();
      setNotice({ tone: 'success', text: 'Folder renamed.' });
      return true;
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
      return false;
    } finally {
      setFolderBusy(false);
    }
  }

  async function saveFolderRename(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedFolder) return;
    const name = renameValue.trim();
    if (name.length === 0) return;
    await renameFolderById(selectedFolder.id, name);
  }

  async function deleteFolderById(folder: MediaFolder): Promise<boolean> {
    if (folderBusy) return false;
    const descendants = folderDescendants(folders, folder.id);
    const itemCount =
      folder.itemCount +
      [...descendants].reduce(
        (total, id) => total + (folders.find((entry) => entry.id === id)?.itemCount ?? 0),
        0,
      );
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Delete the folder “${folder.name}”? It contains ${descendants.size} subfolder(s) and ${itemCount} direct media item(s); child folders move up and its media becomes Uncategorized. This cannot be undone.`,
      )
    ) {
      return false;
    }
    setFolderBusy(true);
    setNotice(null);
    try {
      await deleteMediaFolder(folder.id);
      if (folderFilter === folder.id) setFolderFilter('');
      await refreshFolders();
      setNotice({
        tone: 'success',
        text: 'Folder deleted; child folders moved up. Media items directly in it are now Uncategorized.',
      });
      return true;
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
      return false;
    } finally {
      setFolderBusy(false);
    }
  }

  async function removeFolder(): Promise<void> {
    if (!selectedFolder) return;
    await deleteFolderById(selectedFolder);
  }

  async function moveFolderTo(id: string, parentId: string | null): Promise<boolean> {
    if (folderBusy) return false;
    setFolderBusy(true);
    setNotice(null);
    try {
      await moveMediaFolder(id, parentId);
      await refreshFolders();
      setNotice({ tone: 'success', text: 'Folder moved.' });
      return true;
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
      return false;
    } finally {
      setFolderBusy(false);
    }
  }

  async function moveSelectedFolder(): Promise<void> {
    if (!selectedFolder) return;
    await moveFolderTo(selectedFolder.id, moveTarget === '' ? null : moveTarget);
  }

  /** Rebuild WebP/AVIF derivatives for the whole library, in bounded batches. */
  async function regenerateImageSizes(): Promise<void> {
    if (regenerating) return;
    setRegenerating(true);
    setNotice(null);
    setRegenProgress('Starting…');
    let after: string | undefined;
    let processed = 0;
    let failed = 0;
    try {
      for (;;) {
        const batch = await regenerateMediaDerivatives({
          ...(after ? { after } : {}),
          limit: 20,
        });
        processed += batch.processed;
        failed += batch.failed;
        setRegenProgress(`Regenerated ${processed} image(s)${failed ? `, ${failed} failed` : ''}…`);
        if (!batch.nextAfter) break;
        after = batch.nextAfter;
      }
      setNotice({
        tone: failed > 0 ? 'warning' : 'success',
        text: `Regenerated ${processed} image(s)${failed > 0 ? `; ${failed} failed` : ''}.`,
      });
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setRegenerating(false);
      setRegenProgress(null);
    }
  }

  const selectedFolder = folders.find((folder) => folder.id === folderFilter) ?? null;
  const tree = folderTree(folders);
  const descendants = selectedFolder
    ? folderDescendants(folders, selectedFolder.id)
    : new Set<string>();

  useEffect(() => {
    setMoveTarget(selectedFolder?.parentId ?? '');
  }, [selectedFolder?.id, selectedFolder?.parentId]);

  const showAuthor = !hiddenColumns.has('author');
  const showParent = !hiddenColumns.has('parent');
  const showDate = !hiddenColumns.has('date');
  const [bulkSelect, setBulkSelect] = useState(false);
  const [bulkAction, setBulkAction] = useState('');
  const [bulkFolder, setBulkFolder] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  // Media → Add New deep link opens the file picker once on mount.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('upload') === '1') {
      fileInputRef.current?.click();
    }
  }, []);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [infiniteScroll, setInfiniteScrollState] = useState(() => infiniteScrollEnabled());
  const appendRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [uploads, setUploads] = useState<UploadJob[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [regenerating, setRegenerating] = useState(false);
  const [regenProgress, setRegenProgress] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadKey = useRef(0);
  const dataRef = useRef<Paged<MediaItem> | null>(null);

  const searchId = useId();

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      appendRef.current = false;
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    function onOptions() {
      appendRef.current = false;
      setPerPage(screenPerPage('media', DEFAULT_PER_PAGE));
      setPage(1);
    }
    window.addEventListener(SCREEN_OPTIONS_EVENT, onOptions);
    return () => window.removeEventListener(SCREEN_OPTIONS_EVENT, onOptions);
  }, []);

  useEffect(() => {
    let active = true;
    const append = appendRef.current;
    if (!append) {
      setLoading(true);
    }
    setError(null);

    listMedia({
      page,
      perPage,
      type: 'image',
      ...(search ? { search } : {}),
      ...(monthFilter ? { month: monthFilter } : {}),
      ...(folderFilter ? { folder: folderFilter } : {}),
      order,
    })
      .then((result) => {
        if (!active) return;
        if (append) {
          setData((current) =>
            current
              ? {
                  items: [...current.items, ...result.items],
                  pagination: result.pagination,
                }
              : result,
          );
        } else {
          setData(result);
        }
        appendRef.current = false;
        setLoading(false);
      })
      .catch((caught) => {
        if (!active) return;
        appendRef.current = false;
        setError(actionErrorMessage(caught));
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page, search, monthFilter, folderFilter, order, perPage, reloadKey]);

  // A selection from another folder/search must not survive a filter change.
  useEffect(() => {
    setSelectedIds(new Set());
    setBulkSelect(false);
    setBulkAction('');
    setBulkFolder('');
  }, [folderFilter, search, monthFilter]);

  // WordPress Media Library grid view scrolls into the next page.
  useEffect(() => {
    if (view !== 'grid' || !infiniteScroll || loading || !data) return;
    const pages = data.pagination.totalPages ?? 1;
    if (page >= pages) return;
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !appendRef.current) {
          appendRef.current = true;
          setPage((current) => Math.min(pages, current + 1));
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [view, infiniteScroll, loading, data, page]);

  async function assignItemsToFolder(ids: string[], folderId: string | null): Promise<void> {
    if (ids.length === 0 || bulkBusy) return;
    const targetName =
      folderId === null
        ? 'Uncategorized'
        : (folders.find((folder) => folder.id === folderId)?.name ?? 'the selected folder');
    setBulkBusy(true);
    setNotice(null);
    try {
      // One PATCH per item keeps the existing single-item authorization and
      // audit path; a partial failure refetches so the grid matches the server.
      await Promise.all(ids.map((id) => updateMedia(id, { folderId })));
      setNotice({
        tone: 'success',
        text: `Moved ${ids.length} media item(s) to “${targetName}”.`,
      });
      setSelectedIds(new Set());
      setBulkSelect(false);
      setBulkAction('');
      setBulkFolder('');
      void refreshFolders();
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
      void refreshFolders();
      setReloadKey((value) => value + 1);
    } finally {
      setBulkBusy(false);
    }
  }

  async function moveSelected(): Promise<void> {
    if (selectedIds.size === 0 || bulkFolder === '') return;
    await assignItemsToFolder([...selectedIds], bulkFolder === 'none' ? null : bulkFolder);
  }

  /** Start an internal drag: the selection if the item is part of it, else the item. */
  function startItemDrag(event: DragEvent<HTMLElement>, itemId: string): void {
    const ids = selectedIds.has(itemId) ? [...selectedIds] : [itemId];
    event.dataTransfer.setData('text/plain', ids.join(','));
    event.dataTransfer.effectAllowed = 'move';
  }

  async function deleteSelected(): Promise<void> {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Permanently delete ${selectedIds.size} media item(s)?`)) return;
    const ids = [...selectedIds];
    setBulkBusy(true);
    setNotice(null);
    try {
      for (const id of ids) {
        await deleteMedia(id);
      }
      setNotice({ tone: 'success', text: `${ids.length} media item(s) deleted.` });
      setSelectedIds(new Set());
      setBulkSelect(false);
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setBulkBusy(false);
    }
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
        items: items.slice(0, perPage),
        pagination: {
          ...current.pagination,
          total,
          totalPages: Math.ceil(total / perPage),
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

    // Upload into the folder currently being browsed; "All folders" and
    // "Uncategorized" leave the item Uncategorized.
    const uploadFolder = folderFilter !== '' && folderFilter !== 'none' ? folderFilter : undefined;
    try {
      const item = await uploadMedia(file, {
        onProgress: (percent) => patchUpload(key, { progress: percent }),
        ...(uploadFolder ? { folderId: uploadFolder } : {}),
      });
      patchUpload(key, { progress: 100, status: 'done' });
      void refreshFolders();
      // Insert locally only when the new item belongs to the visible result set;
      // otherwise the grid would show a row that disappears on reload.
      const matchesView =
        !search &&
        !monthFilter &&
        (folderFilter === '' ||
          (folderFilter === 'none' ? item.folderId === null : item.folderId === folderFilter));
      if (dataRef.current && matchesView) {
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
    // Assignment changes the folder counts shown in the filter.
    void refreshFolders();
  }

  function handleDeleted(removed: MediaItem) {
    setSelected(null);
    void refreshFolders();
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
          totalPages: Math.ceil(total / perPage),
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
    <div className="wp-list-screen">
      <div className="list-title-row">
        <h1>Media Library</h1>
        <button
          type="button"
          className="button page-title-action media-add-new"
          onClick={openPicker}
        >
          Add Media File
        </button>
        <button
          type="button"
          className="button media-regenerate"
          onClick={() => void regenerateImageSizes()}
          disabled={regenerating}
          title="Rebuild the WebP and AVIF sizes stored for every image"
        >
          {regenerating ? 'Regenerating…' : 'Regenerate image sizes'}
        </button>
        {regenProgress ? (
          <span className="media-regenerate-progress" role="status">
            {regenProgress}
          </span>
        ) : null}

        <div className="media-folder-bar">
          <label className="media-folder-filter">
            <select
              aria-label="Filter by folder"
              value={folderFilter}
              onChange={(event) => {
                setFolderFilter(event.target.value);
                setRenaming(false);
                setPage(1);
              }}
            >
              <option value="">All folders</option>
              <option value="none">Uncategorized</option>
              {tree.map(({ folder, depth }) => (
                <option key={folder.id} value={folder.id}>
                  {indentedFolder(folder.name, depth)} ({folder.itemCount})
                </option>
              ))}
            </select>
          </label>

          {selectedFolder ? (
            renaming ? (
              <form
                className="media-folder-inline"
                onSubmit={(event) => void saveFolderRename(event)}
              >
                <input
                  aria-label="Folder name"
                  value={renameValue}
                  maxLength={100}
                  onChange={(event) => setRenameValue(event.target.value)}
                  disabled={folderBusy}
                />
                <button type="submit" className="button secondary-button" disabled={folderBusy}>
                  Save
                </button>
                <button
                  type="button"
                  className="button-link"
                  onClick={() => setRenaming(false)}
                  disabled={folderBusy}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <label className="media-folder-move">
                  <span>Move to</span>
                  <select
                    aria-label="Move folder to"
                    value={moveTarget}
                    onChange={(event) => setMoveTarget(event.target.value)}
                    disabled={folderBusy}
                  >
                    <option value="">Top level</option>
                    {tree
                      .filter(
                        ({ folder }) =>
                          folder.id !== selectedFolder.id && !descendants.has(folder.id),
                      )
                      .map(({ folder, depth }) => (
                        <option key={folder.id} value={folder.id}>
                          {indentedFolder(folder.name, depth)}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="button secondary-button"
                  onClick={() => void moveSelectedFolder()}
                  disabled={folderBusy || moveTarget === (selectedFolder.parentId ?? '')}
                >
                  Move folder
                </button>
                <button
                  type="button"
                  className="button-link"
                  onClick={() => {
                    setRenaming(true);
                    setRenameValue(selectedFolder.name);
                  }}
                  disabled={folderBusy}
                >
                  Rename folder
                </button>
                <button
                  type="button"
                  className="button-link is-danger"
                  onClick={() => void removeFolder()}
                  disabled={folderBusy}
                >
                  Delete folder
                </button>
              </>
            )
          ) : null}

          <form className="media-folder-inline" onSubmit={(event) => void addFolder(event)}>
            <select
              aria-label="Parent folder"
              value={folderParent}
              onChange={(event) => setFolderParent(event.target.value)}
              disabled={folderBusy}
            >
              <option value="">Top level</option>
              {tree.map(({ folder, depth }) => (
                <option key={folder.id} value={folder.id}>
                  {indentedFolder(folder.name, depth)}
                </option>
              ))}
            </select>
            <input
              aria-label="New folder name"
              placeholder="New folder"
              value={folderName}
              maxLength={100}
              onChange={(event) => setFolderName(event.target.value)}
              disabled={folderBusy}
            />
            <button
              type="submit"
              className="button secondary-button"
              disabled={folderBusy || folderName.trim().length === 0}
            >
              Create folder
            </button>
          </form>
        </div>

        <MediaFolderTree
          folders={folders}
          selectedId={folderFilter}
          busy={folderBusy}
          onSelect={(id) => {
            setFolderFilter(id);
            setRenaming(false);
            setPage(1);
          }}
          onCreate={createFolderAt}
          onRename={renameFolderById}
          onMove={moveFolderTo}
          onDelete={deleteFolderById}
          onAssignItems={assignItemsToFolder}
        />

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

      <div className={view === 'grid' ? 'media-toolbar-bar' : 'media-toolbar-bar is-list'}>
        <div className="media-toolbar-secondary">
          <div className="media-view-toggle" role="group" aria-label="Media view">
            <button
              type="button"
              className={`view-toggle-button${view === 'list' ? ' is-active' : ''}`}
              aria-pressed={view === 'list'}
              aria-label="List view"
              title="List view"
              onClick={() => {
                appendRef.current = false;
                setView('list');
                setPage(1);
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M2 4h16v2H2V4zm0 5h16v2H2V9zm0 5h16v2H2v-2z" />
              </svg>
            </button>
            <button
              type="button"
              className={`view-toggle-button${view === 'grid' ? ' is-active' : ''}`}
              aria-pressed={view === 'grid'}
              aria-label="Grid view"
              title="Grid view"
              onClick={() => {
                appendRef.current = false;
                setView('grid');
                setPage(1);
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M2 2h6v6H2V2zm10 0h6v6h-6V2zM2 12h6v6H2v-6zm10 0h6v6h-6v-6z" />
              </svg>
            </button>
          </div>
          <label htmlFor="media-type-filter" className="screen-reader-text">
            Filter by type
          </label>
          <select
            id="media-type-filter"
            className="attachment-filters"
            defaultValue="all"
            onChange={() => {
              // Only images exist in this phase; the filter mirrors the WordPress UI.
            }}
          >
            <option value="all">All media items</option>
            <option value="image">Images</option>
          </select>
          <label htmlFor="media-month-filter" className="screen-reader-text">
            Filter by date
          </label>
          <select
            id="media-month-filter"
            className="attachment-filters"
            value={monthFilter}
            onChange={(event) => {
              appendRef.current = false;
              setMonthFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All dates</option>
            {monthOptions().map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
          {view === 'grid' ? (
            <button
              type="button"
              className="button media-button select-mode-toggle-button"
              aria-pressed={bulkSelect}
              onClick={() => {
                setBulkSelect((on) => !on);
                setSelectedIds(new Set());
              }}
            >
              {bulkSelect ? 'Cancel selection' : 'Bulk select'}
            </button>
          ) : (
            <button
              type="button"
              className="button button-compact"
              onClick={() => {
                setSearch(searchInput.trim());
                setPage(1);
              }}
            >
              Filter
            </button>
          )}
          {selectedIds.size > 0 ? (
            <>
              <select
                aria-label="Move selected to folder"
                value={bulkFolder}
                onChange={(event) => setBulkFolder(event.target.value)}
                disabled={bulkBusy || folders.length === 0}
              >
                <option value="">Move to folder…</option>
                <option value="none">Uncategorized</option>
                {folderTree(folders).map(({ folder, depth }) => (
                  <option key={folder.id} value={folder.id}>
                    {indentedFolder(folder.name, depth)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="button secondary-button"
                disabled={bulkBusy || bulkFolder === ''}
                onClick={() => void moveSelected()}
              >
                {bulkBusy ? 'Moving…' : `Move selected (${selectedIds.size})`}
              </button>
              <button
                type="button"
                className="button button-link-delete"
                disabled={bulkBusy}
                onClick={() => void deleteSelected()}
              >
                {bulkBusy ? 'Deleting…' : `Delete selected (${selectedIds.size})`}
              </button>
            </>
          ) : null}
        </div>
        <div className="media-toolbar-primary search-form">
          <label
            htmlFor={searchId}
            className={view === 'grid' ? 'media-search-input-label' : 'screen-reader-text'}
          >
            Search media
          </label>
          <input
            id={searchId}
            type="search"
            className="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          {view === 'list' ? (
            <button
              type="button"
              className="button button-compact"
              onClick={() => {
                setSearch(searchInput.trim());
                setPage(1);
              }}
            >
              Search Media
            </button>
          ) : null}
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
          title={
            search
              ? 'No matching media'
              : folderFilter !== ''
                ? 'No media in this folder'
                : 'No media yet'
          }
          message={
            search
              ? 'Try a different search term.'
              : folderFilter !== ''
                ? 'Upload an image into this folder to get started.'
                : 'Upload your first image to get started.'
          }
          action={
            <button type="button" className="button primary-button" onClick={openPicker}>
              {folderFilter !== '' ? 'Upload into this folder' : 'Upload Your First Image'}
            </button>
          }
        />
      ) : (
        <>
          {view === 'grid' ? (
            <>
              <ul
                className={`media-grid${bulkSelect ? ' is-select-mode' : ''}`}
                aria-label="Media items"
              >
                {data.items.map((item) => {
                  const isSelected = selectedIds.has(item.id);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`media-card${isSelected ? ' is-selected' : ''}`}
                        draggable={!bulkBusy}
                        onDragStart={(event) => startItemDrag(event, item.id)}
                        onClick={() => {
                          if (bulkSelect) {
                            setSelectedIds((current) => {
                              const next = new Set(current);
                              if (next.has(item.id)) {
                                next.delete(item.id);
                              } else {
                                next.add(item.id);
                              }
                              return next;
                            });
                            return;
                          }
                          setSelected(item);
                        }}
                        aria-pressed={bulkSelect ? isSelected : undefined}
                        aria-label={
                          bulkSelect
                            ? `${isSelected ? 'Deselect' : 'Select'} ${item.originalName}`
                            : `View ${item.originalName}`
                        }
                      >
                        <span className="media-thumb">
                          <img src={thumbnailUrl(item)} alt={item.altText || ''} loading="lazy" />
                        </span>
                        <span className="media-card-label" aria-hidden="true">
                          {item.originalName}
                        </span>
                        <span className="media-check" aria-hidden="true">
                          <svg viewBox="0 0 20 20" fill="currentColor">
                            <path d="M8.2 14.4 4 10.2l1.4-1.4 2.8 2.8 6.4-6.4L16 6.6z" />
                          </svg>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {infiniteScroll ? (
                <div ref={sentinelRef} className="media-sentinel" aria-hidden="true" />
              ) : null}
            </>
          ) : (
            <>
              <div className="tablenav">
                <div className="alignleft">
                  <label htmlFor="media-bulk-action" className="screen-reader-text">
                    Bulk actions
                  </label>
                  <select
                    id="media-bulk-action"
                    className="bulk-select"
                    value={bulkAction}
                    onChange={(event) => setBulkAction(event.target.value)}
                  >
                    <option value="">Bulk actions</option>
                    <option value="move">Move to folder</option>
                    <option value="delete">Delete permanently</option>
                  </select>
                  {bulkAction === 'move' ? (
                    <>
                      <label htmlFor="media-bulk-folder" className="screen-reader-text">
                        Move selected to folder
                      </label>
                      <select
                        id="media-bulk-folder"
                        className="bulk-select"
                        value={bulkFolder}
                        onChange={(event) => setBulkFolder(event.target.value)}
                        disabled={bulkBusy || folders.length === 0}
                      >
                        <option value="">Move to folder…</option>
                        <option value="none">Uncategorized</option>
                        {folderTree(folders).map(({ folder, depth }) => (
                          <option key={folder.id} value={folder.id}>
                            {indentedFolder(folder.name, depth)}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="button secondary-button bulk-apply"
                    disabled={
                      bulkBusy || bulkAction === '' || (bulkAction === 'move' && bulkFolder === '')
                    }
                    onClick={() => {
                      if (bulkAction === 'delete') void deleteSelected();
                      if (bulkAction === 'move') void moveSelected();
                    }}
                  >
                    {bulkBusy ? 'Applying…' : 'Apply'}
                  </button>
                </div>
                <div className="alignright">
                  <span className="displaying-num">
                    {`${total} ${total === 1 ? 'item' : 'items'}`}
                  </span>
                </div>
              </div>

              <div className="table-scroll">
                <table className="content-table widefat fixed striped media-list">
                  <caption className="screen-reader-text">Media items</caption>
                  <thead>
                    <tr>
                      <th scope="col" className="check-column">
                        <input
                          type="checkbox"
                          aria-label="Select all"
                          checked={
                            data.items.length > 0 &&
                            data.items.every((item) => selectedIds.has(item.id))
                          }
                          onChange={() =>
                            setSelectedIds((current) =>
                              data.items.every((item) => current.has(item.id))
                                ? new Set()
                                : new Set(data.items.map((item) => item.id)),
                            )
                          }
                        />
                      </th>
                      <th scope="col" className="column-title">
                        File
                      </th>
                      {showAuthor ? (
                        <th scope="col" className="column-author">
                          Author
                        </th>
                      ) : null}
                      {showParent ? (
                        <th scope="col" className="column-parent">
                          Uploaded to
                        </th>
                      ) : null}
                      {showDate ? (
                        <th scope="col" className="column-date">
                          <button
                            type="button"
                            className="sortable-column"
                            aria-label={`Sort by date${order === 'newest' ? ', descending' : ''}`}
                            onClick={() => {
                              appendRef.current = false;
                              appendRef.current = false;
                              setOrder((value) => (value === 'newest' ? 'oldest' : 'newest'));
                              setPage(1);
                              setPage(1);
                              setPage(1);
                            }}
                          >
                            Date
                            <SortIndicator direction={order === 'newest' ? 'desc' : 'asc'} />
                          </button>
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr
                        key={item.id}
                        draggable={!bulkBusy}
                        onDragStart={(event) => startItemDrag(event, item.id)}
                      >
                        <th scope="row" className="check-column">
                          <input
                            type="checkbox"
                            aria-label={`Select ${item.originalName}`}
                            checked={selectedIds.has(item.id)}
                            onChange={() =>
                              setSelectedIds((current) => {
                                const next = new Set(current);
                                if (next.has(item.id)) next.delete(item.id);
                                else next.add(item.id);
                                return next;
                              })
                            }
                          />
                        </th>
                        <td className="media-list-file">
                          <button
                            type="button"
                            className="media-list-open"
                            onClick={() => setSelected(item)}
                          >
                            <img src={thumbnailUrl(item)} alt="" loading="lazy" />
                            <span className="media-list-labels">
                              <span className="media-list-title">
                                {item.altText || item.originalName}
                              </span>
                              <span className="media-list-filename">{item.originalName}</span>
                            </span>
                          </button>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="row-action-link"
                              onClick={() => setSelected(item)}
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
                              onClick={() => {
                                if (!window.confirm(`Permanently delete “${item.originalName}”?`)) {
                                  return;
                                }
                                void deleteMedia(item.id)
                                  .then(() => setReloadKey((value) => value + 1))
                                  .catch((caught) =>
                                    setNotice({ tone: 'error', text: actionErrorMessage(caught) }),
                                  );
                              }}
                            >
                              Delete Permanently
                            </button>
                            <span className="row-action-sep" aria-hidden="true">
                              {' '}
                              |{' '}
                            </span>
                            <button
                              type="button"
                              className="row-action-link"
                              onClick={() => window.open(item.url, '_blank', 'noopener')}
                            >
                              View
                            </button>
                            <span className="row-action-sep" aria-hidden="true">
                              {' '}
                              |{' '}
                            </span>
                            <button
                              type="button"
                              className="row-action-link"
                              onClick={() => {
                                const absolute = item.url.startsWith('http')
                                  ? item.url
                                  : `${window.location.origin}${item.url}`;
                                void navigator.clipboard?.writeText(absolute);
                                setNotice({ tone: 'success', text: 'URL copied.' });
                              }}
                            >
                              Copy URL
                            </button>
                            <span className="row-action-sep" aria-hidden="true">
                              {' '}
                              |{' '}
                            </span>
                            <a className="row-action-link" href={item.url} download>
                              Download file
                            </a>
                          </div>
                        </td>
                        {showAuthor ? (
                          <td className="column-author">
                            —<span className="media-no-author">(no author)</span>
                          </td>
                        ) : null}
                        {showParent ? (
                          <td className="column-parent">
                            <span className="media-unattached">(Unattached)</span>
                            <button
                              type="button"
                              className="media-attach-link"
                              onClick={() => setSelected(item)}
                            >
                              Attach
                            </button>
                          </td>
                        ) : null}
                        {showDate ? (
                          <td className="column-date">{relativeMediaDate(item.createdAt)}</td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="col" className="check-column" />
                      <th scope="col" className="column-title">
                        File
                      </th>
                      {showAuthor ? (
                        <th scope="col" className="column-author">
                          Author
                        </th>
                      ) : null}
                      {showParent ? (
                        <th scope="col" className="column-parent">
                          Uploaded to
                        </th>
                      ) : null}
                      {showDate ? (
                        <th scope="col" className="column-date">
                          <button
                            type="button"
                            className="sortable-column"
                            aria-label={`Sort by date${order === 'newest' ? ', descending' : ''}`}
                            onClick={() => {
                              appendRef.current = false;
                              appendRef.current = false;
                              setOrder((value) => (value === 'newest' ? 'oldest' : 'newest'));
                              setPage(1);
                              setPage(1);
                              setPage(1);
                            }}
                          >
                            Date
                            <SortIndicator direction={order === 'newest' ? 'desc' : 'asc'} />
                          </button>
                        </th>
                      ) : null}
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="tablenav bottom">
                <div className="alignleft">
                  <label htmlFor="media-bulk-action-bottom" className="screen-reader-text">
                    Bulk actions
                  </label>
                  <select id="media-bulk-action-bottom" className="bulk-select" defaultValue="">
                    <option value="">Bulk actions</option>
                    <option value="delete">Delete permanently</option>
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
                    {`${total} ${total === 1 ? 'item' : 'items'}`}
                  </span>
                </div>
              </div>
            </>
          )}

          {totalPages > 1 && (view === 'list' || !infiniteScroll) ? (
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              singular="media item"
              plural="media items"
              ariaLabel="Media pagination"
              onChange={setPage}
            />
          ) : null}
        </>
      )}

      {selected ? (
        <MediaDrawer
          key={selected.id}
          item={selected}
          folders={folders}
          onClose={() => setSelected(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          onPrev={
            data && data.items.findIndex((entry) => entry.id === selected.id) > 0
              ? () => {
                  const index = data.items.findIndex((entry) => entry.id === selected.id);
                  setSelected(data.items[index - 1] ?? null);
                }
              : undefined
          }
          onNext={
            data &&
            data.items.findIndex((entry) => entry.id === selected.id) >= 0 &&
            data.items.findIndex((entry) => entry.id === selected.id) < data.items.length - 1
              ? () => {
                  const index = data.items.findIndex((entry) => entry.id === selected.id);
                  setSelected(data.items[index + 1] ?? null);
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}

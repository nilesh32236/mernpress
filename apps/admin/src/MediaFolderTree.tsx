import { useState, type DragEvent, type FormEvent } from 'react';
import type { MediaFolder } from './api.js';
import { folderDescendants, folderTree, indentedFolder } from './mediaFolders.js';

type ActionKind = 'create' | 'rename' | 'move';
interface Action {
  kind: ActionKind;
  /** Folder being renamed/moved, or the parent for a create; null = root create. */
  id: string | null;
}

/**
 * Visible folder tree for the Media Library. The filter select stays compact;
 * this panel exposes per-folder create/rename/move/delete without hiding them
 * behind a selection in another control.
 */
export function MediaFolderTree({
  folders,
  selectedId,
  busy,
  onSelect,
  onCreate,
  onRename,
  onMove,
  onDelete,
  onAssignItems,
  onUploadFiles,
}: {
  folders: MediaFolder[];
  selectedId: string;
  busy: boolean;
  onSelect: (id: string) => void;
  onCreate: (parentId: string | null, name: string) => Promise<boolean>;
  onRename: (id: string, name: string) => Promise<boolean>;
  onMove: (id: string, parentId: string | null) => Promise<boolean>;
  onDelete: (folder: MediaFolder) => Promise<boolean>;
  /** Assign dragged media ids to a folder (null = Uncategorized). */
  onAssignItems: (ids: string[], folderId: string | null) => Promise<void>;
  /** Upload files dropped from the operating system into a folder. */
  onUploadFiles: (files: File[], folderId: string | null) => void;
}) {
  const [open, setOpen] = useState(true);
  const [action, setAction] = useState<Action | null>(null);
  const [value, setValue] = useState('');
  const [moveTarget, setMoveTarget] = useState('');
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const rows = folderTree(folders);

  function dropHandlers(target: string | null, folderId: string | null) {
    return {
      onDragOver: (event: DragEvent<HTMLElement>) => {
        const types = event.dataTransfer.types;
        if (!types.includes('text/plain') && !types.includes('Files')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = types.includes('Files') ? 'copy' : 'move';
        setDropTarget(target);
      },
      onDragLeave: () => setDropTarget((current) => (current === target ? null : current)),
      onDrop: (event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        setDropTarget(null);
        const files = Array.from(event.dataTransfer.files ?? []);
        if (files.length > 0) {
          onUploadFiles(files, folderId);
          return;
        }
        const ids = event.dataTransfer
          .getData('text/plain')
          .split(',')
          .map((id) => id.trim())
          .filter((id) => id.length > 0)
          .slice(0, 100);
        if (ids.length > 0) void onAssignItems(ids, folderId);
      },
    };
  }

  function start(kind: ActionKind, id: string | null, initial = ''): void {
    setAction({ kind, id });
    setValue(initial);
    setMoveTarget('');
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!action || busy) return;
    let ok = false;
    if (action.kind === 'create') {
      const name = value.trim();
      if (name.length === 0) return;
      ok = await onCreate(action.id, name);
    } else if (action.kind === 'rename' && action.id) {
      const name = value.trim();
      if (name.length === 0) return;
      ok = await onRename(action.id, name);
    } else if (action.kind === 'move' && action.id) {
      ok = await onMove(action.id, moveTarget === '' ? null : moveTarget);
    }
    if (ok) setAction(null);
  }

  function editor(parentId: string | null) {
    if (!action) return null;
    if (action.kind === 'create' && action.id !== parentId) return null;
    if (action.kind !== 'create' && action.id !== parentId) return null;
    if (action.kind === 'move') {
      const excluded = action.id ? folderDescendants(folders, action.id) : new Set<string>();
      return (
        <form className="folder-tree-editor" onSubmit={(event) => void submit(event)}>
          <label>
            <span>Move to</span>
            <select
              aria-label="Move folder to"
              value={moveTarget}
              onChange={(event) => setMoveTarget(event.target.value)}
              disabled={busy}
            >
              <option value="">Top level</option>
              {rows
                .filter(({ folder }) => folder.id !== action.id && !excluded.has(folder.id))
                .map(({ folder, depth }) => (
                  <option key={folder.id} value={folder.id}>
                    {indentedFolder(folder.name, depth)}
                  </option>
                ))}
            </select>
          </label>
          <button type="submit" className="button secondary-button" disabled={busy}>
            Move
          </button>
          <button type="button" className="button-link" onClick={() => setAction(null)}>
            Cancel
          </button>
        </form>
      );
    }
    return (
      <form className="folder-tree-editor" onSubmit={(event) => void submit(event)}>
        <label>
          <span>{action.kind === 'create' ? 'New folder name' : 'New name'}</span>
          <input
            aria-label={
              action.kind === 'create'
                ? action.id
                  ? 'New subfolder name'
                  : 'New top-level folder name'
                : 'New folder name'
            }
            value={value}
            maxLength={100}
            onChange={(event) => setValue(event.target.value)}
            disabled={busy}
          />
        </label>
        <button type="submit" className="button secondary-button" disabled={busy}>
          {action.kind === 'create' ? 'Create folder' : 'Save'}
        </button>
        <button type="button" className="button-link" onClick={() => setAction(null)}>
          Cancel
        </button>
      </form>
    );
  }

  return (
    <details
      className="folder-manager"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Manage folders ({folders.length})</summary>
      <div className="folder-manager-body">
        <button
          type="button"
          className="button secondary-button"
          onClick={() => start('create', null)}
          disabled={busy}
        >
          New top-level folder
        </button>
        {action?.kind === 'create' && action.id === null ? editor(null) : null}
        <ul className="folder-tree" aria-label="Folder tree">
          <li className="folder-tree-item">
            <div
              className={`folder-tree-row${dropTarget === 'none' ? ' is-drop-target' : ''}`}
              {...dropHandlers('none', null)}
            >
              <button
                type="button"
                className="button-link folder-tree-name"
                aria-current={selectedId === 'none' ? 'true' : undefined}
                onClick={() => onSelect('none')}
              >
                Uncategorized
              </button>
              <span className="folder-tree-count">drop media here</span>
            </div>
          </li>
          {rows.map(({ folder, depth }) => (
            <li key={folder.id} className="folder-tree-item">
              <div
                className={`folder-tree-row${dropTarget === folder.id ? ' is-drop-target' : ''}`}
                style={{ paddingLeft: `${depth * 16}px` }}
                {...dropHandlers(folder.id, folder.id)}
              >
                <button
                  type="button"
                  className="button-link folder-tree-name"
                  aria-current={selectedId === folder.id ? 'true' : undefined}
                  onClick={() => onSelect(folder.id)}
                >
                  {folder.name}
                </button>
                <span className="folder-tree-count">({folder.itemCount})</span>
                <span className="folder-tree-actions">
                  <button
                    type="button"
                    className="button-link"
                    onClick={() => start('create', folder.id)}
                    disabled={busy}
                  >
                    New subfolder
                  </button>
                  <button
                    type="button"
                    className="button-link"
                    onClick={() => start('rename', folder.id, folder.name)}
                    disabled={busy}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="button-link"
                    onClick={() => start('move', folder.id)}
                    disabled={busy}
                  >
                    Move
                  </button>
                  <button
                    type="button"
                    className="button-link is-danger"
                    onClick={() => void onDelete(folder)}
                    disabled={busy}
                  >
                    Delete
                  </button>
                </span>
              </div>
              {action?.id === folder.id ? editor(folder.id) : null}
            </li>
          ))}
        </ul>
        {rows.length === 0 ? (
          <p className="field-help">No folders yet. Create one to organise the library.</p>
        ) : null}
        <p className="field-help">
          Counts show items directly in each folder. Drag media items onto a folder row (or
          Uncategorized) to move them, or drop files from your computer to upload them there.
          Deleting a folder moves its child folders up and leaves its media Uncategorized.
        </p>
      </div>
    </details>
  );
}

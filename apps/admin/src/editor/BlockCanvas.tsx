import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  __experimentalListView as ListView,
  BlockEditorProvider,
  BlockInspector,
  BlockList,
  BlockTools,
  Inserter,
  ObserveTyping,
  WritingFlow,
} from '@wordpress/block-editor';
import { Popover, SlotFillProvider, SnackbarList } from '@wordpress/components';
import { useDispatch, useSelect } from '@wordpress/data';
import { Icon, close, listView, plus, redo, undo } from '@wordpress/icons';
import { ShortcutProvider } from '@wordpress/keyboard-shortcuts';
import '@wordpress/keyboard-shortcuts';
import { store as noticesStore } from '@wordpress/notices';
import type { Block } from '@wordpress/blocks';

import { editorSettings, ensureEditorBootstrap } from './blocks.js';
import { blocksFromContent, historySeed, serializeBlocks } from './content.js';

import '@wordpress/components/build-style/style.css';
import '@wordpress/block-editor/build-style/style.css';
import '@wordpress/block-editor/build-style/content.css';
import '@wordpress/block-library/build-style/editor.css';
import '@wordpress/block-library/build-style/style.css';
import '@wordpress/block-library/build-style/theme.css';
import './editor.css';

ensureEditorBootstrap();

type InserterToggleArgs = { onToggle: () => void; disabled: boolean };
const InserterControl = Inserter as unknown as (props: {
  renderToggle: (args: InserterToggleArgs) => ReactElement;
}) => ReactElement;

const HISTORY_LIMIT = 50;
const INPUT_DEBOUNCE_MS = 250;

interface NoticeItem {
  id: string;
  content: string;
  status?: string;
  spokenMessage?: string;
}

interface HistoryState {
  entries: string[];
  index: number;
}

export interface BlockCanvasHandle {
  /** Serialize the latest keystrokes and hand them to the parent synchronously. */
  flush: () => string;
  /** Open the block-settings inspector (the editor sidebar's Block tab). */
  openInspector: () => void;
}

export interface BlockCanvasProps {
  /**
   * Element in the editor top bar where the canvas toolbar (inserter,
   * undo/redo, list view) is rendered. The reference CMS keeps these in the
   * dark header; rendering there avoids a second dark strip inside the sheet.
   */
  toolbarSlot?: HTMLElement | null;
  /** Canonical content loaded from the API. */
  initialContent: string;
  /** Called with serialized content after typing (debounced) or structural edits. */
  onChange: (content: string) => void;
  /** Called synchronously on the first keystroke of a typing burst. */
  onDirty?: () => void;
  /** Rendered above the block list, inside the white canvas (the title field). */
  titleSlot?: ReactNode;
}

/**
 * Standalone Gutenberg canvas. Kept in its own lazily-loaded chunk so the
 * WordPress bundle only loads on new/edit routes.
 *
 * The standalone `BlockEditorProvider` has no editor-wide undo store, so this
 * component owns a bounded snapshot history (50 serialized states) and wires
 * the keyboard shortcuts WordPress users expect.
 */
export const BlockCanvas = forwardRef<BlockCanvasHandle, BlockCanvasProps>(function BlockCanvas(
  { initialContent, onChange, onDirty, titleSlot, toolbarSlot },
  ref,
) {
  const [blocks, setBlocks] = useState<Array<Block<Record<string, unknown>>>>(() =>
    blocksFromContent(initialContent),
  );
  const blocksRef = useRef<Array<Block<Record<string, unknown>>>>(blocks);
  const [history, setHistory] = useState<HistoryState>(() => ({
    entries: [historySeed(initialContent)],
    index: 0,
  }));
  const historyRef = useRef<HistoryState>(history);
  const [listViewOpen, setListViewOpen] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const lastEmitted = useRef(initialContent);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const emit = useCallback((next: Array<Block<Record<string, unknown>>>) => {
    let serialized: string;
    try {
      serialized = serializeBlocks(next);
    } catch {
      // Never hand an empty document to the parent (and then to the API) when
      // the serializer fails; keep the last known-good content instead.
      return lastEmitted.current;
    }
    lastEmitted.current = serialized;
    onChangeRef.current(serialized);
    return serialized;
  }, []);

  const resetHistory = useCallback((seed: string) => {
    const next: HistoryState = { entries: [seed], index: 0 };
    historyRef.current = next;
    setHistory(next);
  }, []);

  // Snapshot history is coalesced per typing burst / structural change: the
  // standalone provider has no undo store, and one entry per keystroke would
  // exceed the 50-entry cap during normal writing.
  const pushHistory = useCallback((serialized: string) => {
    const current = historyRef.current;
    if (serialized === current.entries[current.index]) {
      return;
    }
    const appended = [...current.entries.slice(0, current.index + 1), serialized];
    const entries = appended.length > HISTORY_LIMIT ? appended.slice(-HISTORY_LIMIT) : appended;
    const next: HistoryState = { entries, index: entries.length - 1 };
    historyRef.current = next;
    setHistory(next);
  }, []);

  const emitDebounced = useCallback(
    (next: Array<Block<Record<string, unknown>>>) => {
      clearTimer();
      timer.current = setTimeout(() => {
        timer.current = null;
        pushHistory(emit(next));
      }, INPUT_DEBOUNCE_MS);
    },
    [clearTimer, emit, pushHistory],
  );

  // External content changes (initial load, conflict reload) replace the
  // document. Our own serialized echoes are ignored so typing is never reset.
  useEffect(() => {
    if (initialContent === lastEmitted.current) {
      return;
    }
    const parsed = blocksFromContent(initialContent);
    const normalized = serializeBlocks(parsed);
    if (normalized === lastEmitted.current) {
      lastEmitted.current = initialContent;
      return;
    }
    clearTimer();
    lastEmitted.current = initialContent;
    blocksRef.current = parsed;
    setBlocks(parsed);
    resetHistory(normalized);
  }, [clearTimer, initialContent, resetHistory]);

  useEffect(() => clearTimer, [clearTimer]);

  const handleInput = useCallback(
    (next: Array<Block<Record<string, unknown>>>) => {
      blocksRef.current = next;
      setBlocks(next);
      onDirty?.();
      emitDebounced(next);
    },
    [emitDebounced, onDirty],
  );

  const handleChange = useCallback(
    (next: Array<Block<Record<string, unknown>>>) => {
      const previous = lastEmitted.current;
      blocksRef.current = next;
      setBlocks(next);
      clearTimer();
      // Preserve the pre-change document so undoing a structural edit (insert,
      // move, delete) does not also discard the text typed before it.
      if (previous) {
        pushHistory(previous);
      }
      pushHistory(emit(next));
    },
    [clearTimer, emit, pushHistory],
  );

  const applySnapshot = useCallback(
    (snapshot: string) => {
      clearTimer();
      const parsed = blocksFromContent(snapshot);
      blocksRef.current = parsed;
      setBlocks(parsed);
      lastEmitted.current = snapshot;
      onChangeRef.current(snapshot);
    },
    [clearTimer],
  );

  const canUndo = history.index > 0;
  const canRedo = history.index < history.entries.length - 1;

  const handleUndo = useCallback(() => {
    const current = historyRef.current;
    if (current.index <= 0) return;
    const index = current.index - 1;
    const next = { ...current, index };
    historyRef.current = next;
    setHistory(next);
    applySnapshot(current.entries[index] ?? '');
  }, [applySnapshot]);

  const handleRedo = useCallback(() => {
    const current = historyRef.current;
    if (current.index >= current.entries.length - 1) return;
    const index = current.index + 1;
    const next = { ...current, index };
    historyRef.current = next;
    setHistory(next);
    applySnapshot(current.entries[index] ?? '');
  }, [applySnapshot]);

  useImperativeHandle(
    ref,
    () => ({
      flush: () => {
        clearTimer();
        return emit(blocksRef.current);
      },
      openInspector: () => setInspectorOpen(true),
    }),
    [clearTimer, emit],
  );

  // Built once per canvas. `settings.mediaUpload` is the real media-API
  // uploader (editor/blocks.ts), so the image block's native Upload button and
  // drag/drop write through to /api/admin/media; a stable settings object also
  // stops BlockEditorProvider re-reading settings on every keystroke.
  const settings = useMemo(() => editorSettings(), []);

  const notices = useSelect(
    (select) => (select(noticesStore) as { getNotices: () => NoticeItem[] }).getNotices(),
    [],
  );
  const { removeNotice } = useDispatch(noticesStore) as {
    removeNotice: (id: string) => void;
  };
  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === 'z') {
      event.preventDefault();
      if (event.shiftKey) handleRedo();
      else handleUndo();
    } else if (key === 'y') {
      event.preventDefault();
      handleRedo();
    }
  }

  return (
    <div className="block-canvas-root" onKeyDownCapture={handleKeyDown}>
      <ShortcutProvider>
        <SlotFillProvider>
          <BlockEditorProvider
            value={blocks}
            onInput={handleInput as never}
            onChange={handleChange as never}
            settings={settings as never}
            onChangeSelection={(selection: unknown) => {
              const next = selection as { selectionStart?: { clientId?: string } } | undefined;
              setHasSelection(Boolean(next?.selectionStart?.clientId));
            }}
          >
            {toolbarSlot
              ? createPortal(
                  <div className="editor-topbar-tools" role="toolbar" aria-label="Editor tools">
                    <InserterControl
                      renderToggle={({ onToggle, disabled }) => (
                        <button
                          type="button"
                          className="editor-topbar-tool editor-topbar-tool-primary"
                          onClick={onToggle}
                          disabled={disabled}
                          aria-label="Add block"
                          title="Add block"
                        >
                          <Icon icon={plus} size={20} />
                        </button>
                      )}
                    />
                    <span className="editor-topbar-divider" aria-hidden="true" />
                    <button
                      type="button"
                      className="editor-topbar-tool"
                      onClick={handleUndo}
                      disabled={!canUndo}
                      aria-label="Undo"
                      title="Undo (Ctrl/Cmd+Z)"
                    >
                      <Icon icon={undo} size={20} />
                    </button>
                    <button
                      type="button"
                      className="editor-topbar-tool"
                      onClick={handleRedo}
                      disabled={!canRedo}
                      aria-label="Redo"
                      title="Redo (Ctrl/Cmd+Shift+Z)"
                    >
                      <Icon icon={redo} size={20} />
                    </button>
                    <button
                      type="button"
                      className={`editor-topbar-tool${listViewOpen ? ' is-active' : ''}`}
                      onClick={() => setListViewOpen((open) => !open)}
                      aria-label="Document overview"
                      aria-expanded={listViewOpen}
                      title="Document overview"
                    >
                      <Icon icon={listView} size={20} />
                    </button>
                  </div>,
                  toolbarSlot,
                )
              : null}

            <div className="block-canvas-body">
              {listViewOpen ? (
                <div className="block-canvas-listview" aria-label="Document overview">
                  <div className="block-canvas-panel-head">
                    <span>Document overview</span>
                    <button
                      type="button"
                      className="block-canvas-panel-close"
                      onClick={() => setListViewOpen(false)}
                      aria-label="Close document overview"
                    >
                      <Icon icon={close} size={16} />
                    </button>
                  </div>
                  <div className="block-canvas-listview-scroll">
                    <ListView />
                  </div>
                </div>
              ) : null}

              <div className="block-canvas-scroll" ref={contentRef}>
                <div className="block-canvas-sheet editor-styles-wrapper">
                  {titleSlot}
                  <BlockTools __unstableContentRef={contentRef}>
                    <WritingFlow>
                      <ObserveTyping>
                        <BlockList />
                      </ObserveTyping>
                    </WritingFlow>
                  </BlockTools>
                </div>
              </div>

              {inspectorOpen ? (
                <aside className="block-canvas-inspector" aria-label="Block settings">
                  <div className="block-canvas-panel-head">
                    <span>Block settings</span>
                    <button
                      type="button"
                      className="block-canvas-panel-close"
                      onClick={() => setInspectorOpen(false)}
                      aria-label="Close block settings"
                    >
                      <Icon icon={close} size={16} />
                    </button>
                  </div>
                  <div className="block-canvas-inspector-scroll">
                    {hasSelection ? (
                      <BlockInspector />
                    ) : (
                      <p className="block-canvas-hint">
                        Select a block to edit its settings. Text formatting lives in the block
                        toolbar.
                      </p>
                    )}
                  </div>
                </aside>
              ) : null}
            </div>

            <p className="block-canvas-help">
              Type <kbd>/</kbd> for blocks, or press <kbd>Enter</kbd> to start writing.
            </p>
            <Popover.Slot />
          </BlockEditorProvider>
        </SlotFillProvider>
      </ShortcutProvider>

      <SnackbarList
        className="block-canvas-notices"
        notices={notices as never}
        onRemove={removeNotice}
      />
    </div>
  );
});

export default BlockCanvas;

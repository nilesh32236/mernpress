import { useEffect, useState, type FormEvent } from 'react';
import type { NoteBlockAnchor, PostNote, PostNoteAuthor } from '../api.js';
import { formatDateTime, formatRelativeTime } from '../format.js';
import { anchorSummary, resolveBlockAnchor, type BlockAnchor } from './blockAnchors.js';
import { MentionTextarea } from './MentionTextarea.js';
import type { PostNotesState } from './usePostNotes.js';

function authorName(author: PostNoteAuthor | null): string {
  if (!author) return 'Deleted user';
  const display = author.displayName?.trim();
  return display && display.length > 0 ? display : author.username;
}

function sortThreads(notes: PostNote[]): PostNote[] {
  return [...notes]
    .filter((note) => note.parentId === null)
    .sort((a, b) => {
      // Open threads first, then newest-first inside each group.
      const openA = a.resolvedAt === null ? 0 : 1;
      const openB = b.resolvedAt === null ? 0 : 1;
      if (openA !== openB) return openA - openB;
      return b.createdAt.localeCompare(a.createdAt);
    });
}

function Message({ note, actions }: { note: PostNote; actions?: React.ReactNode }) {
  return (
    <div className="note-message">
      <p className="note-meta">
        <strong>{authorName(note.author)}</strong>
        <time dateTime={note.createdAt} title={formatDateTime(note.createdAt)}>
          {formatRelativeTime(note.createdAt)}
        </time>
      </p>
      <p className="note-content">{note.content}</p>
      {actions ? <div className="note-actions">{actions}</div> : null}
    </div>
  );
}

function AnchorBadge({ anchor, anchors }: { anchor: NoteBlockAnchor; anchors: BlockAnchor[] }) {
  const resolution = resolveBlockAnchor(anchor, anchors);
  let text: string;
  if (resolution.status === 'exact' && resolution.anchor) {
    text = anchorSummary(resolution.anchor);
  } else if (resolution.status === 'moved' && resolution.anchor) {
    text = `${anchorSummary({ ...anchor, path: resolution.anchor.path })} (moved)`;
  } else if (resolution.status === 'changed') {
    text = `${anchorSummary({ ...anchor, path: resolution.anchor?.path ?? anchor.path })} (block changed)`;
  } else {
    text = 'Block no longer found';
  }
  return (
    <p className={`note-anchor is-${resolution.status}`} title={JSON.stringify(anchor)}>
      {text}
    </p>
  );
}

/**
 * Editor notes panel (WordPress "All notes"): per-post threads with replies and
 * a resolved state. Internal to people who can edit the post; nothing here is
 * public, and notes do not create revisions.
 */
export function NotesPanel({
  postId,
  state,
  selectedAnchor = null,
  anchors = [],
  currentUserId = null,
  canDeleteAny = false,
  prepareAnchor,
}: {
  postId: string | null;
  state: PostNotesState;
  /** Anchor of the block selected in the canvas, if any. */
  selectedAnchor?: NoteBlockAnchor | null;
  /** Current document anchors, used to resolve stored note anchors. */
  anchors?: BlockAnchor[];
  /** Signed-in user, used for note-author delete affordances. */
  currentUserId?: string | null;
  /** Administrators/editors may delete any note on a post they can edit. */
  canDeleteAny?: boolean;
  /** Assign a stable block id before saving an anchored note. */
  prepareAnchor?: (
    anchor: NoteBlockAnchor,
  ) => Promise<NoteBlockAnchor | null> | NoteBlockAnchor | null;
}) {
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [attach, setAttach] = useState(Boolean(selectedAnchor));
  const [showTrash, setShowTrash] = useState(false);

  useEffect(() => {
    setAttach(Boolean(selectedAnchor));
  }, [selectedAnchor?.hash, selectedAnchor?.path]);

  if (!postId) {
    return (
      <section className="editor-panel editor-notes-panel" id="editor-notes-panel">
        <h3>Notes</h3>
        <p className="field-help">
          Save the draft first. Notes belong to a saved post and are visible only to people who can
          edit it.
        </p>
      </section>
    );
  }

  const threads = sortThreads(state.notes);
  const repliesFor = (rootId: string) =>
    state.notes
      .filter((note) => note.parentId === rootId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const canDelete = (note: PostNote) =>
    canDeleteAny || (Boolean(currentUserId) && note.author?.id === currentUserId);

  async function trashNote(note: PostNote): Promise<void> {
    if (!canDelete(note)) return;
    const question =
      note.parentId === null
        ? 'Move this note thread and all of its replies to the trash?'
        : 'Move this reply to the trash?';
    if (typeof window !== 'undefined' && !window.confirm(question)) return;
    setLocalError(null);
    await state.moveToTrash(note.id);
  }

  async function restoreNote(note: PostNote): Promise<void> {
    if (!canDelete(note)) return;
    setLocalError(null);
    await state.restoreNote(note.id);
  }

  async function purgeNote(note: PostNote): Promise<void> {
    if (!canDelete(note)) return;
    if (
      typeof window !== 'undefined' &&
      !window.confirm('Delete this note permanently? This cannot be undone.')
    ) {
      return;
    }
    setLocalError(null);
    await state.deleteForever(note.id);
  }

  async function submitRoot(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;
    setLocalError(null);
    const prepared =
      attach && selectedAnchor ? ((await prepareAnchor?.(selectedAnchor)) ?? selectedAnchor) : null;
    const saved = await state.add(content, prepared);
    if (saved) setDraft('');
  }

  async function submitReply(event: FormEvent<HTMLFormElement>, parentId: string): Promise<void> {
    event.preventDefault();
    const content = replyDraft.trim();
    if (!content) return;
    setLocalError(null);
    const saved = await state.reply(parentId, content);
    if (saved) {
      setReplyDraft('');
      setReplyTo(null);
    }
  }

  return (
    <section
      className="editor-panel editor-notes-panel"
      id="editor-notes-panel"
      aria-labelledby="notes-heading"
    >
      <div className="notes-head">
        <h3 id="notes-heading">Notes</h3>
        <span className="notes-count">
          {state.unresolvedCount} open / {state.notes.length} total
        </span>
        {state.trash.length > 0 || showTrash ? (
          <button
            type="button"
            className={`button-link notes-trash-toggle${showTrash ? ' is-active' : ''}`}
            onClick={() => setShowTrash((value) => !value)}
          >
            {showTrash ? 'Back to notes' : `Trash (${state.trash.length})`}
          </button>
        ) : null}
      </div>
      <p className="field-help">
        Internal notes for everyone who can edit this post. Notes never appear on the public site
        and do not create revisions.
      </p>

      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {localError ? (
        <p className="form-error" role="alert">
          {localError}
        </p>
      ) : null}

      <form className="note-compose" onSubmit={(event) => void submitRoot(event)}>
        <label htmlFor="note-new" className="screen-reader-text">
          Add a note
        </label>
        <MentionTextarea
          id="note-new"
          postId={postId}
          rows={3}
          value={draft}
          placeholder="Add a note for the editors…"
          onChange={setDraft}
          disabled={state.busy}
        />
        <p className="note-anchor-line">
          {selectedAnchor ? (
            <>
              <span>
                {attach ? 'Attached to ' : 'General note · '}
                <strong>{anchorSummary(selectedAnchor)}</strong>
              </span>
              <button
                type="button"
                className="button-link"
                onClick={() => setAttach((value) => !value)}
              >
                {attach ? 'Make general' : 'Attach to selected block'}
              </button>
            </>
          ) : (
            <span>Select a block to anchor this note, or add it as a general note.</span>
          )}
        </p>
        <div className="note-compose-actions">
          <span className="field-help">{draft.length} / 2000</span>
          <button
            type="submit"
            className="button primary-button"
            disabled={state.busy || draft.trim().length === 0}
          >
            {state.busy ? 'Saving…' : 'Add note'}
          </button>
        </div>
      </form>

      <p className="field-help note-mention-hint">
        Type <code>@username</code> to notify a teammate. Only people who can edit this post receive
        mention emails. Mentions never appear on the public site.
      </p>

      {showTrash ? (
        <div className="notes-trash">
          <p className="field-help">
            Trashed notes stay here until you restore them or delete them permanently.
          </p>
          {state.trash.length === 0 ? (
            <p className="notes-empty">The trash is empty.</p>
          ) : (
            <ul className="notes-list">
              {state.trash.map((note) => (
                <li key={note.id} className="note-thread is-trashed" data-note-id={note.id}>
                  <Message
                    note={note}
                    actions={
                      canDelete(note) ? (
                        <>
                          <button
                            type="button"
                            className="button-link"
                            onClick={() => void restoreNote(note)}
                            disabled={state.busy}
                          >
                            Restore
                          </button>
                          <button
                            type="button"
                            className="button-link is-danger"
                            onClick={() => void purgeNote(note)}
                            disabled={state.busy}
                          >
                            Delete permanently
                          </button>
                        </>
                      ) : undefined
                    }
                  />
                  {note.deletedAt ? (
                    <p className="note-trash-meta">
                      Trashed {formatRelativeTime(note.deletedAt)}
                      {note.deletedBy ? ` by ${authorName(note.deletedBy)}` : ''}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : state.loading ? (
        <p className="field-help">Loading notes…</p>
      ) : threads.length === 0 ? (
        <p className="notes-empty">No notes yet.</p>
      ) : (
        <ol className="notes-list">
          {threads.map((thread) => {
            const replies = repliesFor(thread.id);
            const resolved = thread.resolvedAt !== null;
            const replying = replyTo === thread.id;
            return (
              <li
                key={thread.id}
                className={`note-thread${resolved ? ' is-resolved' : ''}`}
                data-note-id={thread.id}
              >
                <Message
                  note={thread}
                  actions={
                    <>
                      {resolved ? (
                        <span className="note-resolved-badge">
                          Resolved{thread.resolvedBy ? ` by ${authorName(thread.resolvedBy)}` : ''}
                        </span>
                      ) : null}
                      {!resolved ? (
                        <button
                          type="button"
                          className="button-link"
                          onClick={() => {
                            setReplyTo(replying ? null : thread.id);
                            setReplyDraft('');
                          }}
                          disabled={state.busy}
                        >
                          {replying ? 'Cancel reply' : 'Reply'}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="button-link"
                        onClick={() => void state.setResolved(thread.id, !resolved)}
                        disabled={state.busy}
                      >
                        {resolved ? 'Reopen' : 'Resolve'}
                      </button>
                      {canDelete(thread) ? (
                        <button
                          type="button"
                          className="button-link is-danger"
                          onClick={() => void trashNote(thread)}
                          disabled={state.busy}
                        >
                          {replies.length > 0 ? 'Trash thread' : 'Trash'}
                        </button>
                      ) : null}
                    </>
                  }
                />

                {thread.block ? <AnchorBadge anchor={thread.block} anchors={anchors} /> : null}

                {replies.length > 0 ? (
                  <ol className="note-replies">
                    {replies.map((reply) => (
                      <li key={reply.id}>
                        <Message
                          note={reply}
                          actions={
                            canDelete(reply) ? (
                              <button
                                type="button"
                                className="button-link is-danger"
                                onClick={() => void trashNote(reply)}
                                disabled={state.busy}
                              >
                                Trash
                              </button>
                            ) : undefined
                          }
                        />
                      </li>
                    ))}
                  </ol>
                ) : null}

                {replying ? (
                  <form
                    className="note-reply-form"
                    onSubmit={(event) => void submitReply(event, thread.id)}
                    aria-label="Reply to note"
                  >
                    <label htmlFor={`note-reply-${thread.id}`} className="screen-reader-text">
                      Write a reply
                    </label>
                    <MentionTextarea
                      id={`note-reply-${thread.id}`}
                      postId={postId}
                      rows={2}
                      value={replyDraft}
                      onChange={setReplyDraft}
                      disabled={state.busy}
                    />
                    <div className="note-compose-actions">
                      <button
                        type="submit"
                        className="button primary-button"
                        disabled={state.busy || replyDraft.trim().length === 0}
                      >
                        {state.busy ? 'Saving…' : 'Post reply'}
                      </button>
                    </div>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

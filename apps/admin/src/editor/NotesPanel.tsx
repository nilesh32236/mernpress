import { useEffect, useState, type FormEvent } from 'react';
import type { NoteBlockAnchor, PostNote, PostNoteAuthor } from '../api.js';
import { formatDateTime, formatRelativeTime } from '../format.js';
import { anchorSummary, resolveBlockAnchor, type BlockAnchor } from './blockAnchors.js';
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
}: {
  postId: string | null;
  state: PostNotesState;
  /** Anchor of the block selected in the canvas, if any. */
  selectedAnchor?: NoteBlockAnchor | null;
  /** Current document anchors, used to resolve stored note anchors. */
  anchors?: BlockAnchor[];
}) {
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [attach, setAttach] = useState(Boolean(selectedAnchor));

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

  async function submitRoot(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;
    setLocalError(null);
    const saved = await state.add(content, attach ? selectedAnchor : null);
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
        <textarea
          id="note-new"
          rows={3}
          value={draft}
          maxLength={2000}
          placeholder="Add a note for the editors…"
          onChange={(event) => setDraft(event.target.value)}
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

      {state.loading ? (
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
                    </>
                  }
                />

                {thread.block ? <AnchorBadge anchor={thread.block} anchors={anchors} /> : null}

                {replies.length > 0 ? (
                  <ol className="note-replies">
                    {replies.map((reply) => (
                      <li key={reply.id}>
                        <Message note={reply} />
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
                    <textarea
                      id={`note-reply-${thread.id}`}
                      rows={2}
                      value={replyDraft}
                      maxLength={2000}
                      onChange={(event) => setReplyDraft(event.target.value)}
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

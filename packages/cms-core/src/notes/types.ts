/** Author summary shown on an editor note. */
export interface NoteAuthor {
  id: string;
  username: string;
  displayName: string | null;
}

/** Optional block anchor captured from the editor selection. */
export interface NoteBlockAnchor {
  /** Registered block name, for example `core/paragraph`. */
  name: string;
  /** Dot-separated 0-based path, for example `1` or `0.2`. */
  path: string;
  /** Stable hash of the block name, attributes and own HTML. */
  hash: string;
  /** Short plain-text fingerprint, used to tell "changed" from "removed". */
  text: string;
}

/** A per-post editor note or a reply to a note thread. */
export interface PostNote {
  id: string;
  postId: string;
  /** Null for a thread root; the root note id for a reply. */
  parentId: string | null;
  content: string;
  author: NoteAuthor | null;
  createdAt: string;
  /** Resolved state applies to thread roots only. */
  resolvedAt: string | null;
  resolvedBy: NoteAuthor | null;
  /** Null for an unanchored note or a reply. */
  block: NoteBlockAnchor | null;
  /** Set while the note is in Trash; cleared on restore. */
  deletedAt: string | null;
  deletedBy: NoteAuthor | null;
}

/** A user the mention picker may suggest for a post. */
export interface NoteMentionCandidate {
  id: string;
  username: string;
  displayName: string | null;
}

export interface CreatePostNoteInput {
  content: string;
  /** Root note id; replies are one level deep. */
  parentId?: string | null | undefined;
  /** Block anchor for a root note (replies inherit their thread). */
  block?: NoteBlockAnchor | null | undefined;
}

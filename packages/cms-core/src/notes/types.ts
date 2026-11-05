/** Author summary shown on an editor note. */
export interface NoteAuthor {
  id: string;
  username: string;
  displayName: string | null;
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
}

export interface CreatePostNoteInput {
  content: string;
  /** Root note id; replies are one level deep. */
  parentId?: string | null | undefined;
}

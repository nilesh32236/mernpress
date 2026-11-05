import { useCallback, useEffect, useState } from 'react';
import {
  actionErrorMessage,
  createPostNote,
  deletePostNote,
  fetchPostNotes,
  purgePostNote,
  restorePostNote,
  setPostNoteResolved,
  type NoteBlockAnchor,
  type PostNote,
} from '../api.js';

export interface PostNotesState {
  notes: PostNote[];
  trash: PostNote[];
  loading: boolean;
  error: string | null;
  busy: boolean;
  unresolvedCount: number;
  add: (content: string, block?: NoteBlockAnchor | null) => Promise<boolean>;
  reply: (parentId: string, content: string) => Promise<boolean>;
  setResolved: (noteId: string, resolved: boolean) => Promise<boolean>;
  moveToTrash: (noteId: string) => Promise<boolean>;
  restoreNote: (noteId: string) => Promise<boolean>;
  deleteForever: (noteId: string) => Promise<boolean>;
  refresh: () => void;
}

/**
 * Loads and mutates a post's editor notes. The hook is driven by `postId`; a
 * null id (new, unsaved content) performs no request so the editor never asks
 * for notes before the post exists. Mutations refresh the list so the counts and
 * thread order stay consistent across additions and resolutions.
 */
export function usePostNotes(postId: string | null): PostNotesState {
  const [notes, setNotes] = useState<PostNote[]>([]);
  const [trash, setTrash] = useState<PostNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!postId) {
      setNotes([]);
      setTrash([]);
      setLoading(false);
      setError(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    fetchPostNotes(postId)
      .then((lists) => {
        if (!active) return;
        setNotes(lists.notes);
        setTrash(lists.trash);
      })
      .catch((caught) => {
        if (active) setError(actionErrorMessage(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [postId, reloadKey]);

  const refresh = useCallback(() => setReloadKey((value) => value + 1), []);

  const run = useCallback(
    async (action: () => Promise<unknown>): Promise<boolean> => {
      if (!postId || busy) return false;
      setBusy(true);
      setError(null);
      try {
        await action();
        refresh();
        return true;
      } catch (caught) {
        setError(actionErrorMessage(caught));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy, postId, refresh],
  );

  const add = useCallback(
    (content: string, block?: NoteBlockAnchor | null) =>
      run(() =>
        createPostNote(postId as string, {
          content,
          ...(block ? { block } : {}),
        }),
      ),
    [postId, run],
  );
  const reply = useCallback(
    (parentId: string, content: string) =>
      run(() => createPostNote(postId as string, { content, parentId })),
    [postId, run],
  );
  const setResolved = useCallback(
    (noteId: string, resolved: boolean) =>
      run(() => setPostNoteResolved(postId as string, noteId, resolved)),
    [postId, run],
  );
  const moveToTrash = useCallback(
    (noteId: string) => run(() => deletePostNote(postId as string, noteId)),
    [postId, run],
  );
  const restoreNote = useCallback(
    (noteId: string) => run(() => restorePostNote(postId as string, noteId)),
    [postId, run],
  );
  const deleteForever = useCallback(
    (noteId: string) => run(() => purgePostNote(postId as string, noteId)),
    [postId, run],
  );

  return {
    notes,
    trash,
    loading,
    error,
    busy,
    unresolvedCount: notes.filter((note) => note.parentId === null && note.resolvedAt === null)
      .length,
    add,
    reply,
    setResolved,
    moveToTrash,
    restoreNote,
    deleteForever,
    refresh,
  };
}

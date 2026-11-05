import type { DatabaseClient } from '@mernpress/database';
import { ContentError } from '../content/errors.js';
import type { Principal } from '../content/types.js';
import { canEditPost } from '../content/service.js';
import type { CreatePostNoteInput, NoteAuthor, PostNote } from './types.js';

/**
 * Editor notes: per-post discussion threads for the people who can edit the
 * post. Notes are internal, never public, and are not a revision mechanism.
 * Threads are one level deep (root + replies) and the root can be resolved.
 */
const MAX_CONTENT = 2000;

const AUTHOR_SELECT = {
  select: { id: true, username: true, displayName: true },
} as const;

const NOTE_INCLUDE = {
  author: AUTHOR_SELECT,
  resolvedBy: AUTHOR_SELECT,
} as const;

type NoteRow = {
  id: string;
  postId: string;
  parentId: string | null;
  content: string;
  createdAt: Date;
  resolvedAt: Date | null;
  author: { id: string; username: string; displayName: string | null } | null;
  resolvedBy: { id: string; username: string; displayName: string | null } | null;
};

function toAuthor(
  row: { id: string; username: string; displayName: string | null } | null,
): NoteAuthor | null {
  return row ? { id: row.id, username: row.username, displayName: row.displayName } : null;
}

function toNote(row: NoteRow): PostNote {
  return {
    id: row.id,
    postId: row.postId,
    parentId: row.parentId,
    content: row.content,
    author: toAuthor(row.author),
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolvedBy: toAuthor(row.resolvedBy),
  };
}

export interface NoteServiceOptions {
  prisma: DatabaseClient;
}

export function createNoteService({ prisma }: NoteServiceOptions) {
  async function loadEditablePost(principal: Principal, postId: string) {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true, status: true },
    });
    if (!post) {
      throw new ContentError('NOT_FOUND', 'Not found', 404);
    }
    canEditPost(principal, post.authorId, post.status);
    return post;
  }

  async function list(principal: Principal, postId: string): Promise<PostNote[]> {
    await loadEditablePost(principal, postId);
    const rows = await prisma.postNote.findMany({
      where: { postId },
      include: NOTE_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toNote);
  }

  async function create(
    principal: Principal,
    postId: string,
    input: CreatePostNoteInput,
  ): Promise<PostNote> {
    await loadEditablePost(principal, postId);
    const content = input.content.trim();
    if (content.length === 0) {
      throw new ContentError('VALIDATION_ERROR', 'Write a note first.', 400);
    }
    if (content.length > MAX_CONTENT) {
      throw new ContentError(
        'VALIDATION_ERROR',
        `A note can contain at most ${MAX_CONTENT} characters.`,
        400,
      );
    }
    let parentId: string | null = null;
    if (input.parentId) {
      const parent = await prisma.postNote.findFirst({
        where: { id: input.parentId, postId },
        select: { id: true, parentId: true, resolvedAt: true },
      });
      if (!parent) {
        throw new ContentError('VALIDATION_ERROR', 'That note no longer exists.', 400);
      }
      if (parent.parentId !== null) {
        throw new ContentError('VALIDATION_ERROR', 'Reply to the note thread, not a reply.', 400);
      }
      if (parent.resolvedAt !== null) {
        throw new ContentError(
          'VALIDATION_ERROR',
          'This note is resolved. Reopen it before replying.',
          400,
        );
      }
      parentId = parent.id;
    }
    const row = await prisma.postNote.create({
      data: {
        postId,
        authorId: principal.userId,
        parentId,
        content,
      },
      include: NOTE_INCLUDE,
    });
    return toNote(row);
  }

  async function setResolved(
    principal: Principal,
    postId: string,
    noteId: string,
    resolved: boolean,
  ): Promise<PostNote> {
    await loadEditablePost(principal, postId);
    const note = await prisma.postNote.findFirst({
      where: { id: noteId, postId },
      select: { id: true, parentId: true },
    });
    if (!note) {
      throw new ContentError('NOT_FOUND', 'Not found', 404);
    }
    if (note.parentId !== null) {
      throw new ContentError('VALIDATION_ERROR', 'Only a note thread can be resolved.', 400);
    }
    const row = await prisma.postNote.update({
      where: { id: note.id },
      data: resolved
        ? { resolvedAt: new Date(), resolvedById: principal.userId }
        : { resolvedAt: null, resolvedById: null },
      include: NOTE_INCLUDE,
    });
    return toNote(row);
  }

  return { list, create, setResolved };
}

export type NoteService = ReturnType<typeof createNoteService>;

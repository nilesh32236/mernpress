import type { DatabaseClient } from '@mernpress/database';
import { ContentError } from '../content/errors.js';
import type { Principal } from '../content/types.js';
import { canEditPost } from '../content/service.js';
import { roleHasCapability } from '../auth/capabilities.js';
import { extractMentions } from './mentions.js';
import type { MailService } from '../mail/service.js';
import type {
  CreatePostNoteInput,
  NoteAuthor,
  NoteBlockAnchor,
  NoteMentionCandidate,
  PostNote,
} from './types.js';

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
  deletedBy: AUTHOR_SELECT,
} as const;

type NoteRow = {
  id: string;
  postId: string;
  parentId: string | null;
  content: string;
  blockName: string | null;
  blockPath: string | null;
  blockHash: string | null;
  blockText: string | null;
  blockAnchorId: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  deletedAt: Date | null;
  author: { id: string; username: string; displayName: string | null } | null;
  resolvedBy: { id: string; username: string; displayName: string | null } | null;
  deletedBy: { id: string; username: string; displayName: string | null } | null;
};

function toAuthor(
  row: { id: string; username: string; displayName: string | null } | null,
): NoteAuthor | null {
  return row ? { id: row.id, username: row.username, displayName: row.displayName } : null;
}

const BLOCK_NAME = /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/;
const BLOCK_PATH = /^\d+(?:\.\d+){0,9}$/;
const BLOCK_HASH = /^[0-9a-f]{16}$/;
const BLOCK_ANCHOR_ID = /^[0-9a-f]{16}$/;

function normalizeBlockAnchor(value: unknown): NoteBlockAnchor {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ContentError('VALIDATION_ERROR', 'Invalid block anchor.', 400);
  }
  const block = value as Record<string, unknown>;
  const name = typeof block['name'] === 'string' ? block['name'] : '';
  const path = typeof block['path'] === 'string' ? block['path'] : '';
  const hash = typeof block['hash'] === 'string' ? block['hash'] : '';
  const text = typeof block['text'] === 'string' ? block['text'] : '';
  const anchorIdRaw = block['anchorId'];
  const anchorId =
    anchorIdRaw === undefined || anchorIdRaw === null
      ? null
      : typeof anchorIdRaw === 'string'
        ? anchorIdRaw
        : '';
  if (!BLOCK_NAME.test(name) || name.length > 100) {
    throw new ContentError('VALIDATION_ERROR', 'Invalid block name.', 400);
  }
  if (!BLOCK_PATH.test(path) || path.length > 100) {
    throw new ContentError('VALIDATION_ERROR', 'Invalid block path.', 400);
  }
  if (!BLOCK_HASH.test(hash)) {
    throw new ContentError('VALIDATION_ERROR', 'Invalid block hash.', 400);
  }
  if (text.length > 200) {
    throw new ContentError('VALIDATION_ERROR', 'Invalid block text.', 400);
  }
  if (anchorId !== null && !BLOCK_ANCHOR_ID.test(anchorId)) {
    throw new ContentError('VALIDATION_ERROR', 'Invalid block anchor id.', 400);
  }
  return { name, path, hash, text, anchorId };
}

function toNote(row: NoteRow): PostNote {
  return {
    id: row.id,
    postId: row.postId,
    parentId: row.parentId,
    content: row.content,
    block:
      row.blockName !== null && row.blockPath !== null && row.blockHash !== null
        ? {
            name: row.blockName,
            path: row.blockPath,
            hash: row.blockHash,
            text: row.blockText ?? '',
            anchorId: row.blockAnchorId,
          }
        : null,
    author: toAuthor(row.author),
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolvedBy: toAuthor(row.resolvedBy),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    deletedBy: toAuthor(row.deletedBy),
  };
}

function requireNoteAuthorOrEditor(
  principal: Principal,
  authorId: string | null,
  action: 'trash' | 'restore' | 'delete permanently',
): void {
  if (authorId !== principal.userId && !roleHasCapability(principal.role, 'content.edit.any')) {
    throw new ContentError(
      'FORBIDDEN',
      `Only the note author or an editor can ${action} this note.`,
      403,
    );
  }
}

export interface NoteServiceOptions {
  prisma: DatabaseClient;
  /** Optional outbound mail for note/reply/deletion notifications. */
  mail?: MailService | undefined;
}

export function createNoteService({ prisma, mail }: NoteServiceOptions) {
  async function loadEditablePost(principal: Principal, postId: string) {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        title: true,
        slug: true,
        authorId: true,
        status: true,
        notesNotify: true,
        author: { select: { email: true, username: true, displayName: true } },
      },
    });
    if (!post) {
      throw new ContentError('NOT_FOUND', 'Not found', 404);
    }
    canEditPost(principal, post.authorId, post.status);
    return post;
  }

  async function list(
    principal: Principal,
    postId: string,
    options: { trashed?: boolean } = {},
  ): Promise<PostNote[]> {
    await loadEditablePost(principal, postId);
    const rows = await prisma.postNote.findMany({
      where: {
        postId,
        ...(options.trashed ? { deletedAt: { not: null } } : { deletedAt: null }),
      },
      include: NOTE_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toNote);
  }

  /** Active and trashed notes in one round trip (the editor needs both counts). */
  async function lists(
    principal: Principal,
    postId: string,
  ): Promise<{ notes: PostNote[]; trash: PostNote[] }> {
    const [notes, trash] = await Promise.all([
      list(principal, postId),
      list(principal, postId, { trashed: true }),
    ]);
    return { notes, trash };
  }

  async function create(
    principal: Principal,
    postId: string,
    input: CreatePostNoteInput,
  ): Promise<PostNote> {
    const post = await loadEditablePost(principal, postId);
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
    if (input.parentId && input.block) {
      throw new ContentError(
        'VALIDATION_ERROR',
        'Replies inherit their thread; they cannot be anchored separately.',
        400,
      );
    }
    const block =
      input.block === undefined || input.block === null ? null : normalizeBlockAnchor(input.block);
    let parentId: string | null = null;
    if (input.parentId) {
      const parent = await prisma.postNote.findFirst({
        where: { id: input.parentId, postId },
        select: { id: true, parentId: true, resolvedAt: true, deletedAt: true },
      });
      if (!parent || parent.deletedAt !== null) {
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
        blockName: block?.name ?? null,
        blockPath: block?.path ?? null,
        blockHash: block?.hash ?? null,
        blockText: block?.text ?? null,
        blockAnchorId: block?.anchorId ?? null,
      },
      include: NOTE_INCLUDE,
    });

    // Notify the post author about someone else's note or reply. A missing
    // author address falls back to the administration address; mail failures
    // never lose the note.
    if (mail?.status().configured && principal.userId !== post.authorId) {
      try {
        const actorName = row.author?.displayName?.trim() || row.author?.username || 'An editor';
        await mail.notifyNote({
          postTitle: post.title,
          postSlug: post.slug,
          enabled: post.notesNotify ?? undefined,
          actorName,
          content,
          kind: parentId ? 'reply' : 'created',
          recipientEmail: post.author?.email ?? null,
        });
      } catch {
        // Delivery is best effort.
      }
    }
    // Mention notifications: only people who can edit this post are eligible.
    // The post author already receives the note/reply mail above, and nobody
    // needs a mail about their own mention.
    if (mail?.status().configured) {
      const actorUsername = (row.author?.username ?? '').toLowerCase();
      const names = extractMentions(content).filter((name) => name !== actorUsername);
      if (names.length > 0) {
        const mentioned = await prisma.user.findMany({
          where: { username: { in: names }, status: 'active' },
          select: {
            id: true,
            username: true,
            displayName: true,
            email: true,
            role: true,
          },
        });
        for (const user of mentioned) {
          if (user.id === principal.userId || user.id === post.authorId) continue;
          if (!user.email) continue;
          try {
            canEditPost({ userId: user.id, role: user.role }, post.authorId, post.status);
          } catch {
            // The mentioned account cannot access this post; do not notify it.
            continue;
          }
          try {
            await mail.notifyNoteMention({
              postTitle: post.title,
              postSlug: post.slug,
              enabled: post.notesNotify ?? undefined,
              actorName: row.author?.displayName?.trim() || row.author?.username || 'An editor',
              mentionedName: user.displayName?.trim() || user.username,
              content,
              recipientEmail: user.email,
            });
          } catch {
            // Delivery is best effort.
          }
        }
      }
    }

    return toNote(row);
  }

  /**
   * Users the @mention picker may suggest: active accounts (other than the
   * caller) that can edit this post under the current role/ownership policy.
   */
  async function mentionCandidates(
    principal: Principal,
    postId: string,
    search = '',
  ): Promise<NoteMentionCandidate[]> {
    const post = await loadEditablePost(principal, postId);
    const term = search.trim().toLowerCase().slice(0, 100);
    const rows = await prisma.user.findMany({
      where: {
        status: 'active',
        id: { not: principal.userId },
        ...(term.length > 0
          ? {
              OR: [
                { username: { contains: term, mode: 'insensitive' as const } },
                { displayName: { contains: term, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      select: { id: true, username: true, displayName: true, role: true },
      orderBy: { username: 'asc' },
      take: 50,
    });
    const candidates: NoteMentionCandidate[] = [];
    for (const user of rows) {
      try {
        canEditPost({ userId: user.id, role: user.role }, post.authorId, post.status);
      } catch {
        continue;
      }
      candidates.push({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
      });
      if (candidates.length >= 8) break;
    }
    return candidates;
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
      select: { id: true, parentId: true, deletedAt: true },
    });
    if (!note) {
      throw new ContentError('NOT_FOUND', 'Not found', 404);
    }
    if (note.deletedAt !== null) {
      throw new ContentError('VALIDATION_ERROR', 'Restore this note before resolving it.', 400);
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

  /**
   * Delete a note or a whole thread. The note author may delete their own
   * note; users with `content.edit.any` may delete any note on a post they can
   * edit. Deleting a root cascades its replies (PostNote.parent onDelete).
   */
  /**
   * Soft-delete a note (move to Trash). The note author may trash their own
   * note; users with `content.edit.any` may trash any note on a post they can
   * edit. Trashing a root also trashes its replies so the thread moves as one.
   */
  async function trash(principal: Principal, postId: string, noteId: string): Promise<void> {
    const post = await loadEditablePost(principal, postId);
    const note = await prisma.postNote.findFirst({
      where: { id: noteId, postId },
      select: {
        id: true,
        parentId: true,
        authorId: true,
        content: true,
        blockName: true,
        deletedAt: true,
        author: { select: { email: true, username: true, displayName: true } },
      },
    });
    if (!note) {
      throw new ContentError('NOT_FOUND', 'Not found', 404);
    }
    requireNoteAuthorOrEditor(principal, note.authorId, 'trash');
    if (note.deletedAt !== null) {
      // Already in Trash: idempotent, nothing to duplicate or notify.
      return;
    }
    const replies =
      note.parentId === null
        ? await prisma.postNote.count({
            where: { parentId: note.id, deletedAt: null },
          })
        : 0;
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.postNote.update({
        where: { id: note.id },
        data: { deletedAt: now, deletedById: principal.userId },
      });
      if (note.parentId === null && replies > 0) {
        await tx.postNote.updateMany({
          where: { parentId: note.id, deletedAt: null },
          data: { deletedAt: now, deletedById: principal.userId },
        });
      }
      await tx.auditEvent.create({
        data: {
          eventType: 'content.note.trashed',
          actorUserId: principal.userId,
          metadata: {
            postId,
            noteId: note.id,
            parentId: note.parentId,
            anchored: note.blockName !== null,
            replies,
          },
        },
      });
    });

    if (mail?.status().configured && note.authorId !== null && note.authorId !== principal.userId) {
      try {
        const actor = await prisma.user.findUnique({
          where: { id: principal.userId },
          select: { username: true, displayName: true },
        });
        await mail.notifyNote({
          postTitle: post.title,
          postSlug: post.slug,
          enabled: post.notesNotify ?? undefined,
          actorName: actor?.displayName?.trim() || actor?.username || 'An editor',
          content: note.content,
          kind: 'deleted',
          recipientEmail: note.author?.email ?? null,
        });
      } catch {
        // Delivery is best effort.
      }
    }
  }

  /** Restore a trashed note; restoring a thread restores its trashed replies. */
  async function restore(principal: Principal, postId: string, noteId: string): Promise<PostNote> {
    await loadEditablePost(principal, postId);
    const note = await prisma.postNote.findFirst({
      where: { id: noteId, postId },
      select: { id: true, parentId: true, authorId: true, deletedAt: true },
    });
    if (!note) {
      throw new ContentError('NOT_FOUND', 'Not found', 404);
    }
    requireNoteAuthorOrEditor(principal, note.authorId, 'restore');
    if (note.deletedAt === null) {
      throw new ContentError('VALIDATION_ERROR', 'This note is not in the trash.', 400);
    }
    const replies =
      note.parentId === null
        ? await prisma.postNote.count({
            where: { parentId: note.id, deletedAt: { not: null } },
          })
        : 0;
    const row = await prisma.$transaction(async (tx) => {
      if (note.parentId === null && replies > 0) {
        await tx.postNote.updateMany({
          where: { parentId: note.id, deletedAt: { not: null } },
          data: { deletedAt: null, deletedById: null },
        });
      }
      const restored = await tx.postNote.update({
        where: { id: note.id },
        data: { deletedAt: null, deletedById: null },
        include: NOTE_INCLUDE,
      });
      await tx.auditEvent.create({
        data: {
          eventType: 'content.note.restored',
          actorUserId: principal.userId,
          metadata: { postId, noteId: note.id, parentId: note.parentId, replies },
        },
      });
      return restored;
    });
    return toNote(row);
  }

  /**
   * Permanently delete a trashed note. Only notes already in Trash can be
   * purged, so an accidental click in the thread list can never destroy a note.
   */
  async function purge(principal: Principal, postId: string, noteId: string): Promise<void> {
    await loadEditablePost(principal, postId);
    const note = await prisma.postNote.findFirst({
      where: { id: noteId, postId },
      select: {
        id: true,
        parentId: true,
        authorId: true,
        blockName: true,
        deletedAt: true,
      },
    });
    if (!note) {
      throw new ContentError('NOT_FOUND', 'Not found', 404);
    }
    requireNoteAuthorOrEditor(principal, note.authorId, 'delete permanently');
    if (note.deletedAt === null) {
      throw new ContentError(
        'VALIDATION_ERROR',
        'Move this note to the trash before deleting it permanently.',
        400,
      );
    }
    const replies =
      note.parentId === null ? await prisma.postNote.count({ where: { parentId: note.id } }) : 0;
    await prisma.$transaction(async (tx) => {
      await tx.postNote.delete({ where: { id: note.id } });
      await tx.auditEvent.create({
        data: {
          eventType: 'content.note.deleted',
          actorUserId: principal.userId,
          metadata: {
            postId,
            noteId: note.id,
            parentId: note.parentId,
            anchored: note.blockName !== null,
            replies,
            permanent: true,
          },
        },
      });
    });
  }

  /**
   * Automatic retention sweep: permanently remove notes that have been in the
   * trash longer than the configured window. Roots are purged first (replies
   * cascade), then standalone replies whose parent is still active. `0` (or a
   * negative value) disables the sweep. Each purged note gets an audit event
   * marked `automatic: true`.
   */
  async function purgeExpiredTrash(input: {
    retentionDays: number;
    now?: Date;
  }): Promise<{ purged: number }> {
    const days = Math.trunc(input.retentionDays);
    if (!Number.isFinite(days) || days <= 0) {
      return { purged: 0 };
    }
    const cutoff = new Date((input.now ?? new Date()).getTime() - days * 24 * 60 * 60 * 1000);
    let purged = 0;

    const roots = await prisma.postNote.findMany({
      where: { parentId: null, deletedAt: { not: null, lt: cutoff } },
      select: { id: true, postId: true, blockName: true },
    });
    for (const root of roots) {
      const replies = await prisma.postNote.count({ where: { parentId: root.id } });
      try {
        await prisma.$transaction(async (tx) => {
          await tx.postNote.delete({ where: { id: root.id } });
          await tx.auditEvent.create({
            data: {
              eventType: 'content.note.deleted',
              metadata: {
                postId: root.postId,
                noteId: root.id,
                parentId: null,
                anchored: root.blockName !== null,
                replies,
                permanent: true,
                automatic: true,
              },
            },
          });
        });
        purged += 1;
      } catch {
        // A concurrent purge already removed it; the sweep is idempotent.
      }
    }

    const orphans = await prisma.postNote.findMany({
      where: {
        parentId: { not: null },
        deletedAt: { not: null, lt: cutoff },
        parent: { deletedAt: null },
      },
      select: { id: true, postId: true, parentId: true, blockName: true },
    });
    for (const reply of orphans) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.postNote.delete({ where: { id: reply.id } });
          await tx.auditEvent.create({
            data: {
              eventType: 'content.note.deleted',
              metadata: {
                postId: reply.postId,
                noteId: reply.id,
                parentId: reply.parentId,
                anchored: reply.blockName !== null,
                replies: 0,
                permanent: true,
                automatic: true,
              },
            },
          });
        });
        purged += 1;
      } catch {
        // Already gone.
      }
    }

    return { purged };
  }

  return {
    list,
    lists,
    create,
    setResolved,
    trash,
    restore,
    purge,
    purgeExpiredTrash,
    mentionCandidates,
  };
}

export type NoteService = ReturnType<typeof createNoteService>;

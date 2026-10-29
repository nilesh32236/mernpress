import type { DatabaseClient } from '@mernpress/database';
import { ownsObject, roleHasCapability } from '../auth/capabilities.js';
import { ContentError } from './errors.js';
import type { Principal } from './types.js';

/**
 * Autosave (P8-02).
 *
 * One autosave row per post, stored as `post_revisions` with `kind =
 * 'autosave'`. The posts row is never touched, so an autosave can never
 * overwrite a newer edit — it is a side channel whose only conflict rule is
 * "restore is an explicit user action that goes through the normal update
 * path (version-checked, snapshotted)".
 */

export interface AutosaveSnapshot {
  title: string;
  excerpt: string | null;
  content: string;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  robots: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
}

export interface AutosaveState extends AutosaveSnapshot {
  id: string;
  postId: string;
  authorId: string | null;
  createdAt: string;
}

export interface AutosaveServiceOptions {
  prisma: DatabaseClient;
}

function assertCanEdit(principal: Principal, authorId: string | null, status: string): void {
  // Mirrors canEditPost in service.ts (kept private there).
  if (roleHasCapability(principal.role, 'content.edit.any')) {
    return;
  }
  if (principal.role === 'contributor') {
    if (ownsObject(principal, authorId) && status === 'DRAFT') {
      return;
    }
    throw new ContentError('FORBIDDEN', 'Forbidden', 403);
  }
  if (roleHasCapability(principal.role, 'content.edit.own') && ownsObject(principal, authorId)) {
    return;
  }
  throw new ContentError('FORBIDDEN', 'Forbidden', 403);
}

const SNAPSHOT_LIMITS = {
  title: 300,
  seoTitle: 300,
  seoDescription: 500,
  canonicalUrl: 2048,
  robots: 100,
  ogTitle: 300,
  ogDescription: 500,
} as const;

function validateSnapshot(snapshot: AutosaveSnapshot): void {
  if (snapshot.title.length > SNAPSHOT_LIMITS.title) {
    throw new ContentError('VALIDATION_ERROR', 'Title is too long', 400);
  }
  if (snapshot.content.length > 2_000_000) {
    throw new ContentError('VALIDATION_ERROR', 'Content is too large', 400);
  }
}

function toState(row: {
  id: string;
  postId: string;
  title: string;
  excerpt: string | null;
  content: string;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  robots: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  authorId: string | null;
  createdAt: Date;
}): AutosaveState {
  return {
    id: row.id,
    postId: row.postId,
    title: row.title,
    excerpt: row.excerpt,
    content: row.content,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    canonicalUrl: row.canonicalUrl,
    robots: row.robots,
    ogTitle: row.ogTitle,
    ogDescription: row.ogDescription,
    authorId: row.authorId,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createAutosaveService(options: AutosaveServiceOptions) {
  const { prisma } = options;

  async function loadEditablePost(principal: Principal, postId: string) {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true, status: true, updatedAt: true },
    });
    if (!post) {
      throw new ContentError('NOT_FOUND', 'Not found', 404);
    }
    assertCanEdit(principal, post.authorId, post.status);
    return post;
  }

  /** Replace the post's autosave row (one per post) with the new snapshot. */
  async function saveAutosave(
    principal: Principal,
    postId: string,
    snapshot: AutosaveSnapshot,
  ): Promise<AutosaveState> {
    validateSnapshot(snapshot);
    await loadEditablePost(principal, postId);
    const row = await prisma.$transaction(async (tx) => {
      await tx.postRevision.deleteMany({ where: { postId, kind: 'autosave' } });
      return tx.postRevision.create({
        data: {
          postId,
          kind: 'autosave',
          title: snapshot.title,
          excerpt: snapshot.excerpt,
          content: snapshot.content,
          seoTitle: snapshot.seoTitle,
          seoDescription: snapshot.seoDescription,
          canonicalUrl: snapshot.canonicalUrl,
          robots: snapshot.robots,
          ogTitle: snapshot.ogTitle,
          ogDescription: snapshot.ogDescription,
          authorId: principal.userId,
        },
      });
    });
    return toState(row);
  }

  /** The current autosave for a post, or null. Includes the post's updatedAt
   *  so clients can show a recovery prompt only when the autosave is newer. */
  async function getAutosave(
    principal: Principal,
    postId: string,
  ): Promise<{ autosave: AutosaveState | null; postUpdatedAt: string }> {
    const post = await loadEditablePost(principal, postId);
    const row = await prisma.postRevision.findFirst({
      where: { postId, kind: 'autosave' },
      orderBy: { createdAt: 'desc' },
    });
    return {
      autosave: row ? toState(row) : null,
      postUpdatedAt: post.updatedAt.toISOString(),
    };
  }

  /** Drop the autosave (after a successful save, or when the user discards it). */
  async function discardAutosave(principal: Principal, postId: string): Promise<void> {
    await loadEditablePost(principal, postId);
    await prisma.postRevision.deleteMany({ where: { postId, kind: 'autosave' } });
  }

  return { saveAutosave, getAutosave, discardAutosave };
}

export type AutosaveService = ReturnType<typeof createAutosaveService>;

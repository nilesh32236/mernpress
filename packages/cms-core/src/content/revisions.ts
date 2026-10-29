import type { DatabaseClient, Prisma } from '@mernpress/database';
import type { AdminRevision, AdminRevisionDetail } from './types.js';

/**
 * Post revisions (P8-01).
 *
 * Every content save that changes a snapshotted field writes an immutable
 * `PostRevision` of the PRE-update state inside the same transaction as the
 * update. The newest `MAX_REVISIONS_PER_POST` rows per post are retained;
 * `posts.revisionCount` is cumulative and survives pruning. Restores are
 * ordinary updates, so a restore snapshots the pre-restore state too and can
 * itself be undone (see `ContentService.restoreRevision`).
 */
export const MAX_REVISIONS_PER_POST = 50;

type Tx = Prisma.TransactionClient;

/** Fields captured in a revision snapshot (pre-update values). */
export interface RevisionSnapshotSource {
  id: string;
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
}

/** Fields whose change triggers a snapshot (status/slug/terms do not). */
export interface RevisionComparableFields {
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

/**
 * Whether an update actually changes a snapshotted field. Terms-only, status
 * and slug-only edits must not create revisions.
 */
export function revisionFieldsChanged(
  next: RevisionComparableFields,
  previous: RevisionComparableFields,
): boolean {
  return (
    next.title !== previous.title ||
    next.excerpt !== previous.excerpt ||
    next.content !== previous.content ||
    next.seoTitle !== previous.seoTitle ||
    next.seoDescription !== previous.seoDescription ||
    next.canonicalUrl !== previous.canonicalUrl ||
    next.robots !== previous.robots ||
    next.ogTitle !== previous.ogTitle ||
    next.ogDescription !== previous.ogDescription
  );
}

const REVISION_ORDER_ASC = [{ createdAt: 'asc' as const }, { id: 'asc' as const }];

const REVISION_ORDER_DESC = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];

/**
 * Write one pre-update snapshot and prune the post's retained rows. Runs on
 * the caller's transaction so the snapshot and the update commit atomically.
 * `posts.revisionCount` is incremented by the caller's update statement.
 */
export async function captureRevision(tx: Tx, post: RevisionSnapshotSource): Promise<void> {
  await tx.postRevision.create({
    data: {
      postId: post.id,
      title: post.title,
      excerpt: post.excerpt,
      content: post.content,
      seoTitle: post.seoTitle,
      seoDescription: post.seoDescription,
      canonicalUrl: post.canonicalUrl,
      robots: post.robots,
      ogTitle: post.ogTitle,
      ogDescription: post.ogDescription,
      authorId: post.authorId,
    },
  });
  await pruneRevisions(tx, post.id);
}

/** Delete all but the newest `MAX_REVISIONS_PER_POST` revisions for a post. */
export async function pruneRevisions(tx: Tx, postId: string): Promise<void> {
  const keep = await tx.postRevision.findMany({
    where: { postId, kind: 'revision' },
    orderBy: REVISION_ORDER_DESC,
    take: MAX_REVISIONS_PER_POST,
    select: { id: true },
  });
  if (keep.length < MAX_REVISIONS_PER_POST) {
    return;
  }
  await tx.postRevision.deleteMany({
    where: { postId, kind: 'revision', id: { notIn: keep.map((row) => row.id) } },
  });
}

type RevisionRow = {
  id: string;
  postId: string;
  title: string;
  excerpt: string | null;
  authorId: string | null;
  createdAt: Date;
};

export function toAdminRevision(row: RevisionRow, revisionNumber: number): AdminRevision {
  return {
    id: row.id,
    postId: row.postId,
    title: row.title,
    excerpt: row.excerpt,
    authorId: row.authorId,
    createdAt: row.createdAt.toISOString(),
    revisionNumber,
  };
}

type RevisionDetailRow = RevisionRow & {
  content: string;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  robots: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
};

export function toAdminRevisionDetail(
  row: RevisionDetailRow,
  revisionNumber: number,
): AdminRevisionDetail {
  return {
    ...toAdminRevision(row, revisionNumber),
    content: row.content,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    canonicalUrl: row.canonicalUrl,
    robots: row.robots,
    ogTitle: row.ogTitle,
    ogDescription: row.ogDescription,
  };
}

/**
 * List revisions newest-first. `revisionNumber` is the 1-based oldest-first
 * ordinal among the surviving rows, so a number does not change when newer
 * revisions are added (it only shifts on pruning, which is inherent to the
 * bounded retention window).
 */
export async function listPostRevisions(
  prisma: DatabaseClient,
  postId: string,
): Promise<AdminRevision[]> {
  const rows = await prisma.postRevision.findMany({
    where: { postId, kind: 'revision' },
    orderBy: REVISION_ORDER_ASC,
    select: {
      id: true,
      postId: true,
      title: true,
      excerpt: true,
      authorId: true,
      createdAt: true,
    },
  });
  return rows.map((row, index) => toAdminRevision(row, index + 1)).reverse();
}

/** Full snapshot by (postId, revisionId). Callers authorize the post first. */
export async function findPostRevision(
  prisma: DatabaseClient,
  postId: string,
  revisionId: string,
): Promise<AdminRevisionDetail | null> {
  const row = await prisma.postRevision.findFirst({
    where: { id: revisionId, postId, kind: 'revision' },
  });
  if (!row) {
    return null;
  }
  const ordered = await prisma.postRevision.findMany({
    where: { postId, kind: 'revision' },
    orderBy: REVISION_ORDER_ASC,
    select: { id: true },
  });
  const index = ordered.findIndex((entry) => entry.id === revisionId);
  return toAdminRevisionDetail(row, index + 1);
}

import { Prisma, type DatabaseClient } from '@mernpress/database';
import { ownsObject, roleHasCapability } from '../auth/capabilities.js';
import { ContentError } from './errors.js';
import type { HookRegistry } from '../hooks/types.js';
import type { Principal } from './types.js';

/**
 * First-publish scheduling (P8-04, ADR 0008 §4).
 *
 * A DRAFT with `scheduledAt` in the past is promoted to PUBLISHED by the
 * sweeper. Scheduling an update to already-published content is intentionally
 * out of scope (the reference CMS's payload-envelope design can be adopted
 * later if staged updates become a requirement).
 */

/** Minimum lead time: a schedule must be at least 60 s in the future. */
export const MIN_SCHEDULE_LEAD_MS = 60_000;
/** Maximum lead time: one year, matching the reference guard. */
export const MAX_SCHEDULE_LEAD_MS = 366 * 24 * 60 * 60_000;
/** Rows claimed per sweeper pass. */
export const SWEEP_BATCH_SIZE = 20;

export interface ScheduleState {
  scheduledAt: string | null;
}

export interface ScheduleServiceOptions {
  prisma: DatabaseClient;
  hooks: HookRegistry;
  now?: () => Date;
}

type Tx = Prisma.TransactionClient;

/**
 * Mirrors `canEditPost` in service.ts exactly (kept private there; unify if
 * the content service ever exports it). Scheduling is an edit operation.
 */
function assertCanEdit(principal: Principal, authorId: string | null, status: string): void {
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

function assertCanPublish(principal: Principal, authorId: string | null): void {
  if (roleHasCapability(principal.role, 'content.publish.any')) {
    return;
  }
  if (roleHasCapability(principal.role, 'content.publish.own') && ownsObject(principal, authorId)) {
    return;
  }
  throw new ContentError('FORBIDDEN', 'Forbidden', 403);
}

async function loadPost(
  tx: Tx | DatabaseClient,
  id: string,
): Promise<{
  id: string;
  status: string;
  authorId: string | null;
  version: number;
  scheduledAt: Date | null;
}> {
  const row = await tx.post.findUnique({
    where: { id },
    select: { id: true, status: true, authorId: true, version: true, scheduledAt: true },
  });
  if (!row) {
    throw new ContentError('NOT_FOUND', 'Not found', 404);
  }
  return row;
}

export function createScheduleService(options: ScheduleServiceOptions) {
  const { prisma, hooks } = options;
  const now = options.now ?? (() => new Date());

  async function schedule(
    principal: Principal,
    id: string,
    when: Date,
    baseVersion: number,
  ): Promise<ScheduleState> {
    const lead = when.getTime() - now().getTime();
    if (Number.isNaN(when.getTime()) || lead < MIN_SCHEDULE_LEAD_MS) {
      throw new ContentError(
        'SCHEDULE_TOO_SOON',
        'Scheduled time must be at least 60 seconds in the future',
        400,
      );
    }
    if (lead > MAX_SCHEDULE_LEAD_MS) {
      throw new ContentError('SCHEDULE_TOO_FAR', 'Scheduled time must be within one year', 400);
    }

    const state = await prisma.$transaction(async (tx) => {
      const post = await loadPost(tx, id);
      assertCanEdit(principal, post.authorId, post.status);
      assertCanPublish(principal, post.authorId);
      if (post.status !== 'DRAFT') {
        throw new ContentError(
          'SCHEDULE_INVALID_STATUS',
          'Only drafts can be scheduled for first publication',
          409,
        );
      }
      const updated = await tx.post.updateMany({
        where: { id, version: baseVersion },
        data: { scheduledAt: when, version: { increment: 1 } },
      });
      if (updated.count === 0) {
        throw new ContentError('VERSION_CONFLICT', 'Version conflict', 409);
      }
      return { scheduledAt: when.toISOString() };
    });

    await hooks.doAction('content.post.scheduled', { postId: id, scheduledAt: state.scheduledAt });
    return state;
  }

  async function unschedule(
    principal: Principal,
    id: string,
    baseVersion: number,
  ): Promise<ScheduleState> {
    const state = await prisma.$transaction(async (tx) => {
      const post = await loadPost(tx, id);
      assertCanEdit(principal, post.authorId, post.status);
      const updated = await tx.post.updateMany({
        where: { id, version: baseVersion },
        data: { scheduledAt: null, version: { increment: 1 } },
      });
      if (updated.count === 0) {
        throw new ContentError('VERSION_CONFLICT', 'Version conflict', 409);
      }
      return { scheduledAt: null };
    });

    await hooks.doAction('content.post.unscheduled', { postId: id });
    return state;
  }

  async function getSchedule(principal: Principal, id: string): Promise<ScheduleState> {
    const post = await loadPost(prisma, id);
    assertCanEdit(principal, post.authorId, post.status);
    return { scheduledAt: post.scheduledAt?.toISOString() ?? null };
  }

  /**
   * Claim due rows and promote them. The claim (`scheduled_at = NULL`) and
   * the promotion run as one atomic UPDATE … RETURNING per row batch:
   * concurrent sweepers claim disjoint rows because a row whose
   * `scheduled_at` is already NULL no longer matches. A second sweeper that
   * raced the same claim would publish nothing (its UPDATE matches zero
   * rows), so no FOR UPDATE SKIP LOCKED is needed at one instance; a future
   * multi-instance deployment should still add it (ADR 0008 §4).
   *
   * Promotion mirrors the service publish transition: DRAFT → PUBLISHED,
   * `publishedAt` set on first publish, version bump, lifecycle hook. The
   * hook fires per row so downstream consumers see the same
   * `content.post.published` action as a manual publish.
   */
  async function publishDueScheduled(at: Date = now()): Promise<{ published: string[] }> {
    const claimed = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE "posts"
      SET "scheduled_at" = NULL
      WHERE "id" IN (
        SELECT "id" FROM "posts"
        WHERE "status" = 'DRAFT'
          AND "scheduled_at" IS NOT NULL
          AND "scheduled_at" <= ${at}
        ORDER BY "scheduled_at"
        LIMIT ${SWEEP_BATCH_SIZE}
      )
      RETURNING "id"
    `);

    const published: string[] = [];
    for (const { id } of claimed) {
      const result = await prisma.post.updateMany({
        where: { id, status: 'DRAFT', publishedAt: null },
        data: {
          status: 'PUBLISHED',
          publishedAt: at,
          version: { increment: 1 },
        },
      });
      if (result.count === 0) {
        continue;
      }
      const row = await prisma.post.findUnique({
        where: { id },
        select: { id: true, type: true, status: true, authorId: true, slug: true },
      });
      if (!row) {
        continue;
      }
      published.push(id);
      await hooks.doAction('content.post.published', {
        postId: row.id,
        type: row.type as 'post' | 'page',
        status: row.status,
        authorId: row.authorId,
        slug: row.slug,
        fromStatus: 'DRAFT',
      });
    }
    return { published };
  }

  return { schedule, unschedule, getSchedule, publishDueScheduled };
}

export type ScheduleService = ReturnType<typeof createScheduleService>;

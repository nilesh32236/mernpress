import type { DatabaseClient } from '@mernpress/database';
import { ownsObject, roleHasCapability } from '../auth/capabilities.js';
import { ContentError } from './errors.js';
import type { Principal } from './types.js';
import type { ContentService } from './service.js';

/**
 * Bulk content operations (P4-02 follow-up; fills the gap the audit found in
 * the content-list UI). Every item is processed through the SAME
 * per-object service transitions as single-row actions, so capability and
 * version rules cannot diverge. Items are independent: a failure on one row
 * is reported, never silently skipped and never rolls back the others.
 */

export type BulkAction = 'publish' | 'unpublish' | 'trash' | 'restore' | 'delete';

export interface BulkItemInput {
  id: string;
  baseVersion: number;
}

export interface BulkItemResult {
  id: string;
  ok: boolean;
  error?: { code: string; message: string };
}

export interface BulkResult {
  action: BulkAction;
  succeeded: string[];
  failed: BulkItemResult[];
}

export const BULK_MAX_IDS = 100;

export function createBulkService(options: { prisma: DatabaseClient; content: ContentService }) {
  const { prisma, content } = options;

  /**
   * Permanent delete of a TRASHED post. Hard delete; FK cascades remove
   * terms, revisions and slug history. Capability matches trash semantics.
   */
  async function deletePermanently(
    principal: Principal,
    id: string,
    baseVersion: number,
  ): Promise<void> {
    const row = await prisma.post.findUnique({
      where: { id },
      select: { id: true, status: true, authorId: true, version: true },
    });
    if (!row) {
      throw new ContentError('NOT_FOUND', 'Not found', 404);
    }
    if (row.status !== 'TRASHED') {
      throw new ContentError(
        'INVALID_TRANSITION',
        'Only trashed content can be deleted permanently',
        409,
      );
    }
    // Trash capability mirrors the single-row transitions (any vs own).
    const allowed =
      roleHasCapability(principal.role, 'content.trash.any') ||
      (roleHasCapability(principal.role, 'content.trash.own') &&
        ownsObject(principal, row.authorId));
    if (!allowed) {
      throw new ContentError('FORBIDDEN', 'Forbidden', 403);
    }
    if (row.version !== baseVersion) {
      throw new ContentError('VERSION_CONFLICT', 'Version conflict', 409);
    }
    await prisma.post.delete({ where: { id } });
  }

  async function applyBulk(
    principal: Principal,
    action: BulkAction,
    items: BulkItemInput[],
  ): Promise<BulkResult> {
    const succeeded: string[] = [];
    const failed: BulkItemResult[] = [];

    for (const item of items.slice(0, BULK_MAX_IDS)) {
      try {
        switch (action) {
          case 'publish':
            await content.publish(principal, item.id, item.baseVersion);
            break;
          case 'unpublish':
            await content.unpublish(principal, item.id, item.baseVersion);
            break;
          case 'trash':
            await content.trash(principal, item.id, item.baseVersion);
            break;
          case 'restore':
            await content.restore(principal, item.id, item.baseVersion);
            break;
          case 'delete':
            await deletePermanently(principal, item.id, item.baseVersion);
            break;
        }
        succeeded.push(item.id);
      } catch (error) {
        failed.push({
          id: item.id,
          ok: false,
          error: {
            code:
              typeof (error as { code?: unknown })?.code === 'string'
                ? (error as { code: string }).code
                : 'INTERNAL_ERROR',
            message:
              typeof (error as { message?: unknown })?.message === 'string'
                ? (error as { message: string }).message
                : 'Request rejected',
          },
        });
      }
    }

    return { action, succeeded, failed };
  }

  return { applyBulk };
}

export type BulkService = ReturnType<typeof createBulkService>;

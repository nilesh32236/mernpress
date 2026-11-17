import type { DatabaseClient, Prisma } from '@mernpress/database';
import type { Paged, Principal } from '../content/types.js';
import { requireCapability } from './capabilities.js';

/**
 * Every event type currently written to `audit_events`.
 *
 * `auth.*` rows are produced by `createAuthAudit` (`auth/audit.ts`), `user.*`
 * rows by `createUserAdminService` (`auth/users.ts`). The list is exported so
 * the admin UI can offer a complete, honest filter; hooking a new writer must
 * update this list in the same change.
 */
export const AUDIT_EVENT_TYPES = [
  'auth.bootstrap',
  'auth.manual_test_account.created',
  'auth.login.success',
  'auth.login.failure',
  'auth.login.rate_limited',
  'auth.logout',
  'auth.session.revoked',
  'user.created',
  'user.role.changed',
  'user.status.changed',
  'user.password.reset',
  'user.deleted',
  'user.profile.updated',
  'user.password.changed',
] as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

/**
 * Deny-by-default metadata projection.
 *
 * Only these scalar keys are ever returned. Anything else — `ipHash`,
 * `identifierHash`, `password`, `username`, tokens, nested objects, arrays —
 * is silently dropped. `ipHash` is also excluded from the Prisma `select` so it
 * never even reaches this process layer.
 */
const ALLOWED_METADATA_KEYS = [
  'role',
  'reason',
  'fromRole',
  'toRole',
  'fromStatus',
  'toStatus',
  'revokedSessionCount',
] as const;

export type AuditMetadata = Record<string, string | number>;

/** Safe administrator-facing audit row. Never contains raw identifiers. */
export interface AuditEventDto {
  id: string;
  eventType: string;
  actorUserId: string | null;
  targetUserId: string | null;
  /** ISO-8601 UTC instant. */
  createdAt: string;
  metadata: AuditMetadata;
}

export interface ListAuditEventsQuery {
  eventType?: string | undefined;
  /** ISO-8601 instant; inclusive lower bound on `createdAt`. */
  from?: string | undefined;
  /** ISO-8601 instant; inclusive upper bound on `createdAt`. */
  to?: string | undefined;
  page: number;
  perPage: number;
}

export interface AuditLogService {
  listAuditEvents(principal: Principal, query: ListAuditEventsQuery): Promise<Paged<AuditEventDto>>;
}

export interface AuditLogServiceOptions {
  prisma: DatabaseClient;
}

/** Project stored JSON onto the allow-list, discarding every other key/value. */
function projectMetadata(value: Prisma.JsonValue | null): AuditMetadata {
  const result: AuditMetadata = {};
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return result;
  }

  const source = value as Record<string, unknown>;
  for (const key of ALLOWED_METADATA_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      continue;
    }
    const candidate = source[key];
    if (typeof candidate === 'string' || typeof candidate === 'number') {
      result[key] = candidate;
    }
  }
  return result;
}

/**
 * Read-only audit log for administrators (D-051).
 *
 * Authorization is domain-level: `listAuditEvents` requires the `audit.read`
 * capability (ADR 0004), which only `administrator` holds. Routes authenticate
 * and pass the principal; they do not decide permission.
 */
export function createAuditLogService(options: AuditLogServiceOptions): AuditLogService {
  const { prisma } = options;

  async function listAuditEvents(
    principal: Principal,
    query: ListAuditEventsQuery,
  ): Promise<Paged<AuditEventDto>> {
    requireCapability(principal, 'audit.read');

    const where: Prisma.AuditEventWhereInput = {};
    if (query.eventType !== undefined && query.eventType.length > 0) {
      where.eventType = query.eventType;
    }
    if (query.from !== undefined || query.to !== undefined) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (query.from !== undefined) {
        createdAt.gte = new Date(query.from);
      }
      if (query.to !== undefined) {
        createdAt.lte = new Date(query.to);
      }
      where.createdAt = createdAt;
    }

    const [total, rows] = await Promise.all([
      prisma.auditEvent.count({ where }),
      prisma.auditEvent.findMany({
        where,
        select: {
          id: true,
          eventType: true,
          actorUserId: true,
          targetUserId: true,
          createdAt: true,
          metadata: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        eventType: row.eventType,
        actorUserId: row.actorUserId,
        targetUserId: row.targetUserId,
        createdAt: row.createdAt.toISOString(),
        metadata: projectMetadata(row.metadata),
      })),
      pagination: {
        page: query.page,
        perPage: query.perPage,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.perPage)),
      },
    };
  }

  return { listAuditEvents };
}

import { createAuditLogService, type AuditLogService } from '@mernpress/cms-core';
import type { DatabaseClient, Prisma } from '@mernpress/database';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  createTestApp,
  loginAs,
  seedAdmin,
  seedUser,
} from '../helpers/auth.js';

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: Array<{ path: string; message: string }>;
  };
}

interface AuditItemShape {
  id: string;
  eventType: string;
  actorUserId: string | null;
  targetUserId: string | null;
  createdAt: string;
  metadata: Record<string, string | number>;
  [key: string]: unknown;
}

interface AuditListShape {
  items: AuditItemShape[];
  pagination: { page: number; perPage: number; total: number; totalPages: number };
}

const ADMIN = { userId: 'admin-1', role: 'administrator' };

interface FakeRow {
  id: string;
  eventType: string;
  actorUserId: string | null;
  targetUserId: string | null;
  createdAt: Date;
  metadata: Prisma.JsonValue | null;
}

interface FindManyArgs {
  where: unknown;
  select: Record<string, boolean>;
  orderBy: Array<Record<string, string>>;
  skip: number;
  take: number;
}

/** Minimal in-memory Prisma double so projection/paging can be asserted directly. */
function fakeService(rows: FakeRow[]): {
  service: AuditLogService;
  calls: { countWhere?: unknown; findManyArgs?: FindManyArgs };
} {
  const calls: { countWhere?: unknown; findManyArgs?: FindManyArgs } = {};
  const prisma = {
    auditEvent: {
      async count(args: { where: unknown }) {
        calls.countWhere = args.where;
        return rows.length;
      },
      async findMany(args: FindManyArgs) {
        calls.findManyArgs = args;
        return rows;
      },
    },
  } as unknown as DatabaseClient;
  return { service: createAuditLogService({ prisma }), calls };
}

function makeRow(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    id: 'evt-1',
    eventType: 'auth.login.failure',
    actorUserId: null,
    targetUserId: 'user-1',
    createdAt: new Date('2026-01-02T03:04:05.000Z'),
    metadata: {},
    ...overrides,
  };
}

describe('audit log service (unit)', () => {
  it('requires audit.read in the service; only administrator holds it', async () => {
    const { service, calls } = fakeService([makeRow()]);
    const query = { page: 1, perPage: 20 };

    await expect(service.listAuditEvents(ADMIN, query)).resolves.toBeDefined();
    expect(calls.findManyArgs).toBeDefined();

    for (const role of ['editor', 'author', 'contributor', 'subscriber', 'anonymous']) {
      const denied = fakeService([makeRow()]);
      await expect(
        denied.service.listAuditEvents({ userId: 'u-1', role }, query),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
      expect(denied.calls.findManyArgs).toBeUndefined();
      expect(denied.calls.countWhere).toBeUndefined();
    }
  });

  it('allow-lists metadata keys and drops every other key, including hashes and secrets', async () => {
    const { service } = fakeService([
      makeRow({
        metadata: {
          reason: 'invalid_password',
          role: 'editor',
          fromRole: 'administrator',
          toRole: 'editor',
          fromStatus: 'active',
          toStatus: 'disabled',
          revokedSessionCount: 2,
          identifierHash: 'SENSITIVE_IDENTIFIER_HASH',
          ipHash: 'SENSITIVE_IP_HASH',
          password: 'SENSITIVE_PASSWORD',
          username: 'sensitive-username',
          token: 'SENSITIVE_TOKEN',
          raw: 'SENSITIVE_RAW_JSON',
          nested: { secret: 'SENSITIVE_NESTED' },
          list: ['SENSITIVE_ARRAY'],
          extraAllowedLookingKey: 'SENSITIVE_EXTRA',
        },
      }),
    ]);

    const result = await service.listAuditEvents(ADMIN, { page: 1, perPage: 20 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.metadata).toEqual({
      reason: 'invalid_password',
      role: 'editor',
      fromRole: 'administrator',
      toRole: 'editor',
      fromStatus: 'active',
      toStatus: 'disabled',
      revokedSessionCount: 2,
    });

    const serialized = JSON.stringify(result);
    for (const secret of [
      'SENSITIVE_IDENTIFIER_HASH',
      'SENSITIVE_IP_HASH',
      'SENSITIVE_PASSWORD',
      'sensitive-username',
      'SENSITIVE_TOKEN',
      'SENSITIVE_RAW_JSON',
      'SENSITIVE_NESTED',
      'SENSITIVE_ARRAY',
      'SENSITIVE_EXTRA',
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('returns empty metadata for null, array or scalar stored JSON', async () => {
    const rows = [
      makeRow({ id: 'a', metadata: null }),
      makeRow({ id: 'b', metadata: ['role'] }),
      makeRow({ id: 'c', metadata: 'role' }),
    ];
    const { service } = fakeService(rows);
    const result = await service.listAuditEvents(ADMIN, { page: 1, perPage: 20 });
    expect(result.items.map((item) => item.metadata)).toEqual([{}, {}, {}]);
  });

  it('orders by createdAt desc then id desc, skips/takes and paginates', async () => {
    const rows = [
      makeRow({ id: 'newest', createdAt: new Date('2026-01-03T00:00:00.000Z') }),
      makeRow({ id: 'middle', createdAt: new Date('2026-01-02T00:00:00.000Z') }),
      makeRow({ id: 'oldest', createdAt: new Date('2026-01-01T00:00:00.000Z') }),
    ];
    const { service, calls } = fakeService(rows);

    const result = await service.listAuditEvents(ADMIN, { page: 2, perPage: 2 });
    expect(calls.findManyArgs?.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(calls.findManyArgs?.skip).toBe(2);
    expect(calls.findManyArgs?.take).toBe(2);
    expect(calls.findManyArgs?.select).not.toHaveProperty('ipHash');
    expect(result.pagination).toEqual({ page: 2, perPage: 2, total: 3, totalPages: 2 });
    expect(result.items).toHaveLength(3); // the fake returns all rows; projection is asserted below
    expect(result.items[0]?.createdAt).toBe('2026-01-03T00:00:00.000Z');
  });

  it('builds inclusive from/to bounds and an eventType filter', async () => {
    const { service, calls } = fakeService([]);
    await service.listAuditEvents(ADMIN, {
      eventType: 'user.role.changed',
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-31T00:00:00.000Z',
      page: 1,
      perPage: 20,
    });
    expect(calls.countWhere).toEqual({
      eventType: 'user.role.changed',
      createdAt: {
        gte: new Date('2026-01-01T00:00:00.000Z'),
        lte: new Date('2026-01-31T00:00:00.000Z'),
      },
    });
  });
});

describe('GET /api/admin/audit (integration)', () => {
  let app: FastifyInstance;
  let adminCookie: string;
  let adminId: string;

  beforeEach(async () => {
    app = await createTestApp();
    await seedAdmin(app);
    const session = await loginAs(app, ADMIN_USERNAME, ADMIN_PASSWORD);
    expect(session.response.statusCode).toBe(200);
    adminCookie = session.cookieHeader;
    const profile = await app.inject({
      method: 'GET',
      url: '/api/profile',
      headers: { cookie: adminCookie },
    });
    adminId = (profile.json() as { id: string }).id;

    // bootstrap/login write their own audit rows with current timestamps;
    // start each case from an empty log so paging/order assertions are exact.
    await app.database.auditEvent.deleteMany();
  });

  afterEach(async () => {
    await app.close();
  });

  function getAudit(query = '', cookie = adminCookie) {
    const url = query.length > 0 ? `/api/admin/audit?${query}` : '/api/admin/audit';
    return app.inject({ method: 'GET', url, headers: { cookie } });
  }

  async function insertEvent(input: {
    eventType: string;
    createdAt?: Date;
    metadata?: Prisma.InputJsonObject;
    ipHash?: string;
  }) {
    return app.database.auditEvent.create({
      data: {
        eventType: input.eventType,
        actorUserId: adminId,
        targetUserId: adminId,
        ...(input.createdAt === undefined ? {} : { createdAt: input.createdAt }),
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
        ...(input.ipHash === undefined ? {} : { ipHash: input.ipHash }),
      },
    });
  }

  it('rejects anonymous access with 401 UNAUTHENTICATED', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/audit' });
    expect(res.statusCode).toBe(401);
    expect((res.json() as ErrorEnvelope).error.code).toBe('UNAUTHENTICATED');
  });

  it('returns 403 FORBIDDEN for editor, author and subscriber', async () => {
    for (const role of ['editor', 'author', 'subscriber'] as const) {
      const username = `audit-${role}`;
      const password = `${role} password 123`;
      await seedUser(app, { username, password, role });
      const session = await loginAs(app, username, password);
      expect(session.response.statusCode).toBe(200);

      const res = await getAudit('', session.cookieHeader);
      expect(res.statusCode).toBe(403);
      expect((res.json() as ErrorEnvelope).error.code).toBe('FORBIDDEN');
    }
  });

  it('returns 400 VALIDATION_ERROR for malformed queries', async () => {
    for (const query of ['page=abc', 'perPage=0', 'from=not-a-date', 'eventType=x&unknown=1']) {
      const res = await getAudit(query);
      expect(res.statusCode).toBe(400);
      const body = res.json() as ErrorEnvelope;
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details?.length).toBeGreaterThan(0);
    }
  });

  it('returns a paged, newest-first result with the exact DTO shape', async () => {
    await insertEvent({
      eventType: 'auth.login.success',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    await insertEvent({
      eventType: 'user.created',
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    await insertEvent({
      eventType: 'auth.logout',
      createdAt: new Date('2026-01-03T00:00:00.000Z'),
    });

    const first = await getAudit('perPage=2&page=1');
    expect(first.statusCode).toBe(200);
    const body1 = first.json() as AuditListShape;
    expect(body1.items.map((item) => item.eventType)).toEqual(['auth.logout', 'user.created']);
    expect(body1.pagination).toEqual({ page: 1, perPage: 2, total: 3, totalPages: 2 });
    expect(body1.items[0]?.createdAt).toBe('2026-01-03T00:00:00.000Z');
    expect(body1.items[0]).toHaveProperty('id');
    expect(body1.items[0]).toHaveProperty('actorUserId');
    expect(body1.items[0]).toHaveProperty('targetUserId');
    expect(body1.items[0]).toHaveProperty('metadata');

    const second = await getAudit('perPage=2&page=2');
    const body2 = second.json() as AuditListShape;
    expect(body2.items.map((item) => item.eventType)).toEqual(['auth.login.success']);
    expect(body2.pagination).toEqual({ page: 2, perPage: 2, total: 3, totalPages: 2 });
  });

  it('filters by eventType', async () => {
    await insertEvent({ eventType: 'user.created' });
    await insertEvent({ eventType: 'auth.logout' });
    await insertEvent({ eventType: 'user.created' });

    const res = await getAudit('eventType=user.created');
    expect(res.statusCode).toBe(200);
    const body = res.json() as AuditListShape;
    expect(body.pagination.total).toBe(2);
    expect(body.items.every((item) => item.eventType === 'user.created')).toBe(true);
  });

  it('filters by inclusive from/to dates', async () => {
    await insertEvent({
      eventType: 'auth.login.success',
      createdAt: new Date('2025-12-31T23:59:59.000Z'),
    });
    await insertEvent({
      eventType: 'auth.logout',
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    await insertEvent({
      eventType: 'user.created',
      createdAt: new Date('2026-01-05T00:00:00.000Z'),
    });

    const query = `from=${encodeURIComponent('2026-01-01T00:00:00.000Z')}&to=${encodeURIComponent('2026-01-03T00:00:00.000Z')}`;
    const res = await getAudit(query);
    expect(res.statusCode).toBe(200);
    const body = res.json() as AuditListShape;
    expect(body.pagination.total).toBe(1);
    expect(body.items[0]?.eventType).toBe('auth.logout');
  });

  it('never leaks hashes, secrets or unknown metadata through the HTTP response', async () => {
    await insertEvent({
      eventType: 'auth.login.failure',
      ipHash: 'SENSITIVE_IP_HASH_COLUMN'.padEnd(64, '_'),
      metadata: {
        reason: 'invalid_password',
        role: 'editor',
        fromRole: 'administrator',
        toRole: 'editor',
        fromStatus: 'active',
        toStatus: 'disabled',
        revokedSessionCount: 2,
        identifierHash: 'SENSITIVE_IDENTIFIER_HASH',
        ipHash: 'SENSITIVE_IP_HASH_METADATA',
        password: 'SENSITIVE_PASSWORD',
        username: 'sensitive-username',
        token: 'SENSITIVE_TOKEN',
        raw: 'SENSITIVE_RAW_JSON',
      },
    });

    const res = await getAudit('eventType=auth.login.failure');
    expect(res.statusCode).toBe(200);
    for (const secret of [
      'SENSITIVE_IDENTIFIER_HASH',
      'SENSITIVE_IP_HASH',
      'SENSITIVE_PASSWORD',
      'sensitive-username',
      'SENSITIVE_TOKEN',
      'SENSITIVE_RAW_JSON',
    ]) {
      expect(res.body).not.toContain(secret);
    }

    const item = (res.json() as AuditListShape).items[0];
    expect(item?.metadata).toEqual({
      reason: 'invalid_password',
      role: 'editor',
      fromRole: 'administrator',
      toRole: 'editor',
      fromStatus: 'active',
      toStatus: 'disabled',
      revokedSessionCount: 2,
    });
    expect(item).not.toHaveProperty('ipHash');
    expect(item).not.toHaveProperty('identifierHash');
  });
});

import type { DatabaseClient } from '@mernpress/database';
import { requireCapability } from '../auth/capabilities.js';
import { ContentError } from '../content/errors.js';
import type { Principal } from '../content/types.js';

export type DataRequestType = 'EXPORT' | 'ERASE';
export type DataRequestStatus = 'PENDING' | 'COMPLETED';

export interface DataRequest {
  id: string;
  type: DataRequestType;
  email: string;
  userId: string | null;
  status: DataRequestStatus;
  requestedBy: string;
  note: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface PersonalDataExport {
  exportedAt: string;
  request: DataRequest;
  user: {
    id: string;
    username: string;
    email: string | null;
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
    nickname: string | null;
    bio: string | null;
    website: string | null;
    role: string;
    createdAt: string;
  } | null;
  posts: Array<{ id: string; type: string; title: string; status: string; createdAt: string }>;
  comments: Array<{
    id: string;
    postId: string;
    content: string;
    status: string;
    createdAt: string;
  }>;
}

export interface PrivacyServiceOptions {
  prisma: DatabaseClient;
  now?: () => Date;
}

const EMAIL_MAX = 254;

function toRequest(row: {
  id: string;
  type: string;
  email: string;
  userId: string | null;
  status: string;
  requestedBy: string;
  note: string | null;
  createdAt: Date;
  completedAt: Date | null;
}): DataRequest {
  return {
    id: row.id,
    type: row.type as DataRequestType,
    email: row.email,
    userId: row.userId,
    status: row.status as DataRequestStatus,
    requestedBy: row.requestedBy,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

export function createPrivacyService({ prisma, now = () => new Date() }: PrivacyServiceOptions) {
  async function list(principal: Principal, type: DataRequestType): Promise<DataRequest[]> {
    requireCapability(principal, 'user.manage');
    const rows = await prisma.dataRequest.findMany({
      where: { type },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRequest);
  }

  async function create(
    principal: Principal,
    input: { type: DataRequestType; email: string },
  ): Promise<DataRequest> {
    requireCapability(principal, 'user.manage');
    const email = input.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > EMAIL_MAX) {
      throw new ContentError('VALIDATION_ERROR', 'Enter a valid email address.', 400);
    }
    const user = await prisma.user.findFirst({
      where: { OR: [{ email }, { username: input.email.trim() }] },
      select: { id: true, email: true },
    });
    if (!user) {
      throw new ContentError(
        'NOT_FOUND',
        'No account matches that username or email address.',
        404,
      );
    }
    const existing = await prisma.dataRequest.findFirst({
      where: { type: input.type, userId: user.id, status: 'PENDING' },
    });
    if (existing) {
      throw new ContentError(
        'VALIDATION_ERROR',
        'A pending request already exists for this account.',
        409,
      );
    }
    const row = await prisma.dataRequest.create({
      data: {
        type: input.type,
        email: user.email ?? email,
        userId: user.id,
        requestedBy: principal.userId,
      },
    });
    return toRequest(row);
  }

  async function exportData(principal: Principal, id: string): Promise<PersonalDataExport> {
    requireCapability(principal, 'user.manage');
    const row = await prisma.dataRequest.findUnique({ where: { id } });
    if (!row || row.type !== 'EXPORT') {
      throw new ContentError('NOT_FOUND', 'Export request not found', 404);
    }
    const user = row.userId
      ? await prisma.user.findUnique({
          where: { id: row.userId },
          select: {
            id: true,
            username: true,
            email: true,
            displayName: true,
            firstName: true,
            lastName: true,
            nickname: true,
            bio: true,
            website: true,
            role: true,
            createdAt: true,
          },
        })
      : null;
    const [posts, comments] = await Promise.all([
      row.userId
        ? prisma.post.findMany({
            where: { authorId: row.userId },
            select: { id: true, type: true, title: true, status: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
          })
        : Promise.resolve([]),
      prisma.comment.findMany({
        where: row.userId
          ? { OR: [{ userId: row.userId }, { authorEmail: row.email }] }
          : { authorEmail: row.email },
        select: { id: true, postId: true, content: true, status: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return {
      exportedAt: now().toISOString(),
      request: toRequest(row),
      user: user
        ? {
            ...user,
            role: user.role,
            createdAt: user.createdAt.toISOString(),
          }
        : null,
      posts: posts.map((post) => ({
        id: post.id,
        type: post.type,
        title: post.title,
        status: post.status,
        createdAt: post.createdAt.toISOString(),
      })),
      comments: comments.map((comment) => ({
        id: comment.id,
        postId: comment.postId,
        content: comment.content,
        status: comment.status,
        createdAt: comment.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Erasure anonymises the account's personal data (profile fields and comment
   * authorship) and keeps the account itself, mirroring WordPress. The operator
   * confirms the request; nothing is deleted silently.
   */
  async function complete(principal: Principal, id: string): Promise<DataRequest> {
    requireCapability(principal, 'user.manage');
    const row = await prisma.dataRequest.findUnique({ where: { id } });
    if (!row) {
      throw new ContentError('NOT_FOUND', 'Request not found', 404);
    }
    if (row.status === 'COMPLETED') {
      return toRequest(row);
    }
    const completedAt = now();
    if (row.type === 'ERASE' && row.userId) {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: row.userId },
          data: {
            email: null,
            displayName: null,
            firstName: null,
            lastName: null,
            nickname: null,
            bio: null,
            website: null,
          },
        }),
        prisma.comment.updateMany({
          where: { OR: [{ userId: row.userId }, { authorEmail: row.email }] },
          data: {
            authorName: 'Anonymous',
            authorEmail: 'removed@example.invalid',
            authorUrl: null,
            userId: null,
          },
        }),
        prisma.dataRequest.update({
          where: { id },
          data: {
            status: 'COMPLETED',
            completedAt,
            note: 'Profile fields anonymised and comment authorship removed. The account itself is kept.',
          },
        }),
      ]);
    } else {
      await prisma.dataRequest.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedAt,
          ...(row.type === 'EXPORT'
            ? { note: 'Personal data export generated by the administrator.' }
            : {}),
        },
      });
    }
    const updated = await prisma.dataRequest.findUnique({ where: { id } });
    return toRequest(updated!);
  }

  return { list, create, exportData, complete };
}

export type PrivacyService = ReturnType<typeof createPrivacyService>;

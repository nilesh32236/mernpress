import type { DatabaseClient } from '@mernpress/database';
import { requireCapability, FULL_VISIBILITY_ROLES } from '../auth/capabilities.js';
import { ContentError } from '../content/errors.js';
import type { Principal } from '../content/types.js';
import type {
  AdminComment,
  CommentCounts,
  CommentListQuery,
  CommentStatus,
  CreateCommentInput,
  PublicComment,
  UpdateCommentInput,
} from './types.js';

const MAX_NAME = 200;
const MAX_EMAIL = 254;
const MAX_URL = 2048;
const MAX_CONTENT = 10_000;
const PUBLIC_LIMIT = 500;

function clean(value: string): string {
  return value.trim();
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= MAX_EMAIL;
}

function validUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function toPublic(row: {
  id: string;
  parentId: string | null;
  authorName: string;
  authorUrl: string | null;
  content: string;
  createdAt: Date;
}): PublicComment {
  return {
    id: row.id,
    parentId: row.parentId,
    authorName: row.authorName,
    authorUrl: row.authorUrl,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface CommentServiceOptions {
  prisma: DatabaseClient;
}

export function createCommentService({ prisma }: CommentServiceOptions) {
  async function publicList(postId: string): Promise<PublicComment[]> {
    const rows = await prisma.comment.findMany({
      where: { postId, status: 'APPROVED' },
      orderBy: { createdAt: 'asc' },
      take: PUBLIC_LIMIT,
    });
    return rows.map(toPublic);
  }

  async function createPublic(postId: string, input: CreateCommentInput): Promise<PublicComment> {
    const post = await prisma.post.findFirst({
      where: { id: postId, status: 'PUBLISHED', publishedAt: { lte: new Date() } },
      select: { id: true, type: true },
    });
    if (!post) {
      throw new ContentError('NOT_FOUND', 'Not found', 404);
    }
    const authorName = clean(input.authorName);
    const authorEmail = clean(input.authorEmail).toLowerCase();
    const content = clean(input.content);
    const authorUrl = input.authorUrl ? clean(input.authorUrl) : null;
    if (!authorName || authorName.length > MAX_NAME) {
      throw new ContentError('VALIDATION_ERROR', 'Name is required.', 400);
    }
    if (!validEmail(authorEmail)) {
      throw new ContentError('VALIDATION_ERROR', 'A valid email is required.', 400);
    }
    if (!content || content.length > MAX_CONTENT) {
      throw new ContentError('VALIDATION_ERROR', 'Comment is required.', 400);
    }
    if (authorUrl && (!validUrl(authorUrl) || authorUrl.length > MAX_URL)) {
      throw new ContentError('VALIDATION_ERROR', 'Website must be a valid URL.', 400);
    }
    if (input.parentId) {
      const parent = await prisma.comment.findFirst({
        where: { id: input.parentId, postId, status: 'APPROVED' },
        select: { id: true },
      });
      if (!parent) {
        throw new ContentError('VALIDATION_ERROR', 'The comment you replied to was not found.', 400);
      }
    }
    const flood = await prisma.comment.count({
      where: {
        authorEmail,
        createdAt: { gte: new Date(Date.now() - 30_000) },
      },
    });
    if (flood > 0) {
      throw new ContentError('VALIDATION_ERROR', 'You are posting comments too quickly.', 429);
    }
    const row = await prisma.comment.create({
      data: {
        postId,
        parentId: input.parentId ?? null,
        authorName,
        authorEmail,
        authorUrl: authorUrl || null,
        content,
        status: 'APPROVED',
      },
    });
    return toPublic(row);
  }

  function scopeWhere(principal: Principal, query?: CommentListQuery) {
    if (!roleCanReadAll(principal)) {
      return {
        post: { authorId: principal.userId },
        ...(query?.postId ? { postId: query.postId } : {}),
      };
    }
    return query?.postId ? { postId: query.postId } : {};
  }

  function roleCanReadAll(principal: Principal): boolean {
    return FULL_VISIBILITY_ROLES.has(principal.role);
  }

  async function adminList(
    principal: Principal,
    query: CommentListQuery,
  ): Promise<{ items: AdminComment[]; total: number; totalPages: number; counts: CommentCounts }> {
    requireCapability(principal, 'comments.read');
    const where = {
      ...scopeWhere(principal, query),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { authorName: { contains: query.search, mode: 'insensitive' as const } },
              { authorEmail: { contains: query.search, mode: 'insensitive' as const } },
              { content: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [rows, total, counts] = await Promise.all([
      prisma.comment.findMany({
        where,
        include: { post: { select: { title: true, slug: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
      prisma.comment.count({ where }),
      countsFor(principal),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        postId: row.postId,
        postTitle: row.post.title,
        postSlug: row.post.slug,
        userId: row.userId,
        parentId: row.parentId,
        authorName: row.authorName,
        authorEmail: row.authorEmail,
        authorUrl: row.authorUrl,
        content: row.content,
        status: row.status as CommentStatus,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      total,
      totalPages: Math.ceil(total / query.perPage),
      counts,
    };
  }

  async function countsFor(principal: Principal): Promise<CommentCounts> {
    requireCapability(principal, 'comments.read');
    const base = scopeWhere(principal);
    const groups = await prisma.comment.groupBy({
      by: ['status'],
      where: base,
      _count: { _all: true },
    });
    const result: CommentCounts = {
      all: 0,
      pending: 0,
      approved: 0,
      spam: 0,
      trashed: 0,
      mine: 0,
    };
    for (const group of groups) {
      const count = group._count._all;
      result.all += count;
      if (group.status === 'PENDING') result.pending = count;
      if (group.status === 'APPROVED') result.approved = count;
      if (group.status === 'SPAM') result.spam = count;
      if (group.status === 'TRASHED') result.trashed = count;
    }
    result.mine = await prisma.comment.count({
      where: { ...base, userId: principal.userId },
    });
    return result;
  }

  async function countsByPost(
    principal: Principal,
    postIds: string[],
  ): Promise<Record<string, number>> {
    requireCapability(principal, 'comments.read');
    if (postIds.length === 0) return {};
    const groups = await prisma.comment.groupBy({
      by: ['postId'],
      where: {
        postId: { in: postIds },
        status: 'APPROVED',
        ...(roleCanReadAll(principal) ? {} : { post: { authorId: principal.userId } }),
      },
      _count: { _all: true },
    });
    const result: Record<string, number> = {};
    for (const group of groups) {
      result[group.postId] = group._count._all;
    }
    return result;
  }

  async function recent(principal: Principal, limit = 5): Promise<AdminComment[]> {
    requireCapability(principal, 'comments.read');
    const rows = await prisma.comment.findMany({
      where: { ...scopeWhere(principal), status: 'APPROVED' },
      include: { post: { select: { title: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      postId: row.postId,
      postTitle: row.post.title,
      postSlug: row.post.slug,
      userId: row.userId,
      parentId: row.parentId,
      authorName: row.authorName,
      authorEmail: row.authorEmail,
      authorUrl: row.authorUrl,
      content: row.content,
      status: row.status as CommentStatus,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async function setStatus(
    principal: Principal,
    id: string,
    status: CommentStatus,
  ): Promise<AdminComment> {
    requireCapability(principal, 'comments.moderate');
    const existing = await prisma.comment.findUnique({ where: { id } });
    if (!existing) throw new ContentError('NOT_FOUND', 'Not found', 404);
    const row = await prisma.comment.update({
      where: { id },
      data: { status },
      include: { post: { select: { title: true, slug: true } } },
    });
    return {
      id: row.id,
      postId: row.postId,
      postTitle: row.post.title,
      postSlug: row.post.slug,
      userId: row.userId,
      parentId: row.parentId,
      authorName: row.authorName,
      authorEmail: row.authorEmail,
      authorUrl: row.authorUrl,
      content: row.content,
      status: row.status as CommentStatus,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async function update(
    principal: Principal,
    id: string,
    input: UpdateCommentInput,
  ): Promise<AdminComment> {
    requireCapability(principal, 'comments.moderate');
    const existing = await prisma.comment.findUnique({ where: { id } });
    if (!existing) throw new ContentError('NOT_FOUND', 'Not found', 404);
    const data: Record<string, string | null> = {};
    if (input.authorName !== undefined) {
      const name = clean(input.authorName);
      if (!name || name.length > MAX_NAME) {
        throw new ContentError('VALIDATION_ERROR', 'Name is required.', 400);
      }
      data.authorName = name;
    }
    if (input.authorEmail !== undefined) {
      const email = clean(input.authorEmail).toLowerCase();
      if (!validEmail(email)) {
        throw new ContentError('VALIDATION_ERROR', 'A valid email is required.', 400);
      }
      data.authorEmail = email;
    }
    if (input.authorUrl !== undefined) {
      const url = input.authorUrl ? clean(input.authorUrl) : null;
      if (url && (!validUrl(url) || url.length > MAX_URL)) {
        throw new ContentError('VALIDATION_ERROR', 'Website must be a valid URL.', 400);
      }
      data.authorUrl = url || null;
    }
    if (input.content !== undefined) {
      const content = clean(input.content);
      if (!content || content.length > MAX_CONTENT) {
        throw new ContentError('VALIDATION_ERROR', 'Comment is required.', 400);
      }
      data.content = content;
    }
    const row = await prisma.comment.update({
      where: { id },
      data,
      include: { post: { select: { title: true, slug: true } } },
    });
    return {
      id: row.id,
      postId: row.postId,
      postTitle: row.post.title,
      postSlug: row.post.slug,
      userId: row.userId,
      parentId: row.parentId,
      authorName: row.authorName,
      authorEmail: row.authorEmail,
      authorUrl: row.authorUrl,
      content: row.content,
      status: row.status as CommentStatus,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async function remove(principal: Principal, id: string): Promise<void> {
    requireCapability(principal, 'comments.moderate');
    const existing = await prisma.comment.findUnique({ where: { id } });
    if (!existing) throw new ContentError('NOT_FOUND', 'Not found', 404);
    await prisma.comment.delete({ where: { id } });
  }

  return {
    publicList,
    createPublic,
    adminList,
    countsFor,
    countsByPost,
    recent,
    setStatus,
    update,
    remove,
  };
}

export type CommentService = ReturnType<typeof createCommentService>;

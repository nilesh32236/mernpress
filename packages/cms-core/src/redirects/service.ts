import type { DatabaseClient } from '@mernpress/database';
import { requireCapability } from '../auth/capabilities.js';
import { ContentError } from '../content/errors.js';
import type { Principal } from '../content/types.js';

/**
 * Redirects and 404s (Tools → Redirects).
 *
 * Paths are normalized to a leading slash and no trailing slash (except `/`).
 * Destinations may be a relative path or an http(s) URL. The resolver follows
 * chains with a bounded depth and reports the final destination; loops are
 * rejected when a redirect is created or updated.
 */
export interface RedirectDto {
  id: string;
  fromPath: string;
  toPath: string;
  statusCode: 301 | 302;
  hits: number;
  createdAt: string;
  updatedAt: string;
}

export interface NotFoundDto {
  id: string;
  path: string;
  hits: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface RedirectListResult {
  redirects: RedirectDto[];
  notFound: NotFoundDto[];
}

export interface RedirectInput {
  fromPath: string;
  toPath: string;
  statusCode?: 301 | 302 | undefined;
}

export interface RedirectServiceOptions {
  prisma: DatabaseClient;
  logger?: (message: string, meta?: Record<string, unknown>) => void;
  now?: () => Date;
}

const MAX_PATH = 2048;
const MAX_CHAIN = 10;

function normalizePath(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_PATH) {
    throw new ContentError('VALIDATION_ERROR', 'Enter a path.', 400);
  }
  for (const character of trimmed) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) {
      throw new ContentError('VALIDATION_ERROR', 'The path contains invalid characters.', 400);
    }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('//')) {
    throw new ContentError('VALIDATION_ERROR', 'The source must be a path, not a URL.', 400);
  }
  let path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  path = path.replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path;
}

function normalizeDestination(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_PATH) {
    throw new ContentError('VALIDATION_ERROR', 'Enter a destination.', 400);
  }
  if (trimmed.startsWith('/')) {
    return normalizePath(trimmed);
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new ContentError('VALIDATION_ERROR', 'Enter a path or an http(s) URL.', 400);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ContentError(
      'VALIDATION_ERROR',
      'Only http and https destinations are allowed.',
      400,
    );
  }
  return url.toString();
}

function toRedirectDto(row: {
  id: string;
  fromPath: string;
  toPath: string;
  statusCode: number;
  hits: number;
  createdAt: Date;
  updatedAt: Date;
}): RedirectDto {
  return {
    id: row.id,
    fromPath: row.fromPath,
    toPath: row.toPath,
    statusCode: row.statusCode === 302 ? 302 : 301,
    hits: row.hits,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toNotFoundDto(row: {
  id: string;
  path: string;
  hits: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
}): NotFoundDto {
  return {
    id: row.id,
    path: row.path,
    hits: row.hits,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
  };
}

export function createRedirectService({ prisma, logger }: RedirectServiceOptions) {
  async function list(principal: Principal): Promise<RedirectListResult> {
    requireCapability(principal, 'manage_options');
    const [redirects, notFound] = await Promise.all([
      prisma.redirect.findMany({ orderBy: [{ fromPath: 'asc' }], take: 500 }),
      prisma.notFoundEntry.findMany({ orderBy: [{ lastSeenAt: 'desc' }], take: 500 }),
    ]);
    return {
      redirects: redirects.map(toRedirectDto),
      notFound: notFound.map(toNotFoundDto),
    };
  }

  async function assertNoLoop(fromPath: string, toPath: string, ignoreId?: string): Promise<void> {
    if (toPath.startsWith('/')) {
      if (toPath === fromPath) {
        throw new ContentError('VALIDATION_ERROR', 'A redirect cannot point to itself.', 400);
      }
      const all = await prisma.redirect.findMany({
        select: { id: true, fromPath: true, toPath: true },
      });
      let current = toPath;
      for (let step = 0; step < MAX_CHAIN; step += 1) {
        const next = all.find((entry) => entry.fromPath === current && entry.id !== ignoreId);
        if (!next) return;
        current = next.toPath;
        if (!current.startsWith('/')) return;
        if (current === fromPath) {
          throw new ContentError('VALIDATION_ERROR', 'That redirect would create a loop.', 400);
        }
      }
      throw new ContentError('VALIDATION_ERROR', 'That redirect chain is too long.', 400);
    }
  }

  async function create(principal: Principal, input: RedirectInput): Promise<RedirectListResult> {
    requireCapability(principal, 'manage_options');
    const fromPath = normalizePath(input.fromPath);
    const toPath = normalizeDestination(input.toPath);
    const statusCode = input.statusCode === 302 ? 302 : 301;
    await assertNoLoop(fromPath, toPath);
    try {
      await prisma.redirect.create({ data: { fromPath, toPath, statusCode } });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ContentError('VALIDATION_ERROR', 'A redirect for that path already exists.', 409);
      }
      throw error;
    }
    return list(principal);
  }

  async function update(
    principal: Principal,
    id: string,
    input: RedirectInput,
  ): Promise<RedirectListResult> {
    requireCapability(principal, 'manage_options');
    const existing = await prisma.redirect.findUnique({ where: { id } });
    if (!existing) {
      throw new ContentError('NOT_FOUND', 'Redirect not found', 404);
    }
    const fromPath = normalizePath(input.fromPath);
    const toPath = normalizeDestination(input.toPath);
    const statusCode = input.statusCode === 302 ? 302 : 301;
    await assertNoLoop(fromPath, toPath, id);
    try {
      await prisma.redirect.update({
        where: { id },
        data: { fromPath, toPath, statusCode },
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ContentError('VALIDATION_ERROR', 'A redirect for that path already exists.', 409);
      }
      throw error;
    }
    return list(principal);
  }

  async function remove(principal: Principal, id: string): Promise<RedirectListResult> {
    requireCapability(principal, 'manage_options');
    const deleted = await prisma.redirect.deleteMany({ where: { id } });
    if (deleted.count === 0) {
      throw new ContentError('NOT_FOUND', 'Redirect not found', 404);
    }
    return list(principal);
  }

  async function dismissNotFound(principal: Principal, id: string): Promise<RedirectListResult> {
    requireCapability(principal, 'manage_options');
    const deleted = await prisma.notFoundEntry.deleteMany({ where: { id } });
    if (deleted.count === 0) {
      throw new ContentError('NOT_FOUND', '404 entry not found', 404);
    }
    return list(principal);
  }

  /** All redirects for the public resolver/middleware (no capability). */
  async function publicMap(): Promise<RedirectDto[]> {
    const rows = await prisma.redirect.findMany({ orderBy: { fromPath: 'asc' }, take: 2000 });
    return rows.map(toRedirectDto);
  }

  /**
   * Resolve a request path, following chains. Increments the hit count on the
   * first matching redirect. Returns null when no redirect applies.
   */
  async function resolve(pathname: string): Promise<RedirectDto | null> {
    let current: string;
    try {
      current = normalizePath(pathname);
    } catch {
      return null;
    }
    const all = await prisma.redirect.findMany({ take: 2000 });
    let match: (typeof all)[number] | null = null;
    for (let step = 0; step < MAX_CHAIN; step += 1) {
      const next = all.find((entry) => entry.fromPath === current);
      if (!next) break;
      if (!match) match = next;
      if (!next.toPath.startsWith('/')) break;
      current = next.toPath;
    }
    if (!match) return null;
    await prisma.redirect
      .update({ where: { id: match.id }, data: { hits: { increment: 1 } } })
      .catch(() => undefined);
    return toRedirectDto(match);
  }

  /** Upsert a 404 path; repeated misses increment the counter. */
  async function logNotFound(pathname: string): Promise<void> {
    let path: string;
    try {
      path = normalizePath(pathname);
    } catch {
      return;
    }
    await prisma.notFoundEntry
      .upsert({
        where: { path },
        create: { path },
        update: { hits: { increment: 1 } },
      })
      .catch(() => undefined);
  }

  /**
   * Internal redirect created when a published slug changes. It is not
   * principal-based: the content service has already authorized the edit.
   * Existing redirects for the old path are retargeted, and failures are logged
   * rather than breaking the content save.
   */
  async function createAutomatic(from: string, to: string): Promise<void> {
    try {
      const fromPath = normalizePath(from);
      const toPath = normalizeDestination(to);
      if (fromPath === toPath) return;
      await assertNoLoop(fromPath, toPath);
      const existing = await prisma.redirect.findUnique({ where: { fromPath } });
      if (existing) {
        await prisma.redirect.update({
          where: { id: existing.id },
          data: { toPath, statusCode: 301 },
        });
        return;
      }
      await prisma.redirect.create({ data: { fromPath, toPath, statusCode: 301 } });
    } catch (error) {
      logger?.('automatic redirect skipped', {
        from,
        to,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    list,
    create,
    update,
    remove,
    dismissNotFound,
    publicMap,
    resolve,
    logNotFound,
    createAutomatic,
  };
}

export type RedirectService = ReturnType<typeof createRedirectService>;

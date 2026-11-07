import {
  DEFAULT_LANGUAGES,
  matchPostPath,
  normalizeLanguageConfig,
  type LanguageConfig,
} from '@mernpress/contracts';
import type { DatabaseClient } from '@mernpress/database';
import { requireCapability } from '../auth/capabilities.js';
import { ContentError } from '../content/errors.js';
import type { Principal } from '../content/types.js';

/**
 * Broken-link detection (ADR 0058).
 *
 * Crawls published posts/pages, extracts href/src URLs from the raw block
 * markup, and resolves every internal target against published content,
 * terms, authors, redirects and media — without any HTTP fetch. That keeps the
 * check SSRF-safe: authored URLs are never fetched, so external links are
 * stored as `external` (unchecked) and absolute URLs matching the configured
 * `site_url` host are treated as internal paths.
 */

export type LinkStatus = 'ok' | 'broken' | 'redirect' | 'external';
export type LinkKind = 'internal' | 'external';

export interface LinkCheckDto {
  id: string;
  sourcePostId: string;
  sourceTitle: string;
  sourceSlug: string;
  url: string;
  normalizedPath: string | null;
  kind: LinkKind;
  status: LinkStatus;
  httpStatus: number | null;
  redirectTo: string | null;
  checkedAt: string;
}

export interface LinkCheckSummary {
  total: number;
  ok: number;
  broken: number;
  redirect: number;
  external: number;
  sources: number;
  lastCheckedAt: string | null;
}

export interface LinkCheckListResult {
  links: LinkCheckDto[];
  summary: LinkCheckSummary;
}

export interface ScanBatchInput {
  after?: string | undefined;
  limit?: number | undefined;
}

export interface ScanBatchResult {
  processed: number;
  links: number;
  broken: number;
  external: number;
  remaining: number;
  nextAfter: string | null;
}

export interface LinkCheckServiceOptions {
  prisma: DatabaseClient;
  logger?: ((message: string, meta?: Record<string, unknown>) => void) | undefined;
  now?: (() => Date) | undefined;
}

const MAX_URLS_PER_POST = 1000;
const MAX_URL_LENGTH = 2048;
const DEFAULT_BATCH = 20;
const MAX_BATCH = 50;

/** Extract href/src URLs from raw block markup, order-stable and deduplicated. */
export function extractLinks(content: string): string[] {
  if (!content || typeof content !== 'string') return [];
  const found: string[] = [];
  const seen = new Set<string>();
  const pattern = /\b(?:href|src)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'<>]+))/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const url = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (url.length === 0 || url.length > MAX_URL_LENGTH) continue;
    // Strip HTML entities that commonly appear in hrefs.
    const decoded = url.replace(/&amp;/gi, '&').replace(/&#038;/gi, '&');
    if (!seen.has(decoded)) {
      seen.add(decoded);
      found.push(decoded);
      if (found.length >= MAX_URLS_PER_POST) break;
    }
  }
  // srcset candidates: "url 2x, other 1x" — take each candidate URL.
  const srcsetPattern = /\bsrcset\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;
  while ((match = srcsetPattern.exec(content)) !== null) {
    const value = match[1] ?? match[2] ?? '';
    for (const part of value.split(',')) {
      const candidate = part.trim().split(/\s+/)[0]?.trim();
      if (!candidate || candidate.length > MAX_URL_LENGTH) continue;
      if (!seen.has(candidate)) {
        seen.add(candidate);
        found.push(candidate);
        if (found.length >= MAX_URLS_PER_POST) break;
      }
    }
    if (found.length >= MAX_URLS_PER_POST) break;
  }
  return found;
}

function isIgnoredScheme(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.startsWith('#') ||
    lower.startsWith('mailto:') ||
    lower.startsWith('tel:') ||
    lower.startsWith('javascript:') ||
    lower.startsWith('data:')
  );
}

function normalizePathname(pathname: string): string {
  let path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  try {
    path = decodeURIComponent(path);
  } catch {
    // Keep the raw value when it is not valid percent-encoding.
  }
  path = path.replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path || '/';
}

interface CheckContext {
  postSlugs: Map<string, Set<string>>;
  postIds: Set<string>;
  pageSlugs: Set<string>;
  terms: Set<string>;
  usernames: Set<string>;
  redirects: Map<string, { toPath: string; statusCode: number }>;
  mediaFiles: Set<string>;
  pattern: string;
  categoryBase: string;
  tagBase: string;
  languages: LanguageConfig;
  siteHost: string | null;
}

interface CheckOutcome {
  kind: LinkKind;
  status: LinkStatus;
  httpStatus: number | null;
  redirectTo: string | null;
  normalizedPath: string | null;
}

function checkInternalPath(pathname: string, context: CheckContext): CheckOutcome {
  const normalized = normalizePathname(pathname);
  const noSlash = normalized === '/' ? '/' : normalized.replace(/\/$/, '');
  const broken: CheckOutcome = {
    kind: 'internal',
    status: 'broken',
    httpStatus: 404,
    redirectTo: null,
    normalizedPath: normalized,
  };
  const ok: CheckOutcome = {
    kind: 'internal',
    status: 'ok',
    httpStatus: 200,
    redirectTo: null,
    normalizedPath: normalized,
  };

  if (noSlash === '/' || noSlash === '/posts' || noSlash === '/search') return ok;
  if (
    noSlash === '/feed' ||
    noSlash === '/feed.xml' ||
    noSlash === '/sitemap.xml' ||
    noSlash === '/robots.txt' ||
    noSlash === '/llms.txt'
  ) {
    return ok;
  }

  // Language prefix: /<lang>/... where <lang> is an enabled language.
  let candidate = noSlash;
  const segments = noSlash.split('/').filter(Boolean);
  if (segments.length > 1 && context.languages.enabled.includes(segments[0]!.toLowerCase())) {
    candidate = `/${segments.slice(1).join('/')}`;
    if (candidate === '') candidate = '/';
  }
  if (candidate !== noSlash) {
    // Re-check the stripped path (single strip; nested prefixes are broken).
    const inner = checkInternalPath(candidate, context);
    if (inner.status !== 'broken') {
      return { ...inner, normalizedPath: normalized };
    }
  }

  const redirect = context.redirects.get(noSlash) ?? context.redirects.get(normalized);
  if (redirect) {
    return {
      kind: 'internal',
      status: 'redirect',
      httpStatus: redirect.statusCode,
      redirectTo: redirect.toPath,
      normalizedPath: normalized,
    };
  }

  // Media files: /api/media/<id>/<fileName>
  const mediaMatch = candidate.match(/^\/api\/media\/([^/]+)\/(.+)$/);
  if (mediaMatch) {
    const id = mediaMatch[1]!;
    const file = mediaMatch[2]!;
    return context.mediaFiles.has(`${id}/${file}`) ? ok : broken;
  }

  // Terms: /category/<slug> or /tag/<slug> under the configured bases.
  const categoryMatch = candidate.match(
    new RegExp(`^/${escapeRegExp(context.categoryBase)}/(.+)$`),
  );
  if (categoryMatch) {
    return context.terms.has(`category:${decodeSegment(categoryMatch[1]!)}`) ? ok : broken;
  }
  const tagMatch = candidate.match(new RegExp(`^/${escapeRegExp(context.tagBase)}/(.+)$`));
  if (tagMatch) {
    return context.terms.has(`tag:${decodeSegment(tagMatch[1]!)}`) ? ok : broken;
  }

  const authorMatch = candidate.match(/^\/author\/(.+)$/);
  if (authorMatch) {
    return context.usernames.has(decodeSegment(authorMatch[1]!)) ? ok : broken;
  }

  // Permalink pattern: /posts/<slug>, /<slug> with dates, /archives/<id>, etc.
  if (context.pattern) {
    const matched = matchPostPath(context.pattern, candidate);
    if (matched) {
      if (matched.id) return context.postIds.has(matched.id) ? ok : broken;
      if (matched.slug) {
        return context.postSlugs.get('post')?.has(matched.slug) ? ok : broken;
      }
      return broken;
    }
  }

  // Classic MERNPress shapes regardless of the active pattern.
  const postMatch = candidate.match(/^\/posts\/(.+)$/);
  if (postMatch) {
    return context.postSlugs.get('post')?.has(decodeSegment(postMatch[1]!)) ? ok : broken;
  }
  if (candidate.split('/').filter(Boolean).length === 1) {
    const slug = decodeSegment(candidate.slice(1));
    if (context.pageSlugs.has(slug)) return ok;
    if (context.pattern === '/%postname%/' && context.postSlugs.get('post')?.has(slug)) return ok;
    return broken;
  }

  return broken;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function resolveUrl(
  url: string,
  context: CheckContext,
): { outcome: CheckOutcome; ignore: boolean } {
  if (isIgnoredScheme(url)) return { outcome: externalOutcome(), ignore: true };
  if (/^(?:mailto|tel|javascript|data):/i.test(url)) {
    return { outcome: externalOutcome(), ignore: true };
  }
  if (url.startsWith('#')) return { outcome: externalOutcome(), ignore: true };

  // Absolute or protocol-relative URLs: internal only when the host matches the
  // configured site_url; otherwise external and never fetched.
  if (/^https?:\/\//i.test(url) || url.startsWith('//')) {
    let parsed: URL;
    try {
      parsed = new URL(url, 'http://internal.invalid');
    } catch {
      return { outcome: externalOutcome(), ignore: false };
    }
    const host = parsed.host.toLowerCase();
    const sameHost = context.siteHost !== null && host === context.siteHost;
    if (!sameHost) return { outcome: externalOutcome(), ignore: false };
    return { outcome: checkInternalPath(parsed.pathname, context), ignore: false };
  }

  // Relative URLs resolve against the site root (authors use absolute paths).
  if (url.startsWith('/')) {
    const pathOnly = url.split(/[?#]/)[0] ?? '/';
    return { outcome: checkInternalPath(pathOnly, context), ignore: false };
  }
  if (url.startsWith('?')) {
    // Query-only link on the current page.
    return {
      outcome: {
        kind: 'internal',
        status: 'ok',
        httpStatus: 200,
        redirectTo: null,
        normalizedPath: '/',
      },
      ignore: false,
    };
  }
  // Bare relative path: treat as site-root relative.
  const pathOnly = `/${url.split(/[?#]/)[0] ?? ''}`;
  return { outcome: checkInternalPath(pathOnly, context), ignore: false };
}

function externalOutcome(): CheckOutcome {
  return {
    kind: 'external',
    status: 'external',
    httpStatus: null,
    redirectTo: null,
    normalizedPath: null,
  };
}

function toDto(row: {
  id: string;
  sourcePostId: string;
  sourceTitle: string;
  sourceSlug: string;
  url: string;
  kind: string;
  status: string;
  httpStatus: number | null;
  redirectTo: string | null;
  checkedAt: Date;
}): LinkCheckDto {
  return {
    id: row.id,
    sourcePostId: row.sourcePostId,
    sourceTitle: row.sourceTitle,
    sourceSlug: row.sourceSlug,
    url: row.url,
    normalizedPath: null,
    kind: row.kind === 'external' ? 'external' : 'internal',
    status: (['ok', 'broken', 'redirect', 'external'].includes(row.status)
      ? row.status
      : 'broken') as LinkStatus,
    httpStatus: row.httpStatus,
    redirectTo: row.redirectTo,
    checkedAt: row.checkedAt.toISOString(),
  };
}

export function createLinkCheckService({
  prisma,
  logger,
  now = () => new Date(),
}: LinkCheckServiceOptions) {
  async function loadContext(): Promise<CheckContext> {
    const [posts, terms, users, redirects, media, options] = await Promise.all([
      prisma.post.findMany({
        where: { status: 'PUBLISHED', isPrivate: false },
        select: { id: true, type: true, slug: true },
      }),
      prisma.term.findMany({ select: { taxonomy: true, slug: true } }),
      prisma.user.findMany({ select: { username: true } }),
      prisma.redirect.findMany({ select: { fromPath: true, toPath: true, statusCode: true } }),
      prisma.mediaItem.findMany({ select: { id: true, fileName: true, derivatives: true } }),
      prisma.option.findMany({
        where: {
          key: {
            in: [
              'site_url',
              'permalink_pattern',
              'permalink_structure',
              'category_base',
              'tag_base',
              'site_languages',
            ],
          },
        },
        select: { key: true, value: true },
      }),
    ]);

    const postSlugs = new Map<string, Set<string>>();
    const postIds = new Set<string>();
    const pageSlugs = new Set<string>();
    for (const post of posts) {
      const set = postSlugs.get(post.type) ?? new Set<string>();
      set.add(post.slug);
      postSlugs.set(post.type, set);
      if (post.type === 'post') postIds.add(post.id);
      if (post.type === 'page') pageSlugs.add(post.slug);
    }

    const termSet = new Set(terms.map((term) => `${term.taxonomy}:${term.slug}`));
    const mediaFiles = new Set<string>();
    for (const item of media) {
      mediaFiles.add(`${item.id}/${item.fileName}`);
      const derivatives = (item.derivatives ?? {}) as Record<string, string>;
      for (const value of Object.values(derivatives)) {
        if (typeof value === 'string') {
          const base = value.split('/').pop();
          if (base) mediaFiles.add(`${item.id}/${base}`);
        }
      }
    }

    const optionValue = new Map(options.map((row) => [row.key, row.value]));
    const parse = (key: string): unknown => {
      const raw = optionValue.get(key);
      if (!raw) return undefined;
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    };
    const siteUrlRaw = parse('site_url');
    let siteHost: string | null = null;
    if (typeof siteUrlRaw === 'string' && siteUrlRaw.length > 0) {
      try {
        siteHost = new URL(siteUrlRaw).host.toLowerCase();
      } catch {
        siteHost = null;
      }
    }

    const patternRaw = parse('permalink_pattern');
    const structureRaw = parse('permalink_structure');
    let pattern = '';
    if (typeof patternRaw === 'string' && patternRaw.length > 0) {
      pattern = patternRaw;
    } else if (structureRaw === 'postname') {
      pattern = '/%postname%/';
    } else if (structureRaw === 'day') {
      pattern = '/%year%/%monthnum%/%day%/%postname%/';
    } else if (structureRaw === 'month') {
      pattern = '/%year%/%monthnum%/%postname%/';
    } else if (structureRaw === 'numeric') {
      pattern = '/archives/%post_id%/';
    }
    // Default public shape when no structure is stored.
    if (!pattern) pattern = '/posts/%postname%/';

    const categoryBaseRaw = parse('category_base');
    const tagBaseRaw = parse('tag_base');
    const categoryBase =
      typeof categoryBaseRaw === 'string' && categoryBaseRaw.length > 0
        ? categoryBaseRaw.toLowerCase()
        : 'category';
    const tagBase =
      typeof tagBaseRaw === 'string' && tagBaseRaw.length > 0 ? tagBaseRaw.toLowerCase() : 'tag';

    let languages: LanguageConfig;
    try {
      languages = normalizeLanguageConfig(parse('site_languages'));
    } catch {
      languages = DEFAULT_LANGUAGES;
    }

    return {
      postSlugs,
      postIds,
      pageSlugs,
      terms: termSet,
      usernames: new Set(users.map((user) => user.username)),
      redirects: new Map(
        redirects.map((row) => [row.fromPath, { toPath: row.toPath, statusCode: row.statusCode }]),
      ),
      mediaFiles,
      pattern,
      categoryBase,
      tagBase,
      languages,
      siteHost,
    };
  }

  async function list(principal: Principal): Promise<LinkCheckListResult> {
    requireCapability(principal, 'manage_options');
    const rows = await prisma.linkCheck.findMany({
      orderBy: [{ status: 'asc' }, { checkedAt: 'desc' }],
      take: 500,
    });
    const links = rows.map((row) => {
      const dto = toDto(row as never);
      // Recover the normalized path for display when the stored row has it via
      // a re-check of simple internal paths is unnecessary; it stays null and
      // the URL itself is the identifier.
      return dto;
    });
    const byStatus = { ok: 0, broken: 0, redirect: 0, external: 0 };
    for (const link of links) byStatus[link.status] += 1;
    const sources = new Set(links.map((link) => link.sourcePostId)).size;
    const lastCheckedAt = links.reduce<string | null>(
      (latest, link) => (latest === null || link.checkedAt > latest ? link.checkedAt : latest),
      null,
    );
    return {
      links,
      summary: {
        total: links.length,
        ...byStatus,
        sources,
        lastCheckedAt,
      },
    };
  }

  async function dismiss(principal: Principal, id: string): Promise<LinkCheckListResult> {
    requireCapability(principal, 'manage_options');
    const deleted = await prisma.linkCheck.deleteMany({ where: { id } });
    if (deleted.count === 0) {
      throw new ContentError('NOT_FOUND', 'Link check not found', 404);
    }
    return list(principal);
  }

  async function scanBatch(input: ScanBatchInput = {}): Promise<ScanBatchResult> {
    const context = await loadContext();
    return scanBatchWithContext(context, input);
  }

  async function scanBatchWithContext(
    context: CheckContext,
    input: ScanBatchInput = {},
  ): Promise<ScanBatchResult> {
    const limit = Math.min(MAX_BATCH, Math.max(1, Math.trunc(input.limit ?? DEFAULT_BATCH)));
    const rows = await prisma.post.findMany({
      where: {
        status: 'PUBLISHED',
        isPrivate: false,
        ...(input.after ? { id: { gt: input.after } } : {}),
      },
      orderBy: { id: 'asc' },
      take: limit,
      select: { id: true, title: true, slug: true, content: true },
    });

    let links = 0;
    let broken = 0;
    let external = 0;
    let lastId: string | null = null;
    const checkedAt = now();

    for (const row of rows) {
      lastId = row.id;
      const urls = extractLinks(row.content);
      const seenForSource = new Set<string>();
      for (const url of urls) {
        const { outcome, ignore } = resolveUrl(url, context);
        if (ignore) continue;
        seenForSource.add(url);
        links += 1;
        if (outcome.status === 'broken') broken += 1;
        if (outcome.status === 'external') external += 1;
        await prisma.linkCheck.upsert({
          where: { sourcePostId_url: { sourcePostId: row.id, url } },
          create: {
            sourcePostId: row.id,
            sourceTitle: row.title,
            sourceSlug: row.slug,
            url,
            kind: outcome.kind,
            status: outcome.status,
            httpStatus: outcome.httpStatus,
            redirectTo: outcome.redirectTo,
            checkedAt,
          },
          update: {
            sourceTitle: row.title,
            sourceSlug: row.slug,
            kind: outcome.kind,
            status: outcome.status,
            httpStatus: outcome.httpStatus,
            redirectTo: outcome.redirectTo,
            checkedAt,
          },
        });
      }
      // Remove rows for links that disappeared from this source.
      if (seenForSource.size > 0) {
        await prisma.linkCheck.deleteMany({
          where: { sourcePostId: row.id, url: { notIn: [...seenForSource] } },
        });
      } else {
        await prisma.linkCheck.deleteMany({ where: { sourcePostId: row.id } });
      }
    }

    const remaining =
      lastId === null
        ? 0
        : await prisma.post.count({
            where: { status: 'PUBLISHED', isPrivate: false, id: { gt: lastId } },
          });

    return {
      processed: rows.length,
      links,
      broken,
      external,
      remaining,
      nextAfter: remaining > 0 ? lastId : null,
    };
  }

  async function purgeOrphans(): Promise<number> {
    const valid = await prisma.post.findMany({
      where: { status: 'PUBLISHED', isPrivate: false },
      select: { id: true },
    });
    const ids = valid.map((row) => row.id);
    const result =
      ids.length === 0
        ? await prisma.linkCheck.deleteMany({})
        : await prisma.linkCheck.deleteMany({ where: { sourcePostId: { notIn: ids } } });
    return result.count;
  }

  async function checkAllSystem(): Promise<{
    processed: number;
    links: number;
    broken: number;
    external: number;
    purged: number;
  }> {
    const context = await loadContext();
    let processed = 0;
    let links = 0;
    let broken = 0;
    let external = 0;
    let after: string | undefined;
    for (let batch = 0; batch < 10_000; batch += 1) {
      const result = await scanBatchWithContext(context, {
        ...(after ? { after } : {}),
        limit: DEFAULT_BATCH,
      });
      processed += result.processed;
      links += result.links;
      broken += result.broken;
      external += result.external;
      if (!result.nextAfter) break;
      if (result.nextAfter === after) {
        throw new Error('Link check cursor did not advance.');
      }
      after = result.nextAfter;
    }
    const purged = await purgeOrphans();
    logger?.('link check complete', { processed, links, broken, external, purged });
    return { processed, links, broken, external, purged };
  }

  return {
    list,
    dismiss,
    extractLinks,
    scanBatch,
    checkAllSystem,
    purgeOrphans,
  };
}

export type LinkCheckService = ReturnType<typeof createLinkCheckService>;

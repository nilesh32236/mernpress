import type { DatabaseClient, PostStatus, Prisma } from '@mernpress/database';
import { validateBlockMarkup } from '@mernpress/block-system/validate';
import { renderBlockMarkup } from '@mernpress/block-system/render';
import type { HookRegistry } from '../hooks/types.js';
import { HookRejectedError } from '../hooks/types.js';
import {
  FULL_VISIBILITY_ROLES,
  canReadPost,
  ownsObject,
  requireCapability,
  roleHasCapability,
} from '../auth/capabilities.js';
import { ContentError } from './errors.js';
import {
  deriveSlugFromTitle,
  fallbackSlug,
  isReservedSlug,
  normalizeSlug,
  truncateSlug,
  validateExplicitSlug,
} from './slug.js';
import type {
  AdminListQuery,
  AdminPost,
  AdminTermSummary,
  ContentType,
  CreatePostInput,
  Paged,
  PostActionPayload,
  PostFilterDraft,
  Principal,
  PublicListQuery,
  PublicPost,
  UpdatePostInput,
} from './types.js';

const CONTENT_MAX_CHARS = 2_000_000;

type Tx = Prisma.TransactionClient;

export interface ContentServiceOptions {
  prisma: DatabaseClient;
  hooks: HookRegistry;
  now?: () => Date;
  /** Receives render warnings for otherwise-invisible block fallbacks (ADR 0007). */
  logger?: { warn: (message: string, meta?: Record<string, unknown>) => void };
}

export interface ContentService {
  createPost(principal: Principal, input: CreatePostInput): Promise<AdminPost>;
  getPost(principal: Principal, id: string): Promise<AdminPost>;
  updatePost(principal: Principal, id: string, input: UpdatePostInput): Promise<AdminPost>;
  listAdmin(principal: Principal, query: AdminListQuery): Promise<Paged<AdminPost>>;
  publish(principal: Principal, id: string, baseVersion: number): Promise<AdminPost>;
  unpublish(principal: Principal, id: string, baseVersion: number): Promise<AdminPost>;
  trash(principal: Principal, id: string, baseVersion: number): Promise<AdminPost>;
  restore(principal: Principal, id: string, baseVersion: number): Promise<AdminPost>;
  assignTerms(
    principal: Principal,
    id: string,
    categoryIds: string[],
    tagIds: string[],
    baseVersion: number,
  ): Promise<AdminPost>;
  listPublic(query: PublicListQuery): Promise<Paged<PublicPost>>;
  getPublicBySlug(type: ContentType, slug: string): Promise<PublicPost>;
}

/**
 * Object-level content authorization (ADR 0004). The route authenticates and
 * passes `{ userId, role }`; the service decides permission. A principal may act
 * on an object when it holds the `.any` capability, or the `.own` capability and
 * owns the object. Fail closed: unknown roles have no capabilities.
 */
function canEditPost(principal: Principal, authorId: string | null, status: PostStatus): void {
  if (roleHasCapability(principal.role, 'content.edit.any')) {
    return;
  }
  if (principal.role === 'contributor') {
    // Contributors edit only their own drafts.
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

function canTransition(
  principal: Principal,
  authorId: string | null,
  kind: 'publish' | 'trash',
): void {
  const anyCap = kind === 'publish' ? 'content.publish.any' : 'content.trash.any';
  const ownCap = kind === 'publish' ? 'content.publish.own' : 'content.trash.own';
  if (roleHasCapability(principal.role, anyCap)) {
    return;
  }
  if (roleHasCapability(principal.role, ownCap) && ownsObject(principal, authorId)) {
    return;
  }
  throw new ContentError('FORBIDDEN', 'Forbidden', 403);
}

/** Revalidate a (possibly filter-transformed) draft before persistence. */
function validateDraft(draft: PostFilterDraft): void {
  if (draft.type !== 'post' && draft.type !== 'page') {
    throw new ContentError('VALIDATION_ERROR', 'Invalid content type', 400);
  }
  const title = draft.title.trim();
  if (title.length === 0 || title.length > 300) {
    throw new ContentError('VALIDATION_ERROR', 'Invalid title', 400);
  }
  // A filter must not bypass slug constraints: re-check normalization and the
  // reserved list (compare taxonomy/service.ts which already re-checks).
  if (
    draft.slug.length === 0 ||
    draft.slug.length > 200 ||
    draft.slug !== normalizeSlug(draft.slug)
  ) {
    throw new ContentError('VALIDATION_ERROR', 'Invalid slug', 400);
  }
  if (isReservedSlug(draft.slug)) {
    throw new ContentError('SLUG_RESERVED', 'That slug is reserved', 409);
  }
  if (draft.content.length > CONTENT_MAX_CHARS) {
    throw new ContentError('VALIDATION_ERROR', 'Content too large', 400);
  }
  // Structural validation only: freeform HTML and unknown blocks are valid and
  // must be preserved. This rejects hostile size/depth/count shapes before they
  // reach the parser or a renderer (Phase 5, docs/architecture/gutenberg-and-rendering.md).
  const blockCheck = validateBlockMarkup(draft.content);
  if (!blockCheck.ok) {
    throw new ContentError(
      blockCheck.code ?? 'INVALID_BLOCK_MARKUP',
      blockCheck.message ?? 'Invalid block markup',
      400,
    );
  }
  if (draft.excerpt !== null && draft.excerpt.length > 2000) {
    throw new ContentError('VALIDATION_ERROR', 'Invalid excerpt', 400);
  }
  if (draft.seoTitle !== null && draft.seoTitle.length > 300) {
    throw new ContentError('VALIDATION_ERROR', 'Invalid SEO title', 400);
  }
  if (draft.seoDescription !== null && draft.seoDescription.length > 500) {
    throw new ContentError('VALIDATION_ERROR', 'Invalid SEO description', 400);
  }
  if (draft.canonicalUrl !== null && draft.canonicalUrl.length > 2048) {
    throw new ContentError('VALIDATION_ERROR', 'Invalid canonical URL', 400);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

function slugLockKey(type: ContentType, slug: string): string {
  return `content.slug:${type}:${slug}`;
}

function toSummary(term: { id: string; name: string; slug: string }): AdminTermSummary {
  return { id: term.id, name: term.name, slug: term.slug };
}

type PostWithTerms = Prisma.PostGetPayload<{
  include: { terms: { include: { term: true } } };
}>;

function splitTerms(row: PostWithTerms): AdminPost['terms'] {
  const categories: AdminTermSummary[] = [];
  const tags: AdminTermSummary[] = [];
  for (const join of row.terms) {
    if (join.term.taxonomy === 'category') {
      categories.push(toSummary(join.term));
    } else {
      tags.push(toSummary(join.term));
    }
  }
  return { categories, tags };
}

function toAdmin(row: PostWithTerms): AdminPost {
  return {
    id: row.id,
    type: row.type as ContentType,
    status: row.status,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    content: row.content,
    contentFormat: row.contentFormat,
    contentVersion: row.contentVersion,
    authorId: row.authorId,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    canonicalUrl: row.canonicalUrl,
    robots: row.robots,
    ogTitle: row.ogTitle,
    ogDescription: row.ogDescription,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    trashedAt: row.trashedAt?.toISOString() ?? null,
    previousStatus: row.previousStatus,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    terms: splitTerms(row),
  };
}

/**
 * Render a stored document for public consumption (ADR 0007). Fails closed:
 * unrenderable stored content (legacy rows predating write-time validation)
 * yields empty HTML rather than raw markup. Render warnings are returned so
 * callers can log them with request context.
 */
function renderForPublic(row: PostWithTerms): {
  html: string;
  toc: PublicPost['toc'];
  warnings: string[];
} {
  try {
    const rendered = renderBlockMarkup(row.content);
    return {
      html: rendered.html,
      toc: rendered.toc,
      warnings: rendered.warnings.map(
        (warning) => `${warning.blockName ?? 'freeform'}: ${warning.message}`,
      ),
    };
  } catch (error) {
    return {
      html: '',
      toc: [],
      warnings: [error instanceof Error ? error.message : String(error)],
    };
  }
}

function toPublic(row: PostWithTerms, logger?: ContentServiceOptions['logger']): PublicPost {
  const rendered = renderForPublic(row);
  if (rendered.warnings.length > 0) {
    logger?.warn('content render fell back for one or more blocks', {
      postId: row.id,
      warnings: rendered.warnings,
    });
  }
  return {
    id: row.id,
    type: row.type as ContentType,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    content: row.content,
    contentFormat: row.contentFormat,
    renderedContent: rendered.html,
    toc: rendered.toc,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    canonicalUrl: row.canonicalUrl,
    robots: row.robots,
    ogTitle: row.ogTitle,
    ogDescription: row.ogDescription,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    terms: splitTerms(row),
  };
}

const WITH_TERMS = { terms: { include: { term: true }, orderBy: { position: 'asc' as const } } };

async function loadWithTerms(tx: Tx, id: string): Promise<PostWithTerms | null> {
  return tx.post.findUnique({ where: { id }, include: WITH_TERMS });
}

export function createContentService(options: ContentServiceOptions): ContentService {
  const { prisma, hooks } = options;
  const now = options.now ?? (() => new Date());

  async function applyFilter(
    name: 'content.post.create' | 'content.post.update',
    draft: PostFilterDraft,
  ): Promise<PostFilterDraft> {
    let filtered: PostFilterDraft;
    try {
      filtered = await hooks.applyFilters(name, draft);
    } catch (error) {
      if (error instanceof HookRejectedError) {
        throw new ContentError('HOOK_REJECTED', 'Rejected by a content hook', 400);
      }
      throw error;
    }
    // Revalidate before persistence; hooks must not bypass invariants.
    validateDraft(filtered);
    return filtered;
  }

  function actionPayload(
    row: { id: string; type: string; status: PostStatus; authorId: string | null; slug: string },
    fromStatus: PostStatus | null,
  ): PostActionPayload {
    return {
      postId: row.id,
      type: row.type as ContentType,
      status: row.status,
      authorId: row.authorId,
      slug: row.slug,
      fromStatus,
    };
  }

  /**
   * Resolve a unique slug for a derived (title-based) slug by appending -2, -3…
   * inside the slug lock. Explicit slugs never auto-suffix; they 409 instead.
   */
  async function resolveDerivedSlug(tx: Tx, type: ContentType, base: string): Promise<string> {
    let candidate = truncateSlug(base.length === 0 ? fallbackSlug() : base);
    for (let i = 2; ; i += 1) {
      const existing = await tx.post.findUnique({
        where: { type_slug: { type, slug: candidate } },
        select: { id: true },
      });
      if (!existing) {
        return candidate;
      }
      const suffix = `-${i}`;
      candidate = truncateSlug(`${truncateSlug(base)}${suffix}`);
      if (candidate.length === 0) {
        candidate = fallbackSlug();
      }
    }
  }

  async function lockSlug(tx: Tx, type: ContentType, slug: string): Promise<void> {
    const key = slugLockKey(type, slug);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }

  async function createPost(principal: Principal, input: CreatePostInput): Promise<AdminPost> {
    requireCapability(principal, 'content.create');

    // Validate an explicit slug before any filter so a clearly invalid or
    // reserved slug returns the stable SLUG_INVALID/SLUG_RESERVED error (ADR 0003).
    if (input.slug !== undefined) {
      const check = validateExplicitSlug(input.slug);
      if (!check.ok) {
        throw new ContentError(
          check.reason === 'reserved' ? 'SLUG_RESERVED' : 'SLUG_INVALID',
          check.reason === 'reserved' ? 'That slug is reserved' : 'Invalid slug',
          check.reason === 'reserved' ? 409 : 400,
        );
      }
    }

    const baseSlug =
      input.slug === undefined ? deriveSlugFromTitle(input.title) : normalizeSlug(input.slug);

    const draft = await applyFilter('content.post.create', {
      type: input.type,
      title: input.title.trim(),
      slug: baseSlug,
      excerpt: input.excerpt ?? null,
      content: input.content ?? '',
      seoTitle: input.seoTitle ?? null,
      seoDescription: input.seoDescription ?? null,
      canonicalUrl: input.canonicalUrl ?? null,
      robots: input.robots ?? null,
      ogTitle: input.ogTitle ?? null,
      ogDescription: input.ogDescription ?? null,
    });

    const row = await prisma.$transaction(async (tx) => {
      await lockSlug(tx, draft.type, draft.slug);

      let slug = draft.slug;
      if (input.slug !== undefined) {
        const taken = await tx.post.findUnique({
          where: { type_slug: { type: draft.type, slug } },
          select: { id: true },
        });
        if (taken) {
          throw new ContentError('SLUG_TAKEN', 'That slug is already in use', 409);
        }
      } else {
        slug = await resolveDerivedSlug(tx, draft.type, draft.slug);
      }

      try {
        return await tx.post.create({
          data: {
            type: draft.type,
            title: draft.title.trim(),
            slug,
            excerpt: draft.excerpt,
            content: draft.content,
            seoTitle: draft.seoTitle,
            seoDescription: draft.seoDescription,
            canonicalUrl: draft.canonicalUrl,
            robots: draft.robots,
            ogTitle: draft.ogTitle,
            ogDescription: draft.ogDescription,
            authorId: principal.userId,
          },
          include: WITH_TERMS,
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ContentError('SLUG_TAKEN', 'That slug is already in use', 409);
        }
        throw error;
      }
    });

    await hooks.doAction('content.post.created', actionPayload(row, null));
    return toAdmin(row);
  }

  async function getPost(principal: Principal, id: string): Promise<AdminPost> {
    requireCapability(principal, 'content.read.any');
    const row = await prisma.post.findUnique({ where: { id }, include: WITH_TERMS });
    if (!row) {
      throw new ContentError('NOT_FOUND', 'Not found', 404);
    }
    // Hidden (non-readable) unpublished/trashed objects surface as 404 so
    // existence is not leaked (visibility policy, pre-Phase-3-acceptance fix).
    if (!canReadPost(principal, row.authorId, row.status)) {
      throw new ContentError('NOT_FOUND', 'Not found', 404);
    }
    return toAdmin(row);
  }

  async function updatePost(
    principal: Principal,
    id: string,
    input: UpdatePostInput,
  ): Promise<AdminPost> {
    const row = await prisma.$transaction(async (tx) => {
      const existing = await loadWithTerms(tx, id);
      if (!existing) {
        throw new ContentError('NOT_FOUND', 'Not found', 404);
      }
      canEditPost(principal, existing.authorId, existing.status);

      const requestedSlug = input.slug === undefined ? existing.slug : normalizeSlug(input.slug);

      const draft = await applyFilter('content.post.update', {
        type: existing.type as ContentType,
        title: (input.title ?? existing.title).trim(),
        slug: requestedSlug,
        excerpt: input.excerpt === undefined ? existing.excerpt : input.excerpt,
        content: input.content ?? existing.content,
        seoTitle: input.seoTitle === undefined ? existing.seoTitle : input.seoTitle,
        seoDescription:
          input.seoDescription === undefined ? existing.seoDescription : input.seoDescription,
        canonicalUrl: input.canonicalUrl === undefined ? existing.canonicalUrl : input.canonicalUrl,
        robots: input.robots === undefined ? existing.robots : input.robots,
        ogTitle: input.ogTitle === undefined ? existing.ogTitle : input.ogTitle,
        ogDescription:
          input.ogDescription === undefined ? existing.ogDescription : input.ogDescription,
      });

      if (input.slug !== undefined) {
        const check = validateExplicitSlug(input.slug);
        if (!check.ok) {
          throw new ContentError(
            check.reason === 'reserved' ? 'SLUG_RESERVED' : 'SLUG_INVALID',
            check.reason === 'reserved' ? 'That slug is reserved' : 'Invalid slug',
            check.reason === 'reserved' ? 409 : 400,
          );
        }
      }

      const slugChanged = draft.slug !== existing.slug;
      // Lock old + new slug keys in deterministic order to avoid deadlock.
      const lockTargets = slugChanged ? [existing.slug, draft.slug].sort() : [existing.slug];
      for (const slug of lockTargets) {
        await lockSlug(tx, existing.type as ContentType, slug);
      }

      if (slugChanged) {
        const taken = await tx.post.findFirst({
          where: { type: existing.type, slug: draft.slug, NOT: { id } },
          select: { id: true },
        });
        if (taken) {
          throw new ContentError('SLUG_TAKEN', 'That slug is already in use', 409);
        }
      }

      let updated;
      try {
        updated = await tx.post.updateMany({
          where: { id, version: input.baseVersion },
          data: {
            title: draft.title.trim(),
            slug: draft.slug,
            excerpt: draft.excerpt,
            content: draft.content,
            seoTitle: draft.seoTitle,
            seoDescription: draft.seoDescription,
            canonicalUrl: draft.canonicalUrl,
            robots: draft.robots,
            ogTitle: draft.ogTitle,
            ogDescription: draft.ogDescription,
            version: { increment: 1 },
          },
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ContentError('SLUG_TAKEN', 'That slug is already in use', 409);
        }
        throw error;
      }
      if (updated.count === 0) {
        throw new ContentError('VERSION_CONFLICT', 'Version conflict', 409);
      }

      // Record slug history for a published slug change (redirect resolution is Phase 7).
      if (slugChanged && existing.status === 'PUBLISHED') {
        await tx.postSlugHistory.create({
          data: { postId: id, oldSlug: existing.slug },
        });
      }

      const fresh = await loadWithTerms(tx, id);
      if (!fresh) {
        throw new ContentError('NOT_FOUND', 'Not found', 404);
      }
      return fresh;
    });

    await hooks.doAction('content.post.updated', actionPayload(row, null));
    return toAdmin(row);
  }

  async function listAdmin(principal: Principal, query: AdminListQuery): Promise<Paged<AdminPost>> {
    requireCapability(principal, 'content.read.any');

    // Build the filter as a list of AND conditions so the role-specific
    // visibility predicate (below) composes with the user's type/status/search
    // filters without overwriting them.
    const conditions: Prisma.PostWhereInput[] = [];
    if (query.type) {
      conditions.push({ type: query.type });
    }
    if (query.status) {
      conditions.push({ status: query.status });
    }
    if (query.search) {
      conditions.push({
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { excerpt: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }

    // Visibility: administrators/editors see every state; other read.any
    // holders (authors, contributors) see only their own content in any state
    // plus PUBLISHED content of others. Drafts/trashed content of other authors
    // are excluded from both rows and the total count.
    if (!FULL_VISIBILITY_ROLES.has(principal.role)) {
      conditions.push({
        OR: [{ authorId: principal.userId }, { status: 'PUBLISHED' }],
      });
    }

    const where: Prisma.PostWhereInput = conditions.length === 0 ? {} : { AND: conditions };

    const orderBy = [
      { [query.sort]: query.order } as Prisma.PostOrderByWithRelationInput,
      { id: query.order },
    ];

    const [rows, total] = await prisma.$transaction([
      prisma.post.findMany({
        where,
        include: WITH_TERMS,
        orderBy,
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
      prisma.post.count({ where }),
    ]);

    return {
      items: rows.map(toAdmin),
      pagination: {
        page: query.page,
        perPage: query.perPage,
        total,
        totalPages: Math.ceil(total / query.perPage),
      },
    };
  }

  async function transition(
    principal: Principal,
    id: string,
    baseVersion: number,
    apply: (current: {
      status: PostStatus;
      previousStatus: PostStatus | null;
      publishedAt: Date | null;
    }) => { status: PostStatus; extra: Record<string, unknown> } | 'noop' | 'invalid',
    action:
      | 'content.post.published'
      | 'content.post.unpublished'
      | 'content.post.trashed'
      | 'content.post.restored',
  ): Promise<AdminPost> {
    const outcome = await prisma.$transaction(async (tx) => {
      const existing = await loadWithTerms(tx, id);
      if (!existing) {
        throw new ContentError('NOT_FOUND', 'Not found', 404);
      }
      // Object-level transition authorization runs BEFORE the version check so
      // an unauthorized caller cannot use 409-vs-403 responses to probe an
      // object's version counter. Publish needs publish capability;
      // trash/restore/unpublish need trash capability (unpublishing returns a
      // post to draft, the inverse of publish, so it uses publish capability).
      if (action === 'content.post.published' || action === 'content.post.unpublished') {
        canTransition(principal, existing.authorId, 'publish');
      } else {
        canTransition(principal, existing.authorId, 'trash');
      }
      if (existing.version !== baseVersion) {
        throw new ContentError('VERSION_CONFLICT', 'Version conflict', 409);
      }
      const result = apply({
        status: existing.status,
        previousStatus: existing.previousStatus,
        publishedAt: existing.publishedAt,
      });
      if (result === 'invalid') {
        throw new ContentError('INVALID_TRANSITION', 'Invalid status transition', 409);
      }
      if (result === 'noop') {
        return { row: existing, changed: false };
      }
      const updated = await tx.post.updateMany({
        where: { id, version: baseVersion },
        data: { status: result.status, ...result.extra, version: { increment: 1 } },
      });
      if (updated.count === 0) {
        throw new ContentError('VERSION_CONFLICT', 'Version conflict', 409);
      }
      const fresh = await loadWithTerms(tx, id);
      if (!fresh) {
        throw new ContentError('NOT_FOUND', 'Not found', 404);
      }
      return { row: fresh, changed: true };
    });

    if (outcome.changed) {
      await hooks.doAction(action, actionPayload(outcome.row, null));
    }
    return toAdmin(outcome.row);
  }

  async function publish(
    principal: Principal,
    id: string,
    baseVersion: number,
  ): Promise<AdminPost> {
    const current = now();
    return transition(
      principal,
      id,
      baseVersion,
      ({ status, publishedAt }) => {
        if (status === 'TRASHED') {
          return 'invalid';
        }
        if (status === 'PUBLISHED') {
          return 'noop';
        }
        // Set publishedAt only on first publish; re-publish preserves history (ADR D-2).
        return {
          status: 'PUBLISHED',
          extra: publishedAt === null ? { publishedAt: current } : {},
        };
      },
      'content.post.published',
    );
  }

  async function unpublish(
    principal: Principal,
    id: string,
    baseVersion: number,
  ): Promise<AdminPost> {
    return transition(
      principal,
      id,
      baseVersion,
      ({ status }) => {
        if (status === 'TRASHED') {
          return 'invalid';
        }
        if (status === 'DRAFT') {
          return 'noop';
        }
        // Keep publishedAt as history; only status flips back to DRAFT.
        return { status: 'DRAFT', extra: {} };
      },
      'content.post.unpublished',
    );
  }

  async function trash(principal: Principal, id: string, baseVersion: number): Promise<AdminPost> {
    const current = now();
    return transition(
      principal,
      id,
      baseVersion,
      ({ status }) => {
        if (status === 'TRASHED') {
          return 'noop';
        }
        return {
          status: 'TRASHED',
          extra: { trashedAt: current, previousStatus: status },
        };
      },
      'content.post.trashed',
    );
  }

  async function restore(
    principal: Principal,
    id: string,
    baseVersion: number,
  ): Promise<AdminPost> {
    return transition(
      principal,
      id,
      baseVersion,
      ({ status, previousStatus }) => {
        if (status !== 'TRASHED') {
          return 'noop';
        }
        // Restore to the recorded previous status, falling back to DRAFT.
        const target = previousStatus === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT';
        return {
          status: target,
          extra: { trashedAt: null, previousStatus: null },
        };
      },
      'content.post.restored',
    );
  }

  async function assignTerms(
    principal: Principal,
    id: string,
    categoryIds: string[],
    tagIds: string[],
    baseVersion: number,
  ): Promise<AdminPost> {
    requireCapability(principal, 'taxonomy.assign');

    const row = await prisma.$transaction(async (tx) => {
      const existing = await tx.post.findUnique({
        where: { id },
        select: { id: true, type: true, authorId: true, status: true, version: true },
      });
      if (!existing) {
        throw new ContentError('NOT_FOUND', 'Not found', 404);
      }
      // Assigning terms edits the post, so the caller must also be allowed to edit it.
      canEditPost(principal, existing.authorId, existing.status);
      if (existing.version !== baseVersion) {
        throw new ContentError('VERSION_CONFLICT', 'Version conflict', 409);
      }

      const allIds = [...categoryIds, ...tagIds];
      const terms =
        allIds.length === 0 ? [] : await tx.term.findMany({ where: { id: { in: allIds } } });
      const byId = new Map(terms.map((term) => [term.id, term]));

      for (const termId of allIds) {
        if (!byId.has(termId)) {
          throw new ContentError('TERM_NOT_FOUND', 'Term not found', 400);
        }
      }
      for (const termId of categoryIds) {
        if (byId.get(termId)?.taxonomy !== 'category') {
          throw new ContentError('TERM_TAXONOMY_MISMATCH', 'Term taxonomy mismatch', 400);
        }
      }
      for (const termId of tagIds) {
        if (byId.get(termId)?.taxonomy !== 'tag') {
          throw new ContentError('TERM_TAXONOMY_MISMATCH', 'Term taxonomy mismatch', 400);
        }
      }

      const updated = await tx.post.updateMany({
        where: { id, version: baseVersion },
        data: { version: { increment: 1 } },
      });
      if (updated.count === 0) {
        throw new ContentError('VERSION_CONFLICT', 'Version conflict', 409);
      }

      await tx.postTerm.deleteMany({ where: { postId: id } });
      const data = [
        ...categoryIds.map((termId, index) => ({ postId: id, termId, position: index })),
        ...tagIds.map((termId, index) => ({
          postId: id,
          termId,
          position: categoryIds.length + index,
        })),
      ];
      if (data.length > 0) {
        await tx.postTerm.createMany({ data });
      }

      const fresh = await loadWithTerms(tx, id);
      if (!fresh) {
        throw new ContentError('NOT_FOUND', 'Not found', 404);
      }
      return fresh;
    });

    await hooks.doAction('content.post.terms_updated', {
      postId: row.id,
      type: row.type as ContentType,
      categoryIds,
      tagIds,
    });
    return toAdmin(row);
  }

  async function listPublic(query: PublicListQuery): Promise<Paged<PublicPost>> {
    const current = now();
    const where: Prisma.PostWhereInput = {
      status: 'PUBLISHED',
      publishedAt: { lte: current },
    };
    if (query.type) {
      where.type = query.type;
    }
    const [rows, total] = await prisma.$transaction([
      prisma.post.findMany({
        where,
        include: WITH_TERMS,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
      prisma.post.count({ where }),
    ]);
    return {
      items: rows.map((row) => toPublic(row, options.logger)),
      pagination: {
        page: query.page,
        perPage: query.perPage,
        total,
        totalPages: Math.ceil(total / query.perPage),
      },
    };
  }

  async function getPublicBySlug(type: ContentType, slug: string): Promise<PublicPost> {
    const current = now();
    const row = await prisma.post.findFirst({
      where: { type, slug, status: 'PUBLISHED', publishedAt: { lte: current } },
      include: WITH_TERMS,
    });
    if (!row) {
      throw new ContentError('NOT_FOUND', 'Not found', 404);
    }
    return toPublic(row, options.logger);
  }

  return {
    createPost,
    getPost,
    updatePost,
    listAdmin,
    publish,
    unpublish,
    trash,
    restore,
    assignTerms,
    listPublic,
    getPublicBySlug,
  };
}

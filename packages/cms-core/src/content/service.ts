import type { DatabaseClient, PostStatus, Prisma } from '@mernpress/database';
import { matchPostPath, postPath } from '@mernpress/contracts';
import { validateBlockMarkup } from '@mernpress/block-system/validate';
import { renderBlockMarkup } from '@mernpress/block-system/render';
import { structureUnchanged } from '@mernpress/block-system/structure';
import type { HookRegistry } from '../hooks/types.js';
import { HookRejectedError } from '../hooks/types.js';
import {
  FULL_VISIBILITY_ROLES,
  canReadPost,
  ownsObject,
  requireCapability,
  roleHasCapability,
} from '../auth/capabilities.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { ContentError } from './errors.js';
import {
  captureRevision,
  findPostRevision,
  listPostRevisions,
  revisionFieldsChanged,
} from './revisions.js';
import {
  generatePreviewToken,
  isPreviewTokenFormat,
  previewPathFor,
  safeEqualPreviewToken,
} from './preview.js';
import {
  deriveSlugFromTitle,
  fallbackSlug,
  isReservedSlug,
  normalizeSlug,
  truncateSlug,
  validateExplicitSlug,
} from './slug.js';
import { POST_FORMATS } from './types.js';
import type {
  AdminListQuery,
  AdminPost,
  AdminRevision,
  AdminRevisionDetail,
  AdminTermSummary,
  ContentType,
  CreatePostInput,
  Paged,
  PostActionPayload,
  PostFormat,
  PostFilterDraft,
  PreviewLinkResult,
  Principal,
  PublicListQuery,
  PublicPost,
  PublicTerm,
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
  /** Called after a published post/page slug changes (redirect creation). */
  onSlugChanged?: (change: {
    type: ContentType;
    id: string;
    oldSlug: string;
    newSlug: string;
    publishedAt: string | null;
    categorySlug: string | null;
  }) => Promise<void>;
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
  listRevisions(principal: Principal, postId: string): Promise<AdminRevision[]>;
  getRevision(
    principal: Principal,
    postId: string,
    revisionId: string,
  ): Promise<AdminRevisionDetail>;
  restoreRevision(
    principal: Principal,
    postId: string,
    revisionId: string,
    baseVersion: number,
  ): Promise<AdminPost>;
  rotatePreviewToken(principal: Principal, postId: string): Promise<PreviewLinkResult>;
  revokePreviewToken(principal: Principal, postId: string): Promise<PreviewLinkResult>;
  getPreviewPost(token: string): Promise<PublicPost>;
  listPublic(query: PublicListQuery): Promise<Paged<PublicPost>>;
  getPublicBySlug(type: ContentType, slug: string): Promise<PublicPost>;
  /** Resolve a structured public URL (middleware rewrites). */
  resolvePublicPath(
    pattern: string,
    pathname: string,
  ): Promise<{ slug: string; canonicalPath: string } | null>;
  /** Resolve the Plain permalink form `?p=<id>`. */
  resolvePublicId(
    pattern: string,
    id: string,
  ): Promise<{ slug: string; canonicalPath: string } | null>;
  /** Resolve a slug to its canonical path (internal-path redirects). */
  resolvePublicSlug(
    pattern: string,
    slug: string,
  ): Promise<{ slug: string; canonicalPath: string } | null>;
  unlockPublicPost(
    slug: string,
    password: string,
  ): Promise<{ renderedContent: string; toc: PublicPost['toc'] }>;
  getPublicTerm(taxonomy: 'category' | 'tag', slug: string): Promise<PublicTerm | null>;
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
  include: {
    terms: { include: { term: true } };
    featuredMedia: true;
    author: {
      select: { id: true; username: true; displayName: true; bio: true; website: true };
    };
  };
}>;

/** URL of a media file (public serving route, relative path). */
function mediaUrl(item: { id: string; fileName: string }): string {
  return `/api/media/${item.id}/${item.fileName}`;
}

function mediaDerivatives(
  item: NonNullable<PostWithTerms['featuredMedia']>,
): Record<string, string> {
  const raw = item.derivatives;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [width, path] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof path === 'string') {
      const fileName = path.split('/').pop() ?? path;
      out[width] = `/api/media/${item.id}/${fileName}`;
    }
  }
  return out;
}

function toFeaturedImage(item: NonNullable<PostWithTerms['featuredMedia']>) {
  return {
    id: item.id,
    url: mediaUrl(item),
    width: item.width,
    height: item.height,
    altText: item.altText,
    derivatives: mediaDerivatives(item),
  };
}

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

function toAdmin(row: PostWithTerms, options: { includePreviewToken?: boolean } = {}): AdminPost {
  const post: AdminPost = {
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
    commentStatus: row.commentStatus === 'closed' ? 'closed' : 'open',
    sticky: row.sticky,
    structureLocked: row.structureLocked,
    passwordProtected: row.passwordHash !== null,
    isPrivate: row.isPrivate,
    format: (POST_FORMATS as readonly string[]).includes(row.format)
      ? (row.format as PostFormat)
      : 'standard',
    trashedAt: row.trashedAt?.toISOString() ?? null,
    previousStatus: row.previousStatus,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    terms: splitTerms(row),
    featuredMedia: row.featuredMedia ? toFeaturedImage(row.featuredMedia) : null,
    author: row.author ? { id: row.author.id, username: row.author.username } : null,
  };
  // The preview token is admin-only single-post data; list responses must not
  // carry it (P8-03).
  if (options.includePreviewToken === true) {
    post.previewToken = row.previewToken;
  }
  return post;
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
  // A password-protected post never ships its body to an unauthenticated list
  // or detail request; `unlockPublicPost` returns it after verification.
  const rendered =
    row.passwordHash !== null
      ? { html: '', toc: [] as PublicPost['toc'], warnings: [] as string[] }
      : renderForPublic(row);
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
    featuredImage: row.featuredMedia ? toFeaturedImage(row.featuredMedia) : null,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    canonicalUrl: row.canonicalUrl,
    robots: row.robots,
    ogTitle: row.ogTitle,
    ogDescription: row.ogDescription,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    commentStatus: row.commentStatus === 'closed' ? 'closed' : 'open',
    sticky: row.sticky,
    passwordProtected: row.passwordHash !== null,
    format: (POST_FORMATS as readonly string[]).includes(row.format)
      ? (row.format as PostFormat)
      : 'standard',
    updatedAt: row.updatedAt.toISOString(),
    author: row.author
      ? {
          id: row.author.id,
          username: row.author.username,
          displayName: row.author.displayName,
          bio: row.author.bio,
          website: row.author.website,
        }
      : null,
    terms: splitTerms(row),
  };
}

const WITH_TERMS = {
  terms: { include: { term: true }, orderBy: { position: 'asc' as const } },
  featuredMedia: true,
  author: {
    select: { id: true, username: true, displayName: true, bio: true, website: true },
  },
};

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
    const format = input.format ?? 'standard';
    if (!(POST_FORMATS as readonly string[]).includes(format)) {
      throw new ContentError('VALIDATION_ERROR', 'Invalid post format', 400);
    }

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
            format,
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
    return toAdmin(row, { includePreviewToken: true });
  }

  async function updatePost(
    principal: Principal,
    id: string,
    input: UpdatePostInput,
  ): Promise<AdminPost> {
    let previousSlugForRedirect: string | null = null;
    const row = await prisma.$transaction(async (tx) => {
      const existing = await loadWithTerms(tx, id);
      if (!existing) {
        throw new ContentError('NOT_FOUND', 'Not found', 404);
      }
      canEditPost(principal, existing.authorId, existing.status);

      let publishedAtUpdate: Date | null | undefined;
      if (input.publishedAt !== undefined) {
        if (input.publishedAt === null) {
          publishedAtUpdate = null;
        } else {
          const parsed = new Date(input.publishedAt);
          if (Number.isNaN(parsed.getTime())) {
            throw new ContentError('VALIDATION_ERROR', 'Invalid publish date', 400);
          }
          publishedAtUpdate = parsed;
        }
      }

      let authorIdUpdate: string | null | undefined;
      if (input.authorId !== undefined) {
        if (input.authorId !== null && input.authorId !== existing.authorId) {
          if (!roleHasCapability(principal.role, 'content.edit.any')) {
            throw new ContentError('FORBIDDEN', 'Forbidden', 403);
          }
          const author = await tx.user.findUnique({
            where: { id: input.authorId },
            select: { id: true, status: true },
          });
          if (!author || author.status !== 'active') {
            throw new ContentError('VALIDATION_ERROR', 'Invalid author', 400);
          }
        }
        authorIdUpdate = input.authorId;
      }

      const commentStatus =
        input.commentStatus === undefined ? existing.commentStatus : input.commentStatus;
      if (commentStatus !== 'open' && commentStatus !== 'closed') {
        throw new ContentError('VALIDATION_ERROR', 'Invalid comment status', 400);
      }
      const sticky = input.sticky === undefined ? existing.sticky : input.sticky;
      const isPrivate = input.isPrivate === undefined ? existing.isPrivate : input.isPrivate;
      const format =
        input.format === undefined
          ? (POST_FORMATS as readonly string[]).includes(existing.format)
            ? (existing.format as PostFormat)
            : 'standard'
          : input.format;
      if (!(POST_FORMATS as readonly string[]).includes(format)) {
        throw new ContentError('VALIDATION_ERROR', 'Invalid post format', 400);
      }
      let passwordHashUpdate: string | null | undefined;
      if (input.password !== undefined) {
        const password = input.password === null ? '' : input.password.trim();
        if (password.length > 100) {
          throw new ContentError('VALIDATION_ERROR', 'The password is too long', 400);
        }
        passwordHashUpdate = password.length === 0 ? null : await hashPassword(password);
      }

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

      // Safe client editing: while the structure is locked, only text/innerHTML
      // may change. Adding, removing, reordering, nesting or restyling a block
      // is a structural edit and is rejected. The server enforces this; the
      // editor's guard is only a convenience.
      if (
        existing.structureLocked &&
        draft.content !== existing.content &&
        !structureUnchanged(existing.content, draft.content)
      ) {
        throw new ContentError(
          'STRUCTURE_LOCKED',
          'This post’s block structure is locked. You can edit text, but not add, remove, move or restyle blocks.',
          409,
        );
      }

      const structureLocked =
        input.structureLocked === undefined ? existing.structureLocked : input.structureLocked;
      if (
        input.structureLocked !== undefined &&
        input.structureLocked !== existing.structureLocked
      ) {
        requireCapability(principal, 'content.edit.any');
      }

      const slugChanged = draft.slug !== existing.slug;
      // Revisions snapshot only content-bearing edits. Terms-only, status and
      // slug-only operations must not create a revision (P8-01).
      const snapshotFieldsChanged = revisionFieldsChanged(draft, existing);

      // Featured image: validate existence when set (null clears, undefined keeps).
      let featuredMediaIdUpdate: string | null | undefined;
      if (input.featuredMediaId !== undefined) {
        if (input.featuredMediaId === null) {
          featuredMediaIdUpdate = null;
        } else {
          const media = await tx.mediaItem.findUnique({
            where: { id: input.featuredMediaId },
            select: { id: true },
          });
          if (!media) {
            throw new ContentError('NOT_FOUND', 'Media item not found', 404);
          }
          featuredMediaIdUpdate = input.featuredMediaId;
        }
      }
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
            ...(snapshotFieldsChanged ? { revisionCount: { increment: 1 } } : {}),
            ...(featuredMediaIdUpdate === undefined
              ? {}
              : { featuredMediaId: featuredMediaIdUpdate }),
            ...(publishedAtUpdate === undefined ? {} : { publishedAt: publishedAtUpdate }),
            ...(authorIdUpdate === undefined ? {} : { authorId: authorIdUpdate }),
            ...(passwordHashUpdate === undefined ? {} : { passwordHash: passwordHashUpdate }),
            commentStatus,
            sticky,
            structureLocked,
            isPrivate,
            format,
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

      previousSlugForRedirect = existing.slug;
      // Record slug history for a published slug change (redirect resolution is Phase 7).
      if (slugChanged && existing.status === 'PUBLISHED') {
        await tx.postSlugHistory.create({
          data: { postId: id, oldSlug: existing.slug },
        });
      }

      // Snapshot the PRE-update state inside the same transaction. The
      // snapshot is written after a successful version-checked update so a
      // version conflict leaves no revision behind.
      if (snapshotFieldsChanged) {
        await captureRevision(tx, existing);
      }

      const fresh = await loadWithTerms(tx, id);
      if (!fresh) {
        throw new ContentError('NOT_FOUND', 'Not found', 404);
      }
      return fresh;
    });

    await hooks.doAction('content.post.updated', actionPayload(row, null));
    if (
      options.onSlugChanged &&
      previousSlugForRedirect !== null &&
      previousSlugForRedirect !== row.slug &&
      row.status === 'PUBLISHED'
    ) {
      try {
        await options.onSlugChanged({
          type: row.type as ContentType,
          id: row.id,
          oldSlug: previousSlugForRedirect,
          newSlug: row.slug,
          publishedAt: row.publishedAt?.toISOString() ?? null,
          categorySlug:
            row.terms.find((entry) => entry.term.taxonomy === 'category')?.term.slug ?? null,
        });
      } catch (error) {
        options.logger?.warn('automatic redirect failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
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
    if (query.category) {
      conditions.push({ terms: { some: { termId: query.category } } });
    }
    if (query.tag) {
      conditions.push({ terms: { some: { termId: query.tag } } });
    }
    if (query.author) {
      conditions.push({ authorId: query.author });
    }
    if (query.month && /^\d{4}-\d{2}$/.test(query.month)) {
      const [year, month] = query.month.split('-').map(Number);
      const start = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, 1));
      const end = new Date(Date.UTC(year ?? 1970, month ?? 1, 1));
      conditions.push({ updatedAt: { gte: start, lt: end } });
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
      items: rows.map((row) => toAdmin(row)),
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

  /**
   * Read access to a post for the revision views: `content.read.any` plus the
   * visibility policy. Hidden objects surface as 404 (never 403), matching
   * `getPost`.
   */
  async function requireReadablePost(
    principal: Principal,
    postId: string,
  ): Promise<{ authorId: string | null; status: PostStatus }> {
    requireCapability(principal, 'content.read.any');
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true, status: true },
    });
    if (!post || !canReadPost(principal, post.authorId, post.status)) {
      throw new ContentError('NOT_FOUND', 'Not found', 404);
    }
    return post;
  }

  async function listRevisions(principal: Principal, postId: string): Promise<AdminRevision[]> {
    await requireReadablePost(principal, postId);
    return listPostRevisions(prisma, postId);
  }

  async function getRevision(
    principal: Principal,
    postId: string,
    revisionId: string,
  ): Promise<AdminRevisionDetail> {
    await requireReadablePost(principal, postId);
    const revision = await findPostRevision(prisma, postId, revisionId);
    if (!revision) {
      throw new ContentError('NOT_FOUND', 'Not found', 404);
    }
    return revision;
  }

  async function restoreRevision(
    principal: Principal,
    postId: string,
    revisionId: string,
    baseVersion: number,
  ): Promise<AdminPost> {
    // Authorize against the post BEFORE looking the revision up so an
    // unauthorized caller cannot probe revision ids. Authorization is the same
    // canEditPost policy (and error shape) as updatePost.
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true, status: true },
    });
    if (!post) {
      throw new ContentError('NOT_FOUND', 'Not found', 404);
    }
    canEditPost(principal, post.authorId, post.status);

    const revision = await prisma.postRevision.findFirst({
      where: { id: revisionId, postId },
    });
    if (!revision) {
      throw new ContentError('NOT_FOUND', 'Not found', 404);
    }

    // Restore through the normal update path: it re-authorizes, enforces the
    // version check, snapshots the PRE-restore state and bumps the version, so
    // a restore is itself undoable.
    return updatePost(principal, postId, {
      baseVersion,
      title: revision.title,
      excerpt: revision.excerpt,
      content: revision.content,
      seoTitle: revision.seoTitle,
      seoDescription: revision.seoDescription,
      canonicalUrl: revision.canonicalUrl,
      robots: revision.robots,
      ogTitle: revision.ogTitle,
      ogDescription: revision.ogDescription,
    });
  }

  /**
   * Preferred preview URL: the web app's /preview/<token> route, absolute
   * when the site_url option is configured. The API JSON preview endpoint
   * remains the machine-readable contract. Option values are JSON-encoded at
   * rest (options service contract), so the raw column needs decoding.
   */
  async function previewUrlFor(token: string): Promise<string> {
    const option = await prisma.option.findUnique({ where: { key: 'site_url' } });
    let base = '';
    if (option?.value) {
      try {
        const decoded: unknown = JSON.parse(option.value);
        if (typeof decoded === 'string') {
          base = decoded.trim().replace(/\/+$/, '');
        }
      } catch {
        base = '';
      }
    }
    return base ? `${base}/preview/${token}` : `/preview/${token}`;
  }

  async function rotatePreviewToken(
    principal: Principal,
    postId: string,
  ): Promise<PreviewLinkResult> {
    const previewToken = generatePreviewToken();
    await prisma.$transaction(async (tx) => {
      const existing = await loadWithTerms(tx, postId);
      if (!existing) {
        throw new ContentError('NOT_FOUND', 'Not found', 404);
      }
      canEditPost(principal, existing.authorId, existing.status);
      await tx.post.update({ where: { id: postId }, data: { previewToken } });
    });
    return {
      previewToken,
      previewPath: previewPathFor(previewToken),
      previewUrl: await previewUrlFor(previewToken),
    };
  }

  async function revokePreviewToken(
    principal: Principal,
    postId: string,
  ): Promise<PreviewLinkResult> {
    await prisma.$transaction(async (tx) => {
      const existing = await loadWithTerms(tx, postId);
      if (!existing) {
        throw new ContentError('NOT_FOUND', 'Not found', 404);
      }
      canEditPost(principal, existing.authorId, existing.status);
      await tx.post.update({ where: { id: postId }, data: { previewToken: null } });
    });
    return { previewToken: null, previewPath: null, previewUrl: null };
  }

  /**
   * Public draft preview (P8-03). Same renderer/DTO as `getPublicBySlug`
   * (renderedContent is sanitized) but without the published/schedule gate and
   * for any status except TRASHED. Malformed tokens are a 400; unknown,
   * revoked and trashed posts share the draft 404 shape.
   */
  async function getPreviewPost(token: string): Promise<PublicPost> {
    if (!isPreviewTokenFormat(token)) {
      throw new ContentError('VALIDATION_ERROR', 'Invalid preview token', 400);
    }
    const row = await prisma.post.findUnique({
      where: { previewToken: token },
      include: WITH_TERMS,
    });
    if (!row || row.status === 'TRASHED' || !safeEqualPreviewToken(token, row.previewToken)) {
      throw new ContentError('NOT_FOUND', 'Not found', 404);
    }
    return toPublic(row, options.logger);
  }

  /** Verify a post password and return the body only on success. */
  async function unlockPublicPost(
    slug: string,
    password: string,
  ): Promise<{ renderedContent: string; toc: PublicPost['toc'] }> {
    const current = now();
    const row = await prisma.post.findFirst({
      where: {
        slug,
        status: 'PUBLISHED',
        isPrivate: false,
        publishedAt: { lte: current },
      },
      include: WITH_TERMS,
    });
    if (!row || row.passwordHash === null) {
      throw new ContentError('NOT_FOUND', 'Not found', 404);
    }
    if (!(await verifyPassword(row.passwordHash, password))) {
      throw new ContentError('FORBIDDEN', 'Incorrect password', 403);
    }
    const rendered = renderForPublic(row);
    return { renderedContent: rendered.html, toc: rendered.toc };
  }

  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function primaryCategorySlug(row: PostWithTerms): string | null {
    const category = row.terms.find((entry) => entry.term.taxonomy === 'category');
    return category?.term.slug ?? null;
  }

  function publicPathFor(row: PostWithTerms, pattern: string): string {
    return postPath(pattern, {
      id: row.id,
      slug: row.slug,
      publishedAt: row.publishedAt,
      createdAt: row.createdAt,
      categorySlug: primaryCategorySlug(row),
    });
  }

  async function publishedPostById(id: string): Promise<PostWithTerms | null> {
    if (!UUID_PATTERN.test(id)) return null;
    return prisma.post.findFirst({
      where: {
        id,
        type: 'post',
        status: 'PUBLISHED',
        isPrivate: false,
        publishedAt: { lte: now() },
      },
      include: WITH_TERMS,
    });
  }

  function dateMatches(
    row: PostWithTerms,
    matched: {
      year?: string;
      month?: string;
      day?: string;
      hour?: string;
      minute?: string;
      second?: string;
    },
  ): boolean {
    const wantsDate =
      matched.year ||
      matched.month ||
      matched.day ||
      matched.hour ||
      matched.minute ||
      matched.second;
    if (!wantsDate) return true;
    if (!row.publishedAt) return false;
    const date = row.publishedAt;
    const pad = (value: number) => String(value).padStart(2, '0');
    if (matched.year && matched.year !== String(date.getUTCFullYear())) return false;
    if (matched.month && matched.month !== pad(date.getUTCMonth() + 1)) return false;
    if (matched.day && matched.day !== pad(date.getUTCDate())) return false;
    if (matched.hour && matched.hour !== pad(date.getUTCHours())) return false;
    if (matched.minute && matched.minute !== pad(date.getUTCMinutes())) return false;
    if (matched.second && matched.second !== pad(date.getUTCSeconds())) return false;
    return true;
  }

  async function resolvePublicPath(
    pattern: string,
    pathname: string,
  ): Promise<{ slug: string; canonicalPath: string } | null> {
    if (pattern === '') return null;
    const matched = matchPostPath(pattern, pathname);
    if (!matched) return null;

    let row: PostWithTerms | null = null;
    if (matched.id) {
      row = await publishedPostById(matched.id);
    } else if (matched.slug) {
      // With root-level post names a page takes precedence, matching WordPress's
      // rewrite order. Draft pages never shadow a public post.
      if (pattern === '/%postname%/') {
        const page = await prisma.post.findFirst({
          where: { type: 'page', slug: matched.slug, status: 'PUBLISHED' },
          select: { id: true },
        });
        if (page) return null;
      }
      row = await prisma.post.findFirst({
        where: {
          type: 'post',
          slug: matched.slug,
          status: 'PUBLISHED',
          isPrivate: false,
          publishedAt: { lte: now() },
        },
        include: WITH_TERMS,
      });
    }
    if (!row) return null;
    if (!dateMatches(row, matched)) return null;
    if (matched.category) {
      const categories = row.terms
        .filter((entry) => entry.term.taxonomy === 'category')
        .map((entry) => entry.term.slug);
      if (!categories.includes(matched.category)) return null;
    }
    return { slug: row.slug, canonicalPath: publicPathFor(row, pattern) };
  }

  async function resolvePublicId(
    pattern: string,
    id: string,
  ): Promise<{ slug: string; canonicalPath: string } | null> {
    const row = await publishedPostById(id);
    return row ? { slug: row.slug, canonicalPath: publicPathFor(row, pattern) } : null;
  }

  async function resolvePublicSlug(
    pattern: string,
    slug: string,
  ): Promise<{ slug: string; canonicalPath: string } | null> {
    const row = await prisma.post.findFirst({
      where: {
        type: 'post',
        slug,
        status: 'PUBLISHED',
        isPrivate: false,
        publishedAt: { lte: now() },
      },
      include: WITH_TERMS,
    });
    return row ? { slug: row.slug, canonicalPath: publicPathFor(row, pattern) } : null;
  }

  async function listPublic(query: PublicListQuery): Promise<Paged<PublicPost>> {
    const current = now();
    const where: Prisma.PostWhereInput = {
      status: 'PUBLISHED',
      isPrivate: false,
      publishedAt: { lte: current },
    };
    if (query.type) {
      where.type = query.type;
    }
    const filters: Prisma.PostWhereInput[] = [];
    if (query.search) {
      filters.push({
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { excerpt: { contains: query.search, mode: 'insensitive' } },
          { content: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    if (query.category) {
      filters.push({
        terms: { some: { term: { taxonomy: 'category', slug: query.category } } },
      });
    }
    if (query.tag) {
      filters.push({
        terms: { some: { term: { taxonomy: 'tag', slug: query.tag } } },
      });
    }
    if (query.author) {
      filters.push({ author: { username: query.author } });
    }
    if (filters.length > 0) {
      where.AND = filters;
    }
    const [rows, total] = await prisma.$transaction([
      prisma.post.findMany({
        where,
        include: WITH_TERMS,
        orderBy:
          query.type === 'page'
            ? [{ publishedAt: 'desc' }, { id: 'desc' }]
            : [{ sticky: 'desc' }, { publishedAt: 'desc' }, { id: 'desc' }],
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

  async function getPublicTerm(
    taxonomy: 'category' | 'tag',
    slug: string,
  ): Promise<PublicTerm | null> {
    const term = await prisma.term.findFirst({
      where: { taxonomy, slug },
      select: { name: true, slug: true, description: true },
    });
    return term ?? null;
  }

  async function getPublicBySlug(type: ContentType, slug: string): Promise<PublicPost> {
    const current = now();
    const row = await prisma.post.findFirst({
      where: {
        type,
        slug,
        status: 'PUBLISHED',
        isPrivate: false,
        publishedAt: { lte: current },
      },
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
    listRevisions,
    getRevision,
    restoreRevision,
    rotatePreviewToken,
    revokePreviewToken,
    getPreviewPost,
    listPublic,
    getPublicBySlug,
    resolvePublicPath,
    resolvePublicId,
    resolvePublicSlug,
    unlockPublicPost,
    getPublicTerm,
  };
}

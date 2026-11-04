import { Prisma, type DatabaseClient } from '@mernpress/database';
import type { HookRegistry } from '../hooks/types.js';
import { requireCapability } from '../auth/capabilities.js';
import { ContentError } from '../content/errors.js';
import { isReservedSlug, normalizeSlug } from '../content/slug.js';
import type { Principal } from '../content/types.js';
import type {
  AdminTerm,
  CreateTermInput,
  TaxonomyType,
  TermFilterDraft,
  TermListQuery,
  UpdateTermInput,
} from './types.js';

const TERM_LOCK_PREFIX = 'mernpress.taxonomy.slug';
const NAME_MAX = 200;
const DESCRIPTION_MAX = 2000;
const SEARCH_MAX = 200;
const MAX_CYCLE_DEPTH = 100;

export interface TaxonomyServiceOptions {
  prisma: DatabaseClient;
  hooks: HookRegistry;
  now?: () => Date;
}

export function createTaxonomyService(options: TaxonomyServiceOptions) {
  const { prisma, hooks } = options;

  function requireAdmin(principal: Principal): void {
    // Taxonomy management requires the taxonomy.manage capability (ADR 0004).
    requireCapability(principal, 'taxonomy.manage');
  }

  function assertTaxonomy(taxonomy: string): asserts taxonomy is TaxonomyType {
    if (taxonomy !== 'category' && taxonomy !== 'tag') {
      throw new ContentError('VALIDATION_ERROR', 'taxonomy must be category or tag.', 400);
    }
  }

  function revalidateDraft(draft: TermFilterDraft): void {
    assertTaxonomy(draft.taxonomy);
    if (draft.name.trim().length === 0) {
      throw new ContentError('VALIDATION_ERROR', 'name is required.', 400);
    }
    if (draft.name.length > NAME_MAX) {
      throw new ContentError(
        'VALIDATION_ERROR',
        `name must be at most ${NAME_MAX} characters.`,
        400,
      );
    }
    if (draft.slug.length === 0 || draft.slug.length > 200) {
      throw new ContentError('VALIDATION_ERROR', 'slug is invalid.', 400);
    }
    if (isReservedSlug(draft.slug)) {
      throw new ContentError('VALIDATION_ERROR', `The slug "${draft.slug}" is reserved.`, 400);
    }
    if (draft.taxonomy === 'tag' && draft.parentId !== null) {
      throw new ContentError('TERM_PARENT_INVALID', 'Tags are flat and cannot have a parent.', 400);
    }
  }

  type TermWithCount = Prisma.TermGetPayload<{ include: { _count: { select: { posts: true } } } }>;

  function toAdminTerm(term: TermWithCount): AdminTerm {
    return {
      id: term.id,
      taxonomy: term.taxonomy as TaxonomyType,
      name: term.name,
      slug: term.slug,
      description: term.description,
      parentId: term.parentId,
      postCount: term._count.posts,
      createdAt: term.createdAt.toISOString(),
      updatedAt: term.updatedAt.toISOString(),
    };
  }

  const includeCount = { _count: { select: { posts: true } } } as const;

  async function lockSlug(
    tx: Prisma.TransactionClient,
    taxonomy: TaxonomyType,
    slug: string,
  ): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${TERM_LOCK_PREFIX}:${taxonomy}:${slug}`}::text))`;
  }

  function rethrowSlugConflict(error: unknown, slug: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ContentError(
        'TERM_SLUG_TAKEN',
        `A term with the slug "${slug}" already exists in this taxonomy.`,
        409,
      );
    }
    throw error;
  }

  async function slugTaken(
    tx: Prisma.TransactionClient,
    taxonomy: TaxonomyType,
    slug: string,
    parentId: string | null,
    excludeId?: string,
  ): Promise<boolean> {
    // Symmetric reservation: a slug is taken within a taxonomy if ANY term with
    // that slug exists (root or child). This keeps the invariant "a slug names at
    // most one term per taxonomy", so a child can never be promoted to a duplicate
    // root when its parent is deleted (parent_id SET NULL).
    const existing = await tx.term.findFirst({
      where: {
        taxonomy,
        slug,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    return existing !== null;
  }

  /** Walk ancestors (bounded) to prove `parentId` does not create a cycle for `termId`. */
  async function assertNoCycle(
    tx: Prisma.TransactionClient,
    termId: string,
    parentId: string,
  ): Promise<void> {
    if (parentId === termId) {
      throw new ContentError('TERM_PARENT_CYCLE', 'A term cannot be its own parent.', 409);
    }
    let current: string | null = parentId;
    for (let depth = 0; depth < MAX_CYCLE_DEPTH; depth += 1) {
      if (current === null) {
        return;
      }
      if (current === termId) {
        throw new ContentError('TERM_PARENT_CYCLE', 'The chosen parent would create a cycle.', 409);
      }
      const next: { parentId: string | null } | null = await tx.term.findUnique({
        where: { id: current },
        select: { parentId: true },
      });
      current = next ? next.parentId : null;
    }
    throw new ContentError('TERM_PARENT_CYCLE', 'The category hierarchy is too deep.', 409);
  }

  /**
   * Per-taxonomy hierarchy lock. Serializes category parent changes within one
   * taxonomy so the cycle walk in `assertNoCycle` is race-safe: two concurrent
   * reparent operations (A→B and B→A) cannot both commit and form a cycle.
   */
  async function lockHierarchy(
    tx: Prisma.TransactionClient,
    taxonomy: TaxonomyType,
  ): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mernpress.taxonomy.tree:${taxonomy}`}::text))`;
  }

  async function resolveParent(
    tx: Prisma.TransactionClient,
    taxonomy: TaxonomyType,
    parentId: string | null,
    termId?: string,
  ): Promise<void> {
    if (parentId === null) {
      return;
    }
    if (taxonomy === 'tag') {
      throw new ContentError('TERM_PARENT_INVALID', 'Tags are flat and cannot have a parent.', 400);
    }
    // Serialize hierarchy mutations before walking ancestors.
    await lockHierarchy(tx, taxonomy);
    const parent = await tx.term.findUnique({
      where: { id: parentId },
      select: { id: true, taxonomy: true },
    });
    if (!parent) {
      throw new ContentError('TERM_PARENT_INVALID', 'The parent term does not exist.', 400);
    }
    if (parent.taxonomy !== 'category') {
      throw new ContentError('TERM_PARENT_INVALID', 'The parent must be a category.', 400);
    }
    if (termId) {
      await assertNoCycle(tx, termId, parentId);
    }
  }

  // ---- create ----

  async function createTerm(principal: Principal, input: CreateTermInput): Promise<AdminTerm> {
    requireAdmin(principal);
    assertTaxonomy(input.taxonomy);

    const slug = normalizeSlug(input.slug ?? input.name);
    let draft: TermFilterDraft = {
      taxonomy: input.taxonomy,
      name: input.name.trim(),
      slug,
      description:
        input.description === undefined || input.description === null
          ? null
          : input.description.trim().slice(0, DESCRIPTION_MAX) || null,
      parentId: input.parentId ?? null,
    };

    draft = await hooks.applyFilters('taxonomy.term.create', draft);
    revalidateDraft(draft);

    const term = await prisma
      .$transaction(async (tx) => {
        await lockSlug(tx, draft.taxonomy, draft.slug);
        await resolveParent(tx, draft.taxonomy, draft.parentId);
        if (await slugTaken(tx, draft.taxonomy, draft.slug, draft.parentId)) {
          throw new ContentError(
            'TERM_SLUG_TAKEN',
            `A term with the slug "${draft.slug}" already exists in this taxonomy.`,
            409,
          );
        }
        return tx.term.create({
          data: {
            taxonomy: draft.taxonomy,
            name: draft.name,
            slug: draft.slug,
            description: draft.description,
            parentId: draft.parentId,
          },
          include: includeCount,
        });
      })
      .catch((error: unknown) => {
        if (error instanceof ContentError) {
          throw error;
        }
        return rethrowSlugConflict(error, draft.slug);
      });

    await hooks.doAction('taxonomy.term.created', {
      termId: term.id,
      taxonomy: term.taxonomy as TaxonomyType,
      slug: term.slug,
    });
    return toAdminTerm(term);
  }

  // ---- read ----

  async function getTerm(principal: Principal, id: string): Promise<AdminTerm> {
    requireAdmin(principal);
    const term = await prisma.term.findUnique({ where: { id }, include: includeCount });
    if (!term) {
      throw new ContentError('NOT_FOUND', 'Term not found.', 404);
    }
    return toAdminTerm(term);
  }

  // ---- update ----

  async function updateTerm(
    principal: Principal,
    id: string,
    input: UpdateTermInput,
  ): Promise<AdminTerm> {
    requireAdmin(principal);

    const current = await prisma.term.findUnique({ where: { id } });
    if (!current) {
      throw new ContentError('NOT_FOUND', 'Term not found.', 404);
    }

    let draft: TermFilterDraft = {
      taxonomy: current.taxonomy as TaxonomyType,
      name: (input.name ?? current.name).trim(),
      slug: input.slug !== undefined ? normalizeSlug(input.slug) : current.slug,
      description:
        input.description !== undefined
          ? input.description === null
            ? null
            : input.description.trim().slice(0, DESCRIPTION_MAX) || null
          : current.description,
      parentId: input.parentId !== undefined ? input.parentId : current.parentId,
    };

    draft = await hooks.applyFilters('taxonomy.term.update', draft);
    revalidateDraft(draft);

    const term = await prisma
      .$transaction(async (tx) => {
        await lockSlug(tx, draft.taxonomy, draft.slug);
        await resolveParent(tx, draft.taxonomy, draft.parentId, id);
        if (await slugTaken(tx, draft.taxonomy, draft.slug, draft.parentId, id)) {
          throw new ContentError(
            'TERM_SLUG_TAKEN',
            `A term with the slug "${draft.slug}" already exists in this taxonomy.`,
            409,
          );
        }
        return tx.term.update({
          where: { id },
          data: {
            name: draft.name,
            slug: draft.slug,
            description: draft.description,
            parentId: draft.parentId,
          },
          include: includeCount,
        });
      })
      .catch((error: unknown) => {
        if (error instanceof ContentError) {
          throw error;
        }
        return rethrowSlugConflict(error, draft.slug);
      });

    await hooks.doAction('taxonomy.term.updated', {
      termId: term.id,
      taxonomy: term.taxonomy as TaxonomyType,
      slug: term.slug,
    });
    return toAdminTerm(term);
  }

  // ---- delete ----

  /**
   * Transactional delete: detach every post relationship then remove the term.
   * Content is never deleted. Children become root terms (parent_id SET NULL).
   */
  async function deleteTerm(
    principal: Principal,
    id: string,
  ): Promise<{ detachedPostCount: number }> {
    requireAdmin(principal);

    const current = await prisma.term.findUnique({
      where: { id },
      select: { id: true, taxonomy: true, slug: true },
    });
    if (!current) {
      throw new ContentError('NOT_FOUND', 'Term not found.', 404);
    }

    const detachedPostCount = await prisma
      .$transaction(async (tx) => {
        const detached = await tx.postTerm.deleteMany({ where: { termId: id } });
        await tx.term.delete({ where: { id } });
        return detached.count;
      })
      .catch((error: unknown) => rethrowSlugConflict(error, current.slug));

    await hooks.doAction('taxonomy.term.deleted', {
      termId: id,
      taxonomy: current.taxonomy as TaxonomyType,
      slug: current.slug,
      detachedPostCount,
    });

    return { detachedPostCount };
  }

  // ---- convert ----

  /**
   * WordPress Tools → Categories and Tags Converter. Moves every post
   * relationship from the source taxonomy to a same-slug term in the target
   * taxonomy, creating the target term when needed, then removes the source.
   * Posts and their content are never deleted.
   */
  async function convertTerms(
    principal: Principal,
    from: TaxonomyType,
  ): Promise<{ converted: number; created: number; movedPosts: number }> {
    requireAdmin(principal);
    assertTaxonomy(from);
    const to: TaxonomyType = from === 'category' ? 'tag' : 'category';

    const result = await prisma.$transaction(async (tx) => {
      const sourceTerms = await tx.term.findMany({
        where: { taxonomy: from },
        include: { posts: true },
      });
      let created = 0;
      let movedPosts = 0;

      for (const source of sourceTerms) {
        await lockSlug(tx, to, source.slug);
        let target = await tx.term.findFirst({
          where: { taxonomy: to, slug: source.slug },
        });
        if (!target) {
          target = await tx.term.create({
            data: {
              taxonomy: to,
              name: source.name,
              slug: source.slug,
              description: source.description,
              parentId: null,
            },
          });
          created += 1;
        }

        for (const link of source.posts) {
          const existing = await tx.postTerm.findUnique({
            where: { postId_termId: { postId: link.postId, termId: target.id } },
          });
          if (!existing) {
            await tx.postTerm.create({
              data: {
                postId: link.postId,
                termId: target.id,
                position: link.position,
              },
            });
            movedPosts += 1;
          }
          await tx.postTerm.delete({
            where: { postId_termId: { postId: link.postId, termId: source.id } },
          });
        }

        await tx.term.delete({ where: { id: source.id } });
      }

      return { converted: sourceTerms.length, created, movedPosts };
    });

    await hooks.doAction('taxonomy.terms.converted', { from, to, ...result });
    return result;
  }

  // ---- list ----

  async function listTerms(
    principal: Principal,
    query: TermListQuery,
  ): Promise<{
    items: AdminTerm[];
    pagination: { page: number; perPage: number; total: number; totalPages: number };
  }> {
    requireAdmin(principal);

    const where: Prisma.TermWhereInput = {};
    if (query.taxonomy) {
      where.taxonomy = query.taxonomy;
    }
    if (query.search && query.search.trim().length > 0) {
      const s = query.search.trim().slice(0, SEARCH_MAX);
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { slug: { contains: s, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.TermOrderByWithRelationInput[] =
      query.sort === 'count'
        ? [{ posts: { _count: query.order } }, { name: 'asc' }, { id: 'asc' }]
        : [{ [query.sort]: query.order } as Prisma.TermOrderByWithRelationInput, { id: 'asc' }];

    const [total, rows] = await Promise.all([
      prisma.term.count({ where }),
      prisma.term.findMany({
        where,
        include: includeCount,
        orderBy,
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
    ]);

    return {
      items: rows.map(toAdminTerm),
      pagination: {
        page: query.page,
        perPage: query.perPage,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.perPage)),
      },
    };
  }

  return { createTerm, getTerm, updateTerm, deleteTerm, listTerms, convertTerms };
}

export type TaxonomyService = ReturnType<typeof createTaxonomyService>;

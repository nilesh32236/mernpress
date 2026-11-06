import { Prisma, type DatabaseClient } from '@mernpress/database';

/**
 * Ranked post search for the admin list and the public archive/search pages.
 *
 * The `posts.search_vector` generated column is the relevance source (title A,
 * excerpt B, block body C, see migration 20261106150500). `websearch_to_tsquery`
 * gives users quoted phrases and `-exclusion` for free, and the ILIKE fallback
 * keeps the old substring behaviour ("orch" still finds "orchids") that a plain
 * lexeme query would drop.
 *
 * Only search paths use raw SQL. Non-search lists keep the Prisma query builder,
 * so the visibility/term/date filters remain in one obvious place.
 */

export type PostSearchOrder =
  'relevance' | 'sticky' | 'publishedAt' | 'updatedAt' | 'createdAt' | 'title';

export interface PostSearchFilters {
  search: string;
  type?: string | undefined;
  status?: string | undefined;
  language?: string | undefined;
  categoryId?: string | undefined;
  categorySlug?: string | undefined;
  tagId?: string | undefined;
  tagSlug?: string | undefined;
  authorId?: string | undefined;
  authorUsername?: string | undefined;
  /** Inclusive upper bound for public documents (`published_at <= now`). */
  publishedBefore?: Date | undefined;
  /** Only PUBLISHED, non-private, already-published rows (public surfaces). */
  publicOnly?: boolean | undefined;
  /** Admin visibility: non-full roles only see their own drafts plus published rows. */
  limitedToUserId?: string | undefined;
  /** `YYYY-MM` range on updated_at. */
  monthStart?: Date | undefined;
  monthEnd?: Date | undefined;
  order: PostSearchOrder;
  /** Admin column sort, applied after relevance when provided. */
  sort?: 'updatedAt' | 'createdAt' | 'publishedAt' | 'title' | undefined;
  direction?: 'asc' | 'desc' | undefined;
  page: number;
  perPage: number;
}

export interface PostSearchResult {
  ids: string[];
  total: number;
}

const ADMIN_SORT_COLUMNS: Record<NonNullable<PostSearchFilters['sort']>, string> = {
  updatedAt: 'p."updated_at"',
  createdAt: 'p."created_at"',
  publishedAt: 'p."published_at"',
  title: 'p."title"',
};

/** Escape LIKE wildcards so a search for "%" looks for a literal percent sign. */
function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, '\\$&')}%`;
}

function buildConditions(filters: PostSearchFilters, term: string): Prisma.Sql[] {
  const like = likePattern(term);
  const conditions: Prisma.Sql[] = [
    Prisma.sql`(
      p."search_vector" @@ websearch_to_tsquery('simple', ${term})
      OR p."title" ILIKE ${like} ESCAPE '\\'
      OR coalesce(p."excerpt", '') ILIKE ${like} ESCAPE '\\'
      OR p."content" ILIKE ${like} ESCAPE '\\'
    )`,
  ];

  if (filters.publicOnly) {
    conditions.push(Prisma.sql`p."status"::text = 'PUBLISHED'`);
    conditions.push(Prisma.sql`p."is_private" = false`);
    if (filters.publishedBefore) {
      conditions.push(Prisma.sql`p."published_at" <= ${filters.publishedBefore}`);
    }
  }
  if (filters.type) conditions.push(Prisma.sql`p."type" = ${filters.type}`);
  if (filters.status) {
    conditions.push(Prisma.sql`p."status"::text = ${filters.status}`);
  }
  if (filters.language) conditions.push(Prisma.sql`p."language" = ${filters.language}`);

  if (filters.categoryId) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "post_terms" pt
      WHERE pt."post_id" = p."id" AND pt."term_id" = ${filters.categoryId}::uuid
    )`);
  }
  if (filters.categorySlug) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "post_terms" pt
      JOIN "terms" t ON t."id" = pt."term_id"
      WHERE pt."post_id" = p."id" AND t."taxonomy" = 'category'
        AND t."slug" = ${filters.categorySlug}
    )`);
  }
  if (filters.tagId) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "post_terms" pt
      WHERE pt."post_id" = p."id" AND pt."term_id" = ${filters.tagId}::uuid
    )`);
  }
  if (filters.tagSlug) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "post_terms" pt
      JOIN "terms" t ON t."id" = pt."term_id"
      WHERE pt."post_id" = p."id" AND t."taxonomy" = 'tag'
        AND t."slug" = ${filters.tagSlug}
    )`);
  }
  if (filters.authorId) {
    conditions.push(Prisma.sql`p."author_id" = ${filters.authorId}::uuid`);
  }
  if (filters.authorUsername) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "users" u
      WHERE u."id" = p."author_id" AND u."username" = ${filters.authorUsername}
    )`);
  }
  if (filters.monthStart && filters.monthEnd) {
    conditions.push(
      Prisma.sql`p."updated_at" >= ${filters.monthStart} AND p."updated_at" < ${filters.monthEnd}`,
    );
  }
  if (filters.limitedToUserId) {
    conditions.push(
      Prisma.sql`(p."author_id" = ${filters.limitedToUserId}::uuid OR p."status"::text = 'PUBLISHED')`,
    );
  }
  return conditions;
}

function buildOrder(filters: PostSearchFilters, term: string): Prisma.Sql {
  const direction = Prisma.raw(filters.direction === 'asc' ? 'ASC' : 'DESC');
  const parts: Prisma.Sql[] = [];

  // Search always ranks first; the requested order is a tiebreaker.
  parts.push(
    Prisma.sql`ts_rank_cd(p."search_vector", websearch_to_tsquery('simple', ${term})) DESC`,
  );
  if (filters.order === 'sticky') {
    parts.push(Prisma.sql`p."sticky" DESC`);
  }
  if (filters.sort) {
    parts.push(Prisma.sql`${Prisma.raw(ADMIN_SORT_COLUMNS[filters.sort])} ${direction}`);
  } else if (filters.order === 'publishedAt') {
    parts.push(Prisma.sql`p."published_at" ${direction}`);
  } else if (filters.order === 'updatedAt') {
    parts.push(Prisma.sql`p."updated_at" ${direction}`);
  } else if (filters.order === 'createdAt') {
    parts.push(Prisma.sql`p."created_at" ${direction}`);
  } else if (filters.order === 'title') {
    parts.push(Prisma.sql`p."title" ${direction}`);
  }

  // Public relevance lists keep sticky posts first, then recency; admins keep
  // the chosen column after relevance. `id` is the stable tiebreaker.
  if (filters.publicOnly) {
    parts.push(Prisma.sql`p."published_at" DESC`);
  }
  parts.push(Prisma.sql`p."id" ${direction}`);
  return Prisma.join(parts, ', ');
}

export async function searchPostIds(
  prisma: DatabaseClient,
  filters: PostSearchFilters,
): Promise<PostSearchResult> {
  const term = filters.search.trim();
  if (term.length === 0) return { ids: [], total: 0 };

  const conditions = buildConditions(filters, term);
  const where = Prisma.join(conditions, ' AND ');
  const order = buildOrder(filters, term);
  const take = filters.perPage;
  const skip = (filters.page - 1) * filters.perPage;

  const [rows, totals] = await prisma.$transaction([
    prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT p."id"
      FROM "posts" p
      WHERE ${where}
      ORDER BY ${order}
      LIMIT ${take} OFFSET ${skip}
    `),
    prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`
      SELECT count(*)::int AS total
      FROM "posts" p
      WHERE ${where}
    `),
  ]);

  return { ids: rows.map((row) => row.id), total: totals[0]?.total ?? 0 };
}

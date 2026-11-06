# Search: architecture and operations

Public and admin search use PostgreSQL full-text search with a relevance
ranking, plus a case-insensitive substring fallback. The decision record is
[ADR 0053](../adr/0053-ranked-full-text-search.md).

## Data

Migration `20261106150500_add_post_search_vector` adds a generated column:

```sql
posts.search_vector tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(excerpt, '')), 'B') ||
  setweight(
    to_tsvector('simple', regexp_replace(coalesce(content, ''), '<[^>]*>', ' ', 'g')),
    'C'
  )
) STORED
```

`CREATE INDEX posts_search_vector_idx ON posts USING GIN (search_vector)`.

The column is generated and is **not** declared in `schema.prisma`; Prisma
cannot model generated columns, and no application code writes it. It is
recomputed on every insert/update of title, excerpt or content.

## Query path

`packages/cms-core/src/content/search.ts` builds parameterised SQL:

1. `search_vector @@ websearch_to_tsquery('simple', term)` **or**
   `title/excerpt/content ILIKE escaped %term%`.
2. Visibility and list filters (type, status, language, term id/slug, author
   id/username, updated month, public published/private bounds, role
   visibility).
3. `ORDER BY ts_rank_cd(...) DESC`, then:
   - public: sticky DESC, `published_at` DESC, `id`;
   - admin: selected whitelisted column + direction, then `id`.
4. A second query returns `count(*)::int`.
5. The service loads rows by id with `findMany` (keeping term/author/media
   relations) and restores the SQL order.

Non-search lists keep the Prisma query builder; only search requests take the
raw path, so the `WHERE` filters exist in one place per surface.

## What users can type

| Input | Behaviour |
| --- | --- |
| `orchid` | Word match via FTS; title (A) ranks above body (C) |
| `orch` | Substring fallback (ILIKE) |
| `"orchid tips"` | Phrase via `websearch_to_tsquery` |
| `orchid -draft` | FTS exclusion |
| `%` / `_` | Treated literally through LIKE escaping |

Terms are trimmed, empty terms return no rows, and route schemas cap them at
200 characters. `simple` is language-agnostic (no English stemming), so
translated posts are indexed too.

## Security and limits

- Values are bound with `Prisma.sql`; the only raw fragments are the sort
  column and `ASC`/`DESC`, both chosen from a whitelist.
- Search results obey the same authorization and public visibility rules as
  the non-search lists (admin role visibility, `PUBLISHED` + non-private +
  `published_at <= now` public bounds).
- No stemming, synonyms, typo correction or per-language analyzers.
- The ILIKE fallback can scan for queries with no useful lexemes; a future
  `pg_trgm` index can accelerate it without changing the API.

## Tests

- Public: title-over-body ranking, partial words, quoted phrase, literal `%`,
  search + category composition, existing search/term/visibility suites.
- Admin: ranked search + status composition, existing visibility search test.
- Migration is applied by the normal `pnpm db:migrate` / `pnpm db:migrate:test`
  path; no backfill is needed because the column is generated.

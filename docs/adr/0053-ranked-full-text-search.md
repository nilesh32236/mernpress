# ADR 0053 — Ranked PostgreSQL full-text search

- Status: accepted (2026-11-06)
- Supersedes: the `contains`-only search noted in ADR 0006/Phase 3
- Related: [search architecture](../architecture/search.md), migration
  `20261106150500_add_post_search_vector`

## Context

Both search surfaces used Prisma `contains` filters:

- Admin → Posts: title and excerpt.
- Public archives/search: title, excerpt and block content.

That is a case-insensitive `ILIKE '%term%'` scan with no relevance signal:
a title match and a body-only match sorted by date, and every keystroke-sized
query scanned the full table. The parity research lists Relevanssi (100k+
installs) as evidence that WordPress users want better search. The project
requires PostgreSQL and already has a migration mechanism, so an in-database
ranked search is the smallest complete improvement — no external service, no
new infrastructure.

## Decision

1. **Generated `tsvector` column.** Migration
   `20261106150500_add_post_search_vector` adds
   `posts.search_vector` as `GENERATED ALWAYS AS (...) STORED`:
   - title → weight A
   - excerpt → weight B
   - block body after `regexp_replace(content, '<[^>]*>', ' ', 'g')` → weight C
   - `to_tsvector('simple', …)` everywhere.
   Because the column is generated, inserts, restores, imports, revisions and
   plugin draft filters can never leave it stale. A GIN index
   `posts_search_vector_idx` supports `@@` and `ts_rank_cd`.

2. **`simple` configuration, not `english`.** It lowercases and tokenizes but
   does not stem. That keeps Hindi and other non-English content indexed
   (the site supports per-post languages) and makes relevance predictable.
   Trade-off: "running" does not match "run"; the substring fallback still
   finds it.

3. **Hybrid matching.** A search matches when either:
   - `search_vector @@ websearch_to_tsquery('simple', term)`, or
   - title/excerpt/content `ILIKE` the escaped `%term%`.
   The first gives phrases (`"orchid tips"`), exclusion (`-draft`) and ranking;
   the fallback preserves the previous behaviour for partial words and CJK-like
   text where tokenization is thin.

4. **Rank first.** Orders start with `ts_rank_cd` DESC, then whether the term
   appears in the title, excerpt and body (so a partial title hit beats a
   partial body hit when both rank 0). Public search then applies sticky,
   `published_at` DESC and `id`. Admin search then applies the selected
   column/direction (whitelist: `updated_at`, `created_at`, `published_at`,
   `title`) and `id`. Only search requests use the raw SQL path; every other
   list keeps the existing Prisma query builder.

5. **Composable filters.** The raw builder carries the same filters as the
   Prisma paths: type, status, language, category/tag (id or slug), author
   (id or username), updated month, public visibility (`PUBLISHED`, not
   private, `published_at <= now`) and the role visibility predicate
   (`author_id = me OR PUBLISHED`). Ids are `::uuid`-cast and values are
   parameterised through `Prisma.sql`; only the sort column/direction comes
   from a whitelist. Terms are LIKE-escaped (`%`, `_`, `\`) and capped at 200
   characters by the route schemas.

6. **Two queries, one order.** The helper returns ordered ids plus a total,
   then loads rows with `findMany({ id: { in: ids } })` and restores the SQL
   order. Relations (`terms`, `author`, `featuredMedia`) stay in Prisma, so the
   DTO mapping is unchanged.

## Alternatives considered

- **Trigram similarity (`pg_trgm`)** — better typo tolerance but needs an
  extension and has weaker phrase/weight semantics; not needed for this slice.
- **External search (Meilisearch/OpenSearch)** — new service, sync and
  operations; contradicts the single-PostgreSQL boundary.
- **Application-side scoring** — fetches unbounded candidate rows; worse than
  the existing scan.
- **Prisma `search` extension** — still not a ranked, weighted query and adds
  a dependency.

## Consequences

- `search_vector` is migration-owned and deliberately not in
  `schema.prisma` (Prisma cannot model generated columns); raw queries own it.
- The ILIKE fallback is still a scan for queries with no useful lexemes. It is
  bounded by the public visibility filters and acceptable at this scale; a
  future trigram index can accelerate it without changing the API.
- No stemming, synonyms, typo correction or per-language analyzers. The
  `simple` config is intentional for multilingual content.
- Search queries still run through the existing authorization and language
  rules; results are the same documents the non-search lists would return.
- Tests cover title-over-body ranking, partial words, quoted phrases, literal
  `%`, category composition, admin status composition and the existing
  visibility/term/date suites.

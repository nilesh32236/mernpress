-- Full-text search column for posts.
--
-- Generated (not application-written) so edits, restores, imports and plugin
-- filters can never leave the index stale. Titles weigh most, then excerpts,
-- then the block body after tags are stripped. The 'simple' configuration is
-- language-agnostic: it lowercases and tokenizes without English stemming, so
-- Hindi and other content is indexed too (ADR 0053).
ALTER TABLE "posts" ADD COLUMN "search_vector" tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('simple', coalesce("excerpt", '')), 'B') ||
  setweight(
    to_tsvector('simple', regexp_replace(coalesce("content", ''), '<[^>]*>', ' ', 'g')),
    'C'
  )
) STORED;

-- GIN is the right index for @@ containment and ts_rank_cd ordering.
CREATE INDEX "posts_search_vector_idx" ON "posts" USING GIN ("search_vector");

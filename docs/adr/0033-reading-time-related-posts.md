# ADR 0033 — Reading time and related posts

- Status: accepted (owner scope decision, 2026-11-05)
- Implements the reading-time/related-posts slice from the plugin/theme roadmap

## Context

Theme-market research found reading time, related posts, next/previous
navigation and author metadata among the most requested blog-theme features.
WordPress core provides none of them; themes or plugins implement them. The
MERNPress post template already had previous/next navigation and a "More posts"
list of the newest posts, but no read time and no relation to the current post.

## Decision

1. **Reading time is a shared server-side utility.** `lib/reading-time.ts`
   strips block delimiters, tags and entities, counts words and returns
   `{ words, minutes }` at 200 words per minute with a one-minute floor. It is
   used by the single post meta, related cards and the archive query loop, so the
   number never disagrees between screens.
2. **Related means same primary category.** The single-post route fetches up to
   six posts in the current post's first category, excludes the current post and
   shows the first three. If the post has no category (or the fetch fails) it
   falls back to the newest posts, still excluding the current one.
3. **One reusable component.** `RelatedPosts` renders the section and is labelled
   "Related posts" when category matches exist and "More posts" for the
   newest-post fallback. It shows date and read time per card. The previous
   `MorePosts` component is no longer used by the template (kept out of the
   bundle; the file can be removed in a cleanup).
4. **Failures degrade.** The related fetch is wrapped so an API failure never
   breaks the post; the page still renders the article and the fallback list.
5. **No schema changes.** Both features derive from existing content; no
   migration, no new API endpoint beyond the existing public list filter.
6. **Theme-agnostic.** The default and Journal themes share the template, so both
   get the feature for free; CSS uses theme tokens.

## Consequences

- One extra public list request per single-post render when a category exists.
  It is cached by the existing 60-second API fetch policy; the post itself stays
  `no-store` so privacy changes remain immediate.
- Read time is an estimate based on rendered word count, not a promise; it is
  labelled "min read".
- A future related-posts strategy (tags, recency scoring, manual selection) can
  replace the category lookup behind the same component props.

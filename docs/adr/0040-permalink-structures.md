# ADR 0040 — WordPress permalink structure presets

- Status: accepted (owner scope decision, 2026-11-05)
- Extends: ADR 0003 (content model), ADR 0030/0032 (redirects)

## Context

MERNPress posts lived at `/<permalink_base>/<slug>` with one configurable base.
WordPress offers Plain, Day and name, Month and name, Numeric, Post name and
Custom structures, plus configurable category and tag bases; the design audit
recorded the single-base model as a remaining difference.

## Decision

1. **Shared, isomorphic URL rules.** A new `packages/contracts` package owns
   the pattern language: presets, token validation, path generation and path
   matching. The API (resolver, slug redirects), the edge middleware and the
   admin preview all import it, so the rules cannot drift.
2. **Options.** `permalink_structure` (`plain|day|month|numeric|postname|custom`),
   `permalink_pattern`, `category_base` and `tag_base` are option-store keys in
   the `permalinks` group. The legacy `permalink_base` remains only as the
   migration default: when no structure is stored, the effective structure is
   `custom` with `/<permalink_base>/%postname%/`, so existing installations keep
   their URLs.
3. **Patterns.** Presets map to
   `/%year%/%monthnum%/%day%/%postname%/`, `/%year%/%monthnum%/%postname%/`,
   `/archives/%post_id%/`, `/%postname%/` and Plain (`?p=<id>`). Custom patterns
   accept `%year%`, `%monthnum%`, `%day%`, `%hour%`, `%minute%`, `%second%`,
   `%post_id%`, `%postname%` and `%category%`. Tokens must be whole `/`
   segments, exactly one of `%postname%`/`%post_id%` is required, and static
   segments are lowercase slugs. MERNPress primary keys are UUIDv7, so the
   Numeric preset uses the UUID in `/archives/<id>` rather than a small integer
   (documented deviation).
4. **Canonical URLs come from the API.** Public post responses gain `path`
   (built from the pattern) and each term gains `path` (category/tag bases).
   Pages always use `/<slug>`. Web components, sitemap, RSS, `llms.txt`, JSON-LD
   and canonical tags use these values instead of rebuilding URLs.
5. **Routing is resolved in middleware.** The edge middleware fetches the
   public settings (10 s cache), matches the request path with the structure and
   calls `GET /api/public/resolve` (30 s per-path cache). A match is rewritten
   to the internal `/posts/<slug>` renderer; a date/category variant that is not
   canonical receives a `301` to the canonical path. Plain requests resolve
   `?p=<id>`. Custom category/tag bases are rewritten to the internal
   `/category/<slug>` and `/tag/<slug>` routes.
6. **Server resolution is authoritative.** The resolver only returns published,
   non-private posts whose publish date is in the past; it validates captured
   date parts and the `%category%` token, and with root-level `%postname%` a
   published page with the same slug shadows the post (WordPress rewrite order).
7. **Slug-change redirects follow the structure.** The content callback now
   passes id, publish date and primary category; the API builds the old and new
   paths with the active pattern. Plain and id-based structures create no
   redirect because the URL does not change.
8. **Settings UI matches WordPress.** Settings → Permalinks shows the six radio
   choices with pattern previews, a validated custom pattern field, category/tag
   bases and a live sample URL, and warns that changing the structure does not
   create redirects for old URLs.

## Consequences

- No migration; options drive the behaviour. `packages/contracts` is a new
  workspace package (dist-only for the Next edge runtime).
- Pretty permalinks add one resolver request per uncached path in middleware;
  results are cached for 30 s and settings for 10 s, so a structure change takes
  up to ~10 s to apply.
- The internal `/posts/<slug>` URL still renders the post with a canonical tag
  pointing at the structured URL. It is not redirected (Next re-runs middleware
  on rewrites); this is documented rather than faked.
- Changing the structure does not create redirects for old URLs; the UI says so
  and Tools → Redirects remains the place to add them.
- Trailing slashes are normalised by Next; both forms resolve.

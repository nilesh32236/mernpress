# ADR 0030 — Redirects and 404 manager

- Status: accepted (owner scope decision, 2026-11-05)
- Implements the top-ranked slice from `docs/research/plugin-theme-roadmap.md`

## Context

The roadmap research found redirect/404 management is one of the most requested
"should be core" features, and most existing WordPress plugins are described as
bloated or abandoned. MERNPress previously had no way to preserve old URLs.

## Decision

1. **Redirects are a core table and screen.** `redirects` stores a normalized
   `from_path` (unique), `to_path`, status (301/302) and a hit counter. Tools →
   Redirects lists them, adds/edits/deletes, and shows the aggregated 404 log
   beside them.
2. **Paths are normalized and validated.** Source must be a path (leading slash
   added, duplicate slashes collapsed, trailing slash removed, max 2048 chars,
   no control characters, no scheme). Destination must be a relative path or an
   http(s) URL; `javascript:` and other schemes are rejected.
3. **Loops are rejected.** Creating/updating a redirect walks the existing chain
   (bounded at 10) and refuses self/cyclic destinations.
4. **The public site applies redirects in middleware.** `apps/web/middleware.ts`
   fetches `/api/public/redirects` (10-second in-process cache), matches the
   normalized pathname and returns `NextResponse.redirect` with 301/302. Hit
   counting is reported asynchronously via `event.waitUntil` so redirects stay
   fast.
5. **404s are logged by a catch-all.** `app/[...path]/page.tsx` records the path
   through `POST /api/public/not-found` and then renders the normal 404 page.
   Only the path, hit count and first/last-seen instants are stored — no IP,
   user agent or referrer.
6. **Public writes are bounded.** Hit and 404 recording are limited to 120
   requests/minute per client in a bounded in-memory limiter, and both paths are
   validated. Admin routes require `manage_options`; the public map endpoint is
   read-only.
7. **No automatic redirect on slug change (yet).** The slug history table exists;
   wiring it to automatic 301s is a follow-up slice so the redirect manager and
   slug history are reconciled deliberately.

## Consequences

- Two additive tables (`redirects`, `not_found_entries`), no changes to content.
- Middleware adds one API fetch per 10 seconds (cache miss), not per request.
- The in-memory limiter and cache are per process; multi-instance deployments
  need a shared cache/limiter (documented residual risk).
- Redirects apply only to the public Next.js site, not the admin SPA.

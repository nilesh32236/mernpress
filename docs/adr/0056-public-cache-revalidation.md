# ADR 0056 — Tagged public cache with an internal revalidation webhook

- Status: accepted (2026-11-06)
- Related: [system overview §4.2](../architecture/system-overview.md), env
  `WEB_REVALIDATE_URL`, `WEB_REVALIDATE_SECRET`, `MERNPRESS_REVALIDATE_SECRET`

## Context

Public list and term responses were fetched with Next's data cache and a
60-second revalidate window (`next: { revalidate: 60 }`). Single posts, site
settings, previews and sitemaps were already `no-store`, so the cache applied to
the blog/home/category/tag/author/search lists and term lookups.

Two problems surfaced while adding screenshot baselines:

1. **Publishing was not visible for up to a minute.** A readiness probe (or any
   visitor) could cache an empty home page; a post published seconds later was
   invisible until the window expired. WordPress shows published content on the
   next request, and the system-overview document already claimed tag/path
   invalidation via a webhook — the implementation had no webhook.
2. **Tests were order-dependent.** SQL-seeded fixtures appeared only when the
   cache happened to be cold, so the visual suite failed when it ran after other
   suites.

## Decision

1. **Tag every cacheable public read.** `apiFetch` in `apps/web/lib/api.ts`
   attaches `next: { revalidate: 60, tags: [PUBLIC_CONTENT_TAG] }` where
   `PUBLIC_CONTENT_TAG = 'public-content'`. The 60-second window remains as a
   safety net if a notification is lost. No-store paths (single post, settings,
   preview, sitemap, feed) are unchanged.
2. **Private revalidation route.** `apps/web/app/api/revalidate/route.ts`
   accepts `POST { tags: string[] }` with `x-revalidate-secret`.
   - 503 when `MERNPRESS_REVALIDATE_SECRET` is unset or shorter than 16 chars.
   - 403 for a missing/wrong secret (length check first, then SHA-256 digests
     compared with `timingSafeEqual`).
   - 400 for malformed JSON, an empty/oversized tag list, or a tag outside the
     allowlist (`public-content` only).
   - Accepted tags are invalidated with `revalidateTag(tag, { expire: 0 })`, so
     the very next request re-renders instead of serving one stale response.
   - The route is not publicly reachable: Caddy sends `/api/*` to Fastify, so
     only the API process can call `127.0.0.1:3100/api/revalidate`.
3. **API notifier.** `apps/api/src/revalidate.ts` creates a fire-and-forget
   revalidator from `WEB_REVALIDATE_URL`/`WEB_REVALIDATE_SECRET`
   (3 s timeout, failures logged, never thrown). `registerRevalidation`
   subscribes it to every public-content action: post created/updated/
   published/unpublished/trashed/restored/terms-updated/scheduled/unscheduled
   and term created/updated/deleted/converted.
4. **Configuration.** Both values are optional; without them the site keeps the
   60-second window. Production sets the URL on the API and the same secret on
   both processes. The web unit gets it through a systemd drop-in so the
   packaged unit stays unchanged.

## Alternatives considered

- **No caching at all (`no-store` everywhere).** Simplest and always fresh, but
  every public request would re-render server-side; the tagged cache keeps the
  fast path and fixes staleness precisely.
- **Webhook per page path (`revalidatePath`).** Needs the API to know the web's
  route map and invalidates unrelated pages; tag invalidation is coarser but
  correct and smaller.
- **Shorten revalidate to a few seconds.** Still stale after publish and more
  re-renders; no correctness guarantee.
- **Database LISTEN/NOTIFY.** Adds a long-lived listener and a second channel;
  the HTTP notifier is easier to operate and test.

## Consequences

- A publish/update/delete is visible on the next public request. If the web
  process is down or the secret is wrong, content appears within 60 seconds and
  the API logs a warning.
- The notifier is best-effort; a lost notification is not retried (a job-queue
  retry would be over-engineering for an idempotent cache flush).
- Taxonomy and content changes share one tag, so any content change re-renders
  all cached public lists. That is acceptable at this scale and avoids stale
  cross-references (a post edit can change category counts).
- Site settings and single posts were already no-store, so they are unaffected.
- E2E suites that seed with SQL call the route explicitly; API-driven writes are
  revalidated automatically because Playwright supplies the same secret.

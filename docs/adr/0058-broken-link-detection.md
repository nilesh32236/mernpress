# ADR 0058 — Internal broken-link detection without fetching authored URLs

- Status: accepted (2026-11-06)
- Related: [jobs architecture](../architecture/jobs.md), migration
  `20261106220000_add_link_checks`
- Gap: "Broken-link detection … no link checker in the official features list"
  in [wordpress-feature-gaps](../research/wordpress-feature-gaps.md)

## Context

WordPress core has no link checker. Broken Link Checker (500k+ installs) fills
the gap by crawling published posts and reporting dead links, and MERNPress
already owns the complementary pieces: a redirect table, a 404 log and a durable
job queue. The missing piece is a crawl of published content that reports which
authored links no longer resolve.

A naive port would fetch every URL found in posts. That collides with the
project security boundary (AGENTS.md §7): authored URLs are untrusted input, so
fetching them would be an SSRF surface, and the MVP rule forbids external
fetches beyond configured services. Fetching with allowlists, DNS pinning and
timeouts could be made safe, but it is a much larger surface than the value of
this slice — and dead links that matter most to SEO are the internal ones.

## Decision

1. **Internal links are resolved against the database, never fetched.**
   Published posts/pages are crawled in id-cursor batches (20 per batch, same
   shape as media regeneration). Each `href`/`src`/`srcset` URL is classified
   and resolved against published slugs (honouring the permalink pattern via
   `matchPostPath`), terms (configured category/tag bases), authors, redirects,
   media files (`/api/media/<id>/<fileName>`, including derivatives), language
   prefixes and known static routes (`/`, `/posts`, `/search`, `/feed`,
   `/sitemap.xml`, `/robots.txt`, `/llms.txt`). Statuses are `ok` (200),
   `broken` (404) and `redirect` (301/302 with the destination).
2. **External links are stored, never fetched.** `http(s)://` and
   protocol-relative URLs become `kind: external`, `status: external`,
   `httpStatus: null`. Absolute URLs whose host matches the configured
   `site_url` are treated as internal paths. Fragment-only, `mailto:`, `tel:`,
   `javascript:` and `data:` links are ignored. This keeps the feature useful
   (editors see the scale of unchecked external links) without weakening SSRF
   defenses.
3. **One row per source post + verbatim URL.** Migration
   `20261106220000_add_link_checks` adds `link_checks` with a unique
   `(source_post_id, url)` key plus status/checked-at indexes. Each scan
   upserts the current links for a source and deletes rows for links that
   disappeared from that source; a full scan also purges rows whose source is
   no longer published. Extraction is capped at 1000 URLs and 2048 characters
   per URL.
4. **Durable `linkcheck.scan` job.** `POST /api/admin/links/check` requires
   `manage_options` (checked before enqueue), rejects a second active job with
   `409 LINK_CHECK_IN_PROGRESS`, and returns 202 with the job (`maxAttempts: 2`).
   The worker loops batches to exhaustion; there is no network, so failures are
   database errors only. Queue history (attempts, last error) is visible in
   Tools → Scheduled Actions.
5. **API and admin surface.** `GET /api/admin/links` returns the latest rows
   (broken/redirects first) plus a summary and `lastCheckedAt`; `DELETE
   /api/admin/links/:id` dismisses a row until the next scan recreates it.
   Tools → Redirects gains a “Broken links” section with counts, a
   **Check links now** button that polls the job to completion, stale-row
   cleanup and per-row **Add redirect** (prefills the redirect form) and
   **Dismiss** actions.

## Alternatives considered

- **External HEAD fetching with SSRF guards** — richer (finds dead vendor
  links), but needs DNS-resolution pinning, private-range blocking, redirect
  limits, timeouts and egress decisions. Deferred; the internal slice covers
  the SEO-critical case with no new attack surface.
- **Fetch the rendered page over HTTP and diff links** — would exercise the
  public site but couples the check to deployment health and the same SSRF
  question for internal paths.
- **Browser-crawl in the admin (jsdom/playwright)** — heavy and non-durable;
  the database scan is testable in milliseconds.
- **Check on every save** — instant feedback, but a publish touching many posts
  would queue overlapping work; an on-demand scan matches Broken Link Checker's
  model and costs one job.

## Consequences

- External link health is explicitly not verified; the UI labels those rows
  “not fetched” so operators are not misled.
- Menus, theme templates, excerpts stored separately, comment bodies and
  off-post settings are out of scope for this slice (posts/pages only).
- Absolute same-host URLs require a configured `site_url`; without one they
  count as external.
- Results are a point-in-time scan, not a live monitor: a row disappears when
  the link is fixed, the source is unpublished, or an admin dismisses it.
- No new secret, service or outbound traffic; the check runs entirely inside
  the API process and Postgres.

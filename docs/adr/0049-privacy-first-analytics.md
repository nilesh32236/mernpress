# ADR 0049 — Privacy-first local analytics

- Status: accepted (owner scope decision, 2026-11-05)
- Implements the P2 analytics item from
  [wordpress-feature-gaps.md](../research/wordpress-feature-gaps.md)

## Context

WordPress core has no analytics screen; sites install Jetpack/Site Kit (5M+
active) or MonsterInsights (2M+), which usually embed a third-party script and
send visitor data off-site. MERNPress already renders its own site and can count
views locally without cookies or per-visitor records. The goal is a useful,
honest dashboard for a small site, not an ad-tech product.

## Decision

1. **Aggregate rows only.** `analytics_daily` stores one row per
   (UTC day, path, referrer host) with an incrementing `views` count. No
   cookies, visitor ids, user agents, IP addresses or full referrer URLs.
2. **Public beacon.** `POST /api/public/views` accepts `{ path, referrer? }`.
   The API strips query/hash, collapses duplicate slashes, drops trailing slashes,
   limits paths to 2048 characters, ignores `/api`, `/admin`, `/_next`,
   `/favicon.ico`, `/robots.txt` and `/sitemap.xml`, extracts only the referrer
   hostname, and skips obvious bots. Errors are swallowed: a beacon is never
   allowed to affect the page.
3. **Client beacon.** `ViewTracker` is a client component in the root layout; it
   posts on each pathname change with `keepalive`, skips Do-Not-Track visitors and
   never posts admin/API paths.
4. **Admin summary.** `GET /api/admin/analytics?days=7|30` (1–365 accepted)
   requires `content.read.any` and returns totals, a zero-filled daily series,
   top 10 paths and top 10 referrer hosts. The new Dashboard → Analytics screen
   renders cards, a bar list and two tables; the period selector switches
   7/30 days.
5. **No retention job in this slice.** Rows are tiny and bounded by
   (paths × days × referrers). A future sweep can prune old days; the summary
   only reads the selected window.
6. **Honest limits are documented in the UI and here.** The numbers are
   directional: bots are filtered best-effort, Do-Not-Track is client-side only,
   and there are no unique visitors, sessions, campaigns or real-time data.

## Consequences

- No third-party script, no external requests, no consent banner needed for this
  feature (nothing is stored on the visitor's device).
- The beacon can be inflated by a determined client; it is analytics, not
  billing. Rate limiting is left to the reverse proxy if needed.
- Content security policy is unaffected; the request is same-origin.
- No schema change to posts/users/media; one additive migration for the table.

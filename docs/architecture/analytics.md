# Analytics — developer guide

## Data

`analytics_daily` (migration `add_analytics_daily`):

| Column | Meaning |
| --- | --- |
| `day` | UTC date (`@db.Date`) |
| `path` | Normalised public path, no query/hash, ≤2048 chars |
| `referrer_host` | Hostname only (`example.com`), empty for direct traffic |
| `views` | Incrementing counter |

Unique key `(day, path, referrer_host)`. There are no cookies, visitor ids,
user agents or IP addresses in the table.

## Recording

`packages/cms-core/src/analytics/service.ts`:

- `normalizeAnalyticsPath` strips `?`/`#`, collapses `//`, trims a trailing `/`
  and rejects non-`/` values, over-long paths and `/api`, `/admin`, `/_next`,
  `/favicon.ico`, `/robots.txt`, `/sitemap.xml`.
- `referrerHost` parses the URL and keeps only the lowercased hostname.
- `record` skips obvious bot user agents and upserts the unique row with
  `views: { increment: 1 }`.
- `summary` requires `content.read.any`, clamps `days` to 1–365, zero-fills the
  window and returns totals, `uniquePaths`, top 10 paths and top 10 referrers.

Routes (`apps/api/src/routes/analytics.ts`):

| Route | Notes |
| --- | --- |
| `POST /api/public/views` | Public beacon, always 204 for handled payloads; malformed JSON is rejected by Fastify before the handler |
| `GET /api/admin/analytics?days=` | Session + `content.read.any`; 400 for out-of-range days |

## Client

`apps/web/components/ViewTracker.tsx` runs in the root layout, posts on each
`usePathname()` change and skips Do-Not-Track and admin/API paths. The admin UI
is `apps/admin/src/AnalyticsPage.tsx` on Dashboard → Analytics.

## Retention

`analytics_retention_days` (option group `privacy`, default 90; 0 disables)
keeps the last N calendar days including today. `AnalyticsService.prune(days)`
deletes older rows with a single `deleteMany`, returning
`{ pruned, retentionDays, cutoffDay }`; no visitor data exists to report.

- The API scheduler runs the sweep every 24 hours with a 15-second boot
  catch-up when `SCHEDULER_ENABLED=true`, reading the option each run (invalid
  or missing → 90) and logging `{pruned, retentionDays, cutoffDay}` only when
  rows were removed.
- Operator CLI: `pnpm --filter @mernpress/api analytics:prune`
  (`-- --days 30` overrides; `--days 0` is a no-op).
- Settings → Privacy exposes the number field with help text; Dashboard →
  Analytics notes that old rows are pruned.

## Limits and next steps

- Directional counts only: no unique visitors, sessions, campaigns, events or
  real-time view.
- Bots are filtered by user-agent heuristics; a spoofed client is counted.
- Retention deletes whole days at a time (no partial-day sampling); sessions,
  unique visitors and campaigns remain deliberately absent.
- Query strings are deliberately discarded, so UTM reporting is not available.

## Field Core Web Vitals (ADR 0057)

`POST /api/public/vitals { metric, value }` records one of `lcp`, `inp`, `cls`,
`fcp`, `ttfb`. Validation mirrors the page-view beacon: unknown metrics,
non-finite/negative/oversized values, bot user agents and the `DNT: 1` header
are ignored, and the route always answers 204 so a blocked beacon cannot affect
the page.

`packages/contracts/src/web-vitals.ts` owns the metric table:

| Metric | Stored unit | Good | Poor | Buckets |
| --- | --- | --- | --- | --- |
| LCP | ms | ≤ 2500 | > 4000 | 100 … 60000 |
| INP | ms | ≤ 200 | > 500 | 50 … 10000 |
| CLS | score ×1000 | ≤ 100 | > 250 | 10 … 5000 |
| FCP | ms | ≤ 1800 | > 3000 | 100 … 60000 |
| TTFB | ms | ≤ 800 | > 1800 | 100 … 60000 |

Storage is `web_vitals_daily (day, metric, bucket, count)` with a unique
`(day, metric, bucket)` key. `histogramP75` reports the smallest bucket whose
cumulative count reaches 75 % of samples; the p75 therefore has the bucket's
resolution, which is dense around the rating boundaries.

The client `WebVitals` component keeps measurements in memory and sends each
metric once at `pagehide`/`visibilitychange`. Do-Not-Track and a required
analytics consent category block the send, exactly like `ViewTracker`.

`GET /api/admin/analytics` includes `vitals: [{ metric, label, p75, rating,
samples }]`. The same `analytics_retention_days` sweep removes old web-vital
rows together with page views; `AnalyticsPruneResult` reports `vitalsPruned`.
The public data has no path, referrer, cookie, user agent or IP, so there is
nothing else to erase.
Per-template breakdown: the beacon also sends the route template
(`home/post/page/archive/search/other`, classified by `templateForPath` in
contracts — never the full path), and `web_vitals_daily` stores one row per
`(day, template, metric, bucket)`. The admin summary returns `byTemplate`
with p75/rating per metric for every template that has samples; the
speculation gate continues to use the 28-day totals.

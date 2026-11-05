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

## Limits and next steps

- Directional counts only: no unique visitors, sessions, campaigns, events or
  real-time view.
- Bots are filtered by user-agent heuristics; a spoofed client is counted.
- No retention sweep yet; pruning old days is a small future job.
- Query strings are deliberately discarded, so UTM reporting is not available.

# ADR 0057 — Field Core Web Vitals from the first-party beacon

- Status: accepted (2026-11-06)
- Related: [analytics architecture](../architecture/analytics.md), migration
  `20261106210000_add_web_vitals_daily`
- Gap: "Site Health checks configuration, not field performance" in
  [wordpress-feature-gaps](../research/wordpress-feature-gaps.md)

## Context

Site Health verifies configuration (PHP version, HTTPS, caching hints) but says
nothing about how the site actually performs for visitors. The demand is large:
Site Kit (5M+ installs) exposes Google's PageSpeed report, and Performance Lab
(100k+) adds performance features. Both send data to a third party.

MERNPress already owns a privacy-first page-view beacon: no cookies, no visitor
ids, no IP storage, Do-Not-Track honoured. Extending it to Chrome's Core Web
Vitals gives editors real field data without an external embed.

## Decision

1. **Five metrics, integer storage.** `packages/contracts/src/web-vitals.ts`
   defines LCP, INP, CLS, FCP and TTFB with web.dev's good/poor thresholds and
   fixed bucket upper bounds. Time metrics are milliseconds; CLS is the
   unitless score multiplied by 1000 ("milli-score") so every bucket is an
   integer. Values above the last bucket clamp to it.
2. **Daily histogram table.** Migration
   `20261106210000_add_web_vitals_daily` adds `web_vitals_daily`
   `(id, day, metric, bucket, count, created_at, updated_at)` with a unique
   `(day, metric, bucket)` key and a `day` index. One row per bucket per UTC
   day; no path, referrer, user agent, session or IP is stored.
3. **Public beacon.** `POST /api/public/vitals { metric, value }` validates the
   metric allowlist and a finite non-negative value, ignores bot user agents and
   the `DNT: 1` header, and always answers 204 so a beacon can never surface an
   error. `WebVitals` (client component in the root layout) observes the five
   metrics, keeps measurements in memory, and sends once per metric at
   `pagehide`/`visibilitychange`. Nothing leaves the browser when Do-Not-Track
   is set or when the analytics consent category is required and not granted.
4. **p75 from the histogram.** `histogramP75` returns the smallest bucket whose
   cumulative count reaches 75 % of samples, so the reported p75 has the
   bucket's resolution (e.g. 2.5 s buckets around the LCP boundary) and is
   monotonic. The dashboard shows the value, the web.dev rating and the sample
   count per metric.
5. **Reuse the analytics surface.** `GET /api/admin/analytics` (already
   `content.read.any`) gains a `vitals` array in display order; Dashboard →
   Analytics renders a full-width p75 panel with an explicit empty state. The
   same `analytics_retention_days` sweep deletes stale web-vital rows in one
   transaction with the page-view rows (`vitalsPruned` in the result/log/CLI).
6. **INP approximation.** INP uses the 98th percentile of interaction durations
   with a non-zero `interactionId`, mirroring web-vitals, not a single worst
   interaction.

## Alternatives considered

- **Google PageSpeed / CrUX API** — third-party request, needs an API key and
  sends the URL; contradicts the privacy-first stance.
- **Site Kit-style lab data only** — reproducible but not field experience; the
  gap explicitly asks for real-user performance.
- **Raw samples per page view** — unbounded storage and correlation risk;
  the histogram keeps five metrics × ~15 buckets per day.
- **Storing path with each sample** — useful per-template breakdowns but
  increases correlation and row count; deferred until a real need appears.

## Consequences

- The dashboard shows directional field data; it is not a substitute for a
  synthetic benchmark or a full RUM product (no device/connection breakdown).
- Bucket resolution bounds accuracy: p75 is reported at the bucket's upper
  bound. The boundary buckets are dense around the rating thresholds, so
  decisions (good vs needs-improvement) stay meaningful.
- CLS is reported as 0 for pages with no shifts, which is a valid measurement.
- No new secret or external service; retention, consent and DNT behaviour match
  the page-view beacon.

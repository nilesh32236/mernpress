# ADR 0060 — Gated speculative prerender (prefetch default, prerender on field data)

- Status: accepted (2026-11-07)
- Supersedes: the deferral in [ADR 0059](0059-speculative-prerender-evaluation.md)
- Related: [field vitals ADR 0057](0057-field-core-web-vitals.md),
  [public cache revalidation ADR 0056](0056-public-cache-revalidation.md)

## Context

ADR 0059 deferred speculative prerender until field data justified it. The
measurement (ADR 0057) now exists, so the feature can ship in gated form: the
risky part (full prerender renders) stays off until real visitors show a need,
while the cheap part (browser prefetch hints) can be enabled by an operator.

## Decision

1. **Three-mode setting.** `speculation_mode` (Reading group, default `off`)
   is one of `off | prefetch | prerender`, validated server-side and exposed in
   the public site settings. Settings → Reading shows the select with the gate
   explained in the help text.
2. **Speculation-rules injection.** The web root layout emits at most one
   `<script type="speculationrules">`:
   - `off` → no script (Next's own `<Link prefetch="auto">` still runs).
   - `prefetch` → `{"prefetch":[{"eagerness":"moderate"}]}` (same-origin by
     default; no URL-specific work).
   - `prerender` → gated (below); when the gate passes,
     `{"prerender":[{"selector":"a[href^=\"/posts/\"]","eagerness":"conservative"}]}`.
     The selector limits prerender to article links with conservative
     eagerness, so it cannot stampede every internal link.
3. **Field-data gate.** `GET /api/public/vitals-summary` returns aggregated
   28-day p75/rating/samples per metric (no paths, hosts, cookies or ids).
   Prerender activates only when LCP **and** INP each have ≥100 samples **and**
   either is `needs-improvement` or `poor` (same triggers as ADR 0059).
   Otherwise prerender mode falls back to prefetch rules, never to prerender.
4. **Pure helpers in contracts** (``shouldPrerender`, `speculationRules`) so the
   threshold, buckets and fallback are unit-tested independently of React.

## Alternatives considered

- **Shipped prerender always on** — rejected by ADR 0059 evidence.
- **Prefetch-only setting** — simpler, but the WordPress demand is specifically
  prerender; gating covers both.
- **URL-specific rules per template** — more precise but couples the rules to
  the route map; the conservative selector achieves the bound with one rule.
- **Gate in a Settings → General control** — WordPress puts speculative loading
  in Reading; this follows that.

## Consequences

- Default behaviour is unchanged (`off`): no script tag, no extra load.
- When `prerender` is saved without field data, public pages contain prefetch
  rules; editors may read that as a silent downgrade, which the help text
  states explicitly.
- The vitals-summary endpoint is an extra public aggregate; it contains only
  five p75 values and counts.
- Logged-in-only surfaces are unaffected: rules are same-origin and the web
  layout renders for anonymous visitors; no admin routes are matched by the
  selector.

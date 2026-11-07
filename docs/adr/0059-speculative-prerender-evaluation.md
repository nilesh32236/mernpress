# ADR 0059 — Speculative prerender: evaluated and deferred

- Status: accepted (2026-11-07)
- Related: [field vitals ADR 0057](0057-field-core-web-vitals.md),
  [public cache revalidation ADR 0056](0056-public-cache-revalidation.md)
- Gap: "Prerender speculative loading + settings UI" in
  [wordpress-feature-gaps](../research/wordpress-feature-gaps.md)

## Context

WordPress 6.8 ships `prefetch` only (conservative eagerness, off for logged-in
users); the Speculative Loading plugin (70,000+ installs) adds `prerender` and
`moderate` plus a Reading settings UI. The roadmap said to add prerender only
where field data justifies it, and ADR 0057 built the measurement first.

This evaluation uses that measurement plus the platform's existing load
behaviour. It does not change code.

## Evidence (2026-11-07, production)

| Signal | Value |
| --- | --- |
| Field samples in `web_vitals_daily` | **1 sample** (LCP only) |
| Page-view rows today | **1** |
| Web.dev guidance | p75 needs a 28-day window with many samples; 1 sample cannot justify a load increase |
| Public routes | home, blog, single, page, archives, search (6 templates) plus media derivatives already sized |
| Next.js prefetch | `<Link>` already prefetches in production (`auto`); static routes fully, dynamic routes to the nearest loading boundary |
| Freshness | tagged `public-content` cache + API webhook makes the next navigation fresh; a prerendered snapshot could still be served if it prerendered before an edit and the browser navigated after it without re-checking |

## Decision

**Do not enable speculative prerender yet.** Keep Next's production
`prefetch="auto"` behaviour as the loading strategy. Revisit when all of the
following hold for the same rolling window:

1. **100+ samples per metric** over 28 days in `web_vitals_daily`; and
2. **LCP p75 or INP p75 is `needs-improvement`/`poor`** on a high-traffic
   template; and
3. a prerender target exists whose navigation LCP, not server time, dominates
   (private/negative media, login-gated and error pages are excluded).

When those hold, the preferred shape is browser speculation rules
(`"prerender"` for the next likely post link only, `"prefetch"` elsewhere),
injected per template with the same-origin constraint, plus a Reading setting
(`speculation_mode: off | prefetch | prerender`). Logged-in and `DNT: 1`
visitors must be excluded, matching WordPress's stance.

## Alternatives considered

- **Enable prerender now for all post links** — would prerender every visible
  link on low traffic, multiplying server renders for ~1 visitor and risking
  stale snapshots between prerender and navigation.
- **Keep a settings UI without behaviour** — a control that promises
  performance it does not deliver; rejected.
- **Prefetch aggressively (`prefetch={true}` on every link)** — Next docs warn
  it costs a server invocation per link and can prefetch URL-specific work the
  visitor never opens.
- **Do nothing and revisit** — chosen. The vitals panel (ADR 0057) makes the
  revisit measurable instead of opinion-based.

## Consequences

- No runtime change: no speculation rules, no new setting, no load increase.
- The roadmap entry is recorded as evaluated/deferred with explicit triggers,
  so the decision is revisited with data rather than opinion.
- Production currently renders with Next's default prefetch, so the
  low-traffic cost is bounded to viewport-visible links.

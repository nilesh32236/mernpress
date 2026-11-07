# ADR 0063 — External links get rel="external noopener nofollow" at render time

- Status: accepted (2026-11-07)
- Related: [SEO research](../research/wordpress-feature-gaps.md),
  [sanitizer ADR 0007](0007-allowlist-sanitizer.md)

## Context

Outbound links in authored content were rendered without `rel`. That leaks
link equity to arbitrary sites (unless the author remembers to add it in the
editor) and, with `target="_blank"`, allows `window.opener` abuse. WordPress
link blocks add `nofollow`/open-safely hints; the SEO plugin demand (Yoast,
10M+) treats link hardening as baseline hygiene.

## Decision

The server sanitizer adds `rel="external noopener nofollow"` to every
absolute `http(s)` link via a DOMPurify `uponSanitizeElement` hook:

- existing rel tokens are preserved and merged (no duplicates);
- relative, fragment, `mailto:` and `tel:` links are untouched;
- the allowlist already permits `rel`, so no new attribute is introduced;
- stored block markup is unchanged — the hardening happens at render time,
  like the allowlist itself.

## Alternatives considered

- **Editor-only toggle** — authors forget; render-time hardening covers all
  content including imports.
- **Only `noopener`** — misses the SEO intent; `nofollow` is the point.
- **Strip `target="_blank"`** — changes author intent; `noopener` neutralizes
  the opener risk while keeping the tab behaviour.

## Consequences

- Golden render fixtures that contain absolute links gain the rel attribute;
  golden tests were updated accordingly.
- Same-host absolute URLs also get the rel (the sanitizer has no site host);
  harmless for SEO and consistent with the external treatment.
- No editor or storage change; re-render on deploy picks it up.

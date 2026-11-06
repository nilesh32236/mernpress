# ADR 0050 — Privacy-first cookie consent manager

- Status: accepted (owner scope decision, 2026-11-05)
- Implements the P2 consent item from
  [wordpress-feature-gaps.md](../research/wordpress-feature-gaps.md)

## Context

WordPress core has no cookie-consent banner; sites install CookieYes (1M+
active), Complianz or similar, which often add third-party scripts, remote calls
and a server-side consent log. MERNPress stores no consent data today, and its
only optional client feature is the cookieless aggregate analytics beacon.

## Decision

1. **One configuration object.** `consent_config` in the option store (group
   `consent`) holds `enabled`, `version`, `title`, `message`, three button
   labels, `analyticsEnabled`, `marketingEnabled` and `analyticsRequired`.
   The shared contract (types, defaults, normalization, storage parsing) lives
   in `packages/contracts/src/consent.ts`.
2. **Admin surface.** `GET/PUT /api/admin/consent` requires `manage_options`.
   Settings → Consent edits the banner (with a live text preview) and explains
   versioning: bumping it invalidates stored choices so the banner reappears.
3. **Public configuration only.** The banner config is part of
   `GET /api/public/site`. No consent data is sent to the server; there is no
   consent log, no IP and no visitor id.
4. **Browser-only choice.** `localStorage["mernpress.consent"]` stores
   `{version, analytics, marketing, decidedAt}`. A choice only counts when its
   version matches the current config. `ConsentBanner` renders only when consent
   is enabled and no current choice exists; Accept all, Reject non-essential and
   a Preferences panel with category checkboxes are offered. A small “Cookie
   settings” button reopens the banner by clearing the stored choice.
5. **Blocking is a contract, not script rewriting.** No arbitrary scripts are
   stored or injected (that would be an XSS surface). Themes/components wrap
   optional third-party content in `<ConsentGate category="analytics|marketing">`,
   which renders children only after a current grant and reacts to consent
   changes. A `mernpress:consent` event and helper functions
   (`hasConsent`, `readConsentChoice`, `writeConsentChoice`) are the public API.
6. **Analytics gating is optional.** The local page-view beacon is cookieless
   and aggregate. `analyticsRequired` (default off) makes it wait for an
   analytics grant; when off, counting continues without a choice. This is
   stated in Settings → Consent.
7. **Necessary storage is always on.** Session cookies, CSRF and the consent
   choice itself are necessary and cannot be disabled in the banner.

## Consequences

- No server-side proof of consent and no consent analytics; the product cannot
  answer “who consented and when” beyond the visitor's own browser. This is
  deliberate and documented in the UI.
- No geo-targeting, IAB TCF strings, vendor lists, or automatic script blocking.
  A site that needs those must add a reviewed plugin; the `ConsentGate`
  contract is the supported integration point.
- Storage can be unavailable (private mode); the banner simply reappears.
- Changing the wording/categories should bump `version`, otherwise existing
  choices remain valid.

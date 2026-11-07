# WordPress feature gaps and user-requested missing features (2026)

Research date: 2026-11-05. Reference installation: WordPress 7.1.4 (the
read-only reference at `../wordpress` reports 7.1.4). This document records
**observed facts with sources**, separates them from **interpretation**, and
maps each finding to a MERNPress decision. Plugin install counts come from the
official WordPress.org plugin pages on the access date; they are evidence of
demand, not proof of quality.

## 1. What WordPress core already provides

WordPress 7.1's own feature list and documentation are the baseline. Relevant
core capabilities that a modern CMS is expected to copy:

| Capability | Core evidence | MERNPress status |
| --- | --- | --- |
| Posts, pages, revisions, scheduling, trash | [WordPress features](https://wordpress.org/features/), [Media/Posts docs](https://wordpress.org/documentation/) | Done (revisions, scheduling, trash/restore) |
| Block editor, reusable blocks, patterns, block bindings | [Gutenberg](https://wordpress.org/gutenberg/) | Done (Gutenberg packages, block registry, structure lock) |
| Media library, image subsizes, responsive images, lazy loading | [Media Library screen](https://wordpress.org/documentation/article/media-library-screen/) | Done (WebP + AVIF derivatives, responsive `<picture>`, metadata) |
| XML sitemaps | [New XML sitemaps in 5.5](https://make.wordpress.org/core/2020/07/22/new-xml-sitemaps-functionality-in-wordpress-5-5/) | Done, plus image sitemap and `llms.txt` |
| AVIF upload/edit support | [WordPress 6.5 adds AVIF support](https://make.wordpress.org/core/2024/02/23/wordpress-6-5-adds-avif-support/) (changeset [57524](https://core.trac.wordpress.org/changeset/57524)) | Done, and uploads are converted to WebP + AVIF derivatives automatically |
| Comments, roles/capabilities, REST API, application passwords | [WordPress features](https://wordpress.org/features/) | Done |
| Site health, privacy tools, import/export | [WordPress features](https://wordpress.org/features/) | Done (health, privacy, WXR export/import) |

WordPress's [philosophy](https://wordpress.org/about/philosophy/) explicitly
pushes non-majority features to plugins ("clean, lean and mean"). That is why
the gaps below exist; it is a product decision, not an oversight.

## 2. Observed gaps in core, with demand evidence

All install counts below were read from the official plugin pages on
2026-11-05.

| Gap | Core status | Demand evidence | MERNPress decision |
| --- | --- | --- | --- |
| **Reliable mail (SMTP)** | Core sends PHP `mail()` only; no SMTP settings UI | [WP Mail SMTP](https://wordpress.org/plugins/wp-mail-smtp/): 4+ million active | Capability exists (SMTP transport, mail log, test); credentials are owner-supplied env values, not stored in the DB |
| **Two-factor authentication** | Not in core | [Two Factor](https://wordpress.org/plugins/two-factor/): 100,000+; [WP 2FA](https://wordpress.org/plugins/wp-2fa/): 100,000+ | Done (TOTP, recovery codes, admin reset, login challenge) |
| **Backups / restore** | Not in core | [UpdraftPlus](https://wordpress.org/plugins/updraftplus/): 4+ million active | Done (tar.gz SQL + media, CLI restore, retention) |
| **SEO metadata, schema, redirects** | Core has sitemaps but no meta/schema/redirect manager | [Yoast SEO](https://wordpress.org/plugins/wordpress-seo/): 10+ million; [Redirection](https://wordpress.org/plugins/redirection/): 2+ million | Done (SEO fields, JSON-LD, Twitter cards, image sitemap, redirects, 404 log) |
| **Spam protection** | Akismet is a plugin, external service | [Akismet](https://wordpress.org/plugins/akismet/) is bundled but requires an account | Done as a **local heuristic guard**; Akismet remains optional/owner-supplied |
| **Forms** | Not in core | [WPForms](https://wordpress.org/plugins/wpforms-lite/): 5+ million active | **Out of scope** by project policy (AGENTS §12: no forms/CRM) |
| **Media library folders** | No folder tree; only list/search/filter | [FileBird](https://wordpress.org/plugins/filebird/): 200,000+; [Real Media Library](https://wordpress.org/plugins/real-media-library-lite/): 100,000+; [WP Media Folder](https://wordpress.org/plugins/wp-media-folder/): 90,000+ | **P1 candidate** (virtual collections; not built yet) |
| **Bulk image regeneration / converting the existing library** | Core converts nothing on its own: the 6.5 announcement's own comments ask "Is there a way to convert existing files?" and the answer is "Not directly in core, plugins should let you do this." Client-negotiated `<picture>` is still ticket [#42920](https://core.trac.wordpress.org/ticket/42920) | [Regenerate Thumbnails](https://wordpress.org/plugins/regenerate-thumbnails/): 1+ million; [EWWW Image Optimizer](https://wordpress.org/plugins/ewww-image-optimizer/): 1+ million | **Built in this slice** (see §4) |
| **Page caching / object cache** | Not in core | [LiteSpeed Cache](https://wordpress.org/plugins/litespeed-cache/): 7+ million | Deferred (deployment-level concern; the API is already cache-friendly) |
| **Cookie consent / CMP** | Not in core | [CookieYes](https://wordpress.org/plugins/cookie-law-info/): 1+ million active | P2 candidate (privacy helper exists; no consent banner yet) |
| **Multilingual** | Not in core (Gutenberg phase 4 scope) | [Polylang](https://wordpress.org/plugins/polylang/): 900,000+ | P2; large model change, needs its own ADR |
| **Analytics** | Not in core | [Site Kit](https://wordpress.org/plugins/google-site-kit/): 5+ million | P2; prefer a privacy-first local option over a third-party embed |
| **Security firewall / malware scan** | Not in core | [Wordfence](https://wordpress.org/plugins/wordfence/): 5+ million | Out of scope for the application (operator/WAF responsibility, recorded in the threat model) |

Interpretation (not observed fact): the largest demand clusters are **mail and
security basics**, **SEO**, **media management**, and **forms/e-commerce**. The
first three are already covered here; media folders and bulk optimization are
the remaining high-demand media gaps.

## 3. Direct user requests found in primary sources

- AVIF announcement comments (official Make WordPress Core post): users ask
  whether existing files can be converted, whether the original is kept, and
  whether AVIF can be served with a JPEG fallback. The core contributors answer
  that conversion and negotiation are plugin/CDN territory and that `<picture>`
  is still [ticket #42920](https://core.trac.wordpress.org/ticket/42920).
- Media folder plugins exist specifically because the Media Library has no
  folder concept; their combined official install count exceeds 390,000.
- Mail and 2FA plugins are installed at millions/100k+ scale despite core
  providing neither.

These are demand signals, not a statistically representative survey; the
project does not claim to know the whole market.

## 4. Prioritized roadmap

| Priority | Item | Why | Status |
| --- | --- | --- | --- |
| P0 | Keep the implemented parity surface green | Tests/E2E/builds are the guardrail | Ongoing |
| P1 | **Bulk regenerate image sizes/derivatives** | Core explicitly does not do it; existing media can be stale after settings changes or imports; we already own the pipeline | **Implemented now** |
| P1 | Media library virtual folders/collections | Largest unimplemented media demand (390k+ installs across three plugins) | **Implemented now** (ADR 0048, D-106): nested virtual folders, indented tree, create/rename/cycle-safe move/delete with child reparenting, drawer assignment. No drag-drop/bulk move; names globally unique |
| P2 | Cookie consent manager | 1M+ installs; privacy tooling already exists | **Implemented now** (ADR 0050): local banner/config and `ConsentGate` |
| P2 | Multilingual content model | 900k+ installs; Gutenberg phase 4 | **Implemented now** (ADR 0051–0052, D-100–D-105): languages/translation groups, prefixed URLs, hreflang, sitemap `xhtml:link` alternates, per-language menus and component/theme strings, date locales and 404 copy. No language negotiation or machine translation |
| P2 | Privacy-first analytics | 5M+ analytics installs; self-hosted counters avoid third-party embeds | **Implemented now** (ADR 0049, D-107): local aggregate beacon, Dashboard → Analytics, configurable retention sweep + CLI. No unique visitors/sessions/campaigns (privacy choice) |
| P2 | Page/object cache integration | 7M+ cache plugin installs; operational rather than editorial | **Documented** (production-hosting.md): tagged Next cache + webhook invalidation shipped; CDN/object-cache guidance with bypass rules and field-data triggers |
| — | Forms, e-commerce, CRM, marketplaces | Explicitly out of scope in AGENTS §12 | Not built |
| — | SMTP credentials | Owner-only secret | Blocked on the owner |
| — | Firewall/malware scanning | Operator boundary (threat model) | Not built |

## 5. What this slice implements

**Virtual media folders** (ADR 0048): a `media_folders` table plus
`media_items.folder_id` (SetNull), a Folder bar in the Media Library with
filter counts, create/rename/delete, and assignment from the attachment drawer.
Files stay flat on disk, so URLs do not change; nesting and drag-and-drop are
documented limits.

**Bulk media regeneration** (`POST /api/admin/media/regenerate`, Media Library
button "Regenerate image sizes"):

- cursor-based batches (default 20, max 50) so a large library cannot time out;
- rebuilds every configured WebP + AVIF derivative from the canonical stored
  file and updates the `derivatives` JSON;
- reports `processed`, `failed`, `remaining` and the next cursor; missing or
  unreadable files count as failures without aborting the batch;
- requires `content.create` (the same capability as upload), and every file
  path is confinement-checked before writing.

This closes the specific gap the core contributors named: existing images can be
converted/regenerated without a third-party plugin.

## 6. Sources (accessed 2026-11-05)

- https://wordpress.org/features/
- https://wordpress.org/about/roadmap/
- https://wordpress.org/about/philosophy/
- https://wordpress.org/documentation/article/media-library-screen/
- https://make.wordpress.org/core/2020/07/22/new-xml-sitemaps-functionality-in-wordpress-5-5/
- https://make.wordpress.org/core/2024/02/23/wordpress-6-5-adds-avif-support/
- https://core.trac.wordpress.org/changeset/57524
- https://core.trac.wordpress.org/ticket/42920
- https://wordpress.org/plugins/wp-mail-smtp/ (4+ million active)
- https://wordpress.org/plugins/two-factor/ (100,000+ active)
- https://wordpress.org/plugins/wp-2fa/ (100,000+ active)
- https://wordpress.org/plugins/updraftplus/ (4+ million active)
- https://wordpress.org/plugins/wordpress-seo/ (10+ million active)
- https://wordpress.org/plugins/redirection/ (2+ million active)
- https://wordpress.org/plugins/akismet/ (bundled, external service)
- https://wordpress.org/plugins/wpforms-lite/ (5+ million active)
- https://wordpress.org/plugins/filebird/ (200,000+ active)
- https://wordpress.org/plugins/real-media-library-lite/ (100,000+ active)
- https://wordpress.org/plugins/wp-media-folder/ (90,000+ active)
- https://wordpress.org/plugins/regenerate-thumbnails/ (1+ million active)
- https://wordpress.org/plugins/ewww-image-optimizer/ (1+ million active)
- https://wordpress.org/plugins/litespeed-cache/ (7+ million active)
- https://wordpress.org/plugins/cookie-law-info/ (1+ million active)
- https://wordpress.org/plugins/polylang/ (900,000+ active)
- https://wordpress.org/plugins/google-site-kit/ (5+ million active)
- https://wordpress.org/plugins/wordfence/ (5+ million active)

## 7. 2026 update — additional gaps and direct user requests

Research date: 2026-11-06. Stable core is WordPress 7.1.4; 7.2 is in beta
([Make/Core](https://make.wordpress.org/core/)). Install counts below are the
official WordPress.org directory figures read on that date. These rows are
additive to §2 and do not repeat SMTP/2FA/backups/SEO/media/consent/multilingual.

| Gap | Core status | Demand evidence | MERNPress decision |
| --- | --- | --- | --- |
| **Real-time co-editing (RTC)** | Not shipped. Removed from the 7.0 release over race conditions, server load and fuzz-test bugs; still R&D ([removal post](https://make.wordpress.org/core/2026/05/08/rtc-removed-from-7-0/), [sync-engine guide](https://make.wordpress.org/core/2026/10/14/real-time-collaboration-a-guide-to-sync-engines/)) | Direct user requests in the removal post: teams editing one post simultaneously, or round-tripping through Google Docs. VIP beta feedback: [early user feedback](https://make.wordpress.org/core/2025/12/16/real-time-collaboration-early-user-feedback/) | **P2** after the revision/conflict model; core itself judged the current design not robust enough to ship. |
| **AI content features** | Core ships the AI Client + Settings → Connectors only; user-facing AI is a separate plugin ([AI plugin](https://wordpress.org/plugins/ai/)) | Official **AI** plugin: **60,000+** active, v1.5.0 (2026-10-30) | **P2** opt-in with owner-supplied provider keys and a privacy/cost ADR; same stance as SMTP. |
| **Prerender speculative loading + settings UI** | Core 6.8 ships `prefetch` only, conservative eagerness, off for logged-in users; a UI is explicitly out of core scope ([dev note](https://make.wordpress.org/core/2025/03/06/speculative-loading-in-6-8/)) | **Speculative Loading** plugin: **70,000+** active, adds `prerender`/`moderate` + Reading UI | **Implemented 2026-11-07 (ADR 0060): gated** — Reading setting `speculation_mode` + same-origin speculation rules; prerender only with 100+ LCP/INP samples and a needs-improvement rating, else prefetch fallback |
| **Field Core Web Vitals / INP monitoring** | Site Health checks configuration, not field performance ([Site Health docs](https://wordpress.org/documentation/article/site-health-screen/)) | **Site Kit** PageSpeed report: **5+ million** active; **Performance Lab**: **100,000+** | **Implemented** (ADR 0057): first-party LCP/INP/CLS/FCP/TTFB beacon, daily p75 histogram, ratings and Dashboard → Analytics panel. No per-path/device breakdown yet |
| **Deterministic background jobs / queue** | WP-Cron is request-triggered (“only triggered on page load”) ([cron docs](https://developer.wordpress.org/plugins/cron/)) | **Action Scheduler**: **20,000+**; **WP Crontrol**: **300,000+** active | **Implemented** (ADR 0054): durable `jobs` table, `FOR UPDATE SKIP LOCKED` claims, exponential retries, stale-worker recovery, retention handlers, history pruning and Tools → Scheduled Actions. No cron expressions, per-job timeouts or non-retention handlers yet |
| **Relevant full-text search** | Core search is a `LIKE` scan; Relevanssi exists to replace it ([plugin](https://wordpress.org/plugins/relevanssi/)) | **Relevanssi**: **100,000+** active, v4.28.8 (2026-10-30) | **Implemented** (ADR 0053): weighted generated `tsvector`, GIN index, `websearch_to_tsquery` phrases/exclusions, rank-first ordering and a substring fallback. No stemming, synonyms or typo correction |
| **Broken-link detection** | Not in core; no link checker in the official features list ([features](https://wordpress.org/about/features/)) | **Broken Link Checker**: **500,000+** active (2026-10-13) | **Implemented** (ADR 0058) + **external evaluation** (ADR 0061): SSRF guard + **gated fetcher shipped** (ADR 0062): Reading toggle (default off), DNS pinning, per-hop re-check, 5s timeout, ≤3 redirects, 100/batch budget |
| **Staging / clone / push-to-live** | Not in core; provided by plugins ([WP Staging](https://wordpress.org/plugins/wp-staging/)) | **WP Staging**: **100,000+** active, v4.20.0 (2026-11-06) | **Out of scope** — deployment/ops boundary; backups + CLI restore cover recovery. |
| **SQLite / single-file database** | Core requires MySQL/MariaDB; SQLite is a feature plugin that starts empty ([plugin](https://wordpress.org/plugins/sqlite-database-integration/)) | **5,000+** active, v3.1.3 (2026-11-03) | **Out of scope** — AGENTS §6 mandates PostgreSQL and forbids a second production schema path. |
| **Export Site Editor design to a theme package** | Core keeps edited templates/styles in the DB; export is a plugin feature ([Create Block Theme](https://wordpress.org/plugins/create-block-theme/)) | **Create Block Theme**: **20,000+** active, v2.10.2 (2026-10-01) | **P2** — MERNPress themes are code packages; only relevant if DB-backed templates ship. |
| **Builder migration / structured “data liberation”** | Core path is WXR/legacy importers; Data Liberation phases are ongoing ([project](https://wordpress.org/data-liberation/)) | **Unverified** demand for builder migration; official **WordPress Importer**: **2,000,000+** (import demand only) ([plugin](https://wordpress.org/plugins/wordpress-importer/)) | **P2** — WXR import ships; builder migration needs measured demand first. |
| **Classic / plain-writing editor** | Block editor is core; classic editing is the official Classic Editor plugin ([plugin](https://wordpress.org/plugins/classic-editor/)) | **Classic Editor**: **8,000,000+** active, v1.7.0 (2026-05-28) | **Out of scope** as a second editor (breaks one registry/schema); read the 8M installs as a UX warning about writing speed, not a feature request. |

Sources: the linked primary sources above plus the WordPress.org plugin API
(`active_installs`, versions, last-updated) read on 2026-11-06. Quotes from the
RTC post are user comments (anecdotal, not a survey); builder-migration demand
is explicitly unverified.

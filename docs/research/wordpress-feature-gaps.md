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
| P1 | Media library virtual folders/collections | Largest unimplemented media demand (390k+ installs across three plugins) | **Implemented now** (ADR 0048): flat virtual folders, one per item, filter/create/rename/delete + drawer assignment |
| P2 | Cookie consent manager | 1M+ installs; privacy tooling already exists | Proposed |
| P2 | Multilingual content model | 900k+ installs; Gutenberg phase 4 | Proposed; needs an ADR before code |
| P2 | Privacy-first analytics | 5M+ analytics installs; self-hosted counters avoid third-party embeds | **Implemented now** (ADR 0049): local aggregate beacon + Dashboard → Analytics |
| P2 | Page/object cache integration | 7M+ cache plugin installs; operational rather than editorial | Deferred to deployment docs |
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

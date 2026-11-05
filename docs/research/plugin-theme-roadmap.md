# Plugin and theme roadmap — research (2026-11-05)

This document records what WordPress does well, what its users complain about,
and which of those gaps MERNPress should close with first-party code, plugins or
themes. It is a roadmap, not a promise: every item needs its own slice, ADR and
tests.

## 1. What WordPress ships that MERNPress has now matched

| WordPress capability | MERNPress status |
| --- | --- |
| Block editor and server-rendered block content | Implemented (ADR 0006/0007) |
| Media library, derivatives, Edit Image | Implemented (ADR 0008/0024) |
| Comments and moderation | Implemented (ADR 0009) |
| Roles/capabilities | Implemented (ADR 0004) |
| Settings, reading, discussion, permalinks, media | Implemented (ADR 0010) |
| Menus/widgets equivalents, site editor surface | Implemented as the Appearance screens |
| Plugins, activation, updates, delete | Implemented with on-disk packages (ADR 0012/0020/0025/0027) |
| Themes, activation, details | Implemented with theme packages (ADR 0011/0028) |
| Import/Export (WXR) | Implemented (ADR 0016/0022) |
| SMTP mail, comment notifications, reset links | Implemented (ADR 0019/0021) |
| Application passwords, profile preferences | Implemented (ADR 0018) |
| XML sitemap, robots.txt, per-post robots, canonical, OG | Implemented |
| Structured data (Schema.org) | **First-party JSON-LD** (ADR 0025-era SEO slice) |

## 2. What WordPress users repeatedly ask for

Sources: r/Wordpress, r/WordpressPlugins, r/ProWordPress threads from 2025–2026,
and long-form migration write-ups. Recurring themes:

1. **Plugin bloat and "a plugin for everything".** Basic features (SEO, SMTP,
   caching, security, backups, redirects, image optimisation) each require a
   third-party plugin with its own settings, ads and update risk. Users say they
   counted 20–50 active plugins on ordinary sites.
2. **Updates that break layouts.** No safe preview, no global undo, and plugins
   interact unpredictably. A first-party update path with rollbacks is valued.
3. **Redirects and 404 management.** Users call a lightweight redirect manager
   with 404 logs and one-click suggestions "still underserved"; most existing
   plugins are bloated or abandoned.
4. **Email deliverability visibility.** "I never got the form email" is a common
   support ticket; plugins rarely show a log of what was sent and why it failed.
5. **Backups and restore that are actually usable.** Complaints about missing
   exclusions, retention rules, point-in-time restore and opaque failures.
6. **Safe editing for non-technical clients.** Clients break layouts by editing
   one paragraph; a locked "edit only this text" mode is requested.
7. **Performance tuning feels like black magic.** Caching, asset optimisation and
   image formats should be built in, not assembled from plugins.
8. **Dashboard/admin performance and noise.** Slow admin pages, stacked update
   badges and notification spam.
9. **Security basics.** Users say two-factor authentication should be core, not a
   plugin.
10. **Consistency.** Inconsistent UI between core and plugins; conflicting schema
    or SEO output from two plugins.

## 3. Where block themes stand (2026)

- Block themes are ~44 % of new WordPress.org submissions but roughly 8–18 % of
  active installs; classic themes still dominate the installed base.
- Buyers now expect native block support, performance-first CSS/JS (no jQuery
  bloat), clear licensing, maintenance and rollback paths.
- The most requested blog-theme features are multiple blog layouts, related
  posts, next/previous navigation, author boxes, reading time, reading progress
  and show/hide metadata.
- Criticism of the Site Editor: default core styles fight advanced layouts,
  inconsistent controls and no responsive editing.

MERNPress's theme model is deliberately smaller than FSE: tokens plus a closed
layout variant, no in-browser template editing. That is honest and fast, and it
avoids the "fight the Site Editor" problem. If a theme needs a new layout, it is
a code change, not a fragile user-built template.

## 4. What MERNPress now ships as a differentiator

### Core performance
- Automatic WebP **and AVIF** derivatives for every upload (ADR 0026), with
  `<picture>` negotiation on the public site. Measured on a 1600×900 photo:
  1200 px AVIF 231 KB vs WebP 418 KB (−45 %), 300 px AVIF 6.6 KB vs 13.4 KB
  (−50 %).
- Server-rendered content (no JS needed for crawlers), intrinsic image
  dimensions, lazy/eager loading and `fetchpriority` on the LCP hero.
- First-party technical SEO: JSON-LD, Twitter cards, image sitemap, `/llms.txt`
  (documented as experimental).

### Plugins (real, runnable, trusted local packages)

| Plugin | Use case | Evidence |
| --- | --- | --- |
| **Auto Excerpt** | Fills an empty excerpt from the post body so archives, feeds and search always have a summary; never overwrites authored excerpts. | `plugins/auto-excerpt/plugin.mjs`, runtime tests, production verification |
| **SEO Fallbacks** | Fills missing meta description / OG title / OG description from visible content; authored values win; no keyword scoring or external calls. | `plugins/seo-fallback/plugin.mjs`, runtime tests |

These are not marketplace downloads. They demonstrate the trusted-package model
and solve two concrete gaps without adding a settings screen or bloat.

### Themes

| Theme | Character | Implementation |
| --- | --- | --- |
| **MERNPress** | The previous classic design, expressed as tokens | `themes/mernpress/theme.json` |
| **MERNPress Journal** | Editorial: warm paper, centred serif masthead, 700 px measure, boxed rules | `themes/journal/theme.json` + journal CSS variant |

Themes are data packages: tokens and a closed layout variant. Switching is
instant and safe; no PHP or template execution.

## 5. Candidate next slices (ranked)

1. ~~**Redirect & 404 manager**~~ — delivered (ADR 0030): normalized
   redirect table, loop rejection, aggregated 404 log, public middleware and
   Redirect/Dismiss actions.
2. **Transactional mail log** — store the last N sends with status, recipient
   and error; show deliverability status. Complements the SMTP transport and
   answers the most common support question without exposing message bodies.
3. **Backup/export packages** — database + media archive with retention and a
   documented restore, built on the existing WXR/media services rather than a
   new vendor. High demand, but needs careful security and disk handling.
4. **Safe client editing mode** — a per-post "locked blocks" flag that disables
   structural edits while allowing text changes. Large editor change; valuable
   for agencies.
5. **Reading time / related posts / author box theme features** — small,
   high-demand blog features; can be tokens or a plugin once a template hook
   exists.
6. **Two-factor authentication** — TOTP for administrators, recovery codes. Core
   security gap users call out; needs its own ADR.
7. **Redirect-aware slug rename** — automatically create a 301 when a published
   slug changes (fits with the redirect manager).
8. **Admin performance budget** — keep the admin bundle and dashboard queries
   under documented thresholds; add a CI check.

## 6. Explicit non-goals

The repository boundary still applies: no marketplace, billing, multi-tenancy,
cloud hosting, forms/CRM, outreach, compliance workflows or e-commerce. Plugin
packages are local and trusted; there is no ZIP upload, remote install or
automatic download. The Theme/Plugin File Editors stay excluded (RCE surface).

## Sources

- r/WordpressPlugins, "What WordPress plugin is missing or badly made right
  now?" (2026-06-03): https://www.reddit.com/r/WordpressPlugins/comments/1tvjluz/
- r/Wordpress, "What is a small feature that annoys you in WordPress?"
  (2026-04-03): https://www.reddit.com/r/Wordpress/comments/1sbb7iu/
- r/ProWordPress, "Are people actually leaving WordPress…?" (2026-04-28):
  https://www.reddit.com/r/ProWordPress/comments/1sy576c/
- r/Wordpress, "If you wanted one or more improvements…" (2025-12-13):
  https://www.reddit.com/r/Wordpress/comments/1plq86o/
- holas.pl, "19 Years of WordPress — Why I Finally Quit" (2026-03-17):
  https://holas.pl/blog/why-i-left-wordpress/
- WP.MD, "The State of WordPress Themes — 14,800 themes" (2026-06-23):
  https://wp.md/blog/state-of-wordpress-themes-2026/
- Superb Themes, "Are Premium WordPress Marketplaces Slowly Dying?" (2026-02-05):
  https://superbthemes.com/blog/why-premium-wordpress-marketplaces-are-losing-ground/
- Bob the Web Builder, theme feature comparison (2026-05-06):
  https://bobthewebbuilder.com/wordpress-theme/
- WordPress.org, "Block themes": https://wordpress.org/documentation/article/block-themes/

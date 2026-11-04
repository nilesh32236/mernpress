# WordPress 7.1.4 parity matrix (admin)

Captured 2026-11-04 by reading both menus: the live WordPress 7.1.4 reference at
`/wp-admin/` and the MERNPress admin at `/admin/`. Use it to see exactly which
screens exist, where they were verified and what is still outstanding.

## Menu diff

| WordPress top-level | WordPress submenu | MERNPress status |
| --- | --- | --- |
| Dashboard | Home, Updates | Match |
| Posts | All Posts, Add Post, Categories, Tags | Match (label fixed to "Add Post") |
| Media | Library, Add Media File | Match |
| Pages | All Pages, Add Page | Match (label fixed to "Add Page") |
| Comments | — (single link, moderation bubble) | Match (submenu removed) |
| Appearance | Themes, Editor, Fonts | Match |
| Plugins | Installed Plugins, Add Plugin | Match (Add Plugin states no marketplace) |
| Users | All Users, Add User, Profile | Match |
| Tools | Available Tools, Import, Export, Site Health, Export Personal Data, Erase Personal Data, Theme File Editor, Plugin File Editor | Match except the two File Editors (excluded, see below) |
| Settings | General, Connectors, Writing, Reading, Discussion, Media, Permalinks, Privacy | Match |

## Screen status

Legend: **D** = implemented and visually verified against the reference in
development; **P** = additionally captured and reviewed in production with a
temporary administrator account (2026-11-04); **X** = deliberately excluded by
owner decision.

| Screen | Status | Notes |
| --- | --- | --- |
| Login | D/P | WordPress login layout, error copy, Remember Me |
| Dashboard + widgets | D/P | Welcome, Site Health, At a Glance, Activity, Quick Draft, Events and News |
| Posts list / editor / Quick Edit / revisions / preview | D/P | Gutenberg-compatible editor, status tabs, filters, bulk actions |
| Categories / Tags | D/P | Add/edit/delete, hierarchy, counts |
| Media library / grid / list / details | D/P | Upload, derivatives, alt text, grid/list toggle |
| Pages list / editor | D/P | Same editor chrome as posts |
| Comments | D/P | Status tabs, moderation, edit, bulk, dashboard widget |
| Appearance → Themes | D/P | Grid, details dialog, search, Customize |
| Appearance → Editor | D/P | Design sidebar, template list, live canvas |
| Appearance → Fonts | D/P | Library, weights, samples, unavailable upload/install |
| Plugins → Installed | D/P | Filters, bulk, active edge, auto-update column |
| Plugins → Add Plugin | D/P | Honest no-marketplace boundary |
| Users / Add User / Profile | D/P | Roles, display name select, colour schemes, password |
| Tools → Available Tools / Export / Site Health | D/P | Cards, export JSON, health checks |
| Tools → Import | D/P | Real WordPress WXR import |
| Tools → Export/Erase Personal Data | D/P | Request queue, JSON export, anonymising erasure |
| Tools → Theme/Plugin File Editor | X | In-browser server-code editing excluded (RCE surface) |
| Settings → General/Reading/Writing | D/P | Site identity, formats, feed options, mail fields |
| Settings → Discussion/Media/Permalinks/Privacy | D/P | Options drive comments, uploads, URLs, privacy page |
| Settings → Connectors | D/P | Encrypted provider credentials, masked state |
| Updates | D/P | Version report, "Check again", manifest checks |
| Public: home/blog/single/page/archives/search/404/author/feed/sitemap | D/P | Twenty Twenty-Five geometry, comments, pagination |

## Verification evidence

- **Development**: every screen above was opened in a real browser, measured
  against the live WordPress 7.1.4 reference and fixed (search block, 404
  geometry, list tables, editor chrome, media grid, dashboard widgets, theme
  dialog, plugin table, updates, import, personal data, connectors, site editor,
  fonts).
- **Production (2026-11-04)**: a temporary administrator account was created
  for the pass and deleted afterwards. All 20 admin screens were captured at
  1440px (plus the mobile posts list at 375px) and reviewed: dashboard, posts,
  pages, media, comments, themes, plugins, users, add user, profile, tools,
  import, export personal data, general settings, discussion settings,
  connectors, updates, site editor, fonts, login. Write paths were exercised
  live: updates "Check again", connector save/disconnect, and a media upload
  (201, served 200).
- **Production public templates (2026-11-04)**: captured anonymously at 1440px
  after the admin pass — home, blog, single post, page, search, 404, author and
  feed. Measured geometry matches the WordPress reference: home/blog/search
  titles at `(398,141,645,54)` 48px/400, the search block `645×61` with a 498px
  input and 129px button, the 404 at title `(745,750)` / form `(745,905)` /
  photo `645×826` / footer 1035, and no horizontal overflow on any page. The
  RSS feed returns `application/rss+xml` XML. Category/tag archives 404 because
  production has no published terms, which matches WordPress.
- **Production bug found and fixed by this pass**: `mernpress-api.service` runs
  with `ProtectSystem=strict`, which made `/opt/mernpress/media` read-only to the
  process even though the directory was owned by `mernpress`. Site Health
  reported `Media storage: Critical` and uploads failed. The unit now declares
  `ReadWritePaths=/opt/mernpress/media` (backup kept), the service was
  restarted, Site Health reports Good, and a real upload succeeded.

## Outstanding

1. **Tools → Theme/Plugin File Editor.** Owner decision (2026-11-04): keep them
   excluded; do not ship a read-only viewer. Recorded in AGENTS.md.
2. Third-party importers (Blogger, LiveJournal, Movable Type, RSS, Tumblr) and
   the plugin marketplace are listed as unavailable by design; they need
   external services and an install/runtime story the project has not accepted.
3. Per-screen pixel comparison is complete for the WordPress chrome and layout,
   in development and production; content differences (fewer posts/pages in
   production) are expected and documented above.

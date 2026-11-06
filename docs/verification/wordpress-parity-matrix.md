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
| Settings | General, Connectors (AI keys + bundled spam guard), Writing, Reading, Discussion, Media, Permalinks, Privacy | Match except Akismet (external credentials; see below) |

## Screen status

Legend: **D** = implemented and visually verified against the reference in
development; **P** = additionally captured and reviewed in production with a
temporary administrator account (2026-11-04); **X** = deliberately excluded by
owner decision.

| Screen | Status | Notes |
| --- | --- | --- |
| Login | D/P | WordPress login layout, error copy, Remember Me, Lost Password form, reset-token screen |
| Dashboard + widgets | D/P | Welcome, Site Health, At a Glance, Activity, Quick Draft, Events and News |
| Settings → Languages / editor → Translations | D/P | Per-post language + linked translation groups, default-language unprefixed URLs, `/<lang>/…` variants, hreflang alternates (with x-default) and sitemap entries with `xhtml:link` alternates. WordPress needs Polylang (900k+) or WPML; archives stay default-language. Per-language header menus, layout chrome, post meta, author box, related/more headings, comments, pagination, search form, date locales and the 404 copy are editable in Settings → Languages (ADR 0051–0054) |\n| Settings → Consent | D/P | Cookie banner configuration (copy, labels, categories, version) with browser-only consent; `ConsentGate` for optional content. WordPress needs CookieYes/Complianz, usually with third-party scripts and server logs |\n| Dashboard → Analytics | D/P | Privacy-first local aggregate views (no cookies/IPs), 7/30-day totals, daily bars, top paths and referrer hosts, plus configurable retention pruning; WordPress needs Jetpack/Site Kit or MonsterInsights (third-party) |\n| Screen Options | D/P | Per-user columns, items per page, view mode, dashboard boxes/columns and editor panel visibility; stored on the user and synced across browsers |
| Media → Folders | D/P | Nested virtual folders (indented tree, create with parent, rename, cycle-safe move, delete reparents children) with per-item assignment and counts; files stay flat on disk. WordPress needs FileBird/Real Media Library/WP Media Folder. Manage folders tree with per-folder actions and folder-aware uploads. Bulk move from grid/list selection, internal drag-and-drop and OS file-drop uploads onto tree rows. Names globally unique (ADR 0048) |\n| Media → Bulk regeneration | D/P | “Regenerate image sizes” rebuilds WebP + AVIF derivatives for existing media in bounded batches; WordPress needs the Regenerate Thumbnails plugin |
| Editor → Notes / All notes | D/P | Per-post threads with author names, timestamps, replies, resolve/reopen and an unresolved count; root notes are anchored to the selected block with a stable metadata id and stay exact when it moves or its text changes (ADR 0045), plus two-stage deletion (trash, restore, purge) with an audit trail and a configurable retention sweep, optional note/reply/deletion mail with a per-post override, and @username mention notifications with an autocomplete picker (ADR 0045) |
| Posts list / editor / Quick Edit / revisions / preview | D/P | Row actions, Bulk edit/Move to Trash, WordPress sidebar order and Options menu; Quick Edit has date/author/terms/password/private/comments/sticky; Bulk Edit has terms/author/comments/sticky/format/status |
| Safe client editing | D/P | Per-post block-structure lock enforced by the API (409 on structural edits) while text edits remain allowed; editor banner, panel and canvas guard. WordPress has no core equivalent |
| Categories / Tags | D/P | Add/edit/delete, hierarchy, counts |
| Media library / grid / list / details | D/P | Upload, derivatives, alt text, grid/list toggle, Edit Image (rotate/flip/crop/scale/undo/redo/restore) |
| Pages list / editor | D/P | Same editor chrome as posts |
| Comments | D/P | Status tabs, moderation, edit, bulk, dashboard widget, e-mail notifications when mail is configured |
| Appearance → Themes | D/P | Store-backed grid, details dialog, search, Customize; two installable theme packages (classic + Journal) with real design switching |
| Appearance → Editor | D/P | Design sidebar, template list, live canvas |
| Appearance → Fonts | D/P | Library, weights, samples, unavailable upload/install |
| Plugins → Installed | D/P | Filters, bulk, active edge, auto-update column, View details, Delete (inactive only, removes the package directory); plugins can ship a real runtime module (Auto Excerpt) |
| Plugins → Add Plugin | D/P | WordPress description + filter bar/search; directory tabs disabled and explained; installed packages listed |
| Profile → Two-Factor / Login challenge | D/P | TOTP enrollment, recovery codes, password+code disable, admin reset, two-step login; WordPress needs a plugin |
| Profile → Administration Color Scheme | D/P | The nine WordPress schemes (Default, Light, Modern, Blue, Coffee, Ectoplasm, Midnight, Ocean, Sunrise), stored per user and applied on login |
| Users / Add User / Profile | D/P | Roles, display name select, colour schemes, syntax highlighting, language, application passwords, password, Send password reset (row + bulk); Send User Notification enabled when mail is configured and includes a reset link |
| Public post template | D/P | Reading time, related posts by category with newest fallback, author box with local initials avatar, prev/next, comments; WordPress themes/plugins need code for this |
| SEO / metadata | D/P | Per-post SEO fields, JSON-LD (BlogPosting/WebPage/Breadcrumb/Collection/Profile), Twitter cards, image sitemap, /llms.txt; WordPress needs plugins for all of this |
| Tools → Backups | D/P | Database + media archive, retention, admin download/delete, documented CLI restore; WordPress needs a plugin |
| Tools → Scheduled Actions | D/P | Durable PostgreSQL job queue with SKIP LOCKED claims, exponential retries, stale-worker recovery, daily retention sweeps and admin Run now/Cancel. WordPress core WP-Cron fires on page loads; Action Scheduler adds the durable queue |
| Tools → Redirects | D/P | Admin-managed 301/302 redirects applied by public middleware, loop rejection, aggregated 404 log with Redirect/Dismiss; WordPress needs a plugin |
| Tools → Available Tools / Export / Site Health | D/P | Cards; WordPress WXR export with All/Posts/Pages/Media scopes and author, date-range, status and category filters; health checks |
| Tools → Import | D/P | WordPress importer order, real WXR import, unavailable importers stated, closing marketplace note |
| Tools → Export/Erase Personal Data | D/P | Request queue, JSON export, anonymising erasure |
| Tools → Theme/Plugin File Editor | X | In-browser server-code editing excluded (RCE surface) |
| Settings → General/Reading/Writing | D/P | Site identity, formats, feed options, mail fields |
| Settings → Discussion → Mail delivery | D/P | Transport status, sender and a metadata-only delivery log with Clear; WordPress needs a plugin |
| Appearance → Customize | D/P | Site Identity, Colors (five theme tokens), Menus (label/URL items), Homepage Settings (static front page + posts page) and validated Additional CSS; Site Editor covers templates |\n| Settings → Discussion/Media/Permalinks/Privacy | D/P | Options drive comments, uploads, permalink structures (presets, custom pattern, category/tag bases), privacy page; comment/moderation e-mails sent when mail is configured |
| Settings → Connectors | D/P | Encrypted provider credentials, masked state |
| Updates | D/P | Version report, "Check again", manifest checks |
| Public: home/blog/single/page/archives/search/404/author/feed/sitemap | D/P | Twenty Twenty-Five geometry, comments, pagination |
| Public/admin search | D/P | Ranked PostgreSQL FTS (title A / excerpt B / body C, GIN) with quoted phrases, `-exclusion`, substring fallback and composable filters (status, language, category/tag, author, month, role visibility). WordPress core is a `LIKE` scan; users install Relevanssi (100k+) for relevance |

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
- **Production Profile verification (2026-11-04)**: the Profile screen showed
  WordPress's Syntax Highlighting and Language rows and the Application
  Passwords section. A credential created there authenticated a Basic-auth API
  request over HTTPS (200), recorded its last-used time/IP, allowed a
  cookie-less mutation (201) and was rejected over plain HTTP
  (`APP_PASSWORD_HTTPS_REQUIRED`); revoking it removed access. The temporary
  administrator and its credentials were deleted afterwards.
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

## Owner-blocked and unavailable (explicit)

These are deliberate boundaries, not unfinished controls. The screens state each
one; no button pretends to work.

| Item | State | Reason |
| --- | --- | --- |
| Production e-mail delivery | Disabled (`configured: false`) | No SMTP credentials supplied; set `SMTP_HOST`/`MAIL_FROM` + credentials and restart the API. |
| Tools → Theme File Editor / Plugin File Editor | Not implemented | Owner decision 2026-11-04: in-browser server-code editing is an RCE surface. |
| WordPress.org plugin directory / ZIP upload | Not implemented | Plugins are trusted local packages in a persistent store; no marketplace or installer. Add Plugins shows disabled directory tabs and an explicit notice. |
| WordPress.org theme directory / ZIP upload | Not implemented | Themes are trusted packages in the release; Add Themes shows disabled directory tabs and an explicit notice. |
| Third-party importers (Blogger, LiveJournal, Movable Type, RSS, Tumblr) | Not implemented | Require external services/plugins; the Import list marks them unavailable. |
| Plugin marketplace / remote updates | Not available | Updates are discovered from a configured manifest; nothing is downloaded or installed from the internet. |
| Allow Pings (pingbacks / trackbacks) | Disabled and explained in the editor Discussion panel, Quick Edit, Bulk Edit and Settings → Discussion | No inbound XML-RPC endpoint and no untrusted link verification. The `default_ping_status` option was removed; WXR keeps `wp:ping_status` for import compatibility only ([ADR 0043](../adr/0043-pings-disabled.md)). |
| Akismet | Not implemented; the bundled local spam guard runs instead | Akismet needs an external account, API key and per-comment data transfer. The Connectors screen states this ([ADR 0042](../adr/0042-local-spam-guard.md)). |

## Known remaining parity work

These are implemented surfaces with narrower behaviour than WordPress, not
missing screens. The per-screen evidence for what was checked is recorded in
[design-audit-2026-11-05.md](design-audit-2026-11-05.md).

| Area | Current state | WordPress also has |
| --- | --- | --- |
| Post sidebar extras | Preview token, SEO and revisions are MERNPress additions shown after the WordPress panels. | No equivalent panels; WordPress revisions live in the document overview. |
| Screen Options per screen | Persisted per screen (columns and paging where applicable). | Some screens expose panels MERNPress does not have. |

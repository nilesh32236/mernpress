# WordPress design-parity audit — 2026-11-05

This record covers the admin screens re-checked side by side against the live
WordPress 7.1.4 reference at `http://127.0.0.1:8080` (admin account) and the
MERNPress development admin at `http://127.0.0.1:5173/admin/`.

## Method

- Chromium via Playwright, viewport **1440 × 1000**, both apps at 100 % zoom.
- For each screen the `<h1>`, sidebar width, admin-toolbar height, status tabs,
  primary page action and table count were read from the DOM. This is a
  structural check, not a claim of pixel identity; visual screenshots were also
  captured for the screens listed.
- Content counts differ between the two installations (the reference has more
  posts/users), so a count difference alone is not a defect. The tab *set* and
  labels are compared, not the numbers.

## Chrome measurements

| Element | WordPress 7.1.4 | MERNPress | Result |
| --- | --- | --- | --- |
| Sidebar width | 160 px (`#adminmenu`) | 160 px (`.admin-sidebar`) | match |
| Admin bar height | 32 px (`#wpadminbar`) | 32 px (`.admin-bar`, `--wp-admin-bar-h`) | match |
| Content origin | x = 160 | x = 160, width 1280 | match |
| Page heading style | `h1.wp-heading-inline` | `h1` in `.page-header` | match visually |
| Status tabs | `.subsubsub` links | `.subsubsub-tab` | match |

## Screen-by-screen

| Screen | WordPress `<h1>` | MERNPress `<h1>` | Tabs / primary action | Notes |
| --- | --- | --- | --- | --- |
| Dashboard | Dashboard | Dashboard | Quick Draft “Save Draft” widget | Cards use MERNPress-specific classes; layout (At a Glance, Activity, Quick Draft, Site Health) matches the prior design pass |
| Posts | Posts | Posts | All / Mine / Published; **Add Post** | Same toolbar: bulk actions + filters + search in one row; row actions verified in earlier browser checks (Quick Edit, Bulk Edit) |
| Pages | Pages | Pages | All / Published / Draft in WP when a draft exists; MERNPress shows All / Mine / Published | Same tab mechanism; MERNPress computes the counts live from the API |
| Media Library | Media Library | Media Library | **Add Media File** | Filters and Grid/List toggle verified in earlier passes |
| Comments | Comments | Comments | All / Pending / Approved / Spam / Trash | Labels match; MERNPress has no “Mine” tab (single-role moderation) — documented deviation |
| Appearance → Themes | Themes 3 | Themes (count in list header) | **Add Theme**, Activate/Active, Customize | Two installed packages by design (MERNPress, Journal); WordPress reference has three |
| Plugins | Plugins | Plugins | All / Active / Inactive; **Add Plugin** | WordPress also shows Auto-updates Enabled/Disabled tabs; MERNPress auto-update is one global preference, so per-plugin tabs would be misleading — documented deviation |
| Users | Users | Users | All / Administrator (+ role tabs); **Add User** | Same columns and row actions, including Send password reset and Reset 2FA |
| Tools | Tools | Tools | Cards | MERNPress adds Redirects and Backups, which WordPress needs plugins for |
| Settings → General | General Settings | General Settings | **Save Changes** | Same field groups and labels |
| Profile | Profile | Profile | **Update Profile** | MERNPress uses sections instead of WordPress's five tables; it adds Two-Factor Authentication and Application Passwords. The nine colour schemes now match WordPress's names and persist per user |
| Editor → Preferences | Block-editor Preferences: General/Appearance/Blocks | Preferences: Welcome guide, word count, density, preview target and **Document panels** (Author, Template, Discussion, Format, Slug, Categories and tags, Sticky) | match in purpose; the panel visibility list mirrors classic-editor Screen Options and persists per user (ADR 0046) |
| Single post (public) | n/a | — | — | Reading time, related posts and the author box verified in the browser and in production |

Screenshots from this pass (development, git-ignored):
`.playwright-mcp/audit-mn-posts.png`, plus the feature screenshots referenced in
`docs/implementation-log.md`.

## Remaining deviations (deliberate)

| Deviation | Reason |
| --- | --- |
| Allow Pings | Pingbacks/trackbacks need XML-RPC or inbound verification; the runtime stays disabled and the option registry no longer stores a ping state. The control appears disabled and explained in the editor Discussion panel, Quick Edit, Bulk Edit and Settings → Discussion (ADR 0043). |
| Plugin auto-update tabs | MERNPress has one global plugin auto-update preference; per-plugin tabs would imply a per-plugin toggle that does not exist. |
| Comment “Mine” tab | Single-role moderation model; the tab would always equal “All”. |
| Theme/Plugin File Editors | Excluded by owner decision (RCE surface). |

The admin colour schemes (nine), per-user Screen Options, editor notes, and
Customizer panels are implemented and are no longer deviations (ADR 0044,
0046, 0045, 0041).

## Follow-up pass — previously unverified screens

These were re-checked against the live reference on the same day. Where the
reference screen is a JavaScript application (Fonts, Site Editor, Customizer),
the comparison is on the screen name, primary navigation and the visible
controls MERNPress implements.

| Screen | WordPress 7.1.4 | MERNPress | Result |
| --- | --- | --- | --- |
| Media attachment details | “Attachment details” modal: Edit Image, uploaded date/author, file name/type/size/dimensions, alt/caption/description, File URL + copy, view/download/delete | Same dialog title, same fields and actions; previous/next navigation between items | match (re-checked with the reference Hero image; the editor itself is covered in the row below) |
| Media → Edit Image | Inline editor under the fields: Crop, Scale, Image Rotation (90° left/right, 180°, flip vertical/horizontal), Undo, Redo, Cancel Editing, Save Edits; Scale box (width/height) and Crop box (aspect ratio, selection, start position, Apply/Clear) | Modal editor: rotate left/right/180, flip vertical/horizontal, undo/redo, crop with aspect ratios and Apply/Clear, scale mode with width/height and Apply Scale, Save/Cancel, Restore original image | match; **Rotate 180° added in this pass** to complete the rotation set. The overlay replaces WordPress's inline panel because the MERNPress drawer is narrower; every operation is present |
| Appearance → Customize | “Customizing: …”, Site Identity, Colors, Menus, Homepage Settings, Additional CSS, “Use Site Editor” notice | “Customizing: MERNPress” with Site Identity, Colors (five theme tokens), Menus, Homepage Settings (static front page + posts page) and Additional CSS, live preview and per-panel saves | match in panel set (single menu location; no postMessage preview; see ADR 0041) |
| Appearance → Site Editor | `<h1>Design</h1>` | `<h1>Design</h1>`, Identity / Styles / Pages | match |
| Appearance → Fonts | “Fonts” (Font Library) | “Fonts”, Library / Upload / Install Fonts, installed font list | match in name and purpose |
| Tools → Import | “Import” + importer list | “Import” + importer list with Open / Run Importer | match; third-party importers remain unavailable by design |
| Tools → Export | “Export”, *Choose what to export*: All content, Posts, Pages, Media, author/date/status/category filters, Download Export File | “Export”, same four scopes and author/date/status/category filters, Download Export File | match (one filter set applies to the included types; WordPress has separate Posts/Pages fieldsets) |
| Tools → Export / Erase Personal Data | Request form, request list, status filters, bulk actions | Request form, request list with complete/download actions | match in structure; WordPress adds Screen Options and bulk filters |
| Settings → Writing | “Writing Settings”: Post via email, Update Services | Same headings and fields | match |
| Settings → Reading | “Reading Settings”: front page, posts per page, feed items, full text/excerpt, visibility | Same | match |
| Settings → Discussion | “Discussion Settings”: article settings, other comment settings, email me, moderation, disallowed keys, avatars | Same sections plus a Mail delivery log panel | match + MERNPress addition |
| Settings → Media | “Media Settings”: Image sizes, Uploading Files | Same | match |
| Settings → Permalinks | “Permalink Settings”: structure presets, category base, tag base | “Permalink Settings”: the same six presets, a validated custom pattern, category/tag bases and a live preview | match (numeric ids are UUIDs; see ADR 0040) |
| Settings → Privacy | `<h1>Privacy</h1>`, “Privacy Settings”, policy page picker, Create/Use This Page helpers | `<h1>Privacy</h1>`, “Privacy Settings”, policy page picker, **Create a new Privacy Policy page**, Edit/View links and **Use This Page** | match (follow-up slice; see ADR 0039) |
| Settings → Connectors | “Connectors”: Akismet, Anthropic, Google, OpenAI cards | “Connectors”: Spam protection card (bundled heuristic guard with thresholds, stats) + OpenAI / Google / Anthropic key cards; Akismet row marked unavailable with its external-service reason | match in purpose (local guard instead of Akismet; ADR 0042) |
| Dashboard → Updates | “WordPress Updates”: core, Plugins, Themes, re-install | “MERNPress Updates”: MERNPress, Plugins, Themes, Check again | match adapted to the product name |
| Editor at 375 px | Admin bar 46 px, editor header 64 px, sidebar 0 px, canvas 375 px; Add block, Document overview, Save draft, Preview, Settings, Publish, Options | Admin bar 46 px, editor header 64 px, sidebar 0 px, canvas 375 px; Add block, Document overview, Save draft, Preview, Settings, Publish, overflow menu | match after **Save draft and Preview were restored to the mobile header** (they were hidden below 782 px); no horizontal overflow at 320/375/768/1024 px |

The only code change from this pass was the Privacy page title/heading split
(`Privacy` as the page title, `Privacy Settings` as the section heading), which
now matches WordPress.

## Deliberate deviations confirmed in this pass

| Deviation | Reason |
| --- | --- |
| Single Customizer menu location | Themes are token packages with one header menu; multiple menu locations/widget areas are not implemented (ADR 0041). |
| Akismet replaced by a local guard | External account, API key and per-comment data transfer were not accepted; the heuristic guard is local (ADR 0042). |
| Allow Pings | No XML-RPC endpoint or inbound link verification; shown disabled and explained (ADR 0043). |

## Verification status

All screens listed in this document have now been re-checked against the live
WordPress 7.1.4 reference at least once. The only remaining items are the
deliberate deviations above and the owner-blocked external services (SMTP,
Akismet, file editors, third-party importers) recorded in the parity matrix.


## Control and chrome metrics pass (2026-11-05, second measurement)

A second measured pass compared computed styles, not just the DOM structure, on
Posts and Settings → General at 1440×1000. Every item below was a real
difference that is now fixed; the `content.spec.ts` E2E test asserts the control
contract so it cannot silently regress.

| Metric | WordPress 7.1.4 | MERNPress before | MERNPress after |
| --- | --- | --- | --- |
| Text-input border | `1px solid #949494` | `#8c8f94` | `#949494` |
| Input/select radius | 2 px | 3 px | 2 px |
| Settings input box | 40 px high, padding 0 12, line-height normal | 40 px, line-height 28 | 40 px, line-height normal |
| Single-select chevron | inline SVG, `appearance:none`, right padding 24 | native arrow | same inline SVG, `appearance:none`, right padding 24 |
| List-table select | height 32, line-height 30 | height 32, line-height 28 | line-height 30 |
| Standard button | height 32, padding 0 10, line-height 30, radius 2 | height 34, padding 3 12, line-height 26, radius 3 | height 32, padding 0 10, line-height 30, radius 2 |
| First sidebar item | y = 44 (bar 32 + 12 padding) | y = 48 (extra 4 px nav padding) | y = 44 |
| Row actions | off-screen (`left: -129987px`), focusable, reveal on hover/focus | `visibility:hidden` (not keyboard reachable) | off-screen and focusable; `left: 0` on hover/focus; no horizontal overflow |
| Search field line-height | normal | 28 px | normal |

Screenshots from this pass (development, git-ignored):
`.playwright-mcp/audit-wp-posts.png`, `.playwright-mcp/audit-mn-posts-final.png`,
`.playwright-mcp/audit-mn-posts-refined.png`, `.playwright-mcp/dev-analytics2.png`.

## Remaining-screens measured pass (2026-11-06)

The reference screenshots from 2026-11-05 were re-used together with the current
WordPress `wp-admin` CSS (`wordpress-develop/trunk`: `common.css`,
`list-tables.css`, `forms.css`, `wp-includes/css/buttons.css`) so the rules are
compared to source, not memory. The MERNPress measurements were taken in
Chromium at 1440×1000 on the development admin.

| Screen | Metric | WordPress 7.1.4 | MERNPress before | MERNPress after |
| --- | --- | --- | --- | --- |
| Posts | h1 | 23px / 400 | 23px / 400 | match |
| Posts | content origin / no overflow | x=160 | x=160, scrollWidth 1440 | match |
| Posts | list search | 199×32, #949494, radius 2 | 199×32, #949494, radius 2 | match |
| Posts | table header / rows | th 14px; td 13px, line-height 1.5, padding 8/10 | same | match |
| Posts | row actions | off-screen left, reveal on hover/focus | left −129987px, reveal on hover/focus | match |
| Settings → General | text input | 350×40, #949494, radius 2, 14px | same | match |
| Settings → General | h1 / content x | 23px/400, x=182 | 23px/400, x=182 | match |
| Plugins | row cell padding | 10px 9px | 12px 10px | **10px 9px** |
| Tools | cards | 520px wide at x=182 | 520px at x=182 | match |
| Users | h1, tabs, table | All/Administrator…, 8/10 cells, 14px header | same structure | match |
| Scheduled Actions | search field | list control 32px, padding 0 12, #949494, radius 2, 14px | native 13.33px, 1px 2px padding, radius 0, #767676 | **32px / 0 12 / #949494 / 2px / 14px** |
| Scheduled Actions | actions | row actions appear on hover in list tables | dedicated Actions column was left empty (row actions off-screen) and touch users could not see it | **always-visible `Run now` / `Cancel` in the column** |
| Scheduled Actions | mobile table | WordPress stacks the primary column and keeps actions visible | generic list rule hid every cell (0 visible cells, 0px rows) and the toolbar | **hook/status/actions visible, toolbar visible, rows 75px, no horizontal overflow** |

Fixes made in this pass:

- `apps/admin/src/JobsPage.tsx`: column classes, a dedicated `job-actions`
  container and a `jobs` table class so the responsive rules can target it.
- `apps/admin/src/styles.css`: 32px styled search field, always-visible job
  actions, mobile column widths/toolbar, and the WordPress plugin-row padding.
- `tests/e2e/admin-parity.spec.ts`: new DOM regression test covering nine
  screens (h1 style, no horizontal overflow), the settings input contract, the
  plugin row padding, and the Scheduled Actions desktop/mobile table, controls
  and actions. Desktop/mobile screenshots are attached to the Playwright report.

Not changed: the WordPress 7.1 standard button is 40px in
`wp-includes/css/buttons.css` (the 32px size is `button-compact` and
`page-title-action`); the settings Save button at 40px and list-page actions at
32px are therefore correct. The Customizer/menu, Akismet, pings and file-editor
deviations recorded above remain deliberate.

## Custom-screen control pass (2026-11-06, Analytics / Languages / Backups / Media)

The four screens without a direct WordPress core equivalent were measured against
the WordPress control contract (32px list controls, 14px `#949494` inputs with
2px radius, 1.3em = 16.9px section headings) and the saved media screenshot.
Measurements at 1440×1000 and 375×812.

| Screen | Metric | WordPress contract | MERNPress before | MERNPress after |
| --- | --- | --- | --- | --- |
| Analytics | period select | 32px, 14px, #949494, radius 2 | 32px but native 13.33px, radius 0, #767676 | **32px, 14px, #949494, radius 2** |
| Analytics | privacy text width | readable measure | 820px | match |
| Languages | section h2 (Theme strings / Language menu) | 16.9px/600, margin 1em | 14–16px, 8px margin | **16.9px/600, 16.9px margin** |
| Languages | text/select fields | 40px, #949494, radius 2 | 40px, #949494, radius 2 | match |
| Backups | section h2 (Create a backup / Stored backups) | 16.9px/600, margin 1em | 14px, 7px gap under h1 | **16.9px/600, 16.9px margin** |
| Backups | primary section button | standard/compact WP button | 32px, padding 0 10, radius 2 | match (compact action) |
| Media | folder filter/parent selects | list select 32px, 14px, #949494, radius 2 | 32px but native 13.33px, radius 0, #767676 | **32px, 14px, #949494, radius 2** |
| Media | New folder input | list text input 32px, 14px, #949494, radius 2, padding 0 12 | 28px, 13px, padding 0 8 | **32px, 14px, #949494, radius 2, padding 0 12** |
| Media | folder tree rows/actions | visible management + wrap | tree present; controls native-sized | **3 tree rows incl. Uncategorized; actions wrap; no overflow** |
| All four | 375px layout | no horizontal overflow | no overflow | no overflow; media selects/input stay 32px |

Changes: `apps/admin/src/styles.css` (media/analytics control sizing, settings
h2 scale, 32px media input) and the extended
`tests/e2e/admin-parity.spec.ts`, which now also covers these four screens at
both viewports and attaches desktop/mobile screenshots to the report. The
media test seeds an `Audit Root`/`Audit Child` tree in the disposable E2E
database and removes it afterwards.

## Remaining custom screens pass (2026-11-06, Consent/Connectors/Redirects/Personal Data/Import-Export/Profile/Terms/Customize/Site Editor)

Measured at 1440×1000 and 375×812 against the WordPress 7.1.4 control
contract, the saved Terms/Users/Posts screenshots and the `wp-admin` CSS source
(`forms.css`, `customize-controls.css`). Only the differences that were fixed
are listed; Profile, Site Editor and the Consent form controls already matched.

| Screen | Metric | WordPress contract | MERNPress before | MERNPress after |
| --- | --- | --- | --- | --- |
| Redirects | desktop width | no overflow; inline form fits | **1498px scrollWidth**, Status select at x=1460 (off-screen) | **1440px**, fields 517/517/180, Status fully visible |
| Redirects | field layout | label above control | labels and inputs shared a 210px grid inside each 1fr column | **label above control in three columns** |
| Import | 375px width | table fits the viewport | **582px scrollWidth**, clipped importer text | **375px**, table 355px, text wraps |
| Export | filters | 40px, 14px, #949494, radius 2 | native 32px, 13.33px, radius 0, #767676 | **40px/14px/#949494/2**, select `0 24 0 12`, input `0 12` |
| Connectors | API/threshold inputs | 40px, 14px, #949494, radius 2 | native 21px, 13.33px, radius 0 | **40px/14px/#949494/2** |
| Connectors | card/stack | balanced section width | spam card 760px at x=182; banner/list 630px centred at x=487 | **all 760px, left-aligned at x=182** |
| Personal Data | request input/button | 40px form controls | input 30px/`3 8`; button 32px | **input 40px/`0 12`/radius 2; button 40px** |
| Terms | add-form controls | radius 2 | radius 4 | **radius 2** (input, select, textarea) |
| Terms | Add Category h2 | 16.9px/600 | 14.3px | **16.9px/600, 16.9px margin** |
| Consent | Preview h2 | 16.9px/600 | 14px | **16.9px/600** |
| Customize | header title | 20px/200 (panel title) | 16px/600 | **20px/200** |
| Customize | field controls | 40px form controls | 30px/`3 8` | **40px/#949494/radius 2/`0 12`** |
| All | 375px layout | no horizontal overflow | Import and Redirects overflowed | **all 11 screens 375 = 375** |

Site Editor already measured 20px white heading, no overflow at either viewport.
Profile/Consent fields already used the 40px settings control; their headings now
share the 16.9px section scale.

The extended `tests/e2e/admin-parity.spec.ts` (third test) covers these 11
screens, asserts the redirect form/status position, import mobile table,
connectors alignment/inputs, export filters, personal-data form, terms radius,
consent preview heading and Customizer header/controls, and attaches desktop
screenshots for every screen plus mobile screenshots for the layout-sensitive
ones.

## Remaining routes responsive pass (2026-11-06)

Measured 13 previously uncovered admin routes at 1440×1000 and 375×812:
Appearance → Themes/Add Themes/Fonts, Plugins → Add Plugins, Users → Add User,
Tools → Site Health, Updates, and Settings → Writing/Reading/Media/Permalinks/
Privacy.

Two real mobile overflows were found and fixed:

| Screen | Before | Cause | After |
| --- | --- | --- | --- |
| Plugins → Add Plugins | **582px** scroll width at 375 | `.content-table` inherited the 44rem (572px) list-table minimum; the Installed package table kept a fixed 160px action column | **375px**, table 355px, action column auto |
| Users → Add User | **433px** scroll width at 375 | `.user-new-page .password-row input` was fixed at `0 0 350px`; the Show button pushed the row to 413px | **375px**, password row/input 345px and wrapping |

All other routes measured 375 = 375 and 1440 = 1440 with no changes: Themes
cards/footers, Add Themes/Add Plugins filter bars, Fonts tabs (20px app heading),
Site Health cards, Updates sections and the five Settings tabs retain the
WordPress control/heading scale. Add Themes and Add Plugins intentionally show
disabled directory tabs (no marketplace/remote install).

`tests/e2e/admin-parity.spec.ts` now has a sixth test covering all 13 routes at
both viewports, asserting no horizontal overflow, with desktop screenshots for
every route and mobile screenshots for the two fixed screens.

## Public screens measured pass (2026-11-06)

Measured home, blog, single post, page, category, tag, author, search, 404,
feed and sitemap against the saved Twenty Twenty-Five geometry from the
2026-11-05 reference pass, at 1440×1000 and 375×812.

| Screen | WordPress geometry | MERNPress |
| --- | --- | --- |
| Home/blog/search H1 | x=398, 645×54, 48px/400 | match (`Blog` / archive title; search block 645×61) |
| Content column | x=398, 645px | match on every route |
| Header | full width, 71px | match |
| Single/page article | 645px content column, 48px title | match; page mobile title was 48px and is now **36px** |
| Archives (category/tag/author) | 645px column, 48px archive title | match |
| Search | H1 + 645×61 search form | match |
| 404 | centered image/title/search, status 404 | match (48px desktop / 36px mobile) |
| Feed/sitemap | RSS/XML content types, canonical links | match (feed `application/rss+xml`, sitemap includes post URLs) |
| Mobile | 36px titles, no horizontal overflow | all routes 375 = 375 after the page-title fix |

The only fix in this pass: `.entry.page .entry-title` kept its desktop 48px on
phones because it outranks the mobile `.entry-title` rule; a mobile
`.entry.page .entry-title { font-size: 36px; }` now matches every other public
heading.

`tests/e2e/public-design.spec.ts` seeds/publishes the demo post and page,
verifies all nine HTML routes at both viewports (H1 geometry/font/weight, search
block, no overflow), the 404 status, RSS/XML content types and sitemap post
links, and attaches desktop plus selected mobile screenshots. The Playwright web
server now points `MERNPRESS_API_URL` at the isolated E2E API instead of the
default localhost:4000.

## Screenshot regression baselines (2026-11-06)

`tests/e2e/visual.spec.ts` now stores pixel baselines under
`tests/e2e/visual.spec.ts-snapshots/` (`*-chromium-linux.png`), using
Playwright's `toHaveScreenshot` with `maxDiffPixelRatio: 0.01`, animations
disabled, the caret hidden, fonts awaited and images settled first.

| Group | Baselines |
| --- | --- |
| Public desktop | Home, Blog, Single post, Search, About, 404 |
| Public mobile | Home, Blog, Single post, Search, About, 404 |
| Admin desktop | Posts, Pages, Media, Comments, Users, Settings, Tools, Backups, Scheduled Actions, Redirects, Themes, Add Plugins, Add User, Connectors, Mail delivery |
| Admin mobile | Posts, Media, Comments, Tools, Themes, Add Plugins, Add User |

37 baselines in total. Analytics is covered by (a) a stable element baseline for the Core Web Vitals empty state and (b) a full-screen chart baseline with the summary API intercepted to a fixed payload, so the rolling daily labels and vital rows cannot flake with the calendar day. The admin additions were chosen for deterministic state: the spec pins demo timestamps and the `visual_admin` account, and clears `jobs`, redirects, 404s, link checks and media from unrelated suites before capturing, so empty-state pages (media/comments/backups/jobs/redirects) are stable regardless of test order. The diff budget is `maxDiffPixelRatio: 0.001`
(0.1% of the viewport) after an earlier 1% budget silently tolerated two real
changes: the Next dev indicator badge and a dangling “Written by ·” label are
each smaller than 1% of the frame. `settle()` also injects
`nextjs-portal { display: none !important; }` so the development overlay can
never contaminate a capture (it does not exist in production), and
`devIndicators: false` keeps the route badge out of the screen entirely.

Why these screens: they are the ones this audit changed or that carry the most
layout risk (card footers, the Installed package table, the password row, the
760px connector stack, the mail panel). The baselines sit next to the measured
DOM assertions in `admin-parity.spec.ts` / `public-design.spec.ts`, so a
spacing or typography change now fails twice: once on the numeric contract and
once on the pixels.

The visual spec seeds and publishes `welcome-to-mernpress`/`about`, bootstraps
its own `visual_admin` account, and takes the screenshots only after a fixed
settle step, so the baselines are deterministic in the isolated E2E database.

### Post meta without an author

The single-post baseline caught a real rendering defect: a post with no author
still rendered “Written by” followed by the separator, producing
“Written by · 1 min read in News, Guides”. The author label, link and separator
now render only when an author exists; the reading time and categories always
render. Covered by a web unit test.

### Empty-blog copy

The empty home page used the search copy
(`Sorry, but nothing was found…`). It now uses a dedicated
`noPosts` theme string (“No posts published yet. Nothing to read yet.”) on
page 1 of the home, `/posts` and a page assigned as the posts index;
`noResults` still covers search, category/tag/author archives and pages beyond
the last page. This matches WordPress, where an empty blog and an empty search
are different states, and it is editable per language in Settings → Languages.

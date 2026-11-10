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


## Measured side-by-side pass — previously uncompared states (2026-11-10)

Reference: WordPress 7.1.4 + Twenty Twenty-Five at `http://127.0.0.1:8080`
(Local PHP built-in server over the local `wordpress` database; a temporary
`audit-admin` user was created for the measurements and deleted afterwards).
MERNPress: the live production release. Chromium 1440x1000 and 375x812.

| State | WordPress 7.1.4 | MERNPress (before) | Result |
| --- | --- | --- | --- |
| Admin bar / sidebar (1440) | 32 px / 160 px | 32 px / 160 px | match |
| Editor header / settings column | 64 px / 280 px | 64 px / 280 px | match |
| Editor sidebar tabs | Post, Block | Post, Block, Notes | **addition** (internal notes, ADR 0038) |
| Options → Preferences modal | 750 px wide, focus trapped, Escape closes, focus restored | 720 px, trapped, Escape closes | **fixed to 750 px** |
| Options → Keyboard shortcuts modal | 629 px wide, trapped | 720 px, trapped | **fixed to 629 px** |
| Options → Welcome guide | 312 px illustrated card | standard modal | deviation: the MERNPress guide is textual, so it uses the shared modal width |
| Public body copy (1440) | 18 px / 1.4, weight 300, 645 px measure | 22 px / 1.4, weight 300, 645 px measure | **fixed to 18 px** (post body, page body, archive description, status text) |
| Public post title (1440) | 48 px / 400 | 48 px / 400 | match |
| Public body copy (375) | 18 px | 22 px | **fixed to 18 px** |
| Public post title (375) | 35.13 px (theme clamp) | 36 px (fixed) | 0.87 px difference retained: the mobile contract asserts an explicit 36 px title |
| Mobile admin bar / editor header | 46 px / 64 px | 46 px / 64 px | match |
| Mobile editor overflow | scrollWidth = innerWidth = 375 | 375 = 375 | match |
| Language-prefixed page (`/hi/…`) | not available in core (needs Polylang) | `/hi/…` + hreflang + x-default | deliberate difference: shipped in core (D-100–D-105) |

Two real mismatches were fixed and captured: the public body copy size and the
two editor modal widths. Everything else matched or is a documented addition.

Baselines affected by the typography change were regenerated (108 total) and the
customizer/site-editor preview iframes plus the post comments fetch are now
stabilised/masked so a capture cannot silently record a half-loaded screen.


## Measured pass 2 — admin lists, themes, media, comments and the title curve (2026-11-10)

Second side-by-side run against the same WordPress 7.1.4 reference (PHP server
on 8080, temporary administrator, deleted afterwards) for the screens the first
pass did not cover.

| State | WordPress 7.1.4 | MERNPress | Result |
| --- | --- | --- | --- |
| Posts list (1440) | table 1238 px, th 14 px, row 55 px, tabs 13 px | 1238 px, 14 px, 56 px, 13 px | match (1 px row rounding) |
| Pages list (1440) | 1238 / 14 / 55 / 13 | 1238 / 14 / 56 / 13 | match |
| Users list (1440) | row 69 px, th 14 px, tabs 13 px | row 71 px, 14 px, 13 px | 2 px difference (avatar cell padding), accepted |
| Media (1440) | filter bar 80 px, view switch present | folder bar 50 px + separate toolbar, view toggles present | different composition (MERNPress adds folders); documented |
| Themes (1440) | card 379x304 px | card 379 px wide | match on width; height differs with screenshot aspect |
| Analytics (1440) | not in core (plugin territory) | Dashboard → Analytics | **addition** |
| Posts list (375) | 375 = 375, admin bar 46 px | 375 = 375, admin bar 46 px, row actions visible | match |
| Media (375) | no overflow | 375 = 375 | match |
| Public meta | 14 px | 14 px | match |
| **Public title 375** | **35.13 px** | **36 px** | **fixed**: viewport curve |
| **Public title 512** | **36.96 px** | **36 px** | **fixed**: same curve |
| Public title 1440 | 48 px | 48 px | match |
| Comments | reference post has no approved comment in the fixture | comment styles 14 px meta / 18 px body | meta matches; body inherits the 18 px fix from pass 1 |
| Options → Welcome guide | 312 px card | 720 px modal | **fixed to 312 px** |

Title curve: Twenty Twenty-Five scales the post title linearly between roughly
35.1 px at 375 and 37 px at 512 before capping at 48 px. MERNPress now uses
`clamp(2.2rem, 1.335vw + 1.8825rem, 3rem)`, which reproduces 35.13 px at 375 and
36.96 px at 512 (verified in the E2E suite, which asserts the 375 value stays
within 0.5 px of the reference).


## Measured pass 3 — Settings, Profile, Personal Data, Customizer, Tools (2026-11-10)

Third side-by-side run against WordPress 7.1.4 (same local reference; a comment
was also created with wp-cli to exercise the public comment template).

| State | WordPress 7.1.4 | MERNPress | Result |
| --- | --- | --- | --- |
| Settings form table (General) | 1238 px wide, 210 px label column, 14 px labels, 40 px inputs, 14 px text, 2 px radius, 40 px submit | same values | match |
| Settings Reading/Discussion/Media/Permalinks | 210 px labels, 14 px, 40 px selects | same structure | match |
| Settings at 375 | no overflow, labels stacked full width, 40 px inputs | 375 = 375, labels stacked, 40 px inputs | match |
| Profile | sections Personal Options / Name / Contact Info / About Yourself / Account Management / Application Passwords; 40 px inputs; submit 40 px | same sections (+ Two-Factor Authentication), 40 px inputs | **submit fixed 32 → 40 px** |
| Tools | one card, 520 px wide | six cards at 520 px | card width matches; MERNPress adds Redirects/Backups/Jobs/Health |
| Export Personal Data | table 1238 px, 40 px input | table scroll-contained, 40 px input | match |
| Customizer | sidebar **300 px**, header 46 px | sidebar **320 px** | **fixed to 300 px** |
| Backups / Scheduled Actions | not in core | present | **addition** |
| Public comment | approved comment exists in `wp_comments`, but the installed single template emits no comments block (verified: no `wp-block-comments` in the HTML), so body/meta/avatar metrics cannot be compared | 18 px body, 14 px meta, 32 px avatar | not measurable on the reference; documented |

Two more mismatches were fixed: the Profile submit height (32 → 40 px, matching
both WordPress and the Settings panels) and the Customizer sidebar width
(320 → 300 px). A DOM contract in `admin-parity.spec.ts` now pins the Settings
geometry (210/40/14/2/40), the Profile submit height and the Customizer width so
they cannot drift.


## Measured pass 4 — phone-width lists, Media, Profile, Personal Data (2026-11-10)

Fourth side-by-side run at 375px (reference had one imported image in its media
library so the grid could be measured).

| State | WordPress 7.1.4 | MERNPress | Result |
| --- | --- | --- | --- |
| Posts list row (375) | 67 px tall, row actions present, 25 px checkbox | 35 px, 16 px checkbox, actions in the chevron toggle | **fixed**: status/date meta line + 14 px row padding + 25 px checkbox at ≤782 |
| Media grid (375) | 116x116 tiles, 198 px toolbar, 38 px view toggle | 2-up grid, folder bar + toolbar (130 px), 32 px toggles | tile/toolbar composition differs (MERNPress adds folders); documented |
| Profile (375) | labels stacked full width, 40 px inputs, 40 px submit | same | match |
| Export Personal Data (375) | table 353 px, 40 px input | 355 px content width, 40 px input | match |
| Tools (375) | card 353 px | card 355 px | match |
| Backups / Scheduled Actions | not in core | present | **addition** |
| All phone screens | scrollWidth = innerWidth = 375 | same | match |

The phone list row now matches WordPress's touch density: a 12 px
status/date line under the title (the columns WordPress shows there), 14 px
vertical padding and 25 px checkboxes. A DOM contract pins row height ≥ 60 px,
checkbox size 25 px and no horizontal overflow.

Media remains a documented composition difference: WordPress's toolbar is a
single 198 px filter bar, MERNPress has a folder bar plus a toolbar because it
ships virtual folders; the grid is 2-up at phone widths in both.

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
| Public desktop | Home, Blog, Single post, Search, About, 404, Category, Tag, Author |
| Public mobile | Home, Blog, Single post, Search, About, 404 |
| Admin desktop | Dashboard, Posts, New post + Edit post + New page (block editor), Pages, Media, Comments, Users, Plugins, Settings, Settings → Languages, Settings → Consent, Settings → Reading, Settings → Writing, Settings → Discussion, Settings → Media, Settings → Permalinks, Settings → Privacy, Profile, Export/Erase Personal Data, Appearance → Customize, Appearance → Add Themes, Appearance → Design (Site Editor), Export, Fonts, Tools, Tools → Site Health, Tools → Import, Updates, Terms (Categories/Tags), Backups, Scheduled Actions, Redirects, Themes, Add Plugins, Add User, Connectors, Mail delivery |
| Admin mobile | Dashboard, Posts, New post (block editor), Pages, Media, Comments, Tools, Backups, Scheduled Actions, Redirects, Updates, Fonts, Themes, Plugins, Add Plugins, Add User, Users, Languages, Consent, Terms, Tags, Site Health, Import, Profile, Customize, Site Editor, General, Reading, Writing, Discussion, Media, Privacy, Permalinks, Export, Add Themes, Connectors, Export/Erase Personal Data |

102 baselines in total. Mail delivery (Discussion) joins the mobile set, completing the mobile matrix for every desktop screen. Category, Tag and Author archives join the public set at both widths, and New page completes the block-editor variants. Users, Plugins, Permalinks, Export, Add Themes, Connectors, both Personal Data screens and the Edit post editor join the mobile set, completing the heavy-surface mobile coverage. General, Reading and Pages join the mobile set; mobile captures for Settings tabs now wait for the loaded field. The block editor joins the set (New post and Edit) — the last major surface without coverage — and Dashboard/Customize/Site Editor mobile views cover the highest-risk stacked layouts. The Edit capture resolves the seeded post id at runtime (`/posts/:id/edit`). The file-level timeout was raised to 180s because the admin test now captures 20+ screens. Dashboard, Terms, Import, Site Health and Updates join the set; Terms is also captured at 375px. Dashboard activity uses the pinned demo dates, and Site Health shows the E2E scheduler-disabled state deterministically. Languages, Consent, Fonts and Reading close the remaining Settings sub-screen gaps; the Reading capture also pins the gated Speculative loading control (Off default). Analytics is covered by (a) a stable element baseline for the Core Web Vitals empty state and (b) a full-screen chart baseline with the summary API intercepted to a fixed payload, so the rolling daily labels and vital rows cannot flake with the calendar day. The admin additions were chosen for deterministic state: the spec pins demo timestamps and the `visual_admin` account, and clears `jobs`, redirects, 404s, link checks and media from unrelated suites before capturing, so empty-state pages (media/comments/backups/jobs/redirects) are stable regardless of test order. The diff budget is `maxDiffPixelRatio: 0.001`
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

## Mobile responsive pass (2026-11-09)

Audited 320/375/414/768/1024 plus the 1440 control on both surfaces, fixed in
CSS with three component changes (table wrapper, class hook, scroll-lock hook).
Baselines were regenerated afterwards (102 captures).

| Area | Defect (computed from the stylesheet + existing layout contracts) | Fix |
| --- | --- | --- |
| Public header/footer | `nowrap` flex rows overflow at 320 with several page links / a long site title | `flex-wrap: wrap` ≤900 |
| Public pagination | one link per page, `nowrap`, ~25px targets | wraps ≤600; 32×32 targets |
| Single post/page | long unbroken words/URLs, tables and embeds wider than the column | `overflow-wrap` on titles/body, `anywhere` in table cells, `figure.wp-block-table` scrolls, `max-width:100%` embeds |
| Public admin bar | fixed 32px row with greeting overflowed 375 | greeting hidden ≤782 (WordPress behaviour), 10px gaps, name capped 30vw with ellipsis |
| Consent banner | ignored the home-indicator inset; 13px copy | `env(safe-area-inset-bottom)`, 14px copy, 32px settings pill |
| Language switcher / comment reply | 12px links ~17–20px tall | 14px + 32px minimum |
| Search form | desktop pill padding squeezed the input at 320 | 8px gap / 20px padding ≤360 only |
| Admin shell | `min-width:320px` + classic scrollbar overflowed 305px viewports | `min-width:0` ≤360 |
| Admin form controls | 13–14px inputs zoom on iOS focus | 16px ≤782 (login/2FA stay 24px) |
| Admin touch targets | 24–28px icon buttons, postbox handles, view toggles, ~31px tabs | 32px ≤782 |
| Admin list tables | row actions unreachable without hover at 641–782 | static/visible ≤782 |
| Personal Data | request table 704px min-width with no scroll wrapper | wrapped in `.table-scroll` |
| Analytics | `nowrap` path cells could widen the page | panel scrolls ≤782 |
| Customizer | stacked rows in a fixed screen with no scroll; preview collapsed | one scrolling column; 60vh preview (min 320px) |
| Editor top bar | sticky header slid under the sticky admin bar | `top: var(--wp-admin-bar-h)`; desktop sidebar aligned to 96px |
| Editor/media dialogs | `96vw` inside padded overlays clipped 33–35px | `min(…, 100%)`; 12px backdrop padding ≤640 |
| Attachment drawer | 120px labels left 158px at 320; inner scroll areas | fields stack ≤640; one scrolling column with 38vh preview + safe area |
| Off-canvas/drawers | page scrolled behind the backdrop; `100vh` on mobile | shared `useBodyScrollLock` (media-query guarded), `overscroll-behavior: contain`, `100dvh` |
| Editor footer | fixed 24px bar under the home indicator | `env(safe-area-inset-bottom)` |

Deliberate: 13px admin body copy (WordPress parity, e2e-asserted), inline text
links below 32px (WCAG 2.5.8 inline exception), 16px checkboxes (label is the
target), and table `nowrap` inside scroll containers.

Parity state matrix (2026-11-10): the baseline set now also covers a
language-prefixed page pair (default post and its Hindi translation, 2 captures)
and the editor inspector tabs (Block, Notes) plus the Shortcuts and Preferences
dialogs (4 element captures) — 108 in total. The language pair is asserted for
hreflang (both directions), x-default and the prefixed canonical URL, not only
photographed. The editor dialogs also trap focus (D-134 extension).

Keyboard containment is now implemented (D-134): the attachment drawer and the
floating editor Document panel move focus in, cycle Tab/Shift+Tab, close on
Escape and restore focus to the control that opened them. Covered by
`useFocusTrap.test.tsx` and keyboard E2E in `media.spec.ts` and
`editor.spec.ts` (375px).

Regression caught by this reconciliation: gating `/api/admin/health` on
`manage_options` made the editor dashboard request it and log two console 403s
(e2e `content.spec`); the dashboard now hides the Site Health widget and skips
the request for non-administrators.

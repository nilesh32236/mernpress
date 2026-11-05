# Implementation log

## 2026-11-03 (evening) — WordPress 6.8 parity pass (side-by-side against a real WordPress install)

**Status:** implemented, verified, committed to `master` (`ba2360f`) and
deployed (release `20261103T095101Z-ba2360f`).

The owner reported the admin still did not match WordPress. This pass installed
a real WordPress 6.8.3 stack (PHP 8.4, MariaDB, WP-CLI at
`/tmp/opencode/wp-site`, served on `127.0.0.1:8080`) and compared every admin
screen side by side, then fixed each divergence.

### Chrome and chrome-level features

- Admin bar: 32px, site name with the hidden “Visit Site” submenu, + New,
  Howdy menu; footer credit left and version right; active-menu notch.
- Screen Options / Help buttons float at the top right like WordPress and open
  working panels. Screen Options changes the per-page item count for posts,
  pages, users, terms and media (persisted in `localStorage`); Help shows
  screen-specific documentation.
- Users submenu now includes Add User (`/users?action=add` opens the dialog).

### Dashboard

- WordPress welcome panel: dark 226px hero with gradient lines, 48px heading,
  Dismiss, and the three white feature columns at 24px padding.
- Collapsible postboxes with WordPress order arrows: Site Health Status, At a
  Glance (icon list + site line), Activity (Recently Published), Quick Draft
  (Title/Content/Save Draft).
- Fluid content width and WordPress list-table spacing.

### Lists (posts, pages, users, terms)

- WordPress subsubsub tabs: All / Mine / Published and non-empty Drafts /
  Trashed; counts from the server; “Mine” and author/tag links filter the list.
- Title | Author | Categories | Tags | Comments | Date columns with WordPress
  fixed widths; status prefix inside the Date column; comments column and
  tfoot header; row actions appear on row hover.
- Bottom tablenav with bulk actions and item count; pagination hidden on a
  single page.
- Users: text row actions Edit | Delete | View, WordPress role tabs, numeric
  Posts count, 32px avatar floated beside the name.
- Terms: WordPress add form (Name / Slug / Parent Category / Description),
  search row, bulk actions, tfoot, Count links and the category/tag footnotes.

### Media

- Grid shows only thumbnails in transparent 8px-padded cells; “Showing X of Y
  media items”.
- List view uses WordPress columns (File with title + filename, Author,
  Uploaded to, Date) with row actions Edit | Delete Permanently | View | Copy
  URL | Download file and relative dates; media supports only Help (no Screen
  Options).

### Editor

- Full-screen Gutenberg shell: no admin bar/menu, 60px white header with the
  black logo box, plus/undo/redo/document-overview tools, centered document
  pill (title · Post, Ctrl+K), Save draft / preview eye / Publish / ⋮.
- White canvas at 646px with a 48px placeholder title and WordPress footer
  (“Post” / “Page”).
- 280px sidebar with Post | Block tabs. Post tab: summary (title, edit, ⋮,
  Set featured image, Add an excerpt, Last edited), Status & visibility rows
  with the blue status dot, Publish Immediately, Author, permalink, and
  collapsible Categories/Tags plus an SEO panel. Block settings remain in the
  Block tab.

### Login, profile, settings

- wp-login.php-style card: 84px logo mark, Username or Email Address, password
  reveal, Remember Me, right-aligned Log In, “← Go to MERNPress”. The API now
  accepts email logins and issues a 14-day session when Remember Me is used.
- Profile: WordPress form-table sections (Name, Contact Info, Account
  Management) with Update Profile / Update Password.
- Settings: General | Writing | Reading tabs in WordPress order, form-table
  rows, solid primary Save Changes.

### Verification

- `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (537 tests:
  337 API, 122 admin, 65 block-system, 13 web), `pnpm build` and
  `pnpm test:e2e` (23/23) all pass.
- Deployed as release `20261103T095101Z-ba2360f`; `/`, `/admin/` and
  `/api/health` return 200.

## 2026-11-03 (PM) — Reference-matched design pass (side-by-side against the running qrolichealth CMS)

**Status:** implemented, verified, pushed to `master` (`dadce21`) and deployed
(release `20261103T074100Z-dadce21`).

The owner reported the admin still did not look like WordPress or the
qrolichealth CMS. This pass installed and seeded the reference CMS
(`/tmp/opencode/refs/qrolichealth-cms-main`, DB `qrolic_cms`, API :4300, admin
:5173) and compared every screen side by side, then fixed each divergence.

### Editor (largest visual gap)

- The Gutenberg toolbar (blue `+` inserter, undo, redo, document overview,
  block settings) now portals into the 60px dark editor top bar, exactly like
  the reference; the second dark strip inside the canvas is gone.
- Top bar: white logo box (links back) · centered save state · right Preview /
  Save draft / Publish / Schedule… / gear (blue when the sidebar is open).
- Sidebar: white panel with an attached `Post | SEO | Block` tab strip (active
  tab has a dark underline), 16px body padding and flat sections with
  uppercase labels — no more boxed cards.
- Added the reference's Permalink row (`/` prefix) and a Preview-token section
  (create/regenerate/revoke, copies the link).

### Lists, dashboard, media, users, nav

- Lists: Add New moves to the top right; one WordPress toolbar row
  (Bulk actions + Apply, funnel, **All categories**, **All dates**, search);
  columns Title | Author | Categories | Tags | Status | Date | Actions with
  icon actions; author name from a new `AdminPost.author` summary. New API
  filters: `category` (term id) and `month` (YYYY-MM on updatedAt).
- Dashboard: added Quick Draft (creates a real draft) and Site Health (new
  `GET /api/admin/health`: database, media writable, scheduler) → the
  reference's 2×2 widget grid; Activity shows real newest published posts.
- Media: reference toolbar (type + sort filters, search, N items, Grid|List
  toggle with a real list table), inline title row with “Add New Media File”,
  `/media?upload=1` deep link opens the picker.
- Users: Name/Email columns backed by new nullable user fields (additive
  migration `20261103070000_add_user_name_email`), add-user form fields,
  profile Name/Email editing, actions in an Actions column.
- Nav: Posts → All Posts / Add New / Categories / Tags (separate pages),
  Media → Library / Add New; redundant top-level Terms entry removed.

### Verification

- 537 unit/integration (337 API, 122 admin, 65 block-system, 13 web), 23/23
  E2E, lint/format/typecheck clean, builds 6/6.
- Production: migration applied after a `pg_dump` backup; `/`, `/admin/`,
  post page, sitemap, API all 200; new bundle contains the new UI strings;
  zero API errors.

## 2026-11-03 — Live verification pass: WordPress-parity fixes + production hardening

**Status:** implemented, verified, pushed to `master` and deployed
(release `20261103T060000Z-cd203ed`).

### What was verified

Full visual sweep of every admin screen (dashboard, posts, pages, media,
terms, users, profile, settings ×3 tabs, editor new/edit, SEO tab, featured
image panel, revisions panel, schedule control, login, 404) at 1440px and
375px, plus the public site (home, post, page, preview, sitemap, robots) both
locally and on production. 23/23 E2E and 537 unit/integration tests exercised.

### Bugs found and fixed

1. **Scheduling had no UI** — the P8-04 backend (endpoints + sweeper) was
   implemented but users could not schedule anything. Added the WordPress
   pattern to the editor PUBLISH panel: Immediately/Scheduled-for + Edit,
   datetime-local input, Schedule/Cancel, wired to the existing endpoints.
2. **Terms footer said "2 Categoriness"** — plural label bug; singular/plural
   helpers fixed everywhere ("2 categories", "1 category").
3. **List toolbar was two rows** — WordPress uses one row (Bulk actions +
   Apply, filters, search right). Merged to a single row.
4. **Dashboard Activity was placeholder copy** — now lists the newest
   published posts (title link, status pill, date), reusing the existing
   published query.
5. **Production: media directory root-owned** — the API runs as `mernpress`,
   so uploads would have failed with EACCES. Chowned to `mernpress:mernpress`.
6. **Production: sitemap/robots advertised `http://localhost:3000`** — the
   web app had no site URL; added `MERNPRESS_SITE_URL` (systemd env) and
   `siteUrl()`/`mediaUrl()` helpers used by sitemap, robots, canonical and
   og:image. Also fixed og:image/article images pointing at the internal API
   origin.
7. **Turbo cache baked stale URLs** — `build` reused a cached `.next` that
   predated the env var. Fixed by declaring the site/media env vars in
   `turbo.json` `globalEnv` (cache key now includes them) and rebuilding with
   `--force`.

### Verification (all PASS)

- lint/format/typecheck clean; 537 unit/integration (337 API, 122 admin, 65
  block-system, 13 web); 23/23 E2E; builds 6/6.
- Production live checks: `/` 200 public site, `/admin/` 200, API health ok,
  post page 200 with absolute canonical, sitemap/robots absolute URLs
  (https://mernpress.duckdns.org), unauth media upload 401/403, preview
  400/404 contract, zero API errors.

## 2026-10-29 (evening) — CMS completion: renderer, media, workflows, public site

**Status:** implemented on branch `feat/cms-completion` (17 commits), fully
verified locally. NOT pushed, NOT merged, NOT deployed (per task rules).

### What happened

A comprehensive capability-gap audit against the qrolichealth-cms reference
(extracted from ~/reference-archives to /tmp/opencode/refs) produced
docs/design/capability-gap-matrix.md, followed by autonomous implementation
in the task's priority order. Baseline: master `9f74f5f` (deployed release
`20261029T103000Z-7dd1a1d`).

### Implemented (one commit per slice on the branch)

1. **P5-06 server renderer + sanitizer** (ADR 0007, `92834e0`):
   `packages/block-system` `./render` + `./sanitize` — DOMPurify+jsdom with a
   tight MVP allowlist (no SVG/forms/data-*, strict URI schemes, CSS property
   filter), structural limits enforced before render, deterministic heading
   anchors + TOC, per-block fail-closed fallback. `PublicPost.renderedContent`
   + `toc`. 50 new tests.
2. **Schema** (`ca9fedd`): media_items, post_revisions, preview_token,
   scheduled_at, revision_count; then revision `kind` (`0481c0e`). Two
   additive migrations, applied to dev/test only.
3. **First-publish scheduling** (`2fad7df`): ADR 0008 §4 — `scheduled_at`
   column, atomic-claim sweeper (60 s + boot catch-up), admin schedule
   endpoints, 11 tests.
4. **Editor SEO tab + Next.js public site** (`36e9581`): all six stored SEO
   fields editable; real public rendering (home, /posts, /posts/[slug],
   /[slug], sitemap, robots, generateMetadata chains).
5. **Bulk actions** (`935c12a`, `ff51ccc`, `fd95658`): POST
   /api/admin/posts/bulk (≤100, per-item outcomes) + the previously dead list
   UI wired (selection, contextual options, partial-failure notice).
6. **Revisions + preview tokens** (`28b324d`, `3848485`, `0b3cec0`):
   pre-update snapshots (retention 50, cumulative count, restore via update
   path); revocable 256-bit preview tokens with sanitized public route and a
   web `/preview/[token]` route (banner, noindex, no-store).
7. **Media library** (`2874fde`, `8da762a`): raster-only upload (sharp
   metadata sniff, WebP q85 ≤2560px + 300/600/1200 derivatives, random names,
   confinement-checked serving), admin media page (grid, upload progress,
   drawer edit/delete), Gutenberg `settings.mediaUpload`.
8. **Autosave** (`0481c0e`): one autosave/post (kind='autosave'), 30 s
   debounce, recovery banner, restore/discard, save discards.
9. **Editor revisions/preview UI** (`f3af590`): on-demand revisions panel,
   detail dialog + restore; topbar Preview button.
10. **Featured image** (`dfc81b3`): `posts.featured_media_id` (SetNull on
    media delete), editor picker panel, `featuredImage` on admin/public DTOs,
    og:image + article rendering on the web. 7 new tests.

### Bugs found by live browser verification (fixed, `49a23f9`)

- rotatePreviewToken sent JSON content-type with an empty body → Fastify 400;
  Preview button silently failed.
- previewUrlFor read the JSON-encoded option column raw → quoted preview URLs.

### Verification (all PASS)

- lint/format/typecheck: clean (9 packages).
- Unit/integration: **528** (333 API, 119 admin, 65 block-system, 11 web).
- E2E: **23/23** (incl. new media + preview browser flows).
- Builds: 6/6 (incl. Next.js with real routes).
- Live browser rig (API+admin+web): media upload → derivatives → serving with
  headers; editor save → revision #1 → dialog; Preview → token → web preview
  with banner; XSS post → public page with zero onerror/javascript:/script.
- `pnpm audit --prod`: 1 low (deepmerge via @wordpress/*, no patch; documented).
- `git diff --check`: clean.

## 2026-10-29 (PM) — Admin design matched to the reference CMS

**Status:** implemented, fully verified, pushed to `master` (`7dd1a1d`) and
deployed (release `20261029T103000Z-7dd1a1d`). The reference CMS
(qrolichealth-cms) was run locally and screenshotted screen-by-screen; MERNPress
was restyled to match it (owner feedback: the first WordPress approximation was
too plain).

### What changed

- **Topbar**: dark 36px admin bar — M logo + MERNPress brand, "Visit Site" pill,
  "+ New" dropdown (Post/Page/User, role-gated), right "Hello, {user}" + avatar
  initials dropdown (Profile, Sign out).
- **Sidebar**: "Collapse menu" top item, chevron groups with dot-bullet
  submenus (Dashboard→Home; Posts→All Posts/Add New/Categories & Tags;
  Pages→All Pages/Add New; Users→All Users/Profile; Settings→General/Reading/
  Writing), 52px rail with hover flyouts, mobile drawer.
- **Dashboard**: welcome banner with 4 CTAs; "At a Glance" icon+count chips +
  "Site-wide totals" note; "Activity" card.
- **Lists**: funnel icon, magnifier-inside search + blue Search, exact-reference
  status tabs, centered-icon empty states, "Page X of Y" pagination.
- **Users**: icon-badge + adjacent Add New User, "All Users (n) | You are
  signed in as …" subheader, circle-user icon + "you" badge.
- **Settings**: icon nav-tabs sharing panel edge, icon-prefixed labels, "Save
  Changes" with check icon.
- **Editor**: Post | SEO | Block tab strip (Excerpt on SEO tab), gear Settings
  toggle, category/tag rows name-left/slug-right.

### Bugs found and fixed during verification (all design regressions)

1. Admin-bar dropdown unusable: `.menu-backdrop` (z-55) covered the topbar
   (z-50) — raised `.admin-bar` to z-60.
2. Editor SEO/Block panels nested inside the Post panel's `hidden` container —
   moved out as siblings; tab switching now reveals Excerpt (E2E covers it).
3. Mobile off-canvas settings drawer unclickable (topbar z-60 above drawer
   z-51) — drawer raised to z-70.

### Verification

- lint/format/typecheck clean; 356 unit/integration tests; 21/21 E2E; build 6/6.
- Side-by-side screenshots: dashboard, posts, users, settings, editor, terms
  match the reference (shots in /tmp/opencode/shots-v3 + shots-reference).

## 2026-10-29 — WordPress-style admin redesign + Users/Settings parity slice

**Status:** implemented and fully verified locally; pushed to `master`; deployed to
production (release `20261029T08…` → see production-hosting.md for the release id).
Owner acceptance of the live UI pending. Design target and reference extractions:
[docs/design/wordpress-admin-target.md](design/wordpress-admin-target.md),
[reference-cms-design-inventory.md](design/reference-cms-design-inventory.md),
[reference-cms-feature-matrix.md](design/reference-cms-feature-matrix.md)
(analysis of the qrolichealth-cms reference; design lessons adopted, no code copied).

### What changed

- **Root-cause fix**: `apps/admin/src/styles.css` contained two competing design
  systems — a later fixed-position off-canvas `.admin-sidebar` overrode the grid
  shell, so the sidebar rendered off-screen at every viewport width and the
  editor main column collapsed. Consolidated to ONE WordPress design system
  (tokens: sidebar `#1d2327`, WP blue `#2271b1`/`#135e96`, content bg `#f0f0f1`,
  borders `#c3c4c7`/`#8c8f94`, text `#2c3338`/muted `#646970`, WP status pills).
- **Admin shell**: dark 220px sidebar always visible ≥1024px (52px icon rail when
  collapsed; off-canvas drawer + backdrop below), dark 36px topbar, WP nav icons,
  sidebar footer with username (→ Profile) / role / Sign out.
- **Screens restyled**: login (centered card, stale "Phase 4/later phases" copy
  removed), dashboard (welcome banner + At a Glance card), posts/pages lists
  (WP `.subsubsub` status tabs with counts, tablenav, widefat table, hover row
  actions), terms (two-column, nav-tabs), 404.
- **Editor layout rebuilt**: dark 58px header (back, title, save state, Draft
  pill, Save draft/Publish/Settings), centered 800px white paper (large title,
  permalink under it, horizontal Gutenberg toolbar, 60vh canvas), 320px Document
  sidebar with bordered panels, ≤1024px right overlay drawer. Duplicate
  `.editor-screen`/`.editor-layout`/`.editor-sidebar` definitions removed
  (root cause of the crushed canvas). Publish panel: status "Edit" action now
  exposes `aria-label="Unpublish"`/`Change status`; added Restore button for
  trashed content.
- **Users administration (P2-05, owner-authorized autonomous slice)**:
  - API: `GET/POST /api/users`, `PUT /api/users/:id/role|status|password`,
    `DELETE /api/users/:id?reassignTo=` — administrator-only via new
    `user.manage` capability, self-role-change/last-admin guards, session
    invalidation on disable/password reset, post reassignment on delete, audit
    events, no passwordHash leakage. 18 tests.
  - UI: `UsersPage` (WP list table, search, pagination, Add User / Change role /
    Reset password / Delete-with-reassignment modals) + `ProfilePage` (username
    edit, change password with client checks; shell user updates live). 13 tests.
- **Settings (options store)**:
  - DB: new additive migration `20261029090000_add_options` (`options` table:
    key PK, value, group, autoload, updated_at timestamptz).
  - API: `GET/PUT /api/options` with an allowlisted key set across groups
    general/reading/writing (site_title, site_tagline, admin_email, site_url,
    homepage_mode, homepage_id, posts_page_id, posts_per_page,
    default_post_category, default_author); reads any authenticated principal,
    writes administrator-only (`manage_options`); defaults merged over stored
    rows; unknown keys 400. 8 tests.
  - UI: `SettingsPage` with WP nav-tabs (General/Reading/Writing), typed values,
    dirty-gated Save, success/error notices. 4 tests.
- **Terms defect fixed**: inline rename had unr wired state (input rendered but
  no save path). Added Save/Cancel buttons, Enter/Escape handling and the
  `updateTerm` call.
- **E2E updated for the accepted redesign**: `/admin/` trailing slash base URL,
  dashboard "At a Glance" assertion, subsubsub status buttons, "Add New
  category" scoped to the create form, "Move to Trash"/"Unpublish" labels,
  row-hover before row actions, WP pagination text ("11 Posts" + current page).

### Verification (exact)

- `pnpm lint` / `pnpm format:check` / `pnpm typecheck` — clean.
- `pnpm test` — 356 pass (admin 92, api 248, block-system 15, web 1).
- `pnpm build` — 6/6 tasks successful.
- `E2E_API_PORT=4100 pnpm test:e2e` — 21/21 pass.
- Visual pass (Playwright, 1440×900 + 900×800): login, dashboard, posts, pages,
  terms, users, profile, settings (3 tabs), editor — zero console errors;
  geometry checked (sidebar 220px visible, editor paper 800px centered,
  toolbar horizontal 798×48, Document sidebar 320px).
- Migration applied to `mernpress_test` only; dev/prod DBs need `pnpm db:migrate`
  on next deploy (options table is additive, no data change).

### Known limitations / notes

- Settings Reading/Writing page/author pickers are ID text inputs (no
  search-picker UI yet).
- UsersPage modal backdrop uses inline styles; a shared dialog primitive is a
  candidate for the design system.
- Media library remains Phase 6 gated — not started.
- The CI bundle-budget step exists locally in `.github/workflows/ci.yml` but
  cannot be pushed (OAuth token lacks `workflow` scope) — unchanged from before.

## 2026-10-28 — Phase 5 MVP: real Gutenberg block editor

**Status:** implemented, browser-tested and committed locally on branch
`feat/gutenberg-editor`; **not pushed, not deployed, not owner-accepted**.
Baseline `b3fc337` (accepted D-036/D-037/D-038). Commits: `0fe0077` (acceptance
records + cutover plan preserved), `e915fbf` (editor slice). Documentation is a
follow-up commit on the same branch.

### What changed

- **New package `packages/block-system`** (isomorphic): contracts/limits,
  official `@wordpress/block-serialization-default-parser` adapter, iterative
  depth/count measurement, `validateBlockMarkup`. 15 tests.
- **API content guard**: `validateDraft` rejects block markup above 2 MB /
  5,000 blocks / depth 20 with stable 400 codes before persistence. Freeform
  HTML and unknown blocks stay valid and are never rewritten. 6 API tests.
- **Admin editor** (`apps/admin/src/editor/`): lazy-loaded standalone Gutenberg
  canvas (`@wordpress/block-editor` 19.0.0 set), core block allowlist,
  searchable inserter, contextual toolbar, formatting, block inspector drawer,
  list view, image URL insertion, notice snackbars, 50-entry snapshot
  undo/redo, flush-before-save and external-content guard.
- **ContentEditor rewrite**: WordPress-like document workflow with one h1,
  top-bar Publish/Update/Save draft (one primary action per state), document
  sidebar (slug, excerpt, categories/tags, status metadata, unpublish/trash/
  restore), editor breadcrumbs hidden in the shell, mobile off-canvas settings.
- **Shell/stage labels** updated to Phase 5; dashboard, lists, auth, terms and
  status tabs unchanged in behaviour.
- **E2E**: content spec now drives the canvas; new `editor.spec.ts` (5 tests);
  `E2E_API_PORT` lets Playwright start the API on an isolated port while the
  test database is reset normally. Production was never contacted.

### Verified commands and results (this tree)

```text
pnpm install --frozen-lockfile                        PASS
pnpm lint                                              PASS
pnpm format:check                                      PASS
pnpm typecheck                                         PASS (9 tasks)
pnpm test                                              PASS — 222 API + 73 admin
                                                       + 15 block-system + 1 web
                                                       = 311
pnpm build                                             PASS (6 tasks)
pnpm audit --audit-level=high                          PASS; one low advisory
                                                       (deepmerge, no patched
                                                       version; not user-input
                                                       reachable)
git diff --check                                       clean
E2E_API_PORT=4100 pnpm test:e2e                        21/21 PASS
```

Build sizes (admin): main 271.2 kB (83 kB gzip), lazy editor chunk 5,836.3 kB
(1.34 MB gzip), editor CSS 467.1 kB (64 kB gzip). `pnpm check:bundle` enforces
400 kB / 6,500 kB / 600 kB budgets in CI. The vips
and video-conversion workers are emitted (13.4 MB / 406 kB) but not fetched
during editing. Build completes in ~4–11 s with the default Node heap.

Browser-tested (Playwright, isolated API on :4100): sign-in, paragraph typing,
heading via searchable inserter, list with two items, save/reload, canonical
`wp:paragraph`/`wp:heading`/`wp:list`/`wp:list-item` persistence, publish and
public API read, undo/redo of a structural insert preserving typed text,
unknown `acme/widget` block preserved byte-for-byte, 375 px layout with
off-canvas settings, no unexpected console/page errors.

### Finishing work after the first checkpoint

- Block inspector selection now comes from the provider's
  `onChangeSelection` (the global selector does not see the provider's
  sub-registry); the inspector shows real block settings instead of a hint.
- Ctrl/Cmd+S saves (preventDefault, latest-handler ref), with
  `aria-keyshortcuts` on both save buttons.
- The title is an auto-growing `<textarea>` so long titles wrap like WordPress
  instead of scrolling out of view.
- Escape closes the document drawer; the shell breadcrumb, top-bar title and
  desktop collapse control are hidden on editor routes to avoid duplicate
  navigation.
- Publish failure recovery: a failed publish after creating a new post keeps the
  "Draft created" panel (no duplicate-create path); a failed transition after a
  content save commits the saved version first, so a retry does not reuse a
  stale `baseVersion`.
- Serializer failure no longer emits `''`; the last known-good content is kept.
- Visual polish pass (CSS only, designer lane): calmer toolbar, sheet
  proportions, panel rhythm, mobile drawer, dark-shell/light-canvas behaviour.
- `scripts/check-admin-bundle.mjs` + CI step guard the main/editor/critical CSS
  budgets.

### Decisions and records

- ADR 0006 records the integration approach, package pins, bundle evidence,
  undo model, media deferral and residual risks.
- D-039 (editor integration), D-040 (structural validation), D-041 (E2E port
  override); U-001/U-003 resolved, U-002 deferred.
- Three-model microbenchmark (beam-free, deepseek-v4.1-flash,
  muse-spark-1.3-contributor): [research note](research/editor-model-benchmark-2026-10-28.md).

### Manual verification still needed (owner)

1. Open Posts → New post; type a paragraph, insert Heading/List/Quote/Separator
   from the inserter; check the block toolbar and the Settings (block inspector).
2. Save draft, reload, confirm content and hierarchy persist.
3. Publish; confirm the public endpoint returns the post; unpublish/trash/restore.
4. Trigger a second-tab edit to confirm the 409 conflict panel still works.
5. Check 375 px: hamburger, canvas, Settings drawer, no horizontal scroll.
6. Confirm the image block's Insert from URL path; upload is intentionally
   disabled until Phase 6.

### Limitations

- No server renderer, sanitizer, golden HTML or XSS suite yet (P5-06/P5-07);
  stored markup must not be rendered publicly until Phase 7.
- No preview action (no public post renderer yet) and no media upload (Phase 6).
- Undo is burst-level snapshot history, not WordPress per-keystroke parity.
- WordPress CSS is global; popovers portal to `body`. No iframe isolation.
- `deepmerge` low advisory is transitive through WordPress packages.
- Production still serves the pre-D-038 release; cutover remains separately
  authorized and the hosting plan still targets `b3fc337`, not this branch.

---

## 2026-10-28 — D-036/D-037/D-038 accepted; deployment plan prepared (not executed)

Owner accepted D-036 (Terms), D-037 (WordPress-style shell) and D-038 (status
tabs + shareable URLs) as implementation-complete and published at commit
`b3fc337` (CI run `40652450339`, success). Per-owner instruction: no production
deployment in this slice.

Changed in this slice: AGENTS.md §1 + TASKS.md Phase 4 status now record the
acceptance; docs/operations/production-hosting.md gains a "Pending cutover to
`b3fc337`" plan (target verification, timestamped release build, BUILD-INFO,
symlink switch, api restart + Caddy reload, health/dashboard smoke checks,
code-only rollback to `20261027T140348Z-46bd5c1`). Not executed — production
still serves the older release; cutover needs separate explicit authorization.

API delta since the live release: only the D-035 terms `baseVersion` contract
(no migration; existing `version` column). No Prisma/schema/env changes, so
rollback is code-only.

---

## 2026-10-28 — CI failure round 3: tablist/select label collision

Run `40651714460` (commit `496b734`) failed 1 browser test (terms specs now
pass). `content.spec.ts` failed on `getByLabel('Status')`: the new D-038
status tablist (`role=tablist`, `aria-label="Posts status"`) collides with the
label of the pre-existing Status `<select>`, which does the same filtering job
— a genuine UI duplication, not just a test collision. Fix: removed the
redundant Status `<select>` (and the now-unused `STATUS_OPTIONS`); the tabs are
the single status filter. E2E drives the Published tab instead of
`selectOption`; the unit test clicks the Trashed tab. No API or behavior change
beyond removing the duplicate control.

Validation: lint, format, typecheck, `pnpm test` PASS — 216 API + 61 admin + 1
web = 278; `pnpm build` PASS; audit clean; `git diff --check` clean; secret
scan 0; e2e not run locally (production owns :4000), validated via CI.

## 2026-10-28 — Admin shell (D-037) implemented locally

**Status:** implementation complete and verified locally; **uncommitted**; owner
review pending. Builds on the uncommitted D-036 Terms slice (preserved). Phase 5
was not started.

### Scope delivered

- **Shell layout:** responsive `AdminShell` with a sticky sidebar (MERNPress
  identity, single Content nav group: Dashboard/Posts/Pages/Terms) and a top
  bar (page title, current user + role, logout). Sidebar collapses on desktop
  with an optional `localStorage` preference; mobile uses an off-canvas drawer
  that closes on Escape, backdrop tap and navigation, with focus handling and a
  focus trap.
- **Navigation gating:** nav items shown only via existing role helpers
  (`canReadContent`, `canManageTerms`); no new nav items and no dead controls.
- **Breadcrumbs:** derived from `breadcrumbs(route)` in the History-API router
  and rendered for list/new/edit/terms routes; URL and rendered state stay
  synchronized via the existing `useLocation`/`ROUTE_EVENT` flow; the popstate
  unsaved-changes guard is preserved.
- **Loading states:** `Skeleton` component replaces text-only `LoadingState` in
  Dashboard, ContentList, ContentEditor and TermsPage.
- **Consistent states:** permission-denied and empty states reuse
  `EmptyState`/`ErrorState` from `components.tsx`.
- **No API/schema/migration/dependency changes.**

### Commands and results

| Command | Result |
| --- | --- |
| `pnpm lint` | PASS (0 errors) |
| `pnpm format:check` | PASS |
| `pnpm typecheck` | PASS (7 tasks) |
| `pnpm test` | PASS — API 216, admin 56, web 1 (273 total) |
| `pnpm build` | PASS — admin Vite bundle 269.48 kB (80.67 kB gzip) |
| `pnpm audit --audit-level=high` | PASS — no known vulnerabilities |
| `git diff --check` | PASS |
| `pnpm exec playwright test --list` | PASS — 14 tests in 4 files |

### Manual test steps

1. `pnpm dev` (API 4000, admin 5173, web 3000) with a migrated test/dev DB.
2. Sign in as administrator; verify sidebar identity, nav group, active state,
   top-bar title/user/role, logout.
3. Collapse the sidebar (desktop) and reload to confirm the preference persists;
   expand again.
4. Resize to 375 px; open the drawer via the hamburger, close via Escape,
   backdrop tap and by clicking a nav link; verify focus returns to the toggle.
5. Visit `/posts`, `/posts/new`, `/posts/:id/edit`, `/terms` directly and via
   Back/Forward; verify breadcrumbs and active nav update with the URL.
6. Sign in as subscriber/contributor/editor and verify nav gating and
   no-access states.
7. Observe skeleton placeholders during slow loads (throttle network) on
   dashboard/lists/editor/terms.

### Limitations

- E2E was not executed (`pnpm test:e2e` requires ports 4000/5173/3000 and a
  migrated test DB; production owns :4000 in this environment). Spec count
  validated with `playwright --list` (14). CI plan: run the full Playwright
  suite on a clean runner with `TEST_DATABASE_URL` set.
- Sidebar collapse preference is stored in `localStorage` and may be unavailable
  in locked-down browsers (fails open to expanded).
- No mobile focus trap beyond the drawer's Tab wrapping; screen-reader
  announcement of drawer open/close is not yet assertive.

### Next step

Owner review of this slice. If approved, next slice is Phase 5 (Gutenberg
foundation) per TASKS.md. Do not start Phase 5 without explicit approval.

---

## 2026-10-28 — Phase 4 Terms management (D-036) preserved (uncommitted)

**Status:** implemented locally in the baseline working tree and preserved
alongside this slice; no changes made to those files.

### Scope delivered (D-036)

- `apps/admin/src/TermsPage.tsx`, `/terms` route and gated Terms nav entry
  for categories/tags management (list/search/paginate, create, rename, delete
  with detach count), administrator/editor only.

---

# Implementation log

## 2026-10-28 — CI e2e failure fixes (duplicate headings) + D-038 publish

**Status:** implemented and verified locally; committed and pushed. Phase 5 not started.

CI run `40648146991` (commit `43b57f6`) failed in Browser smoke tests with 2
failures, both genuine shell regressions from D-037 — not flaky tests:

1. `content.spec.ts:90` — strict-mode violation: `getByLabel('Content')`
   matched 2 elements (sidebar `<nav aria-label="Content">` + Content
   textarea). Fix: nav landmark renamed to `aria-label="Primary"`
   (`apps/admin/src/AdminShell.tsx`). No test references the old name.
2. `terms.spec.ts:72` — rename timed out: the spec clicked the first Rename
   button on the page, but `content.spec.ts` runs earlier in the same shared
   test DB and leaves other terms behind, so the click opened the wrong row and
   the term's own row never entered edit mode. Fix: scope the click to the
   term's own row (`tests/e2e/terms.spec.ts`). Assertion strength unchanged.

Validation (actual, this tree): `pnpm lint` PASS; `pnpm format:check` PASS;
`pnpm typecheck` PASS (7 tasks); `pnpm test` PASS — 216 API + 60 admin + 1 web
= 277; `pnpm build` PASS; `pnpm audit` clean; `git diff --check` clean; secret
scan 0; `playwright --list` 14 tests. `pnpm test:e2e` not run locally
(production owns :4000); CI exercises it.

Manual test: sign in, open Terms, rename via the term's own row; open the
editor and confirm `Content` resolves to the field; inspect one h1 per view.

Known limitation: production still serves the pre-D-038 build; cutover needs
separate explicit authorization.

## 2026-10-28 — CI failure round 2: breadcrumb duplication + stale rename locator

Run `40650677826` (commit `87b5aaf`) still failed 2 browser tests. Root causes,
both genuine D-037-shell interactions, found in the CI artifacts:

1. `content.spec.ts:90` — strict-mode violation on `getByRole('link', {name:
   'Posts'})`: the new breadcrumb trail renders a "Posts" parent link on
   new/edit pages, duplicating the sidebar nav link (2 elements). Fix: scope
   nav-link clicks to the Primary navigation landmark via a `primaryNav(page)`
   helper in `content.spec.ts`. Kept the breadcrumb links (correct UX); made
   the tests precise instead of weakening them.
2. `terms.spec.ts:72` — rename fill timed out although the screenshot shows
   edit mode open: the row was located by `hasText: termName`, but opening
   edit mode replaces the name text with the input, so the lazily re-resolved
   locator matched nothing. Fix: locate the row by its slug cell (stable
   across edit mode). Added a `Breadcrumbs` unit test locking the contract
   (parents are links, current page is a span with `aria-current`).

Validation: lint, format, typecheck, `pnpm test` PASS — 216 API + 61 admin + 1
web = 278; `pnpm build` PASS; audit clean; `git diff --check` clean; secret
scan 0; e2e not run locally (production owns :4000), validated via CI.

---

---

Append-only. Newest entries at the top. Record what was actually done, commands
and results, decisions, limitations and the next step. Do not record secrets.

---

## 2026-10-27 — Phase 4 admin content UX (P4-01…P4-06) implemented locally

**Status:** implementation complete and verified locally; **uncommitted and not
CI-verified**; owner review pending. Phase 3 baseline `46bd5c1` is published and
CI-green (run `40507958602`). Phase 5 was not started.

### Scope delivered

- **P4-01 shell:** responsive application frame, header, Dashboard/Posts/Pages
  navigation for implemented destinations only, active `aria-current` state,
  skip link, signed-in identity/role, sign-out, session loading/error/retry,
  subscriber no-content state, route focus management.
- **P4-02 lists:** separate posts/pages routes, search, status filters, server
  pagination and totals, status badges, timestamps, per-row lifecycle actions,
  empty/loading/error/retry states, role-aware controls. Bulk multi-item actions
  remain deferred until the API exposes bulk endpoints; no fake bulk control is
  shown.
- **P4-03 forms:** create/edit title, slug, excerpt and content; status and
  lifecycle actions; category/tag assignment with `baseVersion` optimistic
  concurrency; server field errors; optimistic
  `baseVersion`; double-submit guard; unsaved-change guard (in-app links, browser
  Back and beforeunload); stale-version conflict with explicit reload; read-only
  views for non-editable content. Author and publication date are read-only;
  media and scheduling are absent because the Phase 3 API does not support them.
- **P4-04 feedback:** success/error/warning notices with `role=status`/`alert`,
  field-level errors, retry actions, disabled/aria-busy controls, distinct
  validation/permission/not-found/network/conflict messages, and session-expiry
  reset to the login form on a 401.
- **P4-05 accessibility:** landmarks, heading hierarchy, labels,
  `aria-invalid`/`aria-describedby`, visible focus, skip link, keyboard-only
  workflows, responsive table/form/header layouts, reduced-motion support and a
  documented keyboard/viewport browser walkthrough.
- **P4-06 dashboard:** real counts for posts/pages by status from six
  `perPage=1` list requests; server visibility respected; loading/error/retry;
  no fabricated metrics or false zeros for subscribers.

### Files changed

- `apps/admin/src/App.tsx`, `api.ts`, `roles.ts`, `router.ts`,
  `navigation-guard.tsx`, `components.tsx`, `Dashboard.tsx`, `ContentList.tsx`,
  `ContentEditor.tsx`, `format.ts`, `LoginForm.tsx`, `styles.css`.
- Admin tests: `App.test.tsx`, `api.test.ts`, `roles.test.ts`, `router.test.ts`,
  `Dashboard.test.tsx`, `ContentList.test.tsx`, `ContentEditor.test.tsx`,
  `navigation-guard.test.tsx`.
- `tests/e2e/content.spec.ts`.
- `TASKS.md`, `README.md`, `AGENTS.md`, `docs/roadmap/roadmap.md`,
  `docs/architecture/system-overview.md`, `docs/phase-4-implementation-plan.md`,
  this log.

### Independent reviews and disposition

- `opencode/glm-5.3-flash-free#high` — PASS WITH ISSUES. Fixed: term selections
  were discarded after a partial term-assignment failure (now retained for
  retry); browser Back bypassed the unsaved guard (now handled with a
  capture-phase popstate guard + `history.forward()`); removed dead
  `canManageTaxonomy`; added session-expiry 401 reset; added E2E test-DB cleanup.
  Documented: terms list is capped at the first 100 per taxonomy.
- `opencode/nemotron-3.5-super-vl-free#high` — PASS WITH ISSUES. Fixed: popstate
  duplicate history entries (replaced with forward guard); missing unit coverage
  for the guard and 401 reset (added); dismissible terms warning; aligned confirm
  wording; expanded keyboard E2E to create a post. The reported duplicate `<h1>`
  on the login page was not reproduced (only `LoginForm` renders it after the
  session probe resolves).
- `opencode/beam-free#high` — PASS WITH ISSUES. Fixed the remaining transient
  route flash during a cancelled Back by moving the guard to the capture phase
  and stopping the router listener. The idle-session limitation (expiry is
  detected on the next API request, not proactively) is documented.
- `opencode/glm-5.3-flash-free#high` — final focused re-review after the term
  concurrency fix: **PASS**. Verified authorization-before-version, atomic
  version bump/rollback, admin payload, tests, counts and docs; no blocking,
  high or medium findings.

A final review found one inherited Phase 3 data-integrity gap: term assignment had
last-write-wins semantics. It is fixed by requiring `baseVersion` on
`PUT /api/admin/posts/:id/terms`, returning 409 on a stale version and bumping the
post version on success (D-035). API coverage includes stale and missing-version
cases. No unresolved critical/high/medium findings remain. Phase 7/10 and Phase 9
work were not started; no dependency was added.

### Verification

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS |
| `pnpm lint` | PASS |
| `pnpm format:check` | PASS |
| `pnpm typecheck` | PASS (7 tasks) |
| `pnpm test` | PASS — **216 API + 47 admin + 1 web = 264 tests** |
| `pnpm build` | PASS (5 tasks) |
| `pnpm test:e2e` | PASS — **12 Playwright tests** (auth, content lifecycle, conflict, subscriber gate, pagination, keyboard/viewport, placeholders) |
| `pnpm audit --audit-level=high` | PASS |
| `git diff --check` | PASS |
| Migration status / drift | 4 migrations; dev/test up to date; no difference |

### Limits and deferred work

- Phase 4 changes are uncommitted and not CI-verified; do not claim GitHub CI for
  them.
- Bulk multi-item actions, media, Gutenberg, scheduled publishing, previews and
  user administration remain deferred to their phases.
- Idle session expiry is surfaced on the next content API request; no polling.
- Categories/tags display at most 100 per taxonomy in the form.
- Fresh destructive database reset was not run; migrations/status/drift were
  verified without resetting the dev database.

### Next step

Owner review of the Phase 4 working tree. Do not commit/push or start Phase 5
without explicit owner authorization.

---

## 2026-10-27 — Post-acceptance Phase 3 security correction before publication

**Status:** Phase 3 remains owner-accepted (2026-10-27). Two independent review
findings were triaged before publication; one real issue was fixed, one was a
false positive. The baseline is still **uncommitted and not CI-verified**.

### Review findings and disposition

- **Transition version oracle (real, fixed).** `ContentService.transition()` checked
  `baseVersion` before `canTransition()`, so an unauthorized caller could use
  409-vs-403 responses to probe an object's version. Authorization now runs first
  (`packages/cms-core/src/content/service.ts`); authorized callers still receive
  409 `VERSION_CONFLICT` for a stale version. Regression assertions were added to
  `apps/api/test/content/roles.test.ts`: an author using another author's draft
  with both the correct and an incorrect version receives 403 `FORBIDDEN`, never
  409.
- **`applyFilters()` double-decrement (false positive).** The reviewer claimed
  `applyFilters()` decremented depth twice when `enter()` threw. The code calls
  `enter()` before the `try/finally`, so a rejected entry never reaches
  `leave()`. A temporary simulation produced exactly 2 calls for a second chain at
  `maxDepth: 2` (a negative depth would have produced 3). A regression test was
  added anyway (`apps/api/test/content/hook-recursion.test.ts`) to lock the
  restoration behavior.

### Models used

- Implementation: `opencode-go/deepseek-v4.1-flash` (existing Go entitlement;
  explicitly allowed paid Go model).
- First independent review: `opencode/glm-5.3-flash-free#high` (free).
- Re-review after fixes: `opencode/nemotron-3.5-super-vl-free#high` (free).
- An attempted third review with `opencode/flint-40b-free#high` failed with
  “Endpoint is unavailable”; no result is claimed for it.

### Verification (current tree)

| Command | Result |
| --- | --- |
| `pnpm --filter @mernpress/api test` | PASS — 25 files, **214 tests** |
| `pnpm --filter @mernpress/admin test` | PASS — 3 files, **10 tests** |
| `pnpm --filter @mernpress/web test` | PASS — 1 file, **1 test** |
| Focused visibility/roles/hooks/audit/CLI | PASS — 8 files, **65 tests** |
| `pnpm lint` | PASS |
| `pnpm format:check` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm build` | PASS |
| `pnpm test:e2e` | PASS — 7 Playwright |
| `pnpm audit --audit-level=high` | PASS |
| `git diff --check` | PASS |

Total current local gate: **214 API + 10 admin + 1 web = 225 tests**, plus 7
Playwright tests. Earlier log entries that say 224 describe the pre-correction
gate at acceptance time; the current baseline is 225.

### Publication gate

The accepted Phase 3 baseline (now including these fixes) remains uncommitted.
Phase 4 has not started. Explicit owner authorization is required to commit and
push this baseline; CI must be green for that exact commit before Phase 4 begins.

---

## 2026-10-27 — Phase 3 owner acceptance recorded

**Status:** Phase 3 explicitly accepted by the owner on 2026-10-27. The accepted
baseline is the current local working tree (the Phase 3 correction set plus the
documentation reconciliation); it is **not** committed or published to GitHub.
Phase 2 remains pending owner acceptance; Phase 3 acceptance does not accept
Phase 2.

No application source, tests, schema, migrations or runtime configuration changed
in this documentation-only acceptance record. The 224-test local gate and the
agent-executed live acceptance checks remain the evidence; no new test run was
required to record the owner’s decision.

Publication remains a separate gate: the accepted Phase 3 baseline must be
prepared as a clean diff, explicitly authorized by the owner, committed, pushed,
and verified by GitHub Actions for that exact commit before Phase 4 begins.

---

## 2026-10-27 — Documentation reconciliation before Phase 3 owner acceptance

**Status:** documentation-only slice; Phase 3 still awaits explicit owner
acceptance. No application source, tests, Prisma schema, migrations or runtime
configuration were changed. Nothing was committed or pushed; the current GitHub
revision remains `0bf7754`.

### What changed

- `README.md`: current phase is Phase 3 (implemented, awaiting owner acceptance),
  not Phase 2; described roles/capabilities, content/taxonomy API, visibility,
  hooks, dev CLI and seed; corrected the migration list (4), database/seed
  behavior, test counts, documentation links and next step.
- `AGENTS.md` §1/§10: removed the obsolete “no CMS content feature” prohibition and
  the “two migrations / no-op seed” text; preserved the Phase 4 stop gate,
  one-slice-at-a-time workflow and all security/testing/boundary rules.
- `TASKS.md`: reconciled the Phase 1 approval paragraph; recorded P2-04 as
  implemented; added P3-08 for the pre-acceptance corrections; updated Phase 3
  authorization/tests; reconciled Phase 4 with the API by removing unsupported
  author/date/media/bulk controls and adding P4-06 (dashboard real counts).
- `DECISIONS.md`: added D-033 for the Phase 4 scope limit (API-supported fields
  only; media Phase 6; bulk actions deferred).
- `docs/roadmap/roadmap.md`: corrected phase statuses, Phase 2 five-role scope,
  Phase 3 actual scope (slug history, no featured media/redirects), and Phase 4
  scope/acceptance so no unsupported control is promised.
- `docs/architecture/system-overview.md`: corrected the current-state statement and
  distinguished implemented components from target responsibilities.
- `docs/testing/phase-3-manual-acceptance.md`: corrected the test count to the
  verified 224, enumerated the 4 migrations, added the visibility/recursion/audit
  evidence, documented the 403-vs-404 hidden-mutation residual, and split
  development-account cleanup from demo-content cleanup.
- `docs/implementation-log.md`: added this entry; fixed three broken relative
  links (`../adr/...`, `../architecture/...`) that pointed outside `docs/`.

### Correction to the previous entry

The 2026-10-27 pre-acceptance entry said all six hook-recursion tests “fail on the
old code.” That was imprecise. Against the old double-decrement behavior, the
**restoration** and **repeated-invocation** tests fail (second invocation: 3 calls
instead of 2; five invocations: 20 calls instead of 10). The other four tests cover
adjacent scenarios and pass on the old code. The production fix is correct; the
regression suite as a whole detects the bug.

### Verification (docs-only tree)

| Command | Result |
| --- | --- |
| `pnpm test` | PASS — root cached run 224 tests |
| `pnpm --filter @mernpress/api test` | PASS — 25 files, **213 tests** |
| `pnpm --filter @mernpress/admin test` | PASS — 3 files, **10 tests** |
| `pnpm --filter @mernpress/web test` | PASS — 1 file, **1 test** |
| `pnpm lint` | PASS (exit 0) |
| `pnpm format:check` | PASS (exit 0) |
| `git diff --check` | PASS (exit 0) |
| Relative Markdown link check (10 edited docs) | PASS — 83 links, 0 missing |
| Targeted stale-wording search | No obsolete current-state claims in the reconciled docs (historical Phase 1 acceptance text in `TASKS.md`/`roadmap.md` retained intentionally) |

The 224 count is from a fresh direct API/admin/web test run against the current
tree, not from a cached root log. The uncommitted correction/documentation set is
**not** CI-verified; the CI-green claims in the README refer only to the committed
`dd4ffc6` and `0bf7754` revisions.

### Next step

Owner runs `docs/testing/phase-3-manual-acceptance.md` and explicitly accepts or
rejects Phase 3. No Phase 4 work starts before that.

---

## 2026-10-27 — Pre-Phase-3-acceptance correction: content visibility, hook recursion, audit event

**Status:** complete and verified locally; Phase 3 still awaits owner manual
acceptance; Phase 1/2 status unchanged (Phase 1 approved per AGENTS.md §1;
Phase 2 still pending owner acceptance).

### Findings addressed (independent review before acceptance)

1. **Content visibility (Finding 1).** Added `canReadPost(principal, authorId,
   status)` to `packages/cms-core/src/auth/capabilities.ts` plus
   `FULL_VISIBILITY_ROLES`. `ContentService.getPost()` now returns 404 for
   hidden unpublished/trashed objects; `listAdmin()` composes type/status/search/
   visibility as `AND` so hidden rows and totals agree. Public API unchanged.
   ADR 0005 documents the policy, alternatives and the residual on mutating
   paths. Replaced the cross-author draft-visibility test with regression
   coverage (direct reads, list rows, pagination counts, ownership, draft/trashed
   states, all five roles) plus a pure unit test.
2. **Hook recursion (Finding 2).** `doAction()` now calls `leave()` only after a
   successful `enter()` via an `entered` flag, fixing the double-decrement when
   `enter()` throws. `applyFilters()` already called `enter()` outside its try.
   Depth-limit rejections are now logged distinctly. Added 6 regression tests
   (handler-count based, so they fail on the old code).
3. **Audit event (additional correction 1).** Added
   `auth.manual_test_account.created` distinct from `auth.bootstrap`; bootstrap
   unchanged. Test verifies actor/target/metadata and absence of bootstrap event.
4. **Phase 1 status reconciliation (additional correction 2).** TASKS.md and the
   Phase 3 acceptance guide now record Phase 1 as approved per AGENTS.md §1;
   Phase 2/3 status unchanged.

### Verification (exact commands, all green)

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS |
| `pnpm lint` | PASS |
| `pnpm format:check` | PASS |
| `pnpm typecheck` | PASS (7 tasks) |
| `pnpm test` | PASS — API 213, admin 10, web 1 = **224 tests** |
| `pnpm build` | PASS (5 tasks) |
| `pnpm test:e2e` | PASS (7 Playwright) |
| `pnpm audit --audit-level=high` | PASS |
| `prisma migrate status` | up to date (4 migrations) |
| `git diff --check` | PASS |

Independent review: `opencode/deepseek-v4.1-flash-free#high` (zero-cost, different
family from implementer) — verdict PASS WITH ISSUES; all high/medium findings
fixed or documented as residuals; see ADR 0005 residual note. Low findings
fixed (fail-closed unknown roles, test naming, search coverage, audit catalogue
doc, ADR cross-link, distinct depth log).

### Next step

Owner runs `docs/testing/phase-3-manual-acceptance.md` and decides on Phase 3
acceptance. No Phase 4 started.

---

## 2026-10-27 — Manual-acceptance aid: development-only role-account CLI

**Status:** complete and verified locally; **Phase 3 still awaits owner manual
acceptance.** This adds a narrow, opt-in CLI so the owner can exercise the role
matrix locally without hand-editing DB rows. It is **not** user administration
(P2-05, deferred) and **not** a public API/UI. Committed and pushed with owner
authorization (see below).

### What was added

- `apps/api/src/cli/create-test-account.ts` + script `pnpm dev:create-test-account`.
- Domain use-case `auth.createManualTestAccount` (`auth/service.ts`) + types
  (`ManualTestRole` = editor|author|contributor|subscriber).
- Tests: `test/auth/manual-test-account.test.ts` (7, domain) +
  `test/auth/create-test-account-cli.test.ts` (3, spawn-level CLI safeguards).
- Acceptance-guide section "Provisioning role accounts for manual testing".

### Safeguards (all verified live + by test)

- **Production refusal**: `NODE_ENV=production` → exit 1, before any config load
  or DB work (guard moved before `loadEnv()` per review finding #1).
- **Explicit opt-in**: requires `--i-understand-dev-only`; no env override, no
  default-true.
- **No administrator**: allowlist enforced in both the CLI and the domain
  (`MANUAL_TEST_ROLES` excludes administrator; the first admin stays
  bootstrap-only).
- **No overwrite**: a username collision is a hard 409 inside a transaction —
  never re-roles, resets the password of, or deactivates an existing account.
- **Password**: one-time `Dev-<random>-Aa1!` printed once to the terminal, never
  stored/logged/written; only the Argon2id hash is persisted (same service as
  normal auth). `MERNPRESS_TEST_ACCOUNT_PASSWORD` is an automation-only override.
- **Domain boundary**: username normalization + password policy + audit — no
  validation bypass.
- **Scope**: CLI only — zero references in routes/plugins/seed/startup.

### Independent review (deepseek.v3.2) — PASS WITH ISSUES (all low), fixed

| # | Finding | Fix |
| --- | --- | --- |
| 1 | Production guard after `loadEnv()` + dead branch | guard moved before `loadEnv()`; dead branch removed |
| 4 | Invalid role threw `INVALID_USERNAME` | added `INVALID_ROLE` code |
| 8 | CLI wrapper (production/opt-in) untested | added 3 spawn-level CLI tests |

Reviewer confirmed no defect on: opt-in not bypassable, admin refusal at both
layers, collision is a hard no-op 409, one-time password handling, Argon2id-only
persistence, domain-boundary use, no route/UI/seed exposure, no hidden P2-05.

### Verification (exact commands, all green)

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS (lockfile up to date) |
| `pnpm lint` | PASS |
| `pnpm format:check` | PASS |
| `pnpm typecheck` | PASS (7 tasks) |
| `pnpm test` | PASS — **199 tests** (API 188, admin 10, web 1) |
| `pnpm build` | PASS (5 tasks) |
| `pnpm test:e2e` | PASS (7 Playwright) |
| `pnpm audit --audit-level=high` | PASS |
| Live CLI smoke (production/opt-in/admin/collision/one-time password/login) | PASS |
| `git diff --check` + secret scan | PASS |

### Local vs CI

- **GitHub CI is green for the committed `dd4ffc6`** (Phase 3) — verified via
  `gh run watch` (run `40468067008`, exit 0).
- The reconciliation + this CLI were **verified locally only** at the time of the
  gate; CI evidence for them exists only after the commit/push below.

### Next step

Owner runs `docs/testing/phase-3-manual-acceptance.md` (role-matrix section now
runnable via the CLI) and decides on Phase 3 acceptance.

---

## 2026-10-27 — Reconciliation: P2-04 roles/capabilities + discrepancy verdict

**Status:** implementation complete and verified locally; **Phase 3 still awaits
owner manual acceptance.** This entry resolves the P2-04 dependency flagged in the
Phase 3 report and records the missing-work investigation. No commit/push of this
reconciliation yet (owner authorization required for git mutations).

### 1. Missing-work investigation (discrepancy verdict)

The owner asked to reconcile: the earlier report claimed local HEAD `7e0ed2c` with
roles/user-admin work and `.opencode/` profiles; the live checkout was `36ca6d0`
(now `dd4ffc6` after my Phase 3 commit) with none of that present.

Evidence checked (no destructive action taken):

- `git cat-file -t 7e0ed2c` → **"Not a valid object name"** (object does not exist).
- `git reflog` → repo was **cloned 2026-10-25 directly to `36ca6d0`**; the only
  later entries are my Phase 3 commit. No prior `7e0ed2c` was ever checked out here.
- `git worktree list` → only `/srv/mernpress`. `git stash list` → empty.
- `git fsck --unreachable` → only the **0-byte empty blob** (`e69de29b…`, a git
  artifact, not lost work). No `.git/lost-found`.
- Filesystem search → no other `mernpress*` directory, no tarball/zip/backup of
  mernpress, no `.opencode/` anywhere on the box.

**Verdict: the earlier work is NOT recoverable and was never on this machine.** The
roles/user-administration implementation and `.opencode/` profiles are unavailable.
I did not invent or assume a transfer; Phase 3 was built from the clean Phase 2
base, and P2-04 is now implemented fresh (below).

### 2. P2-04 roles/capabilities (ADR 0004)

- **Migration** `20261027130000_phase2_roles`: `UserRole` enum gains `editor`,
  `author`, `contributor`, `subscriber` (additive).
- **Capability registry** (`auth/capabilities.ts`): code-level role → capability
  map (roles/role_capabilities **tables** deferred to Phase 9 per ADR 0004 D-2).
- **Matrix** (server-enforced): administrator = all; editor = any content +
  taxonomy (not `user.manage`); author = full lifecycle on **own** content +
  assign terms (not taxonomy manage); contributor = create + edit **own drafts
  only** (no publish/trash, no others, no published); subscriber = nothing.
- **Object-level checks** moved into the domain service (`canEditPost`,
  `canTransition`); the HTTP guard now only authenticates and passes the
  principal. `toPublicUser` fails closed on unknown roles.
- **`roles.test.ts`**: 10 tests covering subscriber/contributor/author/editor ×
  own/other × draft/published/trashed, taxonomy manage vs assign, user.manage.

### 3. Verification (exact commands, all green)

| Command | Result |
| --- | --- |
| Roles migration → test DB + dev DB (no reset, dev had 0 users) | PASS — applied `20261027130000_phase2_roles`; existing rows preserved |
| Fresh scratch DB: 4 migrations + `migrate diff --exit-code` | PASS — **No difference detected** |
| Dev DB enum check | `administrator, editor, author, contributor, subscriber` present |
| `pnpm typecheck` | PASS (7 tasks) |
| `pnpm test` | PASS — **187 tests** (API 177, admin 10, web 0* ) |
| `roles.test.ts` alone | PASS — 10/10 |
| Content suite alone | PASS — 130/130 |

\* web has 1 test; full-suite count reported at the final gate below.

### 4. Limitations / notes

- **P2-05 user administration (admin UI/API to manage users) is NOT implemented** —
  roles exist and are enforced; users are created directly in tests/bootstrap only.
- The earlier roles/users work could not be recovered; this is a fresh, verified
  implementation of the same roadmap item, not a restoration.
- Role tests create users via a direct `seedUser` helper (normalized usernames);
  the only public user-creation path remains `pnpm auth:bootstrap` (first admin).

### 5. Independent review (deepseek.v3.2) — PASS WITH ISSUES, no blockers

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | **HIGH** — contributor had no `content.read.any`, so a contributor got 403 even on their own draft (ADR/code mismatch) | **Fixed**: added `content.read.any` to the contributor set; ADR already required it |
| 2 | **MEDIUM** — no test covered contributor read access | **Fixed**: added a contributor read-own-draft + list test (11 role tests now) |
| 3 | **LOW** — stale `Principal` doc comment referencing admin-only | **Fixed**: comment now references the five-role ADR 0004 principal |

Reviewer independently verified correct (no defect): ownership checks fail closed
on null authorId; every admin route has a service-level capability check; the
removed guard role-check is fully backstopped; `toPublicUser` fail-closed; no
principal spoofing (role from session only); unpublish→publish / trash+restore→
trash capability mapping consistent; administrator path unregressed; enum
migration additive/safe on existing rows.

**Final gate after all review fixes:** lint PASS, format PASS, typecheck PASS
(7), `pnpm test` PASS — **189 tests** (API 178, admin 10, web 1), build PASS (5),
`pnpm test:e2e` PASS (7 Playwright), `pnpm audit --audit-level=high` PASS.

### 6. Next step

Owner reviews the reconciled state against
`docs/testing/phase-3-manual-acceptance.md` (role-matrix section now testable) and
decides on Phase 3 acceptance. Git mutations (commit/push of this reconciliation)
require owner authorization.

---

## 2026-10-27 — Phase 3: core content model, taxonomy and API

**Status:** implementation complete and verified locally; **owner manual
acceptance pending** (whole phase, per owner instruction). Phase 1 and the Phase
2 auth slice remain separately **not owner-accepted**.

**Important preflight finding:** the live checkout was a fresh clone at `36ca6d0`
with a **clean** working tree. The user-provided P3-01 report (local HEAD
`7e0ed2c`, "substantial uncommitted changes", roles/user-admin work) did **not**
exist here — no such commit object, no stash, no worktree, no `.opencode/`
profiles. Phase 3 was therefore implemented **from the clean Phase 2 base**, not
built on prior P3-01 work.

### Safe preflight (recorded before any change)

- `git status --short --branch` → `## master...origin/master`, clean; HEAD
  `36ca6d07`, origin `36ca6d07`, divergence `0 0`.
- `git cat-file -t 7e0ed2c` → "Not a valid object name" (historical report
  unverifiable). `git worktree list` → only `/srv/mernpress`. `git stash list` →
  empty.
- Read AGENTS.md, TASKS.md, DECISIONS.md, roadmap, content-model, code-standards,
  implementation log, schema/migrations, auth service/routes/tests, project
  scripts. No P3-01 code, no contracts package, no hooks existed.

### Model/agent workflow

- **Implementer:** Kimi K3 (`amazon-bedrock/global.moonshotai.kimi-k3`).
- **Independent reviewer (Model B, read-only):** `amazon-bedrock/deepseek.v3.2` —
  a different model family, selected after a live 19-model capability benchmark
  (Nova, Mistral, Qwen, DeepSeek, Kimi, MiniMax, NVIDIA families probed; Claude/
  OpenAI-GPT6/Grok/Zai-GLM entitlement-blocked on this account). Owner explicitly
  authorized paid Bedrock credits, superseding the original "zero-cost only" rule.
- **Planning support (Model A):** `opencode/beam-free#high` (zero-cost) — first
  design review (slug-history-not-redirect, admin-only authz, no speculative
  packages) and it agreed with the live-repo analysis.
- **Test authoring:** a `general` subagent drafted the content test suites under
  `apps/api/test/content/` (test-only allowlist, no runtime edits).
- `.opencode/agents/` and `docs/architecture/ai-agent-workflow.md` do **not**
  exist in this checkout — the configured `architecture-planner`/`test-engineer`/
  `independent-reviewer` profiles were unavailable, so `general` was used with
  explicit read-only/test-only instructions. Noted, not pretended.

### What was built (ADR 0003)

- **Schema/migration** `20261027120000_phase3_content_taxonomy`: `posts`,
  `post_slug_history`, `terms`, `post_terms`; `PostStatus` enum; check
  constraints (type, content_format, taxonomy, category-only-parent, no
  self-parent); two partial unique indexes for taxonomy slugs; FKs (author
  SET NULL, others cascade). Media/hierarchy/render/scheduled/revision columns
  deferred (D-1).
- **Slug service** (`content/slug.ts`): NFKC, transliteration, reserved words,
  200-char cap, per-(type,slug) uniqueness (DB constraint + advisory locks).
  Explicit duplicate → 409 `SLUG_TAKEN`; derived slug auto-suffixes. Redirect
  **resolution** deferred to Phase 7 — published slug change records
  `post_slug_history` in the same transaction (D-3).
- **Content service + admin/public routes**: CRUD, list/search/pagination,
  publish/unpublish/trash/restore (idempotent; publishedAt set once, preserved;
  restore returns to previous status), optimistic concurrency (baseVersion → 409
  `VERSION_CONFLICT`), term assignment via `PUT .../terms`. Public read is
  published-only + `publishedAt <= now`, leaks no author/version/status.
- **Taxonomy service + routes**: categories (hierarchical, cycle-safe) + tags
  (flat, DB-enforced); unique slug per taxonomy; transactional content-safe
  delete; computed counts (D-4).
- **Internal hook/filter contract** (`hooks/`): awaited filters (priority +
  stable registration order) revalidated before persistence; actions only
  post-commit with contained/sanitized failures; per-instance registry; depth
  guard; not a public SDK (D-6).
- **Idempotent dev-only seed** (`seed-demo.ts`): 1 post, 1 page, 2 categories,
  2 tags; refuses production; never creates an admin; never overwrites (D-8).
- **Authorization**: administrator-only, fail-closed (route guard + service
  guard + active-user revocation). Editor/author matrix **blocked on P2-04** (D-5).

### Independent review (deepseek.v3.2) — verdict PASS WITH ISSUES, no blockers

| # | Finding | Fix | Regression |
| --- | --- | --- | --- |
| 1 | Re-publish overwrote `publishedAt` (D-2) | preserve it when already set | `transitions.test.ts` re-publish test |
| 2 | Taxonomy slug precheck asymmetric → delete could 500 | symmetric per-taxonomy slug reservation + P2002 map on delete | `taxonomy.test.ts` promote-to-root test |
| 3 | Cycle check not race-safe | per-taxonomy hierarchy advisory lock around parent changes | covered by lock (race test documented) |
| 4 | `updatePost` missing P2002 → 409 map | added `isUniqueViolation` mapping | update-onto-taken test |
| 5 | `validateDraft` didn't re-check reserved/normalized slug | added normalization + reserved re-check | reserved-slug tests |
| 6 | TASKS/log not updated | this entry + TASKS P3 rows | — |
| 7 | Title persisted untrimmed | persist `title.trim()` | covered by create tests |

### Verification (exact commands, all green)

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS |
| `pnpm lint` | PASS |
| `pnpm format:check` | PASS |
| `pnpm typecheck` | PASS (7 Turbo tasks) |
| `pnpm test` | PASS — **178 tests** (API 167, admin 10, web 1) |
| `pnpm build` | PASS (5 tasks) |
| `pnpm test:e2e` | PASS — **7 Playwright tests** |
| `pnpm audit --audit-level=high` | PASS |
| Scratch DB `migrate deploy` (3 migrations) + `migrate diff --exit-code` | PASS — **No difference detected** |
| Existing dev DB `migrate deploy` | PASS — applied **only** the Phase 3 migration; 2 auth migrations + all rows (0 users/sessions/audit) preserved; dev DB never reset |
| Live HTTP smoke (`node` fetch vs running API) | PASS — login, CRUD, publish/unpublish/trash, terms, public-only visibility, 401/403/409, slug conflict |
| Seed ×2 + production refusal | PASS — run 1 created demo content, run 2 idempotent skip, `NODE_ENV=production` refused |

### Limitations / residual risks

- **Owner manual acceptance has NOT run.** This guide
  (`docs/testing/phase-3-manual-acceptance.md`) is the acceptance surface.
- **Role matrix (editor/author) NOT tested** — roles do not exist (P2-04);
  documented as blocked, not skipped.
- **Redirects are recorded, not served** — Phase 7 resolves `post_slug_history`
  into 301s once the public URL grammar is fixed.
- **No permanent delete, revisions, media, page hierarchy, scheduled publish** —
  Phase 5–8.
- Public API has no caching/SEO templates (Phase 7).
- The taxonomy cycle race is mitigated by the hierarchy advisory lock but not
  covered by an explicit concurrent-reparent integration test.

### Next step

Owner follows `docs/testing/phase-3-manual-acceptance.md` and accepts or rejects
the **whole** Phase 3. Only after explicit acceptance does Phase 4 (admin content
UX) begin. Do not start Phase 4 on the strength of the green gate.

---

## 2026-10-25 — Phase 2 auth hardening: fixes, modular pass and verification

**Status:** implementation complete, verified locally and CI-green; owner
manual acceptance pending. No roles, user administration, content or editor
work was started.

### Findings and fixes

| Finding | Fix | Regression evidence |
| --- | --- | --- |
| A. Expired `login_attempts` rows for one-off keys accumulated forever | Bounded opportunistic prune on every login (100 rows, oldest first, `FOR UPDATE SKIP LOCKED`), `login_attempts(attempted_at)` index, cutoff equals the live limiter window start | `rate-limit-cleanup.test.ts`: one-off keys pruned, recent rows kept, exactly one batch deleted, live limiter not reset |
| B. Every 429 wrote a durable audit row | Coalesced `auth.login.rate_limited` at the threshold; rejected requests return 429 + `Retry-After` with no write; per-attempt failures remain | 20-request burst: all 429, ≤2 threshold events; concurrent blocked burst adds none |
| C. `GET /api/auth/csrf` overwrote the session CSRF cookie | Separate `mernpress_csrf_preauth` (login, 10 min) and `mernpress_csrf` (session-bound, login only); GET never touches session state | Authenticated refresh then logout 204; anonymous/invalid/expired session cases; browser regression through the Vite proxy |
| D. Docs implied a configurable separate API origin | Supported topology is same-origin admin + `/api` reverse proxy; client stays relative `/api`; separate-origin is explicitly unsupported | Admin client unit test pins relative URLs/credentials; Playwright asserts the `/api` response origin equals the admin origin |
| E. Session cookie path docs/code mismatch | All docs now agree with `Path=/api`; CSRF cookies use `Path=/` | Cookie assertions in login tests and docs grep |

### Design decisions

Recorded before code changes: D-021 (bounded retention + index), D-022
(coalesced rate-limit audit), D-023 (pre-auth/session CSRF split), D-024
(same-origin topology). Full rationale and residuals:
[ADR 0002](adr/0002-authentication-foundation.md#auth-hardening-follow-up-2026-10-25).

### Modularity and standards

The auth service was split so each module has one reason to change:

- `auth/rate-limit.ts` owns all `login_attempts` reads/writes, pruning and
  threshold detection;
- `auth/audit.ts` is the only auth audit writer and owns HMAC-safe metadata;
- `auth/identifiers.ts` owns domain-separated HMAC hashing;
- `auth/service.ts` now only orchestrates bootstrap/login/session/logout.

[Engineering standards](architecture/code-standards.md) now documents the
SOLID/DRY interpretation, package boundaries, auth module map, error/logging
rules, testing expectations, formatting and scalability rules, and is linked
from `AGENTS.md` so a new session reads it before changing code.

### Verification

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS |
| `pnpm lint` | PASS |
| `pnpm format:check` | PASS |
| `pnpm typecheck` | PASS (7 Turbo tasks) |
| `pnpm test` | PASS — **58 tests** (API 47, admin 10, web 1) |
| `pnpm build` | PASS |
| `pnpm test:e2e` | PASS — **7 Playwright tests** (4 auth incl. CSRF refresh, 3 foundation) |
| `pnpm audit --audit-level=high` | PASS — no known vulnerabilities |
| Fresh database `pnpm db:migrate` | PASS — both additive migrations, auth tables, both attempt indexes, UTC/UUIDv7 check |
| Existing-schema upgrade | PASS — applied only the hardening index via `migrate deploy`; existing `login_attempts` row preserved |
| Seed on fresh DB | PASS — idempotent no-op, no administrator/content rows |
| GitHub Actions | PASS — run `40180070433` on commit `cd56d09`, 2m56s: install, lint, format, typecheck, 58 tests, fresh-DB migrations, seed, build, 7 Playwright tests and audit all green |

### Independent review

Read-only adversarial review by a different free model
(`opencode/glm-5.3-flash-free` with max reasoning). Verdict: **PASS WITH
ISSUES**, no blockers or high findings. It confirmed findings A–E fixed with
file:line evidence, scope clean and no secrets.

It raised documentation accuracy and test-hygiene issues, all corrected before
commit:

- ADR now says five issues and distinguishes tested reproductions (A–C) from the
  static topology/docs checks (D–E).
- The retention test now asserts the exact exported batch size, so the ADR's
  "one batch of 100" claim is proven, and the constant is no longer an unused
  public export.
- The review-entry status line no longer claims fixes are pending; `AGENTS.md`
  now says two additive migrations.
- Removed a dead assertion; added a same-username/different-IP rate-limit test,
  a concurrent-blocked-retry audit test, and a no-session-clear assertion for
  invalid-session CSRF refresh.

### Limitations / residual risks

- Owner manual acceptance has not run.
- Rate-limit audit can emit a few threshold events under an admitted-request
  race; it cannot grow with rejected requests. Documented, accepted at MVP
  volume.
- Pruning runs only while login traffic exists; a static table does not grow.
- No MFA/password reset/email/SSO; a lost sole-admin password needs a separately
  approved recovery procedure.
- Same-origin deployment is required; separate-origin API support is future work.
- E2E is Chromium-only; full axe/cross-browser checks remain later work.
- No content/CMS feature exists.

### Next step

Owner follows `docs/testing/phase-2-manual-test.md` and accepts or rejects this
hardened auth slice. If accepted, the next single slice is the remaining Phase 2
work: roles/capabilities and user administration with last-administrator
protection, then profile/password management. Phase 3 must not start first.

---

## 2026-10-25 — Phase 2 auth hardening: review and reproduction

**Status:** review and reproduction recorded before the fixes; superseded by the
completion entry above. No slice scope added.

A static follow-up review of `223a35f` found five issues. Each was reproduced
with a focused failing test before any code change:

| Finding | Reproduction | Result |
| --- | --- | --- |
| A. Expired `login_attempts` rows for one-off keys are never pruned | `apps/api/test/auth/rate-limit-cleanup.test.ts` | Failed: 6 expired rows remained; 0 of 150 expired rows deleted |
| B. One durable audit row per rate-limited rejection | `apps/api/test/auth/security.test.ts` stress | Failed: 21 `auth.login.rate_limited` rows after a 20-request burst |
| C. `GET /api/auth/csrf` overwrites the session CSRF cookie | `apps/api/test/auth/csrf.test.ts` | Failed: 4 cases, including logout 403 after an authenticated refresh |
| D. Docs imply a configurable separate API origin | static review of `apps/admin/src/api.ts`, Vite config, ADR 0002 | Confirmed: client is relative `/api` only |
| E. Session cookie path mismatch (`/` vs `/api`) | ADR 0002 vs `apps/api/src/auth/cookies.ts` | Confirmed: docs said `/`, code uses `/api` |

Decisions recorded before implementation: D-021 to D-024 and
[ADR 0002](adr/0002-authentication-foundation.md#auth-hardening-follow-up-2026-10-25).
The fixes stay inside the authentication slice and add no roles, user
administration, content or editor work.

---

## 2026-10-25 — Phase 2: secure authentication first slice

**Status:** implementation complete, verified locally and CI-green; **owner
manual acceptance pending**. No Phase 3 or content/CMS feature was started.

### Summary

- Added one additive auth migration: `users`, `sessions`, `audit_events`,
  `login_attempts`, plus `UserRole`/`UserStatus` enums.
- Added `packages/cms-core` as the framework-agnostic auth domain: Argon2id
  password hashing, opaque token/CSRF helpers, database-backed sessions,
  advisory-locked first-admin bootstrap, HMAC-peppered rate-limit/audit keys.
- Added `POST /api/auth/login`, `POST /api/auth/logout`,
  `GET /api/auth/session`, `GET /api/auth/csrf`; exact Origin + CSRF checks;
  request-ID UUID allowlist; 16 KiB body limit; `Cache-Control: no-store`.
- Added `pnpm auth:bootstrap` CLI with a no-echo TTY prompt (or a non-production
  `MERNPRESS_ADMIN_PASSWORD` for automation), refusing if an administrator exists.
- Replaced the admin placeholder with a login/logout/session shell: accessible
  labels, alert region, loading states, keyboard operation, no tokens in browser
  storage.
- Added a dedicated test database workflow (`TEST_DATABASE_URL`), 37 API tests,
  5 admin tests, 1 web test and 3 auth + 3 foundation Playwright tests.
- Recorded ADR 0002 and decisions D-018/D-019/D-020 before/with the slice.

### Scope boundary

Implemented: secure first-administrator bootstrap, Argon2id, database-backed
sessions, login/logout/current-session, CSRF/Origin, DB-backed login rate
limiting, request-ID validation, audit events, minimum login UI.

Deferred: editor/author roles and capability matrix, user administration,
profile/password change, password reset/email, MFA/SSO, audit UI, and all
content, editor, media, taxonomy, theme and plugin features.

### Schema and migration

Migration: `packages/database/prisma/migrations/20261024201137_phase2_auth/migration.sql`.

| Table | Purpose |
| --- | --- |
| `users` | UUIDv7 id, unique normalized username, Argon2id hash, administrator role, active/disabled |
| `sessions` | unique SHA-256 token hash, SHA-256 CSRF hash, created/last-used/expires/revoked timestamps |
| `audit_events` | event type, optional actor/target user, HMAC IP hash, reason-only JSON metadata |
| `login_attempts` | HMAC key hash + timestamp, composite index |

No content, taxonomy, media, revision, role/capability or plugin tables exist.
The seed remains an explicit no-op.

### Commands and results

All commands ran with Node `24.22.1`, pnpm `12.15.0`, local PostgreSQL `18.3`
(project cluster) unless stated.

| Command | Status | Evidence |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | PASS | 6 workspace projects; lockfile up to date |
| `pnpm lint` | PASS | ESLint 10, 0 errors; import boundaries enforced |
| `pnpm format:check` | PASS | Code/config formatted |
| `pnpm typecheck` | PASS | 7 Turbo tasks: database, cms-core, API, admin, web |
| `pnpm test` | PASS | **43 tests**: API 37, admin 5, web 1 |
| `pnpm build` | PASS | API/cms-core/database tsc; admin Vite; Next static routes |
| `pnpm test:e2e` | PASS | **6 Playwright tests**: login/logout, invalid creds, keyboard sign-in, admin/web placeholders, API liveness |
| `pnpm audit --audit-level=high` | PASS | No known vulnerabilities |
| `pnpm db:migrate` on a fresh DB | PASS | Applied one auth migration; tables created; `db:verify` UTC/UUIDv7 |
| `pnpm db:seed` twice on fresh DB | PASS | Identical no-op; users/sessions/audit/attempts rows all 0 |
| `pnpm auth:bootstrap` on empty DB | PASS | Created one administrator; Argon2id PHC `m=65536,t=3,p=1` |
| Bootstrap re-run | PASS (expected refusal) | Refused with `An administrator already exists`; no second user |
| Login → session → logout smoke | PASS | Session cookie HttpOnly/SameSite/Lax Path=/api; CSRF cookie readable; DB token hash 64 chars; logout 204 then session 401; audit events recorded |
| GitHub Actions | PASS | Run `40166039330` on commit `3f29e9f`, 2m17s: install, lint, format, typecheck, 43 tests, fresh-DB migrate, seed, build, 6 Playwright tests and audit all green |

### Security verification

- Bootstrap: CLI-only, advisory lock, existing-admin refusal, unique normalized
  username, 12–128 char password policy, no password in argv/logs, production
  refuses env-password automation.
- Password: Argon2id 64 MiB / 3 passes / 1 lane / 32-byte output; unknown users
  verify a dummy hash; generic `INVALID_CREDENTIALS` for unknown/wrong/disabled.
- Sessions: 256-bit opaque token, only SHA-256 stored; new session per login;
  8 h absolute / 30 min idle; logout, expiry and disabled-user revocation;
  HttpOnly session cookie Path=/api, Secure in production.
- CSRF/Origin: exact Origin on every mutating request; pre-auth double-submit
  login CSRF; session-bound CSRF hash for logout; no state-changing GET.
- Rate limit: DB-backed HMAC IP + username keys, 5/15 min default, 429 +
  Retry-After, success clears, invalid usernames limited, recovery tested with a
  fake clock.
- Request IDs: canonical UUID only; arbitrary/oversized values replaced.
- Audit: six event types, HMAC IP/identifier hashes, no passwords/tokens/cookies.
- Errors/logs: production generic 4xx/5xx messages; cookie/password/CSRF
  redaction tested.
- No secrets tracked; `.env`/test credentials are not in git.

### Independent review

A read-only adversarial review used a different configured free model
(`opencode/glm-5.3-flash-free`). First verdict: **PASS WITH ISSUES**, no blockers.
Medium findings fixed and re-checked:

1. Invalid usernames bypassed the rate limiter → limiter now runs before the
   username-policy branch; test added.
2. Production could fail open with dev CORS/NODE_ENV defaults → `NODE_ENV` is
   required and production requires explicit HTTPS non-loopback CORS + a real
   `AUTH_HASH_PEPPER`; tests added.
3. Audit/rate-limit hashes were unpeppered → HMAC-SHA256 with
   `AUTH_HASH_PEPPER`.
4. CLI arrow-key escape bytes could corrupt passwords → CSI state machine.

Also fixed/verified: key-scoped rate-limit cleanup, session cookie Path=/api,
Turbo env propagation, generic production error messages, no plaintext username
in bootstrap audit metadata. Re-check verdict: **PASS**, 37/37 API tests, no
regressions.

### Limitations / unfinished checks

- Owner manual acceptance has not run.
- CI run `40166039330` passed; GitHub still warns that several actions target
  Node 20 while runners force Node 24. Track action updates; not a failure.
- No MFA/2FA, password reset/email, SSO or account recovery; losing the only
  admin password needs a separately approved recovery procedure.
- Rate-limit count/insert can overshoot by a small amount under extreme
  concurrency; accepted at MVP login volume and documented.
- E2E is Chromium-only; cross-browser and axe checks remain later work.
- SameSite=Lax assumes same-site admin/API deployment; cross-site deployment
  needs `SameSite=None; Secure` and a new review.
- `TRUST_PROXY` must be set correctly behind a reverse proxy or IP rate limiting
  sees the proxy address.
- The admin UI is intentionally only login/logout/session; no dashboard/content.
- No content/CMS feature or Phase 3 work exists.

### Next step

Owner manually tests `docs/testing/phase-2-manual-test.md` and approves or
rejects this slice. If approved, the next single slice is the remaining Phase 2
work: roles/capabilities and user administration (last-admin protection), then
profile/password management. Do not start Phase 3 content, Gutenberg, media,
taxonomy, themes or plugins.

---

## 2026-10-25 — Phase 1: repository foundation

**Status:** Phase 1 implementation complete, verified locally and green in CI;
**owner manual test pending**. No Phase 2 or CMS feature code was started.

### Summary

- Added a pnpm 12.15.0 + Turborepo 2.11.10 workspace with Node 24.22.1 pinned.
- Added strict shared TypeScript, ESLint 10 + typescript-eslint + jsx-a11y +
  Prettier, import-boundary rules, `.editorconfig`, `.gitignore`, `.env.example`
  and environment validation.
- Added `packages/database` (Prisma 7.10.1 + `@prisma/adapter-pg`, UTC-pinned
  session, empty schema, connectivity/seed scripts).
- Added `apps/api` (Fastify 5 app factory, logging/request IDs, error envelope,
  helmet, explicit CORS, graceful shutdown, `/api/health`, `/api/ready`).
- Added `apps/admin` (React 19 + Vite 8 placeholder) and `apps/web` (Next.js 16
  App Router + Tailwind 4 placeholder). Neither contains CMS features.
- Added Vitest tests, Playwright smoke tests, a setup script, an optional
  no-sudo local PostgreSQL helper, CI, and operator/testing documentation.
- Did not copy reference code, did not touch the reference repositories, and did
  not run `codegraph init`.

### Preflight findings and decisions

| Check | Result |
| --- | --- |
| Node 24.22.1 available | Yes, Krypton LTS; installed with `nvm install 24.22.1` |
| pnpm line | 12.15.0 is current stable (12.0.0 2026-08-26, 12.15.0 2026-10-21); Node `>=18`; adopted for a new workspace. D-001/ADR 0001 updated |
| ESLint line | ESLint 9.39.5 is marked "no longer supported"; ESLint 10.13.0 + `@eslint/js` 10.0.1 adopted. `eslint-plugin-jsx-a11y` 6.10.2 declares ESLint ≤9 but its `alt-text` rule was verified failing correctly on ESLint 10.13.0, so an explicit `peerDependencyRules` override is documented (D-016) |
| Prisma 7 config | `prisma7.config.ts` + `prisma-client` generator + `@prisma/adapter-pg`; schema has no models; client generation and adapter verified in a throwaway project first |
| Empty-schema migrations | `prisma migrate deploy` exits 0 with "No migration found"; it creates only `_prisma_migrations`. No empty migration or fake CMS rows were added (D-017) |
| UTC | Adapter pool uses `options: '-c timezone=UTC'`; verified `SHOW TimeZone` = UTC |
| UUIDv7 | PostgreSQL 18 `uuidv7()` verified; Prisma `@default(uuid(7))` also verified in the throwaway probe (not needed without models) |
| Local PostgreSQL service | System server runs 18.3 but the current OS user has no role and no sudo; verification used a loopback-only project cluster on port 55432. CI uses PostgreSQL 18 as a service |
| Peer graph | Install passes with the pinned graph; only the documented jsx-a11y/ESLint override is declared |

### Commands and results

All commands ran with Node `v24.22.1` and pnpm `12.15.0` unless stated.

| Command | Status | Evidence / summary |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | PASS | 5 workspace projects; lockfile up to date; no peer/build errors |
| `pnpm setup` | PASS | Generated Prisma client; migrate no-op; seed no-op |
| `pnpm db:migrate` | PASS | "No migration found in prisma/migrations"; "No pending migrations to apply"; `_prisma_migrations` exists |
| `pnpm db:seed` (twice) | PASS | Identical no-op message; exit 0 both times; no CMS rows |
| `pnpm db:verify` | PASS | `timezone=UTC`; UUIDv7 printed |
| `pnpm lint` | PASS | ESLint 10, 0 errors |
| `pnpm format:check` | PASS | All code/config files formatted; Markdown intentionally excluded from Prettier |
| `pnpm typecheck` | PASS | 5 turbo tasks: database build/typecheck, API, admin, web |
| `pnpm test` | PASS | 12 tests: API 9 (health, readiness 200/503, error envelope, env), admin 2, web 1 |
| `pnpm build` | PASS | API/database tsc; admin 221.26 kB JS (69.18 kB gzip), 2.74 kB CSS; Next 4 static routes |
| `pnpm dev` | PASS | API 4000, admin 5173, web 3000 all started |
| `curl /api/health` | PASS | 200, `{"status":"ok","service":"mernpress-api",...}` |
| `curl /api/ready` with DB | PASS | 200, `{"status":"ready","checks":{"database":"ok"}}` |
| DB stopped: `/api/ready` | PASS | 503, `{"status":"not_ready","checks":{"database":"unavailable"}}` |
| DB stopped: `/api/health` | PASS | 200; API process remained alive |
| DB restarted: `/api/ready` | PASS | 200 again without restarting the API |
| `pnpm test:e2e` | PASS | 3 Playwright tests; both placeholders clean console/assets; API liveness 200 |
| `pnpm audit --audit-level=high` | PASS | "No known vulnerabilities found" |
| CI YAML parse | PASS | `.github/workflows/ci.yml` parsed with PyYAML |
| GitHub Actions run | PASS | Run `40127072446`: all steps green. Initial run `40126832868` failed at typecheck because Turborepo filtered `DATABASE_URL`; fixed by declaring `globalEnv` in `turbo.json` |
| `codegraph init` | SKIPPED | Indexing is the owner's decision; the MCP was verified in Phase 0 and no index was created |
| `opencode-mem` update | SKIPPED | Not part of Phase 1; global OpenCode config was not modified |

### Database semantics

- The Prisma schema is intentionally empty; no migration directory exists.
- `db:migrate` is a documented no-op that also verifies connectivity. On a new
  database Prisma creates `_prisma_migrations` (bookkeeping only).
- `db:seed` is a deterministic, idempotent no-op. It creates no administrator,
  user, post, page, term, media or settings row.
- The first migration and seed data are Phase 2 work.

### Scope and security checks

- No authentication/session, user, content CRUD, editor, media, taxonomy, theme
  or plugin runtime code exists.
- `.env` is ignored; only `.env.example` placeholders are tracked.
- API CORS uses explicit origins with credentials and rejects wildcards.
- Readiness responses expose no connection details.
- Health/readiness headers include the standard helmet set; the API returns a
  request-id response header.
- No reference repository or global OpenCode configuration was modified.
- `.local/`, generated Prisma code, build output and Playwright artifacts are
  gitignored.

### Clean-clone verification (2026-10-25)

A separate clone of commit `48bdbc5` was tested against a brand-new database
(`mernpress_clean_1792869640` on the project-local PostgreSQL 18.3 cluster).

| Step | Status | Evidence |
| --- | --- | --- |
| `git clone` + `git log -1` | PASS | Clone at commit `48bdbc5` |
| `pnpm install --frozen-lockfile` | PASS | Cold install completed (6m due to registry latency); no peer/build bypass |
| `pnpm setup` | PASS | No migrations; seed no-op; UTC/UUIDv7 verified |
| `pnpm lint` | PASS | 0 errors |
| `pnpm format:check` | FAIL → PASS | First run flagged Next-regenerated `apps/web/next-env.d.ts`; excluded that generated file from Prettier in `f344791`, fast-forwarded the clone and re-ran: PASS |
| `pnpm typecheck` | PASS | `next typegen` + 5 turbo tasks |
| `pnpm test` | PASS | 12 tests (API 9, admin 2, web 1) |
| `pnpm build` | PASS | Admin, API, database and Next production builds |
| `pnpm dev` | PASS | API 4000, admin 5173, web 3000 |
| Health/readiness | PASS | 200/200 on the fresh database |
| Database inspection | PASS | Only `_prisma_migrations` exists |
| `pnpm test:e2e` | PASS | 3 Playwright tests |

The clone's dev servers were stopped afterward so the owner's manual test starts
from free ports.

### Final re-verification (2026-10-25)

After the generated-file cleanup and the `test:e2e` precondition fix, the clean
clone was fast-forwarded to `b69e043` and re-tested with no `apps/web/.next` and
no `apps/web/next-env.d.ts` present:

- `pnpm typecheck` regenerated Next route types and passed.
- `pnpm test` passed.
- `pnpm build` passed.
- `pnpm test:e2e` generated the Prisma client first and passed 3/3.
- `git status` remained clean; all dev-server ports were free afterward.

This is the authoritative clean-clone result for the final Phase 1 code state.

### Independent review (2026-10-25)

A read-only review used a different configured free model
(`opencode/glm-5.3-flash-free`) against commit `7b4ad5a`. It did not edit files
and did not re-run build/test/dev; it inspected code, config and the recorded
evidence.

**Verdict: PASS WITH ISSUES — all 10 acceptance gates satisfied, no blocking
issues, no CMS feature and no tracked secret found.** Findings and actions:

| Finding | Action |
| --- | --- |
| `test:e2e` did not generate the Prisma client first, so an isolated fresh-clone E2E run could fail | Fixed: `test:e2e` now runs `pnpm db:generate` first; re-ran Playwright: 3/3 pass |
| Next regenerates `apps/web/next-env.d.ts`, causing format churn | Resolved: `next-env.d.ts` is gitignored and regenerated by `next typegen` / dev / build; Next's generated `apps/web/AGENTS.md` is committed as Next intends |
| `pnpm audit --audit-level=high` can fail CI on a newly published advisory | Intentional: keep the blocking gate; review the advisory rather than weakening it |
| Readiness logs only a generic message, losing the failure cause | Intentional anti-leak default; revisit structured debug-level diagnostics in a later phase |
| Stale ADR line said Node 24 was not installed | Fixed: ADR 0001 now records the Phase 1 installation/verification |
| Reviewer shell exposed Node 22/pnpm 11 | Environment mismatch, not a repo defect; Node/pnpm pins, setup checks, CI and `.nvmrc` defend against it |

The reviewer did not run the commands itself (read-only constraint), so the
command evidence above remains the authoritative record.

### GitHub remote and CI (2026-10-25)

- Private repository: <https://github.com/nilesh32236/mernpress>; default branch
  `master`; current pushed commit at the time of this entry: `ef6d6d0`.
- The initial push needed a temporary repo-scoped write deploy key because the
  GitHub CLI token lacked the `workflow` OAuth scope and the machine's existing
  SSH key belongs to a different GitHub account. The deploy key was deleted
  immediately after the push; the remote is HTTPS and the token now has the
  `workflow` scope.
- First CI run `40126832868` failed at typecheck: Turborepo filtered
  `DATABASE_URL` out of package task environments. Fixed in `ef6d6d0` by
  declaring `DATABASE_URL` (and the other runtime variables) in `turbo.json`
  `globalEnv`. The fix was first reproduced locally with `.env` removed.
- Re-run `40127072446` passed every step: install, lint, format check, typecheck,
  tests, fresh-database migrate, seed no-op, build, Playwright and dependency
  audit.

### Limitations / unfinished checks

- Owner manual acceptance has not run yet.
- CI passes, but GitHub currently warns that `actions/checkout@v4`,
  `actions/setup-node@v4`, `pnpm/action-setup@v4` and
  `actions/upload-artifact@v4` target Node 20 while runners force Node 24. Track
  action updates; the warnings are not failures.
- The clean clone surfaced and fixed one formatting-gate issue: Next regenerates
  `apps/web/next-env.d.ts`, so it is excluded from Prettier. No code behavior
  changed.
- The local verification database was PostgreSQL 18.3 (project-local cluster),
  not 18.6; the SQL used is compatible with PostgreSQL 18.
- `pnpm dev` scripts use POSIX `NODE_OPTIONS`; Windows native shells are not a
  supported Phase 1 path.
- The admin/web pages are placeholders; accessibility is limited to semantic
  structure, skip link, focus styles and a clean browser smoke test. A full axe
  pass belongs to Phase 4.
- `docs/research/opencode-tooling.md` still records the Phase 0 decision to skip
  `opencode-mem`; it was not rewritten because Phase 1 did not change OpenCode
  tooling.

### Next step

Owner manually tests [the Phase 1 checklist](testing/phase-1-manual-test.md) and
approves or rejects the foundation. If approved, implement only **Phase 2 —
secure admin authentication**; do not start content, editor or theme work.

---

## 2026-10-25 — Phase 1 preflight

Short preflight entry required before implementation.

- Read `AGENTS.md`, `README.md`, `TASKS.md`, `DECISIONS.md`, ADR 0001, the system
  overview, threat model, testing strategy, roadmap Phase 1 and the Phase 0 log.
- `pwd` = `/home/nilesh/Documents/big-project/mernpress`; branch `master`; commit
  `60cc1d1`; working tree clean before changes.
- Installed Node 24.22.1 with nvm and pnpm 12.15.0 globally.
- Checked current registry versions and peer ranges for Node, pnpm, Turbo,
  TypeScript, ESLint, typescript-eslint, jsx-a11y, Fastify, Prisma, adapter-pg,
  React, Vite, Next, Tailwind, Vitest and Playwright.
- Recorded D-016 (ESLint 10 + tested jsx-a11y override) and D-017 (no Phase 1
  migration, explicit no-op seed) before writing application code.
- Confirmed `prisma migrate deploy` on an empty schema is a successful no-op and
  that `@prisma/adapter-pg` can pin UTC and use PostgreSQL 18 `uuidv7()`.

## 2026-10-24 — Phase 0: research and architecture baseline

**Status:** Phase 0: planning only; **product feature code not started.**

### Summary

- Inspected the supplied WordPress 7.1.3 source and the four extracted reference
  projects: `qrolic-cms-main`, `qrolichealth-cms-main`,
  `qrolic-frontend-main`, `qrolichealth-main`.
- Produced read-only audits of CMS core, Health CMS delta, both frontends,
  WordPress core and the Gutenberg/block system.
- Compared the current stack options against official docs and npm registry
  metadata; verified a pinned Gutenberg package set with a throwaway Vite build.
- Audited the installed OpenCode environment, free-model inventory and tooling
  candidates; backed up config and installed CodeGraph CLI 1.6.2 with telemetry
  disabled.
- Wrote the Phase 0 documents listed below. Created no applications, packages,
  database migrations, themes or plugins.

### What was actually inspected

- `../wordpress`: `wp-includes/version.php` (`$wp_version = '7.1.3'`), core files
  for posts, revisions, capabilities, hooks, blocks, REST, templates, media,
  options, security.
- `../qrolic-cms-main`: README, codemap, package manifests, Prisma schema and
  migrations, API routes/controllers/services/middleware, admin structure,
  shared block registry, tests, docs, changelog, env names (no values).
- `../qrolichealth-cms-main`: `diff -rq` against the baseline, schema/migrations,
  forms/outreach/leads/Brevo/compliance code, tests, docs, env names.
- `../qrolic-frontend-main`: Next app structure, CMS client/cache/DTO/SEO,
  routes, tests, deploy config.
- `../qrolichealth-main`: Next app structure, CMS client, block adapters,
  preview, SEO, security headers, forms API integration.
- OpenCode: `opencode --version` (2.1.4), `opencode debug config`,
  `opencode plugin list`, `opencode mcp list`, `opencode models`, model cost
  metadata via the OpenCode tool catalog.

### Commands / evidence (key)

```bash
grep -E "wp_version =|wp_db_version" ../wordpress/wp-includes/version.php
# $wp_version = '7.1.3'; $wp_db_version = 61833

node --version        # v22.23.1
pnpm --version        # 11.13.1
psql --version        # PostgreSQL 18.3
docker --version      # not installed
opencode --version    # 2.1.4

npm view prisma dist-tags          # latest = 8.0.0-rc.27
npm view @prisma/client dist-tags  # latest = 7.10.1
npm view typescript dist-tags      # latest = 7.0.2
npm view typescript-eslint peerDependencies  # typescript <6.1.0
```

Gutenberg compatibility spike (throwaway, not committed):

```bash
cd /tmp/opencode/wp-compat-20261024
pnpm install --strict-peer-dependencies --ignore-scripts   # passed, 229 packages
pnpm exec vite build                                      # passed
node parse-test.mjs                                       # nested group/columns parsed
node roundtrip-test.mjs                                   # native Node import of @wordpress/blocks fails
```

Observed bundle: ~5,878 kB main JS (gzip ~1,342 kB), ~474 kB CSS, ~13,449 kB vips
worker, ~406 kB video-conversion worker. This is a Phase 5 performance gate.

### OpenCode tooling

- Config backup: `/home/nilesh/.config/opencode/backups/20261024-232029`
  (mode 700; files 600; `auth.json`/`service.json` excluded).
- Installed `@colbymchenry/codegraph@1.6.2` globally; `codegraph --version` =
  1.6.2; `codegraph telemetry off` succeeded. Not wired to OpenCode, not indexed.
- Context7 0.2.1 connected; gh_grep connected; opencode_console connected; GitHub
  MCP failed with a 404 for `@github/github-mcp-server` (known issue, not fixed).
- `opencode-mem` 2.33.0 skipped: Bun absent, 0.5–2 GB RAM for local embeddings,
  1–2 GB model cache, auto-capture privacy/storage, no code to remember yet.
- CodeGraphContext skipped: redundant with CodeGraph, Python/graph DB overhead.
- Playwright MCP skipped: project Playwright is the plan.
- No paid model/API was used. Free-model cross-check: DeepSeek V4.1 Flash Free and
  GLM-5.3 Flash Free; both preferred Drizzle and React Router 7, split on API.
  Final choices (Prisma/Next/Fastify) and dissent are recorded in the stack
  comparison and ADR.

### Decisions recorded

- ADR 0001: Node 24 LTS, Fastify 5, PostgreSQL 18, Prisma 7.10.1, React 19 + Vite
  8, official Gutenberg packages, Next 16, TypeScript 5.9.3, pnpm 11 + Turbo.
- D-002..D-015: PostgreSQL only; WordPress block markup canonical; API owns
  rendering; unknown blocks preserved; one block registry; trusted plugins; theme
  packages; modular monolith; Docker optional; TS 5.9.3; Prisma pinned; official
  parser first; Phase 1 first slice.

### Documents created

`README.md`, `AGENTS.md`, `TASKS.md`, `DECISIONS.md`,
`docs/research/reference-codebase-audit.md`, `docs/research/feature-matrix.md`,
`docs/research/wordpress-core-audit.md`, `docs/research/stack-comparison.md`,
`docs/research/opencode-tooling.md`, `docs/architecture/system-overview.md`,
`docs/architecture/content-model.md`,
`docs/architecture/gutenberg-and-rendering.md`,
`docs/architecture/plugins-and-themes.md`, `docs/adr/0001-baseline-stack.md`,
`docs/roadmap/roadmap.md`, `docs/roadmap/mvp-definition.md`,
`docs/testing/strategy.md`, `docs/security/threat-model.md`, this log.

### Not done / limitations

- No product feature code, apps, packages, migrations, themes or plugins.
- No reference repository was modified or run.
- No browser editor test; only dependency resolution and a production build.
- No real-corpus parser test; the synthetic nested fixture passed.
- No Node 24 run; the spike used Node 22.23.1.
- No Docker; native PostgreSQL is the verified local assumption.
- No reference test suite was executed (read-only).
- OpenCode config was not rewritten; the deprecated `plugin` key is still merged
  with `plugins` and should be cleaned up in a maintenance window.
- GitHub MCP remains broken; gh_grep/context7 are the working alternatives.

### Verification of Phase 0

- **Independent verifier:** read-only review returned **PASS WITH ISSUES (minor
  only, no blockers)**. All 19 required files present and non-trivial; coverage,
  cross-document versions, no-product-code, no-secrets and link checks passed.
- **Documentation link check:** passed on 2026-10-24 — 19 Markdown files, 46
  relative links, **0 missing files, 0 broken anchors**.
- **Consistency check:** baseline versions/decisions cross-referenced in README,
  ADR, stack comparison, roadmap and TASKS; no contradiction found. The deliberate
  free-model dissent on Drizzle/React Router is recorded rather than hidden.
- **Code check:** `find` shows only Markdown files plus `.git`; no
  `package.json`, `tsconfig`, source, migration, theme or plugin code.
- **Secret check:** regex scan for private keys, tokens, passwords and credential
  values returned no matches. (`auth.json`/`service.json` were never copied.)
- **Reference integrity:** reference directories were read-only; no files were
  modified. The existing `.codegraph` directory in `qrolichealth-main` predates
  this audit and was not created by it.
- **Known limitations:** local Node/pnpm/PostgreSQL versions differ from the
  pinned baseline (Node 22.23.1 vs 24.22.1; pnpm 11.13.1 vs 11.28.8; PostgreSQL
  18.3 vs 18.6). Phase 1 must install/pin Node 24 and re-run checks. The GitHub
  MCP is broken in the current OpenCode config but is not a Phase 0 deliverable.
- **Minor issue fixed:** the earlier "link check to be run" note in this log was
  replaced with the actual result above.

### Next step

Owner review. If approved, start **Phase 1 — repository foundation** only:
workspace, Node/pnpm/Postgres checks, Prisma baseline, health endpoints, app
skeletons, tests/CI, clean-clone setup. Then stop for testing. The first
user-facing product feature is Phase 2 authentication.

**Phase 0: planning only; product feature code not started.**

### D-038 — Status tabs and shareable URL state for content lists (2026-10-28)

**Summary:** ContentList now renders All/Drafts/Published/Trashed status tabs with
real server-computed counts (four `perPage=1` list requests honoring the current
type + search term), and synchronizes search/status/page with the URL via
`useLocation()`. Invalid parameters sanitize to defaults; Back/Forward and refresh
reproduce the same view.

**Changed files:** apps/admin/src/ContentList.tsx, apps/admin/src/ContentList.test.tsx,
apps/admin/src/App.test.tsx, TASKS.md.

**Validation commands/results:**
- `pnpm --filter @mernpress/admin typecheck` — passed.
- `pnpm --filter @mernpress/admin test` — 60/60 passed.
- (full suite and remaining validation to be run by owner per slice protocol.)

**Manual test steps:**
1. Open /posts and /pages; verify four status tabs with counts.
2. Click a tab; URL updates with `?status=...`, list filters, page resets to 1.
3. Search; URL updates with `?search=...`; refresh reproduces view.
4. Use browser Back/Forward; view and URL stay in sync.
5. Open a URL with invalid params (e.g. `?status=NOPE&page=abc`); defaults apply.

**Known limitations:** `pnpm test:e2e` not run in this environment (production owns
port 4000); spec discovery checked via `npx playwright test --list`.

### D-038 completion + CI failure fixes (2026-10-28)

**CI run analysed:** 40648146991 (browser smoke tests). Three failures:

1. `auth.spec.ts` "browser token storage is empty": localStorage contained
   `mernpress:sidebar-collapsed` (admin sidebar collapse preference). Root cause
   was `AdminShell` persisting UI state in localStorage, tripping the no-token-
   storage assertion. Fix: keep sidebar collapse state in React component state
   only (no localStorage read/write). Preference no longer survives a full
   reload, but no browser storage is used. (apps/admin/src/AdminShell.tsx)
2. `content.spec.ts` "New post" heading: strict-mode violation because the
   top bar rendered `<h1 className="top-bar-title">` AND PageHeader rendered
   `<h1>` in main content. Fix: top-bar title is now a `<span>` (CSS class
   retained), leaving exactly one h1 per view (the PageHeader heading).
   (apps/admin/src/AdminShell.tsx)
3. `terms.spec.ts` "Categories & Tags" heading: same duplicate-h1 cause as #2.
   Resolved by the same top-bar change.

**Validation commands/results:**
- `pnpm lint` — passed (no output).
- `pnpm format:check` — passed (all files formatted).
- `pnpm typecheck` — passed (7 tasks).
- `pnpm test` — passed: API 216/216 (25 files), admin 60/60 (11 files),
  web 1/1 (1 file).
- `pnpm build` — passed (admin bundle built).
- `pnpm audit --audit-level=high` — no known vulnerabilities.
- `git diff --check` — no whitespace errors.
- Secret scan of diff — no secret values present (presence/absence only).
- `npx playwright test --list` — 14 tests in 4 files discovered.
- `pnpm test:e2e` — NOT RUN (blocked: production owns :4000; per owner gate).

**Manual test steps:**
1. Start dev servers; sign in; confirm no localStorage/sessionStorage keys.
2. Open New post and Terms; confirm exactly one h1 per view (page heading).
3. Exercise content list tabs/search/pagination/Back-Forward as in D-038.

**Known limitations:** sidebar collapse preference not persisted across reloads.
No Phase 5 or further work started.

## 2026-11-03 — WordPress 7.1 admin parity pass

The owner rejected the earlier approximation and asked for a page-by-page match
against real WordPress. Ground truth: WordPress 7.1.4 at `/tmp/opencode/wp-site`
(PHP 8.4, MariaDB) plus the mirrored core CSS in `/tmp/opencode/wp68`. Every
page was measured with Playwright and rebuilt against the measured values.

**Screens rebuilt:** admin bar/sidebar/Screen Options tabs; Dashboard welcome
panel, Site Health, At a Glance and postboxes; Posts/Pages lists (title, tabs,
search, toolbar, fixed columns, sort indicators, WP row actions and View/
Preview, quick edit, bulk edit); Media grid and list view plus the Attachment
details modal; Users (sortable Username/Email, role tabs, WP table); Terms
(sortable Name/Description/Slug/Count, WP add form); Settings General/Writing/
Reading (form-table geometry, WP field order, 40px submits); Profile (nine
colour schemes, section typography, bio width); Tools (Available Tools cards,
Export and Site Health screens); Updates; the block editor (admin-bar shell,
64px header, 45.6px title, WP action order, sidebar order, inline slug, empty
canvas appender); and the login screen.

**API/UI additions:** users list sort (`sort=username|email&order=`), terms list
sort (`sort=name|description|slug|count`), and the WordPress media modal.

**Validation:** `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test`
(537: API 337, admin 122, block-system 65, web 13), `pnpm build`, and all 23
Playwright E2E tests, run per spec after the suite exceeded the 30-minute
command timeout. Typecheck/lint/build green on the deployed commit.

**Releases:** `20261103T140623Z-97e9053` (first parity pass) and
`20261103T225305Z-5b5a655` (media modal, Writing/Reading settings, editor
appender), both symlinked at `/opt/mernpress/current` and verified 200 on `/`,
`/admin/` and `/api/health`.

**Known limitations:** Comments, Appearance, Plugins and update-checking remain
out of MVP scope (no fake screens). Writing Settings exposes only options the
backend supports (default category/author); post formats, posting by email and
update services are not implemented. Media has no server-side image editor, so
the WordPress "Edit Image" action is omitted. The admin menu uses MERNPress SVG
icons rather than the WordPress Dashicons font.

### 2026-11-03 — Add User, Quick Edit and dashboard parity

- Add User is now a WordPress screen at `/users?action=add`: h1 "Add User",
  description, Username/Email (required), First/Last Name, Website, password
  generator with show/hide and strength meter, narrow role select and an
  "Add User" submit. `POST /api/users` now accepts `website`.
- Quick Edit uses the WordPress inline row (legend, left/right columns,
  Update/Cancel); Bulk Edit restyled; Users role tabs only list roles that
  have members (WordPress behaviour).
- Terms table headers carry WordPress column classes; 7px form-table offset,
  20px menu icons, 52px users rows, 90px Quick Draft content and a 40px Save
  Draft button.
- Docs: release `20261103T231210Z-61be777`.

### 2026-11-03 — Screen Options, WordPress icons and media navigation

- Screen Options now mirrors wp-admin on every list screen: Columns checkboxes,
  Pagination (per-page Apply) and Compact/Extended view mode for posts/pages.
  Column preferences persist per screen and apply live; Screen Options is also
  available on Media.
- Sidebar uses `@wordpress/icons` (with a WordPress-style gauge for Dashboard).
- Dashboard Site Health, Quick Draft and At a Glance heights/insets now match
  wp-admin (134/314/155px widgets, 76/97px insides).
- Attachment details modal gained previous/next navigation and WordPress
  header buttons.

### 2026-11-03 — Dashboard Screen Options and WordPress pagination

- Dashboard Screen Options now offers WordPress Boxes (Welcome, Site Health,
  At a Glance, Activity, Quick Draft) and Layout 1-4; both persist per browser
  and apply live, including a 1-4 column postbox grid.
- All list screens use a shared WordPress pagination component: « ‹ [page] of N
  › » with a current-page input, total pages and displaying-num.

### 2026-11-03 — WordPress contextual Help

- Help is now wp-admin's tabbed contextual help: Overview / Screen Content /
  Available Actions / Bulk Actions tabs, a content panel and a "For more
  information" sidebar with per-screen documentation links for posts/pages,
  media, users, terms, settings, profile, dashboard, tools and updates.

### 2026-11-03 — Global type, profile shortcuts and default post format

- Body text now matches wp-admin exactly: #3c434a, 13px/1.4 (18.2px) with the
  WordPress font stack; headings use #1d2327.
- Profile Personal Options gains a Keyboard Shortcuts preference that gates the
  Ctrl/Cmd+K command palette.
- Writing Settings gains Default Post Format (stored in options) and the editor
  shows that format for new posts.
- wp-login submit button is 40px tall.

## 2026-11-04 — WordPress parity audit and public-site rebuild

Owner feedback: the design and functionality still did not match WordPress, page
by page. Ground truth remained WordPress 7.1.4 at `/tmp/opencode/wp-site` plus
the mirrored core CSS in `/tmp/opencode/wp68`.

**Critical production fix:** the Next.js standalone bundle did not contain
`.next/static` or `public`, so every CSS/font/image request 404ed and production
served unstyled HTML. `apps/web/scripts/copy-standalone.mjs` now copies both as
part of `postbuild`; the live site's CSS, Manrope font, icons and images return
200. This was the single largest visual mismatch.

**Public site (Twenty Twenty-Five):**
- Manrope 22px/300 body, 645px content column, 71px header, 48px Blog and post
  titles, 18px excerpts, 14px dates, long-month `F j, Y` dates.
- Blog and posts pages use the TT5 query loop; single posts use the TT5 template
  (title, 3/2 featured image, Written by/in meta, 22px content, tags, previous/
  next navigation, More posts); pages use the page template.
- Search (`/search`), category and tag archives, the TT5 404 (two-column image
  + copy + search form) and the RSS feed (`/feed`) are implemented.
- Header/footer navigation lists published pages; footer matches the TT5
  structure and 426px height (theme name + credit bottom row).
- Public API supports search and category/tag filters; the public DTO includes
  the author; `/api/public/site` exposes the title/tagline/visibility/feed
  settings.

**Admin:**
- Login, dashboard, posts/pages lists, editor, media grid/list/modal, users,
  terms, Settings General/Writing/Reading, Profile, Tools, Updates and Help/
  Screen Options were compared against wp-admin at 1440px.
- Editor top bar, sidebar and canvas now use the measured WordPress geometry;
  media uses the Attachment details modal; Settings uses form-table geometry;
  Profile has First/Last/Nickname/Display Name, the WordPress colour schemes
  (Fresh default), Keyboard Shortcuts and Toolbar preferences; a public admin
  bar honours the Toolbar preference.
- Sidebar and admin-bar New menu use the WordPress Dashicons font (attributed,
  GPL-2.0-or-later) instead of the Gutenberg icon set.
- Settings Reading gained search-engine visibility and feed options; the public
  site honours them in robots, sitemap and the feed.

**Migrations:** `20261104010000_add_user_name_parts` adds `first_name`,
`last_name`, `nickname` to `users` (additive, applied to dev, test and prod).

**Validation:** format, lint, typecheck, 540 unit/integration tests
(API 340, admin 122, block-system 65, web 13), 23 Playwright E2E tests, and the
production build. Releases: `20261104T001136Z-f850de3`, `...-b805952`,
`...-13ba317`, `...-cd3e9c0`, `...-96e85d9`, `...-ab6c0e2`, `...-3fb42f5`,
`...-8f7c0a1`, `...-bd7eb77`. Production `/`, `/admin/`, `/api/health`, `/feed`
and `/robots.txt` return 200.

**Deliberate MVP exclusions (not faked):** Comments, Appearance, Plugins,
update-checking, post-by-email/update-services, feeds' per-post editor UI,
Discussion/Media/Permalinks/Privacy settings, Tools import/personal-data/editors,
profile language/syntax-highlighting options. These are documented rather than
shown as empty screens.

### 2026-11-04 — Final parity batch (Dashicons, media scrolling, tools, updates)

- Sidebar, admin-bar New menu, collapse control and admin-bar search now use the
  WordPress Dashicons font; postbox order/collapse controls use its arrow
  glyphs and stay visible like wp-admin.
- Media Library grid uses WordPress infinite scrolling; the Profile gains the
  "Disable infinite scrolling in the Media Library grid view" preference.
  Grid tiles reveal the attachment filename on hover/focus.
- Tools gained a transactional Categories and Tags Converter
  (`POST /api/admin/terms/convert`) with a Tools landing card and confirmation.
- Updates now follows the update-core layout (Updates → MERNPress → version
  table → latest-version message).
- General Settings restores the Site Icon row under Tagline, adds the
  translation glyph to Site Language, uses UTC+0 and the measured WordPress
  select widths.
- Profile adds Toolbar and First/Last/Nickname/Display Name; login matches the
  wp-login geometry and #3858e9 action colour; public footer is 427px with the
  theme/credit bottom row and `F j, Y` dates.
- All 541 unit/integration tests (API 341, admin 122, block-system 65, web 13),
  23 E2E tests, lint, typecheck and build pass.

### 2026-11-04 — WordPress 7.1.4 side-by-side parity pass

- Restored a live WordPress 7.1.4 reference (PHP + MariaDB, Twenty Twenty-Five)
  and compared computed styles, markup and geometry page by page instead of
  relying on remembered metrics.
- Public: the search block now uses TT5's pill input/button (61px high,
  `3.125rem` radius, 18px gap), so search and 404 match WordPress exactly
  (404 title 751/form 905/footer 1035 at 1440px). The TT5 query loop now renders
  featured images, the byline uses the theme's black 14px text, tags use the
  bordered pill style, and "More posts" is wide on search/single. Added
  archive descriptions, empty-archive output and WordPress-style
  previous/numbers/next pagination. `/api/public/terms/:taxonomy/:slug` returns
  archive metadata so empty categories no longer 404.
- Admin: restored the reference user's Fresh scheme (`#1d2327` chrome,
  `#2271b1` links/menu, `#007cba` buttons), separated link and button accents,
  and matched list-table rhythm/column widths, transparent toolbar buttons,
  Media Library toolbar/grid metrics, dashboard widget order, editor chrome
  (64px white header, hidden admin menu, `Save` label, WP sidebar order,
  outlined Move to Trash, View Post link), Users labels (`Add User`/`Add New`),
  Profile color swatches/widths, inline username help, the display-name select,
  date-format presets/custom inputs and Tools card width.
- Dashboard activity dates use WordPress's `M jS`/`Today` format; the editor
  shows the word count/read time and a relative "Last edited" line; blog
  excerpts fall back to the rendered content when no excerpt is stored; and the
  public admin bar keeps the Fresh scheme colours.
- The 404 illustration is now the actual Twenty Twenty-Five 404 image
  (`apps/web/public/404-tree.webp`, GPL-2.0-or-later, licence note beside it)
  instead of a vector approximation.
- Validation: 544 unit/integration tests (API 344, admin 122, block-system 65,
  web 13), 23 Playwright E2E tests and six production builds pass.

**Deployment:** release `20261104T071236Z-ab1f4e5` (production symlink
`/opt/mernpress/current`). Production smoke checks: `/`, `/admin/`,
`/api/health`, `/feed`, `/search?q=test` and the 404 route return the expected
statuses; the 404 title/form/footer land at 750/905/1035 and the search block is
61px high with a 498px input and 129px pill button (the live WordPress 7.1.4
reference measures 751/905/1035 and 498/129). Anonymous public pages log zero
console errors after the session probe moved to `/api/public/session`.

Final follow-up release `20261104T072305Z-bdbd3b5` adds the TT5 404 photo,
disabled clean Save state, WordPress activity dates, editor word count/relative
last-edited line and the content-derived blog excerpt. Production `/`,
`/admin/`, `/api/health`, `/feed`, `/search?q=test` return 200, the 404 route
returns 404 with the same 750/905/1035 geometry, and anonymous pages log zero
console errors. A final spacing release `20261104T072643Z-649658d` aligns the
Profile (Personal Options at 102px) and Tools (first card at 105px) content
tops; all production routes remain 200.

### 2026-11-04 — Remaining screens and mobile admin parity

- Audited the screens not covered by the first side-by-side pass against the
  live WordPress 7.1.4 reference.
- Reading/Writing: confirmed the 7.1.4 labels match, added the feeds
  documentation link and restored WordPress's post-format order
  (Standard, Aside, Chat, Gallery, Link, Image, Quote, Status, Video, Audio).
- Add User: removed the profile-only "Usernames cannot be changed" helper,
  added the required Repeat Password row and client-side match validation.
- Updates: rebuilt as the WordPress 7.1 text layout (intro, current version,
  MERNPress, Plugins, Themes) without pretending automatic update checks run.
- Media: list rows use `human_time_diff`-style dates ("24 hours ago") and the
  `— (no author)` label; Screen Options is now available on Media with its
  column/pagination options.
- Mobile admin (≤782px): 46px toolbar, 10px gutters, in-flow Screen
  Options/Help row, 190px drawer, one primary table column, a per-row details
  chevron for Posts/Pages, stacked settings/profile forms, full-width search
  with the button below, and a single-row editor toolbar with the document
  pills and secondary actions hidden.
- Public author archives: `?author=` filtering, `/author/[username]` archive
  and a real byline link, matching WordPress's author page.
- Validation: 545 unit/integration tests (API 345, admin 122, block-system 65,
  web 13), 23 Playwright E2E tests and six builds pass.

**Deployment:** release `20261104T075000Z-811ba05` (production symlink
`/opt/mernpress/current`). Production `/`, `/admin/`, `/api/health`,
`/search?q=test` return 200, `/nope` returns 404, `/author/admin` returns 200
with the `test.com` post, and `?author=admin` returns the same published post.
The built admin stylesheet contains the 46px mobile toolbar and row-detail
toggles. 545 unit/integration tests, 23 E2E tests and six builds pass.

### 2026-11-04 — Expanded scope, slice 1: Comments

- Owner approved expanding beyond the original MVP boundary to every WordPress
  screen (ADR 0009). Comments are the first delivered slice.
- Added the `comments` table and `CommentStatus` enum migration
  (`20261104090209_add_comments`) plus a follow-up index migration
  (`20261104090233_restore_featured_media_index`) that preserves the existing
  featured-media index.
- New comment service and API: public approved-comment list and submission
  (plain text, validated name/email/URL/content, basic flood and parent checks,
  approved by default), admin list/counts/recent/counts-by-post, status
  moderation, editing, permanent delete and bulk moderation.
- Admin: Comments menu with pending bubble, status tabs, search, columns,
  Screen Options, Help, row actions, bulk actions, edit modal, Dashboard Recent
  Comments widget, admin-bar comment count and Posts list comment bubbles.
- Public: approved comment list with threaded replies, comment form with name,
  email, website and comment fields, reply/cancel-reply flow and inline
  moderation/error notices. The Next config now rewrites `/api/*` to the API
  for local same-origin submissions.
- Capabilities: `comments.read` (administrator/editor/author/contributor) and
  `comments.moderate` (administrator/editor).
- Validation: 551 unit/integration tests (API 350, admin 123, block-system 65,
  web 13) and six builds pass; the public form and admin screen were exercised
  end to end in the browser.

**Deployment:** release `20261104T092522Z-584e2e9` (production symlink
`/opt/mernpress/current`), including migrations `20261104090209_add_comments`
and `20261104090233_restore_featured_media_index`. Production `/`, `/admin/`,
`/api/health` return 200; a public comment was created through the production
API (201), listed (200) and removed. The public single-post page renders the
empty comment list and form, with the footer at 427px and no horizontal
overflow. A follow-up mobile-table patch was released as
`20261104T092742Z-c26f870`; a recursive reply rendering fix followed as
`20261104T092931Z-fc94543`. `/`, `/admin/` and `/api/health` remain 200.

### 2026-11-04 — Expanded scope, slice 2: WordPress-only settings

- New option groups with WordPress defaults and validators: `discussion`,
  `media`, `permalinks`, `privacy` (ADR 0010). API `group` enum, admin
  `OptionGroup` type, Settings submenu and page titles all derive from them.
- Discussion options now drive real behaviour in the comment service:
  `default_comment_status=closed` rejects submissions with 403 "Comments are
  closed.", `close_comments_for_old_posts`/`_days_old` closes old posts,
  `comment_registration` requires a session, `comment_moderation` and
  `moderation_keys` hold comments for moderation, `disallowed_keys` and
  `comment_max_links` mark spam/pending, `comment_previously_approved`
  publishes only returning commenters, `comment_order` orders the public list,
  and `show_avatars` hides the public initials avatars. Verified in the browser:
  with moderation and "previously approved" off a first-time comment is
  `APPROVED`; with comments closed the API returns 403.
- Media sizes are applied to new uploads as extra WebP derivatives keyed
  `WxH` (verified: a 2000×1200 PNG produced `150x150`, `300x300`, `1024x1024`
  plus the existing `300`, `600`, `1200`, and the `150x150` file serves 200
  `image/webp`).
- Permalinks: `permalink_base` changes real URLs. With `blog`, list/archive
  pages, the single post, feed and sitemap all use `/blog/<slug>`,
  `/blog/<slug>` returns 200, `/posts/<slug>` returns 404, and the catch-all
  `/[base]/[postSlug]` route serves the post. Restored to `posts` afterwards.
- Privacy: `wp_page_for_privacy_policy` selects a published page and persists.
  This exposed a real bug — the option UUID validator only accepted UUID
  versions 1–5 and rejected this project's UUIDv7 ids (also breaking Site Icon
  and Default Author saves); it now accepts any RFC 9562 version.
- General gains "WordPress Address (URL)"; Writing gains "Post via email"
  (mail server, port, login, password, default category) and "Update Services".
  Both sections state plainly that no inbound mail or XML-RPC ping transport
  exists in this build. Add User gains the WordPress "Send User Notification"
  row, disabled with the same explanation.
- Admin Settings sidebar now lists Discussion, Media, Permalinks and Privacy;
  a generic `OptionGroupForm` renders them with WordPress form-table layout,
  inline help and save feedback.
- Validation: 555 unit/integration tests (API 354, admin 123, block-system 65,
  web 13), 23 Playwright E2E tests and six builds pass.

**Deployment:** release `20261104T100143Z-c2d5505` (production symlink
`/opt/mernpress/current`). `/`, `/admin/`, `/api/health`, `/api/public/site`,
`/feed` return 200 and `/nope` returns 404. The public settings payload now
includes `"permalinkBase":"posts"` and `"showAvatars":true`, so URL building and
the avatar preference are live without further migration (the new groups are
option rows written on first save). The production API build contains the
extended `group` enum and the admin bundle contains the Discussion, Media,
Permalink and Privacy screens.

### 2026-11-04 — Expanded scope, slice 3: Appearance → Themes

- Added a theme registry (`packages/cms-core/src/themes/registry.ts`) describing
  the installed MERNPress theme, a theme service (list/activate/auto-update
  preference stored as `appearance` options) and administrator-only routes
  `GET /api/admin/themes`, `POST /api/admin/themes/:id/activate`,
  `POST /api/admin/themes/auto-updates`.
- Admin Appearance menu entry and Themes screen matched to WordPress 7.1
  measurements: title count bubble, "Add Theme" button, "Search installed
  themes", 379×304 cards with a 283px screenshot and 51px dark name bar, active
  card showing "Active: MERNPress" + Customize, hover/Theme Details actions and
  the dashed Add Theme card.
- Theme Details overlay: 46px toolbar with close, 615px preview, Active Theme
  badge, 32px/100 theme name with version, author line, auto-update link,
  description, tags, features and footer actions.
- Add Themes screen keeps the WordPress header/count/search but states plainly
  that WordPress.org browsing, ZIP upload and runtime install are not enabled;
  `Upload Theme` is disabled rather than faked.
- Customize screen: "Customizing: MERNPress" header, Site Identity (title,
  tagline) writing the real general options with Save & Publish and a public
  site preview iframe. Verified saving updates the option and the preview
  reloads.
- The theme screenshot is a real capture of the public site
  (`apps/admin/public/theme-screenshot.png`).
- Validation: 561 unit/integration tests (API 358, admin 125, block-system 65,
  web 13), 23 Playwright E2E tests and six builds pass.

**Deployment:** release `20261104T101845Z-68b51eb` (production symlink
`/opt/mernpress/current`). `/`, `/admin/`, `/api/health` return 200,
`/admin/themes`, `/admin/themes/new` and `/admin/themes/customize` serve the SPA
(200), `/admin/theme-screenshot.png` returns the 1200×900 PNG, and
`/api/admin/themes` returns 401 for anonymous callers as designed. The
production admin bundle contains the Themes, Add Themes and Customize screens.

A follow-up patch (`20261104T102228Z-d2f4ae8`) aligns the Theme Details dialog
with the WordPress geometry (inset 182/84 → 1237×799) and dims the page behind
it with a backdrop that does not tint the dialog's own text. `/`, `/admin/`,
`/admin/themes`, `/admin/theme-screenshot.png` and `/api/health` remain 200.

### 2026-11-04 — Expanded scope, slice 4: Plugins

- Added a bundled plugin registry (`packages/cms-core/src/plugins/registry.ts`)
  with one genuinely functional plugin, Hello MERNPress (the Hello Dolly
  analogue), plus a plugin service (list/activate/deactivate/auto-update
  preference/toolbar message) storing `active_plugins` and
  `plugin_auto_updates` as `plugins` options. The service accepts an injected
  registry for tests.
- New administrator-only routes: `GET /api/admin/plugins`,
  `GET /api/admin/plugins/toolbar`, `POST /api/admin/plugins/:id/activate`,
  `POST /api/admin/plugins/:id/deactivate`,
  `POST /api/admin/plugins/auto-updates`.
- Installed Plugins screen matched to WordPress 7.1: title count bubble, Add
  Plugin button, All/Active/Inactive filters with counts, "Search installed
  plugins" label + 199px input, bulk actions wired to activate/deactivate the
  selection, list table with Plugin (name + row actions), Description (version
  and author line) and Automatic Updates, active rows with #f0f6fc background
  and a 4px #72aee6 edge, repeating footer, and Screen Options column/per-page
  support.
- Add Plugins screen keeps the WordPress header/count/search and lists installed
  plugins, with a plain statement that WordPress.org browsing, ZIP upload and
  runtime install are unavailable; `Upload Plugin` is disabled.
- Verified in the browser: activating Hello MERNPress shows its lyric in the
  admin toolbar ("Blocks in the editor, posts on the wire"), deactivating
  removes it; filter counts and row actions update; auto-update preference
  persists.
- Validation: 568 unit/integration tests (API 363, admin 127, block-system 65,
  web 13), 23 Playwright E2E tests and six builds pass.

**Deployment:** release `20261104T103630Z-1665c63` (production symlink
`/opt/mernpress/current`). `/`, `/admin/`, `/admin/plugins`,
`/admin/plugins/new` and `/api/health` return 200; `/api/admin/plugins` returns
401 for anonymous callers. The production admin bundle contains the Installed
Plugins/Add Plugins screens and the Hello MERNPress plugin; the API bundle's
`cms-core` includes the `hello-mernpress` registry entry.

### 2026-11-04 — Expanded scope, slice 5: update checking

- Added an update service (`packages/cms-core/src/updates/service.ts`) that
  reports the core version, every installed theme and plugin, the stored
  auto-update preferences and the last check time. It fetches a configured
  `UPDATE_MANIFEST_URL` with a 5-second timeout, compares numeric versions and
  records `updates_last_checked` + `updates_last_result`; transport failures
  surface as `502 UPDATE_CHECK_FAILED`. Without a manifest it re-reads installed
  versions and reports that no update source is configured.
- New administrator-only routes `GET /api/admin/updates` and
  `POST /api/admin/updates/check`. The GET path is capability-checked too — a
  test caught that an editor could read it before the fix.
- Dashboard → Updates rebuilt to the WordPress 7.1 layout: current version,
  "Last checked on … Check again.", auto-update summary, then MERNPress,
  Plugins and Themes sections listing installed versions, available updates
  and per-item auto-update state. Claims of "latest"/"all up to date" appear
  only after a completed manifest check; the persisted result survives reloads.
- `UPDATE_MANIFEST_URL` documented in `.env.example` with the manifest shape.
- Verified in the browser against a local manifest (`core 0.2.0`, plugin
  `1.0.1`): "Check again." reported "2 updates available.", showed the core
  update and the plugin update, recorded the timestamp, and kept the result
  after navigating away and back.
- Validation: 576 unit/integration tests (API 371, admin 130, block-system 65,
  web 13), 23 Playwright E2E tests and six builds pass.

**Deployment:** release `20261104T105023Z-209a0fa` (production symlink
`/opt/mernpress/current`). `/`, `/admin/`, `/admin/updates` and `/api/health`
return 200; `/api/admin/updates` returns 401 for anonymous callers. The
production admin bundle contains the new Updates screen ("Check again", the
no-service notice) and the API build contains the update routes, the
`UPDATE_MANIFEST_URL` env key and the `updates_last_result` persistence key.
Production has no manifest configured, so it reports installed versions and
says so rather than claiming everything is current; set `UPDATE_MANIFEST_URL`
and restart the API to enable remote checks.

### 2026-11-04 — Expanded scope, slice 6: Dashboard Events and News

- Added a dashboard feed service reading the public WordPress.org events API and
  news feed (overridable with `EVENTS_API_URL` / `NEWS_FEED_URL`), with 6-second
  timeouts, RSS item parsing (title/link/pubDate, entity decoding, non-http links
  rejected), per-location events caching and a location-independent news cache
  (10-minute TTL, failures never cached).
- New authenticated route `GET /api/admin/dashboard/feeds?location=…`; visible
  to every signed-in admin user, like the WordPress widget.
- Dashboard gained the "MERNPress Events and News" widget under Quick Draft:
  intro + location control, two event rows with calendar icons and right-aligned
  dates, the "Help organize the next one!" line, five news links and the
  Meetups | WordCamps | News footer. Added to Screen Options as "Events and
  News".
- Fixed a regression found while comparing: the Appearance count-bubble class
  `.page-count` also matched the "Published page" list item in At a Glance,
  painting it as a dark pill. The bubble styles are now scoped to
  `.page-header-title .page-count`.
- Verified in the browser: with no location the widget shows "Choose a location
  to see nearby events."; searching "Manchester" loaded two real events
  (WordCamp Manchester 2026, BeeWUG) and five news items.
- Validation: 586 unit/integration tests (API 375, admin 133, block-system 65,
  web 13), 23 Playwright E2E tests and six builds pass.

**Deployment:** release `20261104T110631Z-d66b07b` (production symlink
`/opt/mernpress/current`). `/`, `/admin/` and `/api/health` return 200;
`/api/admin/dashboard/feeds` returns 401 for anonymous callers. The production
admin bundle contains the Events and News widget and the API build contains the
feed route and the WordPress.org events/news defaults. The first deploy attempt
hit ENOSPC; releases were pruned to the current and previous build (14 removed,
22 GB free) and the build re-ran successfully.

### 2026-11-04 — Expanded scope, slice 7: Appearance → Editor and Fonts

- Added the Site Editor screen (`/site-editor`): 300px dark "Design" sidebar with
  Identity, Styles, Pages, Navigation, Patterns and a Templates list, plus a
  white canvas that previews the real public site in an iframe. Template entries
  resolve real content through the public API (latest post, latest page, that
  post's first category and tag) with the front page, blog index, search and 404
  routes; empty templates show an explicit hint instead of a broken frame.
  Identity opens Appearance → Customize, Pages opens the Pages list, and
  Styles/Navigation/Patterns report that templates and styles ship in code.
- Added the Fonts screen (`/fonts`) matching WordPress 7.1's font library:
  Library / Upload / Install Fonts tabs, THEME section, expandable family rows
  with "N of N active", a sample at each weight and the bottom Update bar. Data
  comes from the active theme's new `fonts` registry field, so Themes and Fonts
  share one source. Upload and provider install state their limitation.
- Appearance submenu now lists Themes, Editor and Fonts, matching WordPress 7.1.
- Extracted the public-site preview helper used by Customize and the Site Editor.
- Validation: 590 unit/integration tests (API 375, admin 137, block-system 65,
  web 13), 23 Playwright E2E tests and six builds pass.

**Deployment:** release `20261104T112145Z-595382f` (production symlink
`/opt/mernpress/current`). `/`, `/admin/`, `/admin/site-editor`,
`/admin/fonts` and `/api/health` return 200; `/api/admin/themes` returns 401 for
anonymous callers. The production admin bundle contains the Site Editor
("Customize the appearance of your website using the block editor") and the
Fonts library ("Install Fonts", the sample sentence), and the deployed cms-core
registry carries the `fonts` field with Manrope.

### 2026-11-04 — Expanded scope, slice 8: Tools import and personal data

- Added the `data_requests` table and migration
  `20261104112457_add_data_requests` (EXPORT/ERASE, PENDING/COMPLETED, matched
  user, requester, timestamps).
- Tools → Import lists the importers WordPress shows. The WordPress importer is
  real: the browser reads a WXR file, `POST /api/admin/import/wordpress` parses
  posts/pages, categories/tags, statuses and publish dates, re-slugs collisions
  and returns imported/skipped/failed counts with per-item errors. Attachments,
  comments and users are skipped and the screen says so. Other importers are
  marked unavailable; the Categories and Tags Converter links to the existing
  tool.
- Tools → Export Personal Data and Erase Personal Data match WordPress 7.1:
  "Add Data Export/Erasure Request" form, All (n) filter line and the
  Requester | Status | Requested | Next steps table with the empty state.
  Exports download real JSON (profile, posts, comments); erasure anonymises
  profile fields and comment authorship in one transaction and keeps the
  account, recording the action taken.
- New administrator-only routes for imports and data requests; duplicates
  return 409, unknown accounts 404, invalid emails 400.
- Verified in the browser: importing a WXR file reported "Import finished: 1
  post, 0 pages, 2 terms"; creating an export request listed it as Pending and
  downloaded `personal-data-<id>.json` with the profile; creating and completing
  an erasure request anonymised the user row (email/display name cleared) and
  recorded the note.
- Validation: 600 unit/integration tests (API 381, admin 141, block-system 65,
  web 13), 23 Playwright E2E tests and six builds pass.

**Deployment:** release `20261104T113807Z-315dc72` (production symlink
`/opt/mernpress/current`), with migration `20261104112457_add_data_requests`
applied. `/`, `/admin/`, `/admin/tools/import`,
`/admin/tools/export-personal-data`, `/admin/tools/erase-personal-data` and
`/api/health` return 200; `/api/admin/data-requests?type=EXPORT` returns 401 for
anonymous callers. The production bundles contain the import and personal-data
screens ("Run Importer", "Add Data Export Request", "Download personal data"),
the API routes exist, and the `data_requests` table is present in production.

### 2026-11-04 — Expanded scope, slice 9: Settings → Connectors

- Added a connector service storing provider API keys (OpenAI, Google,
  Anthropic) in the existing `options` table, encrypted with AES-256-GCM under a
  scrypt-derived key from `AUTH_HASH_PEPPER`. The API returns only a mask and the
  connect time; keys are never echoed back.
- Administrator-only routes `GET /api/admin/connectors`,
  `PUT /api/admin/connectors/:id` and `DELETE /api/admin/connectors/:id`.
- Settings → Connectors matches WordPress 7.1: centered 630px column, title and
  description, lavender AI banner, provider rows with icon/name/description and
  a masked Connected state or key field + Connect, plus the footer note about
  additional connectors. The Settings submenu order is now General, Connectors,
  Writing, Reading, Discussion, Media, Permalinks, Privacy.
- The screen and Help state that no AI feature is bundled yet, so stored keys
  are unused until one ships; "Install the AI plugin" is replaced with "Browse
  plugins" because there is no marketplace.
- Verified in the browser: saving a key showed "Connected · key sk-…3456" and
  Disconnect; the stored option value was AES-GCM ciphertext with the plaintext
  absent (`like '%plaintext-canary%'` = false); disconnecting removed the row.
- Validation: 605 unit/integration tests (API 384, admin 143, block-system 65,
  web 13), 23 Playwright E2E tests and six builds pass.

**Deployment:** release `20261104T115056Z-6ea66fa` (production symlink
`/opt/mernpress/current`). `/`, `/admin/`, `/admin/settings/connectors` and
`/api/health` return 200; `/api/admin/connectors` returns 401 for anonymous
callers. The production admin bundle contains the Connectors screen copy
("All of your API keys and credentials are stored here", "Browse plugins",
"Connected · key"), the API build contains the connector routes, and the cms-core
build uses `aes-256-gcm` for credential encryption.


### 2026-11-04 — Menu parity fixes and verification matrix

- Compared the live WordPress 7.1.4 admin menu with MERNPress by reading both
  menus in the browser. Fixed the remaining label/structure deltas: Posts and
  Pages submenus now say "Add Post"/"Add Page", and Comments is a single link
  without an "All Comments" submenu.
- Added `docs/verification/wordpress-parity-matrix.md` with the captured menu
  diff, a screen-by-screen status table (developed/verified, production
  route-only, excluded) and the outstanding owner decisions.
- Deployed as `20261104T115855Z-168e829`; `/`, `/admin/` and `/api/health`
  return 200 and the production bundle contains the "Add Post" label.
- Remaining deltas are decisions, not code: the Theme/Plugin File Editors and
  production admin visual sign-off (needs an owner login).

### 2026-11-04 — Production admin verification pass

- Created a temporary production administrator (`verify-temp-admin`), captured
  every admin screen at 1440px plus the mobile posts list at 375px, and reviewed
  them against the WordPress 7.1.4 reference: dashboard, posts, pages, media,
  comments, themes, plugins, users, add user, profile, tools, import, export
  personal data, general settings, discussion settings, connectors, updates, site
  editor, fonts and login. The account, its sessions, a test connector key and
  the test upload were removed afterwards.
- Live write paths confirmed in production: Updates "Check again" recorded the
  check, a connector key saved as `Connected · key sk-…7890` and disconnected,
  and a media upload returned 201 with the file served 200.
- **Production bug found and fixed:** `mernpress-api.service` uses
  `ProtectSystem=strict`, so `/opt/mernpress/media` was read-only to the process
  despite correct ownership; Site Health reported `Media storage: Critical` and
  uploads failed. Added `ReadWritePaths=/opt/mernpress/media` (unit backup kept),
  reloaded systemd, restarted the API; Site Health now reports Good.
- Recorded the owner's decision to keep the Theme/Plugin File Editors excluded
  (AGENTS.md) and updated the parity matrix and production hosting notes.
- No application code changed in this pass; the previously verified release
  `20261104T115855Z-168e829` stays live.

### 2026-11-04 — Remaining screenshot review and public template verification

- Reviewed the production screenshots that the first pass had captured but not
  inspected: pages, comments, plugins, users, add user, profile, tools, import,
  export personal data, settings (general and discussion). Fixed the deltas
  found:
  - Empty posts/pages/comments lists now render a WordPress-style
    "No … found." row inside the list table instead of a standalone card.
  - `PageHeader` keeps the description on its own line under the title (the
    count bubble stays beside the h1), matching Add User and other WordPress
    screens.
  - Add User drops the extra Repeat Password field and Cancel button; it now
    matches WordPress 7.1.4's single password field with the strength meter.
- Captured and measured the production public templates anonymously after the
  admin pass: home, blog, single, page, search, 404, author and feed. Geometry
  matches the reference (48px titles at x=398, 645×61 search block with 498/129
  input/button, 404 at 745/750 with the 645×826 photo and 1035 footer, no
  horizontal overflow); feed returns RSS XML. Category/tag archives 404 because
  production has no published terms.
- Deployed as `20261104T130133Z-ca743bc`; `/`, `/admin/`, `/admin/comments` and
  `/api/health` return 200, public routes behave as above, and the production
  bundle contains the new "No comments found." row.
- Validation: 605 unit/integration tests (API 384, admin 143, block-system 65,
  web 13), 23 Playwright E2E tests and six builds pass.

### 2026-11-04 — Profile personal options and application passwords

- `users.syntax_highlighting` (default true) and `users.locale` (default
  `en_US`) added with migration `20261104130529_add_profile_prefs_app_passwords`.
  `GET/PUT /api/profile` round-trip both; `GET /api/profile/locales` lists the
  installed language(s) and unknown locales are rejected with `INVALID_LOCALE`.
- Profile → Personal Options now shows Syntax Highlighting (WordPress's
  "Disable syntax highlighting when editing code" checkbox) before the colour
  scheme and Language after Infinite Scrolling, matching WordPress 7.1.4.
- New `application_passwords` table and service: create returns a one-time
  24-character grouped password, list never returns hashes, revoke is
  per-credential and scoped to the owner. Password hashes use the same
  Argon2id service as logins.
- The admin guard accepts `Authorization: Basic` application passwords when no
  session cookie is present, skips CSRF for that path (no ambient cookie) and
  exempts cookie-less Basic requests from the Origin check so API clients work.
  HTTPS is enforced in production (`APP_PASSWORD_HTTPS_REQUIRED`).
- Profile → Application Passwords matches WordPress: description, "Add New
  Application Password" with a name field, the one-time password panel, and a
  Name / Last Used / Last IP / Revoke table with the WordPress empty state.
- Verified in the browser and with curl: saving the profile persisted
  `syntaxHighlighting: false`; creating "Parity verification" showed
  `Yiew SAAU r2lA Mktn RV9O 6RZF` once and the row appeared; a Basic-auth `GET
  /api/profile` returned 200, the last-used stamp/IP were recorded, a
  Basic-auth POST created a credential with no CSRF token, a wrong password
  returned 401, and revoking the credential made the next Basic request 401.
  Credentials were revoked and syntax highlighting restored afterwards.
- Remaining from the WordPress profile surface: the mail transport for comment
  notifications and Add User's "Send User Notification"; it stays explicitly
  unavailable until that slice.

**Deployment:** release `20261104T132118Z-f74800e` (production symlink
`/opt/mernpress/current`), with migration
`20261104130529_add_profile_prefs_app_passwords` applied (both `users` columns
and the `application_passwords` table verified in production). `/`, `/admin/`
and `/api/health` return 200. A temporary administrator verified the screen in
production and was deleted afterwards:
- Profile showed Syntax Highlighting, Language (`en_US`) and the Application
  Passwords section; saving persisted `syntaxHighlighting: false`.
- Creating "Production Basic auth" returned the one-time password; a Basic-auth
  `GET /api/profile` over HTTPS returned 200 and recorded last-used
  `43.204.100.114`; a Basic-auth POST created a second credential with no CSRF
  token (201).
- The same Basic credential over plain HTTP loopback was rejected with
  `401 APP_PASSWORD_HTTPS_REQUIRED`.
- Both credentials were revoked (rows disappeared) and syntax highlighting was
  restored. Production is back to one user and zero application passwords.

### 2026-11-04 — Outbound mail and notifications

- Added a mail service (`packages/cms-core/src/mail`) with an SMTP transport
  (Nodemailer 10.3.1, pinned; MIT-0, no transitive dependencies) and an
  in-memory sink for tests/development. Transport is selected from
  `MAIL_TRANSPORT`, `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_USER`/
  `SMTP_PASS` and `MAIL_FROM`; the memory transport is rejected in production and
  `MAIL_FROM` is required with SMTP. Connection/greeting/socket timeouts keep a
  dead relay from hanging requests.
- Comment notifications now work: a held comment e-mails the administration
  address when `moderation_notify` is on; an approved comment e-mails the post
  author (or the administration address when the author has no email) when
  `comments_notify` is on. Delivery failures are logged and never fail the
  comment. The Discussion help text now says notifications need outbound mail
  configured rather than claiming it is unavailable.
- Add User → Send User Notification is live: `GET /api/admin/mail/status`
  drives the checkbox (checked by default, disabled with an explanation when no
  transport exists). Sending requires the account email and a configured
  transport (400 `MAIL_NOT_CONFIGURED`), and the message contains the username,
  display name and login URL — never the password. WordPress sends a reset link;
  MERNPress has no reset flow yet, so the message asks the administrator to
  reset instead (documented in ADR 0019).
- Verified end to end against a local SMTP sink:
  - a held comment produced `Please moderate: "Welcome to MERNPress"` to
    admin@example.com with the comment and moderation link;
  - an approved comment produced `New comment on "Welcome to MERNPress"` with the
    post URL and manage-comments link;
  - creating `mail-invitee-dev` through Add User produced `Your new account` to
    invitee-dev@example.com with the username and `/admin/` login URL, and the
    checkbox was enabled and checked.
- Validation: 620 unit/integration tests (API 394, admin 148, block-system 65,
  web 13), 23 Playwright E2E tests and six builds pass.

### 2026-11-04 — Plugin row actions: View details and Delete

- Installed Plugins rows now offer **View details** for every plugin and
  **Delete** for inactive plugins, matching WordPress. Details come from the
  plugin registry (name, version, author, description, short details line,
  automatic-update state); no marketplace figures are invented.
- Delete asks for confirmation, then records the plugin id in
  `deleted_plugins`, removes its activation and filters it from the list,
  counts and toolbar. Deleting an active plugin returns 409 ("Deactivate the
  plugin before deleting it.") and a repeat delete returns 404. Because plugins
  are bundled in releases, the confirmation states that the code remains in the
  release; the action removes the plugin from the site.
- The footer select-all checkbox now mirrors the header instead of staying
  disabled.
- Validation: 623 unit/integration tests (API 395, admin 150, block-system 65,
  web 13), 23 Playwright E2E tests and six builds pass.

**Deployment (mail):** release `20261104T133820Z-03f9f10` (later superseded by
the plugin-row release). Production has no `SMTP_HOST` configured, so
`/api/admin/mail/status` correctly reports `configured: false`, the Add User
checkbox is disabled with "Email delivery is not configured on this server…",
and no notification is attempted. The mail code is deployed; delivering mail
requires setting `SMTP_HOST`/`MAIL_FROM` (and credentials) and restarting the
API, per `docs/operations/production-hosting.md`.

**Deployment (plugin actions):** release `20261104T134818Z-a85ce70` (current).
Production verification with a temporary administrator: the Installed Plugins
row showed `Deactivate | View details` while active; View details opened the
registry description and version; after Deactivate the row showed
`Activate | Delete | View details`; Delete asked for confirmation and removed
the plugin (`All (0)`, "No plugins installed."). The plugin was then restored by
clearing the tombstone and reactivated, leaving production in its original
state (`All (1)`, `Active (1)`). The temporary administrator was deleted.

### 2026-11-04 — Lost-password request and reset tokens

- Added `password_resets` (migration `20261104135232_add_password_resets`):
  SHA-256 token hash, optional HMAC of the requester IP, 24-hour expiry and
  `used_at`. A new request replaces any unused token for the user.
- `POST /api/auth/lost-password` accepts a username or email, requires pre-auth
  CSRF and always answers `{sent:true}` for valid-shaped input so accounts
  cannot be enumerated. Requests are limited to 3 per identifier and 10 per IP
  per 15 minutes; unknown/inactive accounts send nothing. Without a mail
  transport it returns `503 MAIL_NOT_CONFIGURED` instead of pretending.
- `POST /api/auth/reset-password` validates the policy, then atomically updates
  the password hash, deletes every session for the user, marks the token used,
  removes other unused tokens and audits the change. Replays/expired keys return
  `400 INVALID_RESET_KEY`; failed attempts are IP rate-limited.
- Login form: "Lost your password?" now opens a real Lost Password form
  ("Get New Password") with a generic check-your-email confirmation. The reset
  link renders a Reset Password screen (`?action=rp&key&login`) with New
  password/Confirm and Save Password, available signed in or out.
- Add User → Send User Notification now issues a reset token and includes
  WordPress's "To set your password, visit the following address" link.
  `ADMIN_URL` optionally points e-mail links at a split-origin admin in
  development; production uses the site origin.
- Verified in the browser against the local SMTP sink: requested a reset for
  admin@example.com, received `[MERNPress] Password Reset` with a working link,
  set a new password, logged in with it, replayed the link and got "This
  password reset link is invalid or has expired.", then reset the password back.
  Creating `invitee-reset-dev` with Send User Notification produced a welcome
  mail containing a working reset link; the invitee set a password and logged in.
- Validation: 631 unit/integration tests (API 400, admin 153, block-system 65,
  web 13), 23 Playwright E2E tests and six builds pass.

**Deployment:** release `20261104T140553Z-5ca6cfd` (current), with migration
`20261104135232_add_password_resets` applied and the `password_resets` table
verified in production. `/`, `/admin/` and `/api/health` return 200.
- Production has no SMTP configured, so the Login → Lost Password form reports
  "Password reset email cannot be sent because email delivery is not
  configured." rather than pretending to send.
- The Reset Password screen is live at `/admin/?action=rp&key=…&login=…`; a
  fake token returns "This password reset link is invalid or has expired."
- With a token inserted for a temporary administrator, the production reset
  screen set a new password, the temporary administrator logged in with it, and
  the account was deleted afterwards. Production is back to one user with no
  reset rows or rate-limit rows.
- Real lost-password e-mails still require `SMTP_HOST`/`MAIL_FROM` credentials
  supplied by the owner; the Add User welcome e-mail will then include the reset
  link automatically.

### 2026-11-05 — Tools → Export as WordPress WXR

- Replaced the bespoke JSON export with a WXR 1.2 generator
  (`packages/cms-core/src/export/service.ts`). It writes the WordPress channel,
  authors, posts/pages (block content, excerpts, statuses, dates, slugs),
  categories/tags, comments and media attachment items with
  `wp:attachment_url`, plus the featured-image `_thumbnail_id` meta.
- New administrator-only `GET /api/admin/export?content=all|posts|pages|media`
  returning `application/rss+xml` as a `.xml` attachment; trashed posts are
  excluded and each scope matches WordPress's choice.
- Tools → Export now matches WordPress: the explanatory copy, a "Choose what to
  export" fieldset with All content/Posts/Pages/Media and the "Download Export
  File" button. The old JSON path and its client-side pagination are gone.
- Tests parse the export with the existing WXR importer (titles, types,
  statuses, dates and terms) and cover scope selection plus anonymous/editor
  rejection.
- Verified in the browser: the Export screen showed the four scopes with All
  content selected and downloaded `mernpress-export-2026-11-05.xml`; the file
  parses as well-formed XML with `wp:wxr_version 1.2`, 4 items (post, page, two
  attachments), 4 category elements and 3 comments.
- Validation: 635 unit/integration tests (API 403, admin 154, block-system 65,
  web 13), 23 Playwright E2E tests and six builds pass.

**Deployment (WXR export):** release `20261105T053559Z-74639ae`, later
superseded by the page-link fix release. Production verification with a
temporary administrator: Tools → Export showed "Choose what to export" and the
four scopes with All content selected; the download produced
`mernpress-export-2026-11-05.xml`, which parsed as well-formed WXR 1.2 with the
production page and post. Two issues were found and fixed:
- Production's `site_url`/`wordpress_url` options were **unset**, so export
  links fell back to `http://localhost` (and e-mail links would have done the
  same once mail is enabled). Both options are now
  `https://mernpress.duckdns.org`, and the re-downloaded export contains that
  base URL.
- Page items were linked as `/<permalink base>/<slug>`; pages now link as
  `/<slug>`, while posts keep `/<base>/<slug>`.

**Deployment (export link fix):** release `20261105T054350Z-e71c0bd`
(current). After setting the production site URL and rebuilding, the downloaded
WXR contains `<wp:base_site_url>https://mernpress.duckdns.org</wp:base_site_url>`,
the page item links to `https://mernpress.duckdns.org/test` and the post to
`https://mernpress.duckdns.org/posts/testcom`. The temporary administrator was
deleted; production is back to the owner's single account.

### 2026-11-05 — Users → Send password reset

- Added `POST /api/users/:id/send-password-reset` (administrator + CSRF): it
  issues the existing single-use 24-hour reset token and e-mails the Password
  Reset message. The target must exist, be active and have an email, and mail
  must be configured; otherwise the API returns 404 USER_NOT_FOUND, 400
  INVALID_EMAIL/INVALID_STATUS/MAIL_NOT_CONFIGURED or 502 MAIL_SEND_FAILED. The
  send is audited as `user.password_reset.sent` with the administrator as actor.
- Users list rows now show WordPress's "Send password reset" action for other
  accounts (not your own), and the bulk actions in both toolbars offer the same
  action with a sent/failed summary.
- Verified in the browser against the local SMTP sink: the action sent a
  Password Reset email to the target, the link set a new password, and the user
  logged in with it; the bulk action sent links to both selected users.
- Validation: 641 unit/integration tests (API 407, admin 156, block-system 65,
  web 13), 23 Playwright E2E tests and six builds pass.

**Deployment (Send password reset):** release `20261105T055851Z-5e20518`
(current). Production verification with a temporary administrator and a
temporary target user matched the live WordPress 7.1.4 screen exactly:
row actions `Edit | Delete | View | Send password reset`, and both bulk
toolbars offer `Send password reset`. Clicking the action in production
reported "Email delivery is not configured." because no SMTP credentials are
set; no token was created and nothing was claimed as sent. Both temporary
accounts and their sessions were deleted afterwards.

### 2026-11-05 — Media → Edit Image

- Added the media editor: rotate left/right, flip horizontal/vertical,
  aspect-ratio crop with a drag selection and corner handles, scale, undo/redo,
  Save/Cancel and Restore original image. The canvas composes edits locally;
  nothing is saved until Save.
- New `POST /api/admin/media/:id/edit` (multipart, administrator/session + CSRF)
  re-validates and re-encodes the image exactly like an upload, writes it through
  a temporary file, keeps the first pre-edit file at `<storagePath>.original`,
  regenerates all derivatives and records `edited_at`/`original_path`.
  `POST /api/admin/media/:id/restore` puts the original back, regenerates
  derivatives and clears the backup. Deleting the media row removes the backup.
- `MediaItem` gains `editedAt` and `hasOriginal`; drawer/grid image URLs carry a
  cache-busting version so edited bytes appear immediately.
- Migration `20261105060220_add_media_edit`.
- Verified in the browser on a 1200×800 upload: rotate right → 800×1200, undo →
  1200×800, redo → 800×1200, flip (no dimension change), default crop → 640×960,
  scale to 320×480, Save → drawer showed 320×480 and “Image edited.” with the
  cache-busted preview; Restore original → 1200×800, `editedAt: null`,
  `hasOriginal: false`, “Original image restored.”
- Validation: 645 unit/integration tests (API 410, admin 157, block-system 65,
  web 13), 23 Playwright E2E tests and six builds pass.

**Deployment (Media Edit Image):** release `20261105T061704Z-8cfb8c3`
(current), with migration `20261105060220_add_media_edit` applied
(`media_items.edited_at`/`original_path` verified). Production verification with
a temporary administrator: uploaded a 1000×600 PNG, opened Edit Image (1000×600),
rotated right (600×1000), saved → drawer showed 600×1000 with "Image edited.";
re-opened, restored the original → 1000×600 with `editedAt: null`,
`hasOriginal: false` and "Original image restored."; deleted the media row (204)
and the upload/backup files were removed. The temporary administrator was
deleted and production is back to one user and zero media rows.

### 2026-11-05 — Real plugin package removal

- Plugins are now on-disk packages (`plugins/hello-mernpress/plugin.json`) in a
  writable store (`PLUGIN_STORAGE_DIR`), seeded once from the release `plugins/`
  directory and guarded by a `.initialized` marker. After seeding the store is
  authoritative; `PLUGIN_STORAGE_DIR` is required in production.
- Delete now recursively removes the package directory (after deactivation) and
  the plugin vanishes from lists, counts, update checks and the toolbar; a
  restart or deploy does not re-seed it. The `deleted_plugins` tombstone is gone.
- List/activation/toolbar/update checks read the store, so the manifest is the
  single source of truth for name/version/author/description and toolbar lyrics.
- UI copy now states that Delete permanently removes the package and cannot be
  undone.
- Tests seed into an isolated temp store, delete the package, verify its
  directory is gone and that a fresh service over the same store stays empty.
- Validation: 646 unit/integration tests (API 411, admin 157, block-system 65,
  web 13), 23 Playwright E2E tests and six builds pass.

**Deployment (plugin package store):** release `20261105T063338Z-c34aa03`
(current). Production now uses `/opt/mernpress/plugins` (env
`PLUGIN_STORAGE_DIR`, seed `/opt/mernpress/current/plugins`, unit
`ReadWritePaths` added; backups of both files kept). After deploy the store
seeded `hello-mernpress` from the release on first Plugins request. Verification
with a temporary administrator:
- The plugin list showed `All (1) | Active (1)`, proving the manifest-backed
  store and toolbar data still load.
- Deactivate → row actions `Activate | Delete | View details`; Delete removed the
  directory (`/opt/mernpress/plugins/hello-mernpress` gone, `.initialized`
  remained) and the list showed "No plugins installed."
- Restarting `mernpress-api` did **not** re-seed the deleted package.
- The package was copied back from the release and re-activated, restoring the
  original production state (`All (1) | Active (1)`); the temporary
  administrator was deleted.

### 2026-11-05 — Page audit: Add Plugins, Add Themes, Import boundaries

- Compared the three screens with live WordPress 7.1.4 and fixed the deltas:
  - Add Plugins/Add Themes no longer show an installed-count bubble beside the
    page title (WordPress keeps counts in the filter bar, not the title).
  - Add Plugins now has WordPress's description paragraph and a `.wp-filter` bar
    with the Featured/Popular/Recommended/Favorites labels (explicitly disabled)
    plus a "Search Plugins" input; the honest directory-unavailable notice sits
    below it.
  - Add Themes uses the WordPress filter bar: installed-theme count, the
    Popular/Latest/Block Themes/Favorites labels (disabled) and "Search Themes".
  - "Details & Preview" on a theme card is a plain link again (it had inherited a
    button box).
  - Import now lists importers in WordPress's order (Blogger, Categories and Tags
    Converter, LiveJournal, Movable Type and TypePad, RSS, Tumblr, WordPress)
    and ends with the "If the importer you need is not listed…" paragraph,
    adapted to the no-marketplace boundary.
- The unavailable boundaries are explicitly documented in the parity matrix:
  WordPress.org plugin/theme directories, ZIP upload, third-party importers, the
  Theme/Plugin File Editors (owner decision) and production SMTP (owner
  credentials). The screens state these instead of faking controls.
- Validation: 646 unit/integration tests (API 411, admin 157, block-system 65,
  web 13), 23 Playwright E2E tests and six builds pass.

**Deployment (Add Plugins/Add Themes/Import audit):** release
`20261105T064426Z-49a1371` (current). Production verification with a temporary
administrator confirmed all three screens: Add Plugins has no title count, the
WordPress description, disabled Featured/Popular/Recommended/Favorites labels
and "Search Plugins"; Add Themes has the installed-theme count in the filter bar,
disabled Popular/Latest/Block Themes/Favorites and "Search Themes"; Import lists
Blogger, Categories and Tags Converter, LiveJournal, Movable Type and TypePad,
RSS, Tumblr, WordPress in WordPress order with the marketplace boundary note.
The temporary administrator was deleted afterwards.

### 2026-11-05 — Page audit: Posts/Pages list and editor chrome

- Compared the Posts list and block editor with live WordPress 7.1.4.
  - Row actions already matched: Edit | Quick Edit | Trash | View.
  - Bulk actions now match WordPress: "Bulk edit" and "Move to Trash" only (the
    extra Publish/Move to Draft entries were removed).
  - Editor sidebar order now matches WordPress: Status, Publish (date), Slug,
    Author, Template, Discussion, Format, Move to trash, then Categories/Tags;
    MERNPress-only Preview token/SEO/Revisions follow the WordPress panels.
  - The date row is labelled "Publish" and the trash button "Move to trash" like
    WordPress.
  - The inline status "Edit" button (not in WordPress) was removed. Switch to
    draft and Move to trash now live in the top-bar Options menu, matching
    WordPress's action location.
- The E2E editor flow was updated to use the Options menu for Switch to draft and
  Move to trash.
- Known deeper deltas recorded for the next pass: Quick Edit exposes
  title/slug/status only (WordPress also exposes date, author, categories, tags,
  discussion and sticky), and the Options menu does not yet include Code editor,
  Keyboard shortcuts, Welcome guide, Copy all content, Preferences or Plugins.
- Validation: 646 unit/integration tests (API 411, admin 157, block-system 65,
  web 13), 23 Playwright E2E tests and six builds pass.

**Deployment (Posts/Pages chrome audit):** release `20261105T070320Z-11e0ac8`
(current). Production verification with a temporary administrator: the Posts list
showed bulk actions `Bulk edit | Move to Trash` and row actions
`Edit | Quick Edit | Trash | View`; the editor sidebar order was
`Status | Publish | Slug | Author | Template | Discussion | Format`, and the
top-bar Options menu contained `Settings | Switch to draft | Move to trash`.
Screenshots: `prod12-posts-list.png`, `prod12-editor.png`,
`prod12-editor-options.png`. The temporary administrator was deleted.

### 2026-11-05 — Quick Edit and Bulk Edit field parity

- Quick Edit now exposes the WordPress fields that this content model supports:
  Title, Slug, Date (`datetime-local`), Author (administrators), Categories and
  Tags checkboxes (posts), Allow Comments, Status and "Make this post sticky"
  (posts). Saving chains PATCH (date/author/comments/sticky) → term assignment →
  status transition, so version numbers stay consistent.
- Bulk Edit now matches WordPress: Categories and Tags (added to each selected
  post), Author (— No Change —), Comments (— No Change — / Allow / Do not
  allow), Sticky (— No Change — / Sticky / Not sticky, posts) and Status
  (— No Change — / Draft / Published). Per-item failures are collected and
  reported instead of aborting the batch.
- Backend: `posts.comment_status` (open/closed) and `posts.sticky` with
  migration `20261105070833_add_post_sticky_comment_status`; `updatePost`
  accepts `publishedAt`, `authorId` (edit-any only), `commentStatus` and
  `sticky`; public list pins sticky posts first; per-post closed status rejects
  new comments with 403.
- Password, Private, Pings and Format remain unmodelled; they stay documented
  gaps rather than fake controls.
- Verified in the browser: Quick Edit showed Title/Slug/Date/Author/Categories/
  Tags/Status/Allow Comments/Make sticky; saving set sticky=true,
  commentStatus=closed and added the News category; Bulk Edit showed
  Categories/Tags/Author/Comments/Sticky/Status with the WordPress "— No Change —"
  defaults.
- Validation: 653 unit/integration tests (API 416, admin 159, block-system 65,
  web 13), 23 Playwright E2E tests and six builds pass.

**Deployment (Quick/Bulk Edit):** release `20261105T072214Z-8d446a1`
(current), migration `20261105070833_add_post_sticky_comment_status` applied
(`posts.comment_status`, `posts.sticky` verified). Production verification with
a temporary administrator: Quick Edit showed Title, Slug, Date, Author,
Categories, Tags, Status plus Allow Comments and Make sticky; Bulk Edit showed
Categories, Tags, Author, Comments, Sticky and Status with "— No Change —"
defaults. Screenshots: `prod13-quick-edit.png`, `prod13-bulk-edit.png`. The
temporary administrator was deleted.

### 2026-11-05 — AVIF derivatives and responsive content images

- `writeDerivatives` now writes AVIF alongside WebP for every fixed (300/600/
  1200) and configured derivative. AVIF quality is 52; the canonical file stays
  WebP so the edit/restore pipeline is unchanged. DTO keys are `<width>` (WebP)
  and `<width>:avif` (AVIF).
- `resolvePublicFile` chooses the served `Content-Type` from the file extension,
  so AVIF derivatives are served as `image/avif` and WebP as `image/webp`.
- New `apps/web/components/ResponsiveImage.tsx` renders `<picture>` with AVIF
  and WebP `srcset`/`sizes`, intrinsic width/height and lazy loading; the single
  post hero uses `loading="eager"` + `fetchPriority="high"`. PostList and
  PostView now use it.
- Tests: AVIF files decode as `heif` at the right widths, AVIF derivatives are
  served with `image/avif`, and the component emits both source sets plus a
  WebP fallback (and no AVIF keys in the WebP srcset).

**Deployment (AVIF):** release `20261105T073416Z-23f3003` (current). `/`,
`/admin/` and `/api/health` return 200 and the production build contains the
`image/avif` serving path. Public posts without an AVIF-capable image still emit
the WebP-only fallback, and newly uploaded images emit the AVIF source set.

### 2026-11-05 — SEO research and first-party technical SEO

- Added `docs/research/seo-2026.md`: CMS SEO baseline, structured-data types,
  AI search/`llms.txt` evidence (Google's 2026 guidance, The SEO Framework's
  position, plugin reviews), 2026 Core Web Vitals thresholds, and the WordPress
  gaps that become opportunities. Sources are cited.
- Public site now emits JSON-LD: a layout-level `Organization` + `WebSite`
  graph referenced by `@id`, `BlogPosting` for posts (headline, dates, author,
  publisher, section, keywords, ImageObject) and `WebPage` for pages,
  `BreadcrumbList` on posts/pages/blog/category/tag/author, `CollectionPage` +
  `ItemList` on the blog and taxonomy archives, and `ProfilePage` + `Person` on
  author archives. `<` is escaped to keep stored content from closing the tag.
- Added Twitter `summary_large_image` metadata to posts/pages and the layout;
  the sitemap now includes `image:image` entries for featured media.
- New `/llms.txt` route lists canonical published posts/pages, the RSS feed and
  the sitemap, states that it is not a permissions file, and publishes only a
  "not public" note when Settings → Reading disables the blog.
- Deliberately not built: FAQ rich results (retired May 2026), SearchAction
  sitelinks (retired 2024), `agents.json` (no standard) and SEO scores.
- Verified in the browser/curl: a post emits three JSON-LD blocks (site graph,
  BlogPosting with ImageObject, BreadcrumbList), `sitemap.xml` carries the
  image entry, and `/llms.txt` lists the post, page, feed and sitemap.
- Validation: 664 unit/integration tests (API 418, admin 159, web 22,
  block-system 65), 23 Playwright E2E tests and six builds pass.

### 2026-11-05 — Trusted local plugin runtime + Auto Excerpt plugin

- Packages may now ship `plugin.mjs` exporting `activate(api)`/`deactivate(api)`.
  The runtime API exposes typed hooks, plugin-scoped options, identity and a
  prefixed logger — no filesystem/HTTP/Prisma handles. Plugins remain trusted,
  unsandboxed server code (ADR 0027).
- Activation loads the module before marking the plugin active and returns
  `422 PLUGIN_ACTIVATION_FAILED` on error; deactivation and delete dispose every
  recorded hook; `startActive()` restores active modules at boot and drops
  failures without stopping the API; `onClose` unloads everything.
- New **Auto Excerpt** plugin (`plugins/auto-excerpt/`): filters
  `content.post.create`/`content.post.update`, derives a 160-character excerpt
  from the block body when the author left it empty, and never overwrites an
  authored excerpt. Developer documentation is in
  `docs/architecture/plugin-runtime.md`.
- New **SEO Fallbacks** plugin (`plugins/seo-fallback/`): fills a missing meta
  description from the excerpt or body, the social title from the SEO/post title
  and the social description from the meta description. Authored values always
  win; it performs no external request and no keyword scoring.
- Research added: `docs/research/plugin-theme-roadmap.md` maps WordPress user
  complaints (plugin bloat, redirects/404s, mail visibility, backups, safe client
  editing, performance, 2FA) to ranked MERNPress slices, and
  `docs/research/seo-2026.md` records the SEO evidence. README links the new
  docs; both plugins and the theme package have developer guides.
- Verified in the browser with the real store: Plugins listed Auto Excerpt
  (inactive) alongside Hello MERNPress; activating it made a body-only post come
  back with a generated excerpt; deactivating it made the next post return
  `excerpt: null`; after restarting the API the log showed
  `[plugin:auto-excerpt] auto excerpts enabled` and a new post was excerpted
  again.
- Validation: 665 unit/integration tests (API 419, admin 159, web 22,
  block-system 65), 23 Playwright E2E tests and six builds pass.

**Deployment (plugin runtime + Auto Excerpt):** release
`20261105T075442Z-92c4ee0` (current). The release ships
`plugins/auto-excerpt/` and the package was copied into the production store
`/opt/mernpress/plugins` (owner `mernpress`). Verification with a temporary
administrator: Plugins listed Auto Excerpt (inactive) next to the active Hello
MERNPress; activating Auto Excerpt and creating a body-only post returned a
generated 124-character excerpt; the plugin was then deactivated, leaving Hello
MERNPress as the only active plugin. The temporary post and administrator were
deleted; `/`, `/admin/` and `/api/health` return 200.

### 2026-11-05 — Theme packages and MERNPress Journal

- Themes are now trusted packages on disk (`themes/<id>/theme.json`) in a
  writable store (`THEME_STORAGE_DIR`), seeded once from the release `themes/`
  directory behind `.initialized` (ADR 0028). Manifests carry identity,
  tags/features, fonts, a closed `classic`/`journal` layout and validated design
  tokens.
- The public layout injects tokens as CSS custom properties and sets
  `data-theme`/`data-layout`; `getSiteSettings` is now `cache: 'no-store'`, so
  switching themes is immediately visible instead of waiting for a 60-second
  cache.
- Added **MERNPress Journal**: warm paper palette, centred serif masthead,
  700 px measure, boxed post rules and accent links. The default MERNPress theme
  is expressed as tokens (classic layout) so nothing changes when it is active.
- Appearance → Themes, the update checker and the public settings API read the
  store. A second screenshot (`theme-journal.svg`) ships in the admin.
- Verified in the browser: Themes listed 2 with MERNPress active; activating
  MERNPress Journal showed the new notice and the public page switched to
  `data-theme="journal"`, background `rgb(247,242,232)`, Georgia headings and a
  700 px column; switching back restored `data-theme="mernpress"`.
- Validation: 667 unit/integration tests (API 419, admin 159, web 24,
  block-system 65), 23 Playwright E2E tests and six builds pass.

**Deployment (theme packages + Journal):** release
`20261105T080921Z-7f470c5` (current). Added
`THEME_STORAGE_DIR=/opt/mernpress/themes`, `THEME_SEED_DIR=/opt/mernpress/current/themes`
and `ReadWritePaths=/opt/mernpress/themes` (env/unit backups kept); the store
seeded both packages on first request. Verification with a temporary
administrator: Appearance → Themes listed 2 themes; activating MERNPress Journal
showed the notice and the live site immediately rendered
`data-theme="journal"`, background `rgb(247,242,232)` and Georgia headings; the
only remaining Activate switched back to MERNPress (classic). The temporary
administrator was deleted; production is back to 1 user, active theme
`mernpress`, active plugin `hello-mernpress`.

**Deployment (SEO Fallbacks + roadmap):** release
`20261105T081752Z-b51e4fc` (current). `seo-fallback` was copied into the
production plugin store alongside `auto-excerpt` and `hello-mernpress`.
Verification with a temporary administrator: both plugins activated (200), a
body-only post returned the generated excerpt, the derived meta description, the
social title from the post title and the social description; both plugins were
then deactivated (Hello MERNPress remains the only active plugin). The test post
and temporary administrator were deleted; `/`, `/admin/` and `/api/health`
return 200.


### 2026-11-05 — Editor Options menu parity

- The block editor's Options menu now matches WordPress's entries: Settings,
  Code editor, Keyboard shortcuts, Welcome guide, Copy all content, Plugins,
  Switch to draft and Move to trash.
- Code editor opens a raw block-markup textarea wired to the same save path, so
  the server still validates and sanitizes before persisting; invalid markup is
  rejected. Keyboard shortcuts and Welcome guide are real dialogs describing the
  editor's actual controls. Copy all content copies the stored block markup.
  Plugins navigates to the plugin screen.
- Remaining difference: WordPress's Preferences (editor preference modal) is not
  modelled.
- Validation: 669 unit/integration tests (API 420, admin 160, web 24,
  block-system 65), 23 Playwright E2E tests and six builds pass.

**Deployment (editor Options):** release `20261105T082518Z-0620fc2`
(current). Production verification with a temporary administrator: the editor
Options menu contained Settings, Code editor, Keyboard shortcuts, Welcome guide,
Copy all content, Plugins, Switch to draft and Move to trash; Code editor opened
the raw-markup dialog. The temporary administrator was deleted; `/`, `/admin/`
and `/api/health` return 200.

### 2026-11-05 — Post privacy, passwords, formats and editor preferences

- Added `posts.is_private`, `posts.password_hash` (Argon2id) and `posts.format`
  with migration `20261105082816_add_post_password_private_format`.
- Private posts are excluded from public lists, detail, unlock, sitemap and feed.
  Password-protected posts return `passwordProtected: true` and an empty body;
  `POST /api/public/posts/:slug/unlock` verifies the password (403 on failure)
  and returns the rendered HTML; attempts are throttled at 10/10 minutes in a
  bounded in-memory limiter. The admin DTO never exposes the hash.
- The ten WordPress post formats are validated in the service/API, stored on the
  row, selectable in the editor and Bulk Edit, and rendered as a
  `format-<name>` class. Quick Edit now has Password (with Remove password) and
  Private; Bulk Edit has Format. Allow Pings remains deliberately unmodelled
  (XML-RPC/inbound verification, legacy security surface).
- Editor Options → Preferences is now real: density (comfortable/compact),
  preview target (new tab/same tab), welcome guide on load and word count
  visibility, persisted locally and applied immediately.
- Public password form added to the post template; the API withholds the body
  until verification.
- Validation: 676 unit/integration tests (API 424, admin 161, web 26,
  block-system 65), 23 Playwright E2E tests and six builds pass.

**Deployment (privacy/password/format + preferences):** release
`20261105T084717Z-dfc22d4` (current), migration
`20261105082816_add_post_password_private_format` applied (`password_hash`,
`is_private`, `format` verified). Production verification with a temporary
administrator:
- Password: setting one returned `passwordProtected: true`; the public page
  rendered the password form; a wrong password returned 403; the correct one
  returned 200 with the rendered body; the password was then removed.
- Private: setting a page private made its public URL return 404; it was
  reverted to public.
- Format: `quote` round-tripped through the API and was reset to `standard`.
- Post detail is now no-store, so privacy changes take effect immediately instead
  of waiting for a cache window.
The temporary administrator was deleted; production is back to 1 user, zero
password-protected and zero private posts.

### 2026-11-05 — Redirects and 404 manager

- Added `redirects` and `not_found_entries` with migration
  `20261105085025_add_redirects_not_found`. Sources are normalized (leading
  slash, collapsed duplicate slashes, no trailing slash), destinations must be a
  path or http(s) URL, and self/looping chains are rejected.
- Tools → Redirects lists redirects and aggregated 404s, adds/edits/deletes
  redirects and offers one-click Redirect/Dismiss for a 404. Admin routes require
  `manage_options`.
- The public site applies redirects in `apps/web/middleware.ts` using a
  10-second cached map and reports hits asynchronously. A root catch-all logs
  missing paths (path/count/timestamps only) and renders the standard 404 page.
  Public hit/404 writes are validated and limited to 120/min per client.
- Validation: 683 unit/integration tests (API 429, admin 163, web 26,
  block-system 65), 23 Playwright E2E tests and six builds pass.

**Deployment (redirects and 404s):** release `20261105T091408Z-4b62b44`
(current), migration `20261105085025_add_redirects_not_found` applied
(`redirects`, `not_found_entries` verified). Production verification with a
temporary administrator:
- Tools → Redirects accepted `/prod-legacy-test → /posts/testcom` (301); the
  live URL returned `HTTP/2 301` with `location: /posts/testcom`.
- A unique missing path returned 404 and appeared in the 404 log with the
  correct path and hit count (the shared not-found component logs after
  middleware forwards `x-mn-path`).
- The test redirect and 404 entry were deleted and the temporary administrator
  removed; production has 1 user, 0 redirects and 0 404 rows.

### 2026-11-05 — Transactional mail delivery log

- Added `mail_log_entries` (migration `20261105091716_add_mail_log`): recipient,
  subject, sent/failed, reason and timestamp only — no bodies, tokens,
  credentials, IPs or user agents. Retention keeps the newest 200 rows.
- `MailService.deliver` now records every attempted delivery, including
  `no-recipient` and `transport-failed`; a disabled transport or notification
  preference records nothing. Log-write failures are contained.
- Admin-only `GET/DELETE /api/admin/mail/log`; Settings → Discussion shows the
  transport status, sender, latest 100 deliveries and a confirmed Clear log
  action. The panel states when SMTP is not configured instead of inventing
  rows.
- Validation: 689 unit/integration tests (API 432, admin 166, web 26,
  block-system 65), 23 Playwright E2E tests and six builds pass.

**Deployment (mail delivery log):** release `20261105T092601Z-d4457a6`
(current), migration `20261105091716_add_mail_log` applied
(`mail_log_entries` verified). Production verification with a temporary
administrator: Settings → Discussion showed "Transport: Not configured", the
SMTP-unavailable explanation and "No mail has been sent yet."; the admin log
endpoint returned 200 with an empty list (anonymous access is 401). No
notification is attempted while SMTP is absent, so no rows are fabricated. The
temporary administrator was deleted; production has 1 user, 0 mail log rows and
0 redirects.

### 2026-11-05 — Automatic redirects on published slug change

- The content service now calls an internal `onSlugChanged` hook after a
  version-checked update when the row is published and the slug changed; drafts
  create nothing. The API callback builds the old/new public paths from the
  permalink setting and calls `RedirectService.createAutomatic`.
- Automatic redirects are 301s, retarget an existing entry for the old path,
  refuse loops, are logged on failure and remain editable/deletable in
  Tools → Redirects.
- Tests cover a published rename creating `/posts/old → /posts/new` and a draft
  rename creating nothing.
- Validation: 691 unit/integration tests (API 434, admin 166, web 26,
  block-system 65), 23 Playwright E2E tests and six builds pass.

**Deployment (automatic slug redirects):** release
`20261105T093612Z-ec16ca4` (current). Production verification with a temporary
administrator: created and published `Prod slug redirect check`, renamed its slug
to `prod-slug-redirect-renamed`; Tools → Redirects immediately contained
`/posts/prod-slug-redirect-check → /posts/prod-slug-redirect-renamed` (301), and
after the middleware cache window the old URL returned
`HTTP/2 301 location: /posts/prod-slug-redirect-renamed`. The test post and
redirect were deleted and the temporary administrator removed; production has
1 user, 0 redirects and 0 mail log rows.

### 2026-11-05 — Reading time and related posts

- Added `apps/web/lib/reading-time.ts` (rendered word count, 200 wpm, 1-minute
  floor) and used it in the single-post meta, related cards and the archive/list
  query loop.
- Added `RelatedPosts`: same primary category first (up to 3, current excluded),
  falling back to the newest posts (without the current post). The section is
  labelled "Related posts" or "More posts" accordingly and shows date + read
  time per card. An API failure degrades to the fallback.
- No schema or endpoint change; both themes share the template and tokens.
- Tests cover the word-count edge cases (tags, entities, 200/201/400/401 words)
  and the related/fallback rendering with the current post excluded.
- Validation: 696 unit/integration tests (API 434, admin 166, web 31,
  block-system 65), 23 Playwright E2E tests and six builds pass.

**Deployment (reading time + related posts):** releases
`20261105T094335Z-af6d466` and `20261105T095026Z-87efaed` (current).
Production post pages render the estimated read time. Verification with
temporary posts in development showed a same-category "Related posts" section
with date + read time and the current post excluded; the production routes
return 200 and a post card contains "min read". The final release corrects the
fallback label to "More posts" when no same-category matches exist. Temporary
posts and the temporary administrator were removed; production is back to 1
user, 0 redirects, 0 mail log rows.

### 2026-11-05 — Backup packages with retention

- Added `BackupService` and Tools → Backups: one `.tar.gz` containing a plain
  SQL dump (`--clean --if-exists --no-owner --no-privileges`), `media.tar.gz` and
  `MANIFEST.txt`. Database passwords go to `pg_dump` via `PGPASSWORD`, never argv
  or the archive; files are `0600`.
- `BACKUP_STORAGE_DIR` (production `/opt/mernpress/backups`) is required in
  production; `BACKUP_RETENTION` (default 5, max 50) prunes older archives.
- Administrator-only list/create/download/delete with strict filename validation,
  `no-store` downloads, a 409 while a backup is running and cleanup of partial
  archives/temp dirs on failure.
- Restore is intentionally CLI-only and documented step by step in
  `docs/operations/backup-restore.md`; the UI states that it never overwrites live
  data and that the archive is sensitive.
- Tests create a real archive against the test database, verify the gzip magic,
  inspect the tar for `database.sql`/`media.tar.gz`/`MANIFEST.txt`, exercise
  retention, deletion, traversal rejection and anonymous/editor denial.
- Validation: 701 unit/integration tests (API 437, admin 168, web 31,
  block-system 65), 23 Playwright E2E tests and six builds pass.

**Deployment (backups):** release `20261105T100210Z-6e6c352` (current).
Added `BACKUP_STORAGE_DIR=/opt/mernpress/backups`, `BACKUP_RETENTION=5` and
`ReadWritePaths=/opt/mernpress/backups` (env/unit backups kept); the directory is
`0700` owned by `mernpress`. Production verification with a temporary
administrator: Tools → Backups created `mernpress-backup-20261105T100410Z.tar.gz`
(16 KB), downloading it produced a gzip archive containing `database.sql`,
`media.tar.gz` and `MANIFEST.txt` (manifest named `mernpress_prod`); the SQL
contains `DROP TABLE IF EXISTS`/`CREATE TABLE` for users, posts, redirects and
mail log; the test archive was deleted afterwards. Production is back to 1 user
and zero stored backups.

### 2026-11-05 — Two-factor authentication (TOTP + recovery codes)

- Added `auth/totp.ts` (RFC 6238 SHA-1, 6 digits, 30 s, ±1 drift, local base32)
  and `TwoFactorService`: AES-256-GCM sealed TOTP secret derived from
  `AUTH_HASH_PEPPER`, eight single-use HMAC recovery codes, a 10-minute
  five-attempt hashed login challenge, and replay protection via the highest
  accepted counter.
- Password login now returns `{ twoFactorRequired, challengeToken, username }`
  with no cookies when 2FA is enabled; `POST /api/auth/two-factor` verifies a
  TOTP or recovery code and only then creates the session/CSRF cookies.
- Profile → Two-Factor Authentication: setup shows the secret, `otpauth://` URI
  and recovery codes once; confirm enables; disable requires password + code;
  recovery codes regenerate with the password. Users rows show **Reset 2FA** when
  enabled; the admin reset endpoint is audited.
- Migrations `20261105100529_add_two_factor_auth` and
  `20261105100707_add_two_factor_user_fields`.
- Tests cover RFC vector, drift/replay, enrollment, challenge success/failure,
  recovery-code single use, disable, admin reset, anonymous access and the login
  UI challenge.
- Validation: 714 unit/integration tests (API 446, admin 172, web 31,
  block-system 65), 23 Playwright E2E tests and six builds pass.

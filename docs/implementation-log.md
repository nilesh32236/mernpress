# Implementation log

## 2026-11-17 — Legal compliance package and improvement shortlist

**Status:** documentation-only slice; no product source changed.

The owner asked to review the existing WordPress-clone project, check legal
compliance and look for improvements. The project already contains a broad
implementation (Phases 0-8), so this slice closed the concrete open gaps rather
than starting a new feature phase.

### What changed

- Added `LICENSE`: GNU GPL v3, 29 June 2007, canonical text fetched from
  `https://www.gnu.org/licenses/gpl-3.0.txt` (35,149 bytes).
- Chose **GPL-3.0-or-later** (decision D-048) because the admin bundles
  `@wordpress/*` packages that are GPL-2.0-or-later; a compatible copyleft
  licence keeps distribution obligations coherent. The owner's question was
  auto-answered with "decide yourself" for this project.
- Added `THIRD_PARTY_NOTICES.md` from the evidence in
  `docs/research/reference-codebase-audit.md` §9.
- Added `docs/legal/compliance-review.md`: plain-language risk register and
  pre-distribution checklist.
- Added `docs/roadmap/improvements-2026-11.md`: ten ranked improvements.
- Updated `README.md` (licensing status + documentation links), `DECISIONS.md`
  (D-048) and the root `package.json` (`license` field) so the docs agree.

### Verification and limits

- No dependency licence scan: no installed packages and local Node 22 vs the
  pinned Node 24.22.1. The inventory is explicitly marked partial.
- No product build/test run in this slice (documentation only).
- No legal advice given; the compliance review records what the project's own
  evidence says and what a professional review would need to cover.

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

### Public archives and search using the downloaded WordPress 7.1.4 source (2026-11-17)

**Owner context:** the owner placed the current WordPress source at
`docs/wordpress` (verified `$wp_version = '7.1.4'` in `wp-includes/version.php`)
and asked for `app/` to be improved using it, then rebuilt.

**Grounding:** `docs/wordpress/wp-includes/class-wp.php` declares public query
vars including `s`, `category_name`, `tag`, `author`, `year` and `monthnum`. This
slice implements the three directly useful ones for the public site: search,
category archives and tag archives. It does not claim WordPress parity and does
not add comments, menus, themes or plugins (still out of scope).

**Changed files:**
- `apps/api/src/routes/content-schemas.ts` — `publicListQuerySchema` now
  accepts `search`, `category` and `tag` alongside `type`/pagination.
- `packages/cms-core/src/content/types.ts` — `PublicListQuery` gains the same
  three optional filters.
- `packages/cms-core/src/content/service.ts` — `listPublic` applies them inside
  the existing PUBLISHED + publishedAt gate (title/excerpt `contains` with
  `mode: 'insensitive'`; term filters match a category/tag term slug). Filters
  are combined with `AND` so category+tag can be used together.
- `apps/web/lib/api.ts` — `listPublished` takes a filters object; added
  `searchPosts`, `listByCategory`, `listByTag`. Existing callers unchanged.
- `apps/web/app/search/page.tsx`, `apps/web/app/category/[slug]/page.tsx`,
  `apps/web/app/tag/[slug]/page.tsx` — new server-rendered archive routes with
  WordPress-style titles, SEO metadata, empty/error states and pagination.
- `apps/web/components/ArchiveList.tsx` — shared list/pagination rendering.
- `apps/web/components/PostView.tsx` — category/tag chips are now links to
  their archives.
- `apps/web/app/layout.tsx` — small header with a site search form.
- `apps/web/test/archive.test.ts` — 4 new tests for search, category, tag and
  API-down behaviour.

**Validation commands/results:**
- `pnpm build` — passed (6/6 tasks; Next.js routes now include `/search`,
  `/category/[slug]`, `/tag/[slug]`).
- `pnpm --filter @mernpress/web test` — passed (4 files, 17 tests).
- `pnpm test` — passed (7/7 tasks; API 337 tests in 35 files, web 17 tests).
- API schema smoke check: `publicListQuerySchema.parse({type:'post',
  search:'hello', category:'news', tag:'wp', page:'2', perPage:'10'})` returned
  the expected coerced object.
- `pnpm exec eslint <changed files>` — no findings.
- `pnpm exec prettier --check <changed files>` — passed after formatting 3 files.

**Manual test steps:** with API + web running, open `/search?q=<term>`,
`/category/<slug>` and `/tag/<slug>`; confirm filtered results, working
pagination, and that clicking a category/tag chip on a post opens its archive.

**Known limitations:** term archives key on slug, not the numeric WordPress
`cat` id; `author`, date archives and RSS remain deferred. Search matches only
title and excerpt (not full body). No live browser click-through was done; the
verification was build + automated tests (including the DB-backed API suite).

**Next proposed slice (not started):** author and date archives, or an RSS feed
— pick one before starting.

### Legal, naming and hobby-project hardening (2026-11-17)

**Owner request:** check licensing and naming to avoid legal issues, state
clearly that MERNPress is a hobby project, and keep the WordPress reference
source out of the repository.

**Changed files:** `.gitignore`, `DECISIONS.md` (D-049), `README.md`,
`docs/legal/compliance-review.md`, `THIRD_PARTY_NOTICES.md`, `TASKS.md`.

**What changed:** one canonical name (MERNPress); an explicit hobby,
not-professional status with no security, certification or support claims; a
no-affiliation and trademark statement; `.gitignore` rules for `docs/wordpress/`
and local agent tooling artifacts; and a dated decision record. No application
code changed.

**Validation commands/results:** `git check-ignore -v` confirms the reference
source and tooling artifacts are now ignored; markdown links checked during
review. No build or tests were run because this slice is documentation-only.

**Known limitations:** this is a risk register, not legal advice. The dependency
licence scan and GPL distribution review in the compliance checklist remain
outstanding. The uncommitted archive/search work and the earlier licence package
were left untouched.

**Next proposed slice (not started):** review and accept (or revise) the pending
archive/search/category/tag work, then run the dependency licence scan.

### Archive/search slice review and verification (2026-11-17)

**Owner request:** continue to the next slice — review the pending
archive/search/category/tag work and verify it properly.

**What was reviewed:** the uncommitted public query filters
(`publicListQuerySchema`, `PublicListQuery`, `listPublic`) and the new web routes
(`/search`, `/category/[slug]`, `/tag/[slug]`, shared `ArchiveList`, term chips,
site search form) plus `apps/web/test/archive.test.ts`. The service adds the
filters with a fresh `where.AND` on top of the existing published/scheduled gate;
no clause is overwritten. XSS is not a concern: all dynamic text is rendered
through JSX/React escaping and the search input is capped at 200 characters by
the Zod schema.

**Changed files this slice:** `TASKS.md` (P7-03 refreshed, X-07 added),
`tests/e2e/placeholders.spec.ts` (two pre-existing portability fixes: use
`127.0.0.1` instead of `localhost` because the web dev server binds IPv4-only;
`.first()` on an `.or()` locator that matched both the always-present header
text and the empty-state text). No archive application code was changed — it was
reviewed and left intact for owner acceptance.

**Validation commands/results:**
- `pnpm lint` — pass; `pnpm format:check` — pass; `pnpm typecheck` — pass 9/9.
- `pnpm test` — pass 7/7 (API 337 tests / 35 files, admin, web 17, block-system 65).
- `pnpm --filter @mernpress/web test -- --run` — 4 files, 17 tests pass.
- `pnpm build` — pass 6/6; routes `/search`, `/category/[slug]`, `/tag/[slug]` emitted.
- `E2E_API_URL=http://127.0.0.1:4000 pnpm test:e2e` — 23/23 pass.
- Toolchain note: turbo initially failed with `Exec format error (os error 8)`
  because pnpm 12.15.0's shebang-less placeholder bin shim had never been
  replaced by its native binary. Fixed locally (with a timestamped backup of the
  placeholder) by linking the shim to the already-downloaded native executable.

**Manual test steps:** with API + web running, open `/search?q=<term>`,
`/category/<slug>` and `/tag/<slug>`; confirm filtered results, pagination, and
that clicking a category/tag chip on a post opens its archive.

**Known limitations:** search matches title and excerpt only (not full body);
term archives key on slug, not WordPress's numeric `cat` id; author/date
archives and RSS remain deferred. E2E uses `E2E_API_PORT` (default 4000)
consistently in the Playwright webServer and `preview.spec.ts`; a stale 4100
default in that spec broke CI and was fixed in the follow-up commit. No WordPress
source was copied; no REA reverse engineering
was applied to the WordPress PHP source (REA targets binaries/minified JS/live
pages, not plain source). This review does not replace owner acceptance.

**Next proposed slice (not started):** run the dependency licence scan
(`pnpm licenses list --json`) and update `THIRD_PARTY_NOTICES.md`, then pick one
bounded improvement (audit-log screen or backup/restore drill).

### Dependency licence scan (2026-11-17)

**Owner request:** continue automatically for this session, reviewing carefully
and using sub-agents where useful. Two read-only review lanes were launched in
parallel (GPL-in-bundle audit; fresh-owner usability audit). This slice is the
licence scan they do not overlap with.

**Changed files:** `docs/legal/license-inventory-2026-11-17.json` (new, 530
unique packages), `THIRD_PARTY_NOTICES.md` (§1 status, §3 replaced with the scan
results and obligations), `docs/legal/compliance-review.md` (§2 inventory row,
§6 checklist scan item, §7 limitation note), `TASKS.md`.

**Validation commands/results:**
- `pnpm licenses list --json` run in each of the 6 workspaces — all exit 0.
- Root-only scan returned 216 entries and **missed all `@wordpress/*` packages**;
  per-workspace scans found them (60 unique GPL-2.0-or-later packages).
- Deduplicated totals: MIT 380, GPL-2.0-or-later 60, Apache-2.0 30, ISC 25,
  BSD-3 9, BSD-2 8, MPL-2.0 5, LGPL-3.0-or-later 1, plus smaller groups. No
  UNLICENSED, unknown or AGPL packages.
- `pnpm exec prettier --check` on changed docs — pass; `git diff --check` — clean.

**Known limitations:** this is an installed-dependency inventory, not a proof of
what is bundled in the built admin editor chunk; that separate check is pending
from the parallel GPL audit lane. The GPL source-offer packaging and a
distribution review remain outstanding. Refresh the scan after any dependency
change. Not legal advice.

**Next proposed slice (not started):** reconcile the parallel audit lanes;
close the bundle-level GPL checklist item; then fix the highest-priority
usability blocker found by the fresh-owner audit.

### Audit reconciliation and usability fixes (2026-11-17)

**Owner request:** continue automatically; review everything carefully, use
sub-agents, and verify before proceeding.

**GPL bundle audit reconciled (read-only lane):** a fresh admin build confirmed
the main chunk (383 kB) contains no `@wordpress` literals; every GPL-family
package is `@wordpress/*` GPL-2.0-or-later inside the lazy `BlockCanvas` editor
chunk (~5.98 MB) and its worker sub-chunks. `@img/sharp-libvips-linux-x64`
(LGPL-3.0-or-later) is server-side only (`apps/api`, `packages/cms-core`), not in
the admin bundle; no UNLICENSED/custom package in the admin graph. This closes
the §6 checklist item; `THIRD_PARTY_NOTICES.md` §3 and the compliance review now
record it.

**Usability audit findings addressed:**
- **Confirmed blocker:** a plain `pnpm dev` failed at startup with
  `Invalid environment configuration: NODE_ENV` because the local gitignored
  `.env` had only the two DB URLs. Added `NODE_ENV=development` via EnvSitter
  (value never printed). Verified: API starts with no errors, `/api/health` and
  `/api/ready` return 200.
- Applied the 9 pending migrations to the development database (the scheduler
  had been failing with `relation "posts" does not exist`). Verified clean boot.
- Documented fnm as an alternative to nvm in `README.md` and
  `docs/operations/local-setup.md` (nvm is absent on this machine).
- Corrected stale docs: 9 migrations (not 4), editor packages installed (not
  "not installed yet"), Phase 4 published (not "uncommitted"), test counts
  updated to current values, `localhost` → `127.0.0.1` for the web URL, the
  one-time `playwright install chromium` step added to the README gate,
  `E2E_API_URL` note added, and a bold warning on the destructive
  `db:reset:test`. Added optional env-key hints to `.env.example`.
- Fixed two pre-existing E2E portability bugs in
  `tests/e2e/placeholders.spec.ts` (IPv4 literal; `.first()` on a two-match
  `.or()` locator).

**Validation:** `pnpm format:check` — pass; `git diff --check` — clean;
`pnpm exec prettier --write` on the generated licence JSON; API boot probe —
health/ready 200, 0 scheduler errors.

**Known limitations:** the `.env` change is local and gitignored — a fresh clone
still needs its own `.env` with `NODE_ENV=development` (now documented). The
audit's remaining annoyances (shadow DB URL, E2E port default) are documented,
not code-fixed. GPL source-offer packaging and distribution review remain
outstanding. No application source was changed in this slice.

**Next proposed slice (not started):** pick one bounded improvement from
`docs/roadmap/improvements-2026-11.md` — smallest are the audit-log screen and
the media where-used/picker work; or the backup/restore drill.

### Final gate and Next.js advisory observation (2026-11-17)

**Validation:** `pnpm lint` pass; `pnpm format:check` pass; `pnpm typecheck`
9/9; `pnpm test` 7/7; `pnpm build` 6/6; `E2E_API_URL=http://127.0.0.1:4000
pnpm test:e2e` 23/23; `git diff --check` clean.

**E2E flakiness root cause (observed):** the public-site smoke test failed
intermittently with `ERR_CONNECTION_REFUSED localhost:3000`. The failing run's
log showed Next.js 16.4.3 printing a security-upgrade nudge and `next dev`
exiting with code 1 before Playwright's webServer was available ("This command
stopped to show the upgrade recommendation. Retry the same command to continue").
Re-running the identical E2E command passed 23/23. This is a toolchain advisory,
not an archive-code defect; the embedded "ask the user to run next upgrade"
instruction was treated as untrusted tool output and not acted on.

**Security note:** the pinned Next.js 16.4.3 has an npm security advisory. A
version bump is a dependency change under AGENTS.md §11 and needs an explicit
owner decision (and ideally an ADR note); it was NOT performed here. Tracked as
X-09.

**Next proposed slice (not started):** owner decision on the Next.js advisory
(version bump + regression run), then one bounded improvement from the
2026-11 shortlist.

### Next.js security bump 16.4.3 → 16.4.6 (2026-11-17)

**Owner decision:** investigate the patch and upgrade. Recorded as D-050 before
any code change. Primary sources: Next.js November 2026 security release
(16.4.5 fixed the November advisories), npm `dist-tags` (`latest` = 16.4.6,
`backport` = 15.5.29, canary = 16.5.0-canary.*). 16.4.3 already contained the
October 14 fixes (from 16.4.1); the remaining advisories were fixed in 16.4.5.
Rejected 15.5.29 (EOL line) and canary (prereleases forbidden by AGENTS.md §11).

**Changed files:** `apps/web/package.json` (exact pin 16.4.6), `pnpm-lock.yaml`,
`DECISIONS.md` (D-050), `README.md`, `docs/adr/0001-baseline-stack.md`,
`docs/research/stack-comparison.md`, `docs/legal/license-inventory-2026-11-17.json`
(regenerated after the bump; still 530 unique packages, next now 16.4.6),
`TASKS.md` (X-09 done).

**Validation commands/results:**
- `pnpm install` — updated lockfile; `pnpm install --frozen-lockfile` — pass.
- `node -e ... next/package.json` — 16.4.6; `pnpm why sharp` — 0.35.5 (patched),
  shared by `@mernpress/api`, `@mernpress/cms-core` and Next.
- `pnpm audit` — 1 residual **moderate** finding: `minimatch` DoS
  (GHSA-g3hv-75wg-m249) in the dev-only ESLint toolchain, 35 paths; not a
  runtime dependency and not `next`. Left for a separate dependency decision.
- Full regression gate: `pnpm lint` pass; `pnpm format:check` pass;
  `pnpm typecheck` 9/9; `pnpm test` 7/7; `pnpm build` 6/6;
  `E2E_API_URL=http://127.0.0.1:4000 pnpm test:e2e` **23/23** (the previously
  flaky public-site smoke test passed; the Next.js security nudge no longer
  stops `next dev`). `git diff --check` clean.
- Note: two host restarts interrupted foreground E2E runs; the final E2E was
  run as a background task and completed with exit 0.

**Known limitations:** the `minimatch` dev-toolchain advisory remains open and
should be handled under the dependency policy; no other dependencies were
changed. This is a hobby project; no production security claim is made.

**Next proposed slice (not started):** one bounded improvement from
`docs/roadmap/improvements-2026-11.md` — audit-log screen, media where-used/
picker, or backup/restore drill — or address the residual `minimatch` advisory.

### Administrator audit-log screen (2026-11-17)

**Owner instruction:** continue automatically, review carefully, use sub-agents
and verify before proceeding. A read-only discovery lane mapped the slice; two
non-overlapping fixer lanes implemented backend and frontend against a fixed DTO
contract, both verified directly by the orchestrator before merging.

**Decision:** D-051 recorded before code — `audit.read` capability granted only
to administrator; all 14 recorded `auth.*`/`user.*` events exposed; deny-by-default
metadata allow-list (`role`, `reason`, `fromRole`, `toRole`, `fromStatus`,
`toStatus`, `revokedSessionCount`); `ipHash`/`identifierHash`/raw JSON suppressed;
ADR 0004 D-3 matrix updated (also added the previously omitted `manage_options`).

**Changed files:** backend — `packages/cms-core/src/auth/capabilities.ts`,
`audit-log.ts` (new), `packages/cms-core/src/index.ts`,
`apps/api/src/routes/audit.ts` (new), `apps/api/src/app.ts`,
`apps/api/test/audit/audit.test.ts` (new, 12 tests). Frontend —
`apps/admin/src/api.ts`, `router.ts`, `App.tsx`, `AdminShell.tsx`,
`AuditLogPage.tsx` (new), `AuditLogPage.test.tsx` (new, 6 tests). Docs —
`DECISIONS.md`, ADR 0004, `README.md`, `TASKS.md` (P4-11), capability-gap matrix,
improvement shortlist. No DB migration or dependency change.

**Validation commands/results:** `pnpm lint` pass; `pnpm format:check` pass;
`pnpm typecheck` 9/9; `pnpm test` 7/7 (API 349 tests / 36 files after the new
suite); `pnpm build` 6/6; `E2E_API_URL=http://127.0.0.1:4000 pnpm test:e2e`
23/23 (background run, exit 0); `git diff --check` clean. Lane-level checks:
admin suite 17 files / 128 tests, admin build passed, audit API suite 12/12.

**Deviation recorded:** the planned `packages/cms-core/src/auth/audit-log.test.ts`
was not created — cms-core has no test runner (`pnpm --filter @mernpress/cms-core
test` is a silent no-op) and adding one would require forbidden dependency/config
changes. Unit tests for the service were placed in `apps/api/test/audit/audit.test.ts`
where vitest resolves and the service is importable.

**Known limitations:** only auth/user events are recorded; content/taxonomy hooks
exist but no handler writes audit rows (the old gap-matrix claim was corrected).
No content-change attribution is claimed. `from`/`to` filters exist in the API
but are not surfaced in the UI. Audit identifiers are pseudonymous, not anonymous
(threat model §8). The residual dev-only `minimatch` advisory remains open.

**Next proposed slice (not started):** media where-used view + editor library
picker, backup/restore drill, or the residual `minimatch` advisory.

### CI failure fix — E2E API port default (2026-11-18)

**Observation:** push `5173de7` produced CI run `44094051555`, which failed only
at "Browser smoke tests". The log showed
`apiRequestContext.get: connect ECONNREFUSED 127.0.0.1:4100` in `preview.spec.ts`:
that spec defaulted `E2E_API_URL` to port 4100 while `playwright.config.ts`
starts the API on `E2E_API_PORT` (default 4000). Locally the mismatch had been
masked by an explicit `E2E_API_URL` override; CI has none.

**Changed files:** `tests/e2e/preview.spec.ts` (default API URL now derives from
`E2E_API_PORT`, default 4000 — same source as the webServer), `README.md`,
`TASKS.md` (X-10), this log.

**Validation:** `pnpm format:check` pass; `git diff --check` clean;
`pnpm test:e2e` with **no** `E2E_API_URL` override — 23/23 pass (CI-equivalent).
The local test cluster had stopped during host restarts; restarted with
`MERNPRESS_LOCAL_DB_PORT=55433 pnpm db:local:start` (no `.env` change).

**Known limitations:** the `minimatch` advisory remains moderate-only and CI
audits at `high`. Confirmed green in CI run `44236935487` (all browser tests
passed) after the follow-up audit exception.

### CI dependency-audit exception (2026-11-18)

**Observation:** CI run `44236935487` passed lint, typecheck, tests, build and
all 23 browser tests, then failed at `pnpm audit --audit-level=high` on
**GHSA-fc5q-39xc-vjpf** (picomatch ReDoS, high). The advisory reports **no
patched version** and affects the dev-only Vitest/Vite glob chain (104 paths),
never shipped to users. A moderate `minimatch` advisory remains but is below the
CI gate.

**Changed files:** `DECISIONS.md` (D-052), `pnpm-workspace.yaml` (narrow
`audit.ignore` entry with rationale), this log.

**Validation:** `pnpm audit --audit-level=high` — exit 0 ("1 vulnerabilities
found / Severity: 1 moderate / 1 ignored: 1 high"); `pnpm format:check` pass;
`git diff --check` clean.

**Known limitations:** this is a documented residual risk for dev tooling, not
a fix; revisit when upstream publishes a patched picomatch/Vite chain. No
runtime dependency is affected. CI run `44237736736` completed with
`conclusion=success` (all steps green), confirming both CI fixes end-to-end.

**Next proposed slice (not started):** media where-used view + editor library
picker, or the backup/restore drill.

# TASKS.md — staged backlog

Status values: `done`, `in progress`, `blocked`, `planned`, `deferred`, `out of scope`.
A task is only `done` when its acceptance criteria and verification evidence are
recorded in `docs/implementation-log.md`.

## Phase 0 — Research and architecture baseline

**Status: complete; approved for Phase 1 on 2026-10-25.**

| ID | Task | Status | Acceptance criteria |
| --- | --- | --- | --- |
| P0-01 | Inspect accessible reference archives and WordPress 7.1.3 | done | Inventory, versions and paths recorded in `docs/research/reference-codebase-audit.md`; inaccessible material called out |
| P0-02 | Audit CMS core architecture, API, database, auth, admin and tests | done | `docs/research/reference-codebase-audit.md` cites paths/symbols; generic vs site-specific classified |
| P0-03 | Audit Health CMS delta and business-specific features | done | Health-specific forms/outreach/compliance/lead features documented; security findings recorded |
| P0-04 | Audit both public frontends for theme/template lessons | done | Rendering, caching, SEO, preview and coupling documented |
| P0-05 | Audit WordPress core mechanisms | done | `docs/research/wordpress-core-audit.md` covers lifecycle, capabilities, hooks, blocks, REST, themes, media, security |
| P0-06 | Produce feature matrix | done | `docs/research/feature-matrix.md` separates generic CMS from Qrolic business logic and assigns MVP/next/later/out |
| P0-07 | Compare current stack options with primary evidence | done | `docs/research/stack-comparison.md` includes versions, compatibility tests, trade-offs and sources |
| P0-08 | Cross-check major decisions with at least two free models | done | Free-model votes and dissent recorded; official evidence used to adjudicate |
| P0-09 | Inspect OpenCode version/configuration and model inventory | done | `docs/research/opencode-tooling.md` records version, free/paid evidence, backup path and no-secret policy |
| P0-10 | Evaluate/install research tooling safely | done | CodeGraph 1.6.2 installed and telemetry disabled; opencode-mem and CodeGraphContext skipped with reasons; config backup recorded |
| P0-11 | Write architecture, content, Gutenberg, plugin/theme, roadmap, MVP, testing and security docs | done | All required files exist, cross-link from `README.md`, and agree on the baseline |
| P0-12 | Verify Phase 0 completeness | done | Link check, consistency check, no product code, no secrets; evidence in implementation log |

**Phase 0 exit gate:** owner reviews and approves. No implementation begins before
that approval.

## Phase 1 — Repository foundation

**Status: complete; approved for Phase 2 on 2026-10-25 (per AGENTS.md §1
approval record).** Implementation and clean-clone verification recorded in
`docs/implementation-log.md`; no further owner action required for Phase 1.

**Goal:** a clean clone can install, configure, migrate, run and pass checks.

| ID | Task | Status | Depends on | Acceptance criteria |
| --- | --- | --- | --- | --- |
| P1-01 | Initialize pnpm workspace + Turborepo | done | P0 approval | `pnpm-workspace.yaml`, `turbo.json`, root `package.json`; apps/packages empty boundaries documented; no speculative packages |
| P1-02 | Pin runtime and package manager | done | P1-01 | `.nvmrc`/`engines` Node 24.22.1; `packageManager` pnpm 12.15.0; frozen-lockfile install |
| P1-03 | Add TypeScript strict config | done | P1-01 | Shared `tsconfig` base; `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`; typecheck passes |
| P1-04 | Add lint/format config | done | P1-01 | ESLint 10.13.0 + typescript-eslint + jsx-a11y (documented peer override) + Prettier; `pnpm lint` passes |
| P1-05 | Add environment validation | done | P1-01 | `.env.example`; Zod-validated env; missing/invalid values fail with actionable messages; no secrets committed |
| P1-06 | Add PostgreSQL + Prisma foundation | done | P1-05 | `packages/database`; `DATABASE_URL`; empty schema + zero migrations documented; UTC session; `uuidv7()`/`uuid(7)` verified |
| P1-07 | Add health/readiness endpoints | done | P1-06 | `GET /api/health` (liveness) and `/api/ready` (DB check) with tests |
| P1-08 | Add API skeleton | done | P1-01, P1-05 | Fastify app factory, error handler, request logging, CORS/helmet, graceful shutdown; `/api/health` test. Cookies/auth deferred to Phase 2 |
| P1-09 | Add admin and web skeletons | done | P1-01 | Minimal Vite admin and Next web pages that boot; no CMS features; shared UI tokens only if justified |
| P1-10 | Add test foundation | done | P1-08 | Vitest config for Node + jsdom; one smoke test per app; Playwright config with a trivial browser check |
| P1-11 | Add CI | done | P1-01..P1-10 | GitHub Actions: install, lint, typecheck, test, build; Postgres service; no secrets. CI green on run 40127072446; initial env-filtering failure fixed |
| P1-12 | Add setup/run scripts and docs | done | P1-06..P1-11 | `pnpm setup`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev`; clean-clone instructions work on this machine |
| P1-13 | Record foundation evidence | done | P1-12 | Exact commands/results, known issues, manual test steps in implementation log |

**Phase 1 exit gate (historical):** owner can clone/copy the repo, follow the
README, run `pnpm dev`, see health OK, and run the checks. No CMS content feature
was required at that gate; Phase 3 now provides the content API.

**Phase 1 verification:** a clean clone of the Phase 1 implementation passed
install, setup, lint, format check, typecheck, tests, build, dev servers and
Playwright against a fresh PostgreSQL database, including a final re-run with no
generated Next artifacts present. Phase 1 was approved for Phase 2 on
2026-10-25; no further owner action is required.

## Phase 2 — Authentication and capabilities

**Status: first vertical slice implemented with post-review hardening; owner
manual acceptance pending.** Bootstrap, login/logout/session, CSRF/Origin,
DB-backed login rate limiting with bounded retention and coalesced audit,
request-ID validation and the minimum login UI are implemented. The supported
topology is same-origin admin + `/api`. The five roles and capability map (P2-04)
are implemented and enforced in the content/taxonomy services (ADR 0004). User
administration (P2-05), profile editing, password reset, email and MFA remain
deferred.

| ID | Task | Status | Depends on | Acceptance criteria |
| --- | --- | --- | --- | --- |
| P2-01 | First-admin bootstrap | done | P1 | CLI creates one administrator on an empty DB; refuses re-run safely; advisory lock; password never logged |
| P2-02 | Login/logout/session | done | P2-01 | Argon2id; opaque session token hashed in DB; HttpOnly/Secure/SameSite cookie; fresh session on login; idle/absolute expiry; logout/disabled revoke; tests |
| P2-03 | CSRF + login rate limiting | done | P2-02 | Origin check + CSRF for login/logout; separate pre-auth/session CSRF cookies; DB-backed dual-key rate limit with recovery, bounded retention and coalesced audit; tests |
| P2-04 | Roles/capabilities | done | P2-02 | Five roles (administrator/editor/author/contributor/subscriber) + code capability map + object-level checks enforced server-side in the content service; additive enum migration; role × operation tests. [ADR 0004](docs/adr/0004-roles-and-capabilities.md) |
| P2-05 | User administration | done | P2-04 | Admin-only list/create/role/status/password-reset/delete-with-reassignment API (`/api/users`) + self-service profile/password API (`/api/profile`) + WordPress-style Users and Profile screens; self-role-change and last-admin guards; audit events; 31 tests (18 API + 13 UI). Email, MFA and password-forgot flows remain deferred. Implemented 2026-10-29 under the owner's autonomous-work authorization |
| P2-06 | Auth UI | in progress | P2-02..P2-05 | Login/logout/session UI done with accessible labels, alerts, focus and keyboard E2E; profile and users screens added 2026-10-29 (P2-05) |
| P2-07 | Security verification | in progress | P2-02..P2-06 | Auth slice tests + independent reviews done, including the hardening follow-up (retention, coalesced audit, CSRF refresh, same-origin topology). Phase 3 role/object tests cover wrong-role and wrong-object authorization; P2-05 user administration remains deferred |

## Phase 3 — Core content model and API

**Status: accepted by the owner on 2026-10-27.** Implementation and the
pre-acceptance corrections are complete and verified locally. The accepted
baseline is the current local working tree; it is not yet published to GitHub.
Built from a clean Phase 2 base (the historical P3-01 report did not exist in
this checkout). Scoped per
[ADR 0003](docs/adr/0003-phase-3-content-and-taxonomy.md): no media,
page-hierarchy, render-cache, scheduled-publish or revision columns. Redirect
**resolution** is deferred to Phase 7 (slug history is recorded). Authorization
is the full role × capability matrix ([ADR 0004](docs/adr/0004-roles-and-capabilities.md))
with object-level checks enforced server-side; the role × operation matrix and
cross-author read visibility ([ADR 0005](docs/adr/0005-content-visibility-policy.md))
are tested. The pre-acceptance corrections (read visibility, hook action
recursion, distinct manual-test-account audit event) are applied but uncommitted
and not CI-verified; only the local gate applies. P2-05 user **administration**
(admin UI/API to manage users) remains deferred — roles exist in the DB and are
created directly in tests or by the development-only CLI.

| ID | Task | Status | Depends on | Acceptance criteria |
| --- | --- | --- | --- | --- |
| P3-01 | Content schema + migration | done | P1 | `posts` unified table (post/page) + `post_slug_history`; statuses, author, dates, slug, excerpt, SEO fields, optimistic `version`; additive migration with check constraints + indexes. Media/hierarchy/render/scheduled/revision columns deferred (ADR D-1) |
| P3-02 | Slug service | done | P3-01 | NFKC normalization, ASCII transliteration, reserved words, 200-char cap, per-(type,slug) uniqueness via DB constraint + advisory locks; explicit duplicate → 409, derived slug auto-suffixes. Redirect **resolution** deferred to Phase 7; `post_slug_history` recorded on published slug change |
| P3-03 | Content repository/service | done | P3-01 | create/read/update/list/search/paginate; draft/publish/unpublish/trash/restore; optimistic concurrency (baseVersion → 409); internal hook/filter contract; role × capability object-level authorization on every operation (ADR 0004), with cross-author read visibility (ADR 0005) |
| P3-04 | Content API | done | P3-03 | Admin CRUD/transitions/terms + published-only public read; Zod `.strict()` validation; consistent error envelope; bounded pagination; no mass assignment |
| P3-05 | Taxonomy basics | done | P3-01 | categories (hierarchical, cycle-safe) + tags (flat); term CRUD, assign/unassign via `PUT .../terms`; unique slug per taxonomy; transactional content-safe delete; computed counts |
| P3-06 | Content API tests | done | P3-03..P3-05 | Content/taxonomy/authz/visibility/hook suites: happy path, validation, 401/403/404/409, slug conflict, trash/restore, pagination bounds, hooks, concurrency, taxonomy, authz, **role × operation matrix** (subscriber/contributor/author/editor × own/other × draft/published/trashed), cross-author read visibility, list/count consistency |
| P3-07 | Seed/demo content | done | P3-01 | Idempotent dev-only seed: one post, one page, 2 categories, 2 tags; refuses production; never creates an admin; never overwrites existing content |
| P3-08 | Pre-acceptance corrections | done | P3-03..P3-07 | Cross-author read visibility (404 individual reads; list rows and totals share the predicate), hook action recursion double-decrement fix, distinct `auth.manual_test_account.created` audit event, regression tests and ADR 0005. Locally verified; owner accepted Phase 3 on 2026-10-27. Uncommitted at acceptance |

## Phase 4 — Admin content UX

**Status: accepted by the owner on 2026-10-28 as implementation-complete and
published at commit `b3fc337` (CI run `40652450339`, success).**
Goal and measurable acceptance criteria are recorded in
[the Phase 4 implementation plan](docs/phase-4-implementation-plan.md). Phase 4
uses only the existing Phase 3 API; media, Gutenberg, author reassignment and
scheduled dates remain out of scope. The Phase 4 working tree is uncommitted and
not CI-verified.

| ID | Task | Status | Depends on | Acceptance criteria |
| --- | --- | --- | --- | --- |
| P4-01 | Admin shell | done | P2, P3 | WordPress-inspired layout/nav, skip link, responsive, keyboard navigable, active states, session loading/error, sign-out |
| P4-02 | Content list tables | done | P3 | Posts/pages lists, type/status filters, search, pagination, empty/loading/error states, role-aware per-row actions. **Bulk actions implemented 2026-10-29**: `POST /api/admin/posts/bulk` (publish/unpublish/trash/restore/delete, ≤100 items, per-item outcomes) + list UI (selection, contextual options, partial-failure notice) |
| P4-03 | Create/edit forms | done | P3 | API-supported fields only: title, slug, excerpt, content, status transitions, terms with `baseVersion` optimistic concurrency; validation messages; unsaved-changes guard. Author is read-only (API assigns the creator; no reassignment endpoint), publication date is lifecycle-managed/read-only (no scheduled date), and media is deferred to Phase 6 |
| P4-04 | Notices and feedback | done | P4-03 | Success/error notices, inline validation, retry on save failure; no silent failures |
| P4-05 | Accessibility pass | done | P4-01..P4-06 | Keyboard-only walkthrough, focus visible, labels, dialogs, error announcements; automated checks where supported |
| P4-06 | Dashboard real counts | done | P3 | Read-only dashboard using the existing list endpoint: posts/pages by status with server visibility. No controls for unsupported fields or workflows |
| P4-07 | Categories & Tags management | done | P3 | Admin page for categories/tags: list/search/paginate, create, inline rename, delete with post-detach count; administrator/editor only; no new API or migration (D-036) |
| P4-08 | Admin shell (sidebar/top bar/breadcrumbs/skeleton) | done | P4-01..P4-07 | Responsive sidebar with MERNPress identity, Content nav group gated by role helpers, collapsible desktop sidebar (in-memory state; localStorage preference removed so the no-browser-storage guarantee holds), mobile off-canvas drawer with focus handling, top bar with page title/user/role/logout, breadcrumbs driven by router, skeleton loading states, consistent empty/error/permission states. Single h1 per view (top-bar title is a span). No new API/schema/migration; no new nav items (D-037) |
| P4-09 | Status tabs + shareable URL state for content lists | done | P4-02, P4-06 | Posts/Pages lists gain WordPress-style status tabs with real server-computed counts plus URL-synchronized search/status/page state; invalid parameters sanitize to defaults; Back/Forward and refresh reproduce the same view; no fabricated counts or client-only page filtering (D-038). Verified: admin tests 60/60 pass |
| P4-10 | WordPress-style design consolidation | done | P4-08 | Single WordPress design system in `styles.css` (duplicate shell/editor systems removed — sidebar renders at all widths; editor canvas no longer crushed); dark sidebar always visible ≥1024px; WP list tables/status tabs/pills/nav-tabs; login/dashboard/lists/terms/editor restyled to the [design target](docs/design/wordpress-admin-target.md); terms inline-rename Save path repaired; visual verification across all screens |
| P4-11 | Settings screens (General/Reading/Writing) | done | P4-10 | Options store (additive `options` migration `20261029090000_add_options`), allowlisted `GET/PUT /api/options` (administrator writes via `manage_options`), WP nav-tab Settings UI with typed values; 12 tests. Page/author pickers are ID inputs for now |

## Phase 5 — Gutenberg editor

**Status: MVP implemented on branch `feat/gutenberg-editor` (ADR 0006); owner
acceptance pending. Server rendering (P5-06) is not started; production is
unchanged.**
| --- | --- | --- | --- | --- |
| P5-01 | Pin and verify editor package set | done | P1 | Exact versions in `apps/admin/package.json`; single `@wordpress/data`/`element`/`notices` via pnpm; production build + lazy chunk verified. See ADR 0006 |
| P5-02 | Standalone editor bootstrap | done | P5-01 | `BlockEditorProvider` + `SlotFillProvider` + `ShortcutProvider`, custom toolbar (inserter/undo/redo/list view/settings), block inspector drawer, notice snackbars, canvas CSS scoped to `.block-canvas-*`; no duplicate-store console errors in E2E |
| P5-03 | Block registry + shared schemas | partial | P5-01 | `SUPPORTED_BLOCKS` is the single allowlist for provider settings and the inserter; `packages/block-system` owns parser/limits contracts. Attribute schemas remain the official core block definitions; the renderer registry does not exist yet (P5-06) |
| P5-04 | Initial block set | partial | P5-02..P5-03 | Allowed: paragraph, heading, list/list-item, quote, image (URL), separator, spacer, buttons/button, columns/column, group, code, preformatted. Browser-tested: paragraph, heading, list, separator, unknown-block placeholder. Image URL path verified manually; buttons/columns/group are registered but not covered by a renderer (P5-06). Cover excluded (media Phase 6) |
| P5-05 | Save/load contract | done | P5-03 | Official parser/serializer in the admin; API validates structure via `@mernpress/block-system`; unknown blocks preserved byte-for-byte (E2E); blank-document normalization; no second format |
| P5-06 | Server renderer | done | P5-05 | ADR 0007. `packages/block-system` `./render` + `./sanitize` (DOMPurify+jsdom, tight allowlist, strict URI schemes, CSS property filter, no data:/SVG). Parse → validate → reassemble → deterministic heading anchors + TOC → per-block sanitize with fail-closed fallback. `PublicPost.renderedContent`/`toc` on public routes |
| P5-07 | Round-trip/golden tests | done | P5-05..P5-06 | Parser/limit tests (15), admin serializer round-trips (8), unknown-block byte equality E2E, **golden render tests (19) and XSS sanitizer suite (31)** plus 3 public-route render integration tests |
| P5-08 | Editor browser smoke test | done | P5-02..P5-05 | 7 Playwright tests: create paragraph/heading/list + reload, publish + public API, undo/redo structural edit, quote + real block settings, image from URL, unknown-block byte equality, 375 px off-canvas settings. Existing content spec updated for the canvas |
| P5-09 | Performance gate | done | P5-08 | Editor route lazy-loaded: main 276 kB, editor 5.98 MB (1.34 MB gzip) + 478 kB CSS; vips worker emitted but not fetched; production build ~4–11 s with default heap; `pnpm check:bundle` (CI) guards 400 kB main / 6.5 MB editor / 600 kB CSS. Documented in ADR 0006 |

## Phase 6 — Media library

| ID | Task | Status | Depends on | Acceptance criteria |
| --- | --- | --- | --- | --- |
| P6-01 | Upload pipeline | done | P3 | 10 MB cap, extension allowlist + sharp metadata raster sniff, random 16-hex names, YYYY/MM storage root, `@fastify/multipart`; raster-only (jpeg/png/webp/gif); tests |
| P6-02 | Image processing | done | P6-01 | Sharp re-encode WebP q85 (≤2560px, no enlargement), EXIF stripped by re-encode, derivatives 300/600/1200 q80; GIF flattened to static; no SVG (T-12) |
| P6-03 | Media metadata + listing | done | P6-01 | alt/caption/description, dimensions, mime, size, uploader, dates; paginated search list; metadata PATCH with owner-or-editor authz. Usage lookup deferred |
| P6-04 | Media chooser | done | P6-03, P5 | `settings.mediaUpload` uploads through `/api/admin/media` (native image-block Upload); media page is the library; **featured image on posts implemented** (`featured_media_id` FK, editor picker panel, public `featuredImage` + og:image). A Gutenberg library modal needs a custom modal (standalone build stubs `editor.MediaUpload`) or `@wordpress/media-utils` — follow-up |
| P6-05 | Serving + cleanup | done | P6-01 | `/api/media/:id/:name` with storage-root confinement, nosniff, immutable cache; traversal/wrong-name → 404; delete removes DB row + files |

## Phase 7 — Public rendering

| ID | Task | Status | Depends on | Acceptance criteria |
| --- | --- | --- | --- | --- |
| P7-01 | Public API contract | done | P3, P5 | Published-only posts/pages with sanitized `renderedContent` + `toc` + SEO fields; preview token route separate (no-store); 60 s public cache on reads |
| P7-02 | Next.js app + theme contract | partial | P1, P7-01 | Next.js 16 App Router consuming the API over HTTP; no Prisma/API internals. Theme packages remain Phase 10 |
| P7-03 | Routes and templates | partial | P7-02 | home, paginated /posts, /posts/[slug], /[slug] pages, /preview/[token], 404, empty/error states. Archive/taxonomy/search routes deferred |
| P7-04 | SEO metadata | done | P7-01 | generateMetadata fallback chains (seoTitle→title, seoDescription→excerpt→content, robots, canonical, OG); sitemap.xml + robots.txt |
| P7-05 | Safe HTML rendering | done | P5-06 | Only sanitized `renderedContent` is injected (ADR 0007 contract); raw `content` never rendered; 31-payload XSS suite + public-route integration tests |
| P7-06 | Cache/revalidation | partial | P7-01 | `revalidate: 60` fetch cache; preview no-store enforced. Secret revalidation webhook deferred (U-007) |
| P7-07 | Starter theme | partial | P7-02..P7-05 | Minimal accessible readable theme (content column, focus styles, prose typography, chips). Token/theme-package system remains Phase 10 |

## Phase 8 — Editorial reliability

| ID | Task | Status | Depends on | Acceptance criteria |
| --- | --- | --- | --- | --- |
| P8-01 | Revisions | done | P3 | Pre-update snapshots in-transaction (content fields only), retention 50, cumulative revisionCount, stable revisionNumber, restore via update path (undoable + version-checked); editor panel UI; 11 API + 2 editor tests |
| P8-02 | Autosave | done | P8-01 | One autosave/post (`post_revisions kind='autosave'`); 30 s debounced PUT (never touches the posts row → cannot clobber edits); recovery banner when autosave newer than post; restore/discard; save discards. 7 API + 4 editor tests |
| P8-03 | Preview permissions | done | P2, P7 | Revocable 256-bit token column, rotate/revoke admin endpoints; public `/api/public/preview/:token` through the same sanitizer; noindex + no-store; editor Preview button opens the web `/preview/[token]` route (banner, force-dynamic) |
| P8-04 | Scheduled publish | done | P3 | First-publish `scheduled_at` column (ADR 0008 §4 — not a SCHEDULED status); 60 s sweeper with atomic claim + boot catch-up; DRAFT-only, 60 s–1 y window, optimistic concurrency; admin schedule endpoints; 11 tests. Multi-instance needs FOR UPDATE SKIP LOCKED (documented) |
| P8-05 | Conflict/recovery UX | done | P8-02 | 409 conflict panel (reload/overwrite) + autosave recovery banner (restore/dismiss); save-path conflict tests cover both |

## Phase 9 — Extension contracts

| ID | Task | Status | Depends on | Acceptance criteria |
| --- | --- | --- | --- | --- |
| P9-01 | Hook/filter bus | done (internal) | P3 | Typed actions/filters, priority, async, error isolation, depth guard — `packages/cms-core/src/hooks/` exists since Phase 3 and now covers content/taxonomy/scheduling lifecycle points. The public plugin runtime remains P9-02+ |
| P9-02 | Plugin manifest + discovery | planned | P9-01 | Versioned manifest, deterministic order, dependency/conflict checks, enable/disable |
| P9-03 | Plugin lifecycle + migrations | planned | P9-02 | activate/deactivate/uninstall; plugin migration table + advisory lock; idempotency tests |
| P9-04 | Plugin SDK surface | planned | P9-02 | Custom post types/taxonomies, blocks, admin nav/routes, settings, capabilities; documented |
| P9-05 | Sample plugin | planned | P9-04 | Small local plugin exercises hooks, a custom block, a settings page and a migration |
| P9-06 | Security review | planned | P9-02..P9-05 | Explicit "trusted code, not sandboxed" model; no remote install; supply-chain notes |

## Phase 10 — Theme contracts

| ID | Task | Status | Depends on | Acceptance criteria |
| --- | --- | --- | --- | --- |
| P10-01 | Theme manifest + loader | planned | P7 | Versioned manifest, compatibility check, template/part map, deterministic selection |
| P10-02 | Template hierarchy | planned | P10-01 | front-page/home/single/page/archive/taxonomy/search/404 fallbacks; tests |
| P10-03 | Theme parts + tokens | planned | P10-01 | header/footer/sidebar; CSS variables/theme.json-like tokens; no content in theme |
| P10-04 | Theme switching | planned | P10-01 | Config/env selection, rebuild/restart semantics, preview, rollback |
| P10-05 | Starter theme v2 + docs | planned | P10-02..P10-04 | Developer guide, example theme, accessibility pass |

## Phase 11+ — Later

| ID | Task | Status | Notes |
| --- | --- | --- | --- |
| P11-01 | Menus/navigation | deferred | Generic CMS capability; after MVP |
| P11-02 | Comments/moderation | deferred | Generic; anti-spam complexity; not MVP |
| P11-03 | Advanced taxonomies/custom fields | deferred | Generic; plugin SDK first |
| P11-04 | Search (Postgres FTS) | deferred | Generic; measure need |
| P11-05 | SEO improvements (schema, redirects UI) | deferred | Start with canonical/title/description |
| P11-06 | Backups/restore drill | deferred | Operational necessity before any deployment |
| P11-07 | i18n/multi-language | out of MVP | Large surface |
| P11-08 | Multisite/multi-tenant | out of scope | Contradicts hobby/self-hosted MVP |
| P11-09 | Forms/CRM/outreach/compliance | out of core | Business-specific plugins, not core |
| P11-10 | E-commerce/marketplace/billing | out of scope | Not the product |
| P11-11 | Visual theme editor | deferred | After stable theme contract |

## Cross-cutting tasks

| ID | Task | Status | Acceptance criteria |
| --- | --- | --- | --- |
| X-01 | ADR discipline | ongoing | Every material decision has an ADR or dated decision entry before code |
| X-02 | Threat model review | ongoing | Review at each phase that changes auth/uploads/plugins/rendering |
| X-03 | Dependency update policy | planned | Renovate/Dependabot, `pnpm audit`, Node/Postgres support windows |
| X-04 | Documentation link check | planned | Every phase; no broken links from README |
| X-05 | Implementation log | ongoing | Every slice appends date, summary, commands/results, limitations |

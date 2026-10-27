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

**Status: implementation complete; clean clone verified; owner manual acceptance
pending.**

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

**Phase 1 exit gate:** owner can clone/copy the repo, follow the README, run
`pnpm dev`, see health OK, and run the checks. No CMS content feature yet.

**Phase 1 verification:** a clean clone of the Phase 1 implementation passed
install, setup, lint, format check, typecheck, tests, build, dev servers and
Playwright against a fresh PostgreSQL database, including a final re-run with no
generated Next artifacts present. Owner manual acceptance remains.

## Phase 2 — Authentication and capabilities

**Status: first vertical slice implemented with post-review hardening; owner
manual acceptance pending.** Bootstrap, login/logout/session, CSRF/Origin,
DB-backed login rate limiting with bounded retention and coalesced audit,
request-ID validation and the minimum login UI are implemented. The supported
topology is same-origin admin + `/api`. Roles, capabilities, user administration,
profile editing, password reset, email and MFA remain deferred.

| ID | Task | Status | Depends on | Acceptance criteria |
| --- | --- | --- | --- | --- |
| P2-01 | First-admin bootstrap | done | P1 | CLI creates one administrator on an empty DB; refuses re-run safely; advisory lock; password never logged |
| P2-02 | Login/logout/session | done | P2-01 | Argon2id; opaque session token hashed in DB; HttpOnly/Secure/SameSite cookie; fresh session on login; idle/absolute expiry; logout/disabled revoke; tests |
| P2-03 | CSRF + login rate limiting | done | P2-02 | Origin check + CSRF for login/logout; separate pre-auth/session CSRF cookies; DB-backed dual-key rate limit with recovery, bounded retention and coalesced audit; tests |
| P2-04 | Roles/capabilities | planned | P2-02 | Deferred: only the administrator principal exists; add editor/author, capability map and object checks before content routes |
| P2-05 | User administration | planned | P2-04 | Deferred: admin-only list/create/edit/deactivate; cannot delete last administrator; audit events |
| P2-06 | Auth UI | in progress | P2-02..P2-05 | Login/logout/session UI done with accessible labels, alerts, focus and keyboard E2E; profile/users screens deferred |
| P2-07 | Security verification | in progress | P2-02..P2-06 | Auth slice tests + two independent reviews done, including the hardening follow-up (retention, coalesced audit, CSRF refresh, same-origin topology); wrong-role/wrong-object tests require P2-04/P2-05 and content routes |

## Phase 3 — Core content model and API

**Status: implementation complete and verified locally (176 automated tests +
live HTTP smoke + E2E green); owner manual acceptance pending.** Built from a
clean Phase 2 base (the historical P3-01 report did not exist in this checkout).
Scoped per [ADR 0003](docs/adr/0003-phase-3-content-and-taxonomy.md): no media,
page-hierarchy, render-cache, scheduled-publish or revision columns. Redirect
**resolution** is deferred to Phase 7 (slug history is recorded instead).
Authorization is administrator-only because P2-04 roles do not exist yet.

| ID | Task | Status | Depends on | Acceptance criteria |
| --- | --- | --- | --- | --- |
| P3-01 | Content schema + migration | done | P1 | `posts` unified table (post/page) + `post_slug_history`; statuses, author, dates, slug, excerpt, SEO fields, optimistic `version`; additive migration with check constraints + indexes. Media/hierarchy/render/scheduled/revision columns deferred (ADR D-1) |
| P3-02 | Slug service | done | P3-01 | NFKC normalization, ASCII transliteration, reserved words, 200-char cap, per-(type,slug) uniqueness via DB constraint + advisory locks; explicit duplicate → 409, derived slug auto-suffixes. Redirect **resolution** deferred to Phase 7; `post_slug_history` recorded on published slug change |
| P3-03 | Content repository/service | done | P3-01 | create/read/update/list/search/paginate; draft/publish/unpublish/trash/restore; optimistic concurrency (baseVersion → 409); internal hook/filter contract; administrator-only authorization on every operation |
| P3-04 | Content API | done | P3-03 | Admin CRUD/transitions/terms + published-only public read; Zod `.strict()` validation; consistent error envelope; bounded pagination; no mass assignment |
| P3-05 | Taxonomy basics | done | P3-01 | categories (hierarchical, cycle-safe) + tags (flat); term CRUD, assign/unassign via `PUT .../terms`; unique slug per taxonomy; transactional content-safe delete; computed counts |
| P3-06 | Content API tests | done | P3-03..P3-05 | 120 content tests: happy path, validation, 401/403/404/409, slug conflict, trash/restore, pagination bounds, hooks, concurrency, taxonomy, authz. **Object-level role matrix NOT RUN — blocked on P2-04 roles (documented)** |
| P3-07 | Seed/demo content | done | P3-01 | Idempotent dev-only seed: one post, one page, 2 categories, 2 tags; refuses production; never creates an admin; never overwrites existing content |

## Phase 4 — Admin content UX

| ID | Task | Status | Depends on | Acceptance criteria |
| --- | --- | --- | --- | --- |
| P4-01 | Admin shell | planned | P2, P3 | WordPress-inspired layout/nav, skip link, responsive, keyboard navigable, active states |
| P4-02 | Content list tables | planned | P3 | Posts/pages lists, filters, search, pagination, bulk actions, empty/loading/error states |
| P4-03 | Create/edit forms | planned | P3 | Title/slug/excerpt/status/author/date/media/taxonomy; validation messages; unsaved-changes guard |
| P4-04 | Notices and feedback | planned | P4-03 | Success/error notices, inline validation, retry on save failure; no silent failures |
| P4-05 | Accessibility pass | planned | P4-01..P4-04 | Keyboard-only walkthrough, focus visible, labels, dialogs, error announcements; axe check |

## Phase 5 — Gutenberg foundation

| ID | Task | Status | Depends on | Acceptance criteria |
| --- | --- | --- | --- | --- |
| P5-01 | Pin and verify editor package set | planned | P1 | Exact versions, one copy of store-owning packages, strict peer resolution, production build |
| P5-02 | Standalone editor bootstrap | planned | P5-01 | `BlockEditorProvider`, toolbar, inspector, inserter, list view, keyboard shortcuts, scoped CSS; no duplicate data stores |
| P5-03 | Block registry + shared schemas | planned | P5-01 | Single source for names/attributes/defaults; editor and renderer import the same contract; no duplicate defaults |
| P5-04 | Initial block set | planned | P5-02..P5-03 | paragraph, heading, list, quote, image, buttons, columns, group, cover, separator, spacer; each tested |
| P5-05 | Save/load contract | planned | P5-03 | WordPress-compatible block markup persisted; official parser v6 or documented port; unknown blocks preserved |
| P5-06 | Server renderer | planned | P5-05 | Core block renderers, sanitizer, URL validation, deterministic output; no browser-only imports |
| P5-07 | Round-trip/golden tests | planned | P5-05..P5-06 | Fixtures for nested/unknown/malformed blocks; byte/struct round trip; golden HTML; XSS payloads |
| P5-08 | Editor browser smoke test | planned | P5-02..P5-05 | Playwright: load, insert, edit, save, reload, persisted content; no console errors |
| P5-09 | Performance gate | planned | P5-08 | Bundle report; lazy-loaded editor route; documented acceptable size; no 4 GB heap requirement |

## Phase 6 — Media library

| ID | Task | Status | Depends on | Acceptance criteria |
| --- | --- | --- | --- | --- |
| P6-01 | Upload pipeline | planned | P3 | Size/MIME/extension checks, magic bytes, random name, storage abstraction; tests |
| P6-02 | Image processing | planned | P6-01 | Sharp re-encode, dimensions, thumbnails, EXIF strip; no SVG/GIF animation until reviewed |
| P6-03 | Media metadata + listing | planned | P6-01 | Alt/title/caption, dimensions, mime, size, uploader, dates; paginated list; usage lookup |
| P6-04 | Media chooser | planned | P6-03, P5 | Editor media modal; featured image; alt/caption editing; permission checks |
| P6-05 | Serving + cleanup | planned | P6-01 | Controlled serving, path traversal tests, orphan policy, delete rules; no executable content |

## Phase 7 — Public rendering

| ID | Task | Status | Depends on | Acceptance criteria |
| --- | --- | --- | --- | --- |
| P7-01 | Public API contract | planned | P3, P5 | Published-only posts/pages, rendered HTML + blocks + SEO; preview token separate; cache headers |
| P7-02 | Next.js app + theme contract | planned | P1, P7-01 | App Router; theme package selects templates; no Prisma/API internals imported |
| P7-03 | Routes and templates | planned | P7-02 | home, post, page, archive/taxonomy, search, 404; fallback chain; empty/error states |
| P7-04 | SEO metadata | planned | P7-01 | title/description/canonical/OG/Twitter; sitemap/robots; no duplicate canonical |
| P7-05 | Safe HTML rendering | planned | P5-06 | API-rendered HTML rendered without client re-sanitization gaps; CSP; XSS regression tests |
| P7-06 | Cache/revalidation | planned | P7-01 | Tag/path revalidation webhook with secret; preview no-store; documented cache policy |
| P7-07 | Starter theme | planned | P7-02..P7-05 | One accessible, responsive theme; tokens; header/footer/parts; no site-specific content |

## Phase 8 — Editorial reliability

| ID | Task | Status | Depends on | Acceptance criteria |
| --- | --- | --- | --- | --- |
| P8-01 | Revisions | planned | P3 | Immutable snapshots, list/diff/restore, retention; tests |
| P8-02 | Autosave | planned | P8-01 | Debounced autosave, conflict detection, recovery prompt; no lost edits |
| P8-03 | Preview permissions | planned | P2, P7 | Signed/short-lived preview tokens; draft-only; noindex; revoke/expire |
| P8-04 | Scheduled publish | planned | P3 | SCHEDULED status, due worker with `FOR UPDATE SKIP LOCKED`, retry/backoff, failure visibility |
| P8-05 | Conflict/recovery UX | planned | P8-02 | Clear conflict state, compare, overwrite/save-as-draft; tests |

## Phase 9 — Extension contracts

| ID | Task | Status | Depends on | Acceptance criteria |
| --- | --- | --- | --- | --- |
| P9-01 | Hook/filter bus | planned | P3 | Typed actions/filters, priority, async, error isolation; tests |
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

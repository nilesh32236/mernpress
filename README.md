# MERNPress

MERNPress is a Node.js/TypeScript content management system inspired by WordPress:
a familiar admin, a real Gutenberg block editor, a theme/template layer, and a
versioned plugin API. It is a **new, clean project**. The Qrolic CMS repositories
and the supplied WordPress source are reference material only; they are not part
of this repository and must not be modified.

The name is a project name, not a database mandate. MERNPress uses **PostgreSQL**.

## Current phase

**Phase 4 — the admin content UX is implemented locally and awaiting owner
review.** Phase 3 was accepted by the owner on 2026-10-27 and published as
`46bd5c1`. Phase 1 is approved; the Phase 2 authentication first slice still
awaits owner acceptance. Phase 4 adds the responsive admin shell, real dashboard
counts, posts/pages lists, create/edit forms using the Phase 3 API, lifecycle
actions, taxonomy assignment, accessible feedback and keyboard/responsive
coverage. The Phase 4 working tree is uncommitted and not CI-verified; Gutenberg
(Phase 5), media (Phase 6), public rendering/themes (Phase 7/10), revisions and
scheduling (Phase 8) and plugins (Phase 9) remain later phases.

## Quick start

Prerequisites: Node.js **24.22.1**, pnpm **12.15.0**, PostgreSQL **18.x**. Docker is
optional and not required.

```bash
nvm install 24.22.1
nvm use 24.22.1
npm install -g pnpm@12.15.0

pnpm install --frozen-lockfile
cp .env.example .env
# set DATABASE_URL, TEST_DATABASE_URL and AUTH_HASH_PEPPER in .env
# (see docs/operations/local-setup.md)

pnpm setup
pnpm auth:bootstrap   # create the first administrator (interactive)
pnpm dev
```

Open:

| Application | URL | Purpose |
| --- | --- | --- |
| API | http://127.0.0.1:4000/api/health | Liveness |
| API | http://127.0.0.1:4000/api/ready | Readiness (PostgreSQL check) |
| API | http://127.0.0.1:4000/api/auth/session | Current session (401 when anonymous) |
| Admin | http://127.0.0.1:5173 | React/Vite login/session shell |
| Public web | http://localhost:3000 | Next.js App Router placeholder |

No-sudo local database (uses the installed PostgreSQL binaries, no Docker):

```bash
pnpm db:local:init     # creates dev + test DBs and prints both URLs
pnpm db:local:start
pnpm db:local:stop
pnpm db:local:status
```

Full instructions, including a system PostgreSQL role/database path and
troubleshooting: [local setup](docs/operations/local-setup.md).

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Starts API, admin and web together via Turborepo |
| `pnpm build` | Generates Prisma client, builds database package, API, admin and web |
| `pnpm lint` | ESLint 10 with TypeScript and jsx-a11y rules |
| `pnpm format` / `pnpm format:check` | Prettier write/check for code and config |
| `pnpm typecheck` | Strict TypeScript across all packages/apps |
| `pnpm test` | Vitest unit/integration tests (needs the dedicated test PostgreSQL database) |
| `pnpm test:e2e` | Playwright auth, content, editor, terms and placeholder tests (test DB; `E2E_API_PORT` for an isolated API port) |
| `pnpm check:bundle` | Budget guard for the main admin bundle and the lazy editor chunk (run after `pnpm build`) |
| `pnpm auth:bootstrap` | Creates the first administrator; refuses if one exists |
| `pnpm dev:create-test-account` | Development-only, opt-in role account for manual acceptance (never administrator) |
| `pnpm db:generate` | Generates the Prisma client |
| `pnpm db:migrate` | Applies pending migrations and verifies connectivity |
| `pnpm db:seed` | Idempotent demo content (dev/test only; refuses production; never creates an administrator) |
| `pnpm db:migrate:test` / `pnpm db:reset:test` | Migrates/resets the dedicated test database |
| `pnpm db:verify` | Checks PostgreSQL connectivity, UTC session and `uuidv7()` |
| `pnpm setup` | Validates Node/pnpm, generates client, migrates, seeds |
| `pnpm db:local:*` | Optional loopback-only PostgreSQL cluster in `.local/` |

## What is implemented

- pnpm 12 workspace + Turborepo 2.11, exact version pins and a frozen lockfile.
- Node 24.22.1 pin (`.nvmrc`, `engines`) and pnpm 12.15.0 pin
  (`packageManager`).
- Strict shared TypeScript (`noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, NodeNext for server code, Bundler for apps).
- ESLint 10 + typescript-eslint + jsx-a11y + Prettier.
- Zod-validated API environment with actionable startup errors.
- Fastify 5 app factory, structured/redacted logging, request IDs, centralized
  error envelope, helmet security headers, explicit credentialed CORS, graceful
  shutdown.
- `GET /api/health` (liveness, never touches PostgreSQL) and `GET /api/ready`
  (real PostgreSQL check, 200/503).
- Prisma 7.10.1 + `@prisma/adapter-pg`, a UTC-pinned session, and a verified
  PostgreSQL 18 `uuidv7()`.
- React 19 + Vite 8 admin placeholder and Next.js 16 + Tailwind 4 public
  placeholder, both accessible and bootable.
- Argon2id administrator credentials, first-admin CLI, database-backed sessions,
  login/logout/current-session, CSRF/Origin checks with separate pre-auth and
  session-bound cookies, DB-backed login rate limiting with bounded retention and
  coalesced audit, request-ID validation, audit events and the minimum
  login/logout UI.
- Five roles (`administrator`, `editor`, `author`, `contributor`, `subscriber`)
  with a code-level capability map and object-level, server-enforced checks for
  content and taxonomy operations (P2-04, ADR 0004). User administration (P2-05)
  is not implemented.
- Phase 3 content model and API: unified posts/pages, draft/publish/trash/restore,
  optimistic versioning, slug normalization and history, categories/tags,
  admin CRUD/list/search/pagination, a published-only public read API, and an
  internal action/filter hook contract (ADR 0003).
- Content read visibility: authors and contributors cannot read another author's
  draft or trashed content (404); administrators/editors see all states; list rows
  and totals use the same predicate (ADR 0005).
- A development-only, opt-in role-account CLI for manual acceptance
  (`pnpm dev:create-test-account`); it refuses production, never creates an
  administrator, never overwrites an account, and prints a one-time password.
- An idempotent, dev/test-only demo seed that never creates an administrator and
  never overwrites existing content.
- Phase 4 admin content UX: responsive shell and navigation, real status counts
  from the content API, posts/pages lists with search/status filters and server
  pagination, create/edit forms with optimistic concurrency, lifecycle actions,
  category/tag assignment, accessible notices, unsaved-change guards and
  keyboard/responsive browser tests. Bulk multi-item actions remain deferred
  until the API supports them.
- Same-origin deployment contract: the admin calls relative `/api` URLs and is
  served with the API behind one HTTPS reverse proxy (Vite proxies `/api` in
  development). A separate-origin API client is not supported yet.
- Vitest unit/integration/security tests (auth, roles/capabilities, content,
  taxonomy, visibility, hooks), Playwright auth + placeholder smoke tests and a
  GitHub Actions pipeline with a PostgreSQL service.

## What is deliberately not implemented

Gutenberg editor (Phase 5), media library (Phase 6), public rendering and themes
(Phase 7), revisions/autosave/preview/scheduled publishing (Phase 8), plugin
runtime and SDK (Phase 9), and theme contracts (Phase 10) are not implemented.
User administration (P2-05), profile editing, password reset/email and MFA/SSO
remain deferred. Media upload and a featured-image picker are not present. Bulk
multi-item actions are deferred until the API provides bulk endpoints. There are
no fake buttons or unimplemented controls.

## Database behavior

There are four additive migrations:

1. `20261024201137_phase2_auth` — `users`, `sessions`, `audit_events`,
   `login_attempts`.
2. `20261025085158_auth_hardening` — the `login_attempts(attempted_at)` index.
3. `20261027120000_phase3_content_taxonomy` — `posts`, `post_slug_history`,
   `terms`, `post_terms`, status/check constraints and indexes.
4. `20261027130000_phase2_roles` — the additive five-role `UserRole` enum values.

- `pnpm db:migrate` runs `prisma migrate deploy` and verifies connectivity. On a
  fresh database it applies all four migrations.
- `pnpm db:seed` creates idempotent demo content (one post, one page, two
  categories, two tags) in development/test only. It refuses
  `NODE_ENV=production`, never creates an administrator and never overwrites
  existing content. The seed is not run automatically by `db:migrate`.
- Create the first administrator with `pnpm auth:bootstrap`. It is CLI-only,
  advisory-locked, refuses if any administrator exists, and never accepts a
  password in argv or logs it.
- `pnpm test` uses `TEST_DATABASE_URL` (a dedicated database whose name contains
  `test` or `e2e`) and truncates the auth and content tables between tests.
  Never point it at development data.
- PostgreSQL 18 is required because `db:verify` uses the built-in `uuidv7()`.
  The Prisma client also pins `-c timezone=UTC` per connection.

## Baseline stack

| Area | Choice | Version / note |
| --- | --- | --- |
| Runtime | Node.js Active LTS | **24.22.1** (Krypton) |
| Package manager | pnpm workspaces | **12.15.0** (Phase 1 re-evaluation) |
| Build orchestration | Turborepo | **2.11.10** |
| Language | TypeScript strict | **5.9.3** (TS 7 deferred; see ADR 0001) |
| API | Fastify | **5.12.7** |
| Database | PostgreSQL | **18.6** baseline; local 18.3 verified |
| ORM / migrations | Prisma | **7.10.1** pinned; do not use `latest` (8.0 RC) |
| Validation | Zod | **4.6.7** |
| Passwords | `@node-rs/argon2` | **2.2.2**, Argon2id 64 MiB / 3 passes / 1 lane |
| Admin | React + Vite | React **19.3.1**, Vite **8.3.5** |
| Editor | official `@wordpress/*` packages | Phase 5; not installed yet |
| Public frontend | Next.js App Router | **16.4.3**, React 19.3.1, Tailwind **4.3.3** |
| Unit/integration tests | Vitest | **5.0.5** |
| Browser tests | Playwright | **1.64.1** |
| Lint/format | ESLint + Prettier | ESLint **10.13.0**, typescript-eslint **8.72.0**, Prettier **3.9.10** |

The evidence, alternatives and rejected options are in
[stack comparison](docs/research/stack-comparison.md) and
[ADR 0001](docs/adr/0001-baseline-stack.md). Phase 1 amended pnpm 11 → 12 and
documented a tested `eslint-plugin-jsx-a11y` peer override for ESLint 10.

## Project layout

```text
apps/api        Fastify API, auth routes, env validation, health/readiness, DB client
apps/admin      React + Vite login/logout/session shell
apps/web        Next.js App Router public placeholder
packages/cms-core    Framework-agnostic auth, capabilities, content/taxonomy and hooks
packages/database    Prisma schema/config/client, migrations, DB/seed/test scripts
packages/block-system Block contracts, official parser adapter, structural validation
scripts         setup and optional local PostgreSQL helper
tests/e2e       Playwright smoke tests
docs            research, architecture, ADR, operations, testing, security
```

`packages/cms-core`, `packages/database` and `packages/block-system` now exist. `contracts`,
`block-system`, `plugin-sdk` and `theme-sdk` remain future packages until their
first real consumer exists, per the system overview.

## Testing and CI

Local gate:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

`pnpm test` expects the dedicated test PostgreSQL database. It covers API liveness,
readiness 200/503, environment validation, bootstrap, Argon2id, generic login
failures, token-hash storage, cookie flags, session expiry/revocation, disabled
users, CSRF/Origin, the pre-auth/session CSRF split and CSRF refresh regression,
rate limiting/recovery, bounded retention of one-off attempts, coalesced
rate-limit audit under a blocked burst, invalid usernames, oversized bodies,
request IDs and log redaction. It also covers the Phase 3 content lifecycle,
slug rules, taxonomy hierarchy/assignment, optimistic concurrency, published-only
public reads, the role x capability matrix, cross-author visibility, the hook
contract and the development-only role-account audit event. The current local
gate is **216 API + 47 admin + 1 web = 264 tests** plus 12 Playwright tests.
Playwright signs in, signs out, keyboard-submits, checks browser storage and
opens both placeholders without unexpected console/asset errors.

CI is configured in `.github/workflows/ci.yml` with an ephemeral PostgreSQL 18
service. Phase 1 passed in run `40127072446`; the Phase 2 auth slice passed in
run `40166039330` (commit `3f29e9f`); the auth hardening follow-up passed in run
`40180070433` (2m56s, commit `cd56d09`); the Phase 3 content commit `dd4ffc6`
passed in run `40468067008`; the roles/capabilities + dev CLI commit `0bf7754`
passed in run `40475649080`; the accepted Phase 3 hardening commit `46bd5c1`
passed in run `40507958602`. The earlier Turborepo `DATABASE_URL` filtering bug
is fixed via `globalEnv`. The current **uncommitted Phase 4** work is not
CI-verified; only the local gate above applies.

## Documentation

Start here, then follow the links.

| Document | Purpose |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Permanent instructions for AI agents and contributors |
| [TASKS.md](TASKS.md) | Staged backlog, statuses, dependencies and acceptance criteria |
| [DECISIONS.md](DECISIONS.md) | Decision index and links to ADRs |
| [docs/operations/local-setup.md](docs/operations/local-setup.md) | Prerequisites, PostgreSQL, env, commands and troubleshooting |
| [docs/operations/production-hosting.md](docs/operations/production-hosting.md) | DuckDNS + Caddy + systemd production hosting, current status and rollback |
| [docs/testing/phase-1-manual-test.md](docs/testing/phase-1-manual-test.md) | Owner's step-by-step Phase 1 acceptance checklist (approved) |
| [docs/testing/phase-2-manual-test.md](docs/testing/phase-2-manual-test.md) | Owner's step-by-step auth-slice acceptance checklist |
| [docs/testing/phase-3-manual-acceptance.md](docs/testing/phase-3-manual-acceptance.md) | Phase 3 acceptance evidence and reproducible checklist |
| [docs/testing/phase-5-manual-acceptance.md](docs/testing/phase-5-manual-acceptance.md) | Phase 5 editor acceptance checklist (canvas, save/publish, responsive, a11y) |
| [docs/phase-4-implementation-plan.md](docs/phase-4-implementation-plan.md) | Phase 4 goal, acceptance criteria, risks and completion checklist |
| [docs/implementation-log.md](docs/implementation-log.md) | Dated record of what was actually done and verified |
| [docs/design/capability-gap-matrix.md](docs/design/capability-gap-matrix.md) | Evidence-based capability inventory vs the reference CMS (complete/partial/missing/blocked with file paths) |
| [docs/research/reference-codebase-audit.md](docs/research/reference-codebase-audit.md) | What was inspected in WordPress and the reference archives |
| [docs/research/feature-matrix.md](docs/research/feature-matrix.md) | Feature comparison and MVP/next/later/out classification |
| [docs/research/wordpress-core-audit.md](docs/research/wordpress-core-audit.md) | WordPress 7.1.3 mechanisms worth emulating, adapting or avoiding |
| [docs/research/stack-comparison.md](docs/research/stack-comparison.md) | Versions, compatibility evidence, alternatives and trade-offs |
| [docs/research/opencode-tooling.md](docs/research/opencode-tooling.md) | OpenCode tooling history from Phase 0 |
| [docs/research/editor-model-benchmark-2026-10-28.md](docs/research/editor-model-benchmark-2026-10-28.md) | Three-model microbenchmark run during Phase 5 |
| [docs/research/seo-2026.md](docs/research/seo-2026.md) | 2026 SEO research, structured data, AI search/`llms.txt` and WordPress gaps |
| [docs/research/plugin-theme-roadmap.md](docs/research/plugin-theme-roadmap.md) | WordPress user complaints, plugin/theme opportunities and ranked next slices |
| [docs/architecture/plugin-runtime.md](docs/architecture/plugin-runtime.md) | Trusted local plugin package and hook contract for developers |
| [docs/architecture/theme-packages.md](docs/architecture/theme-packages.md) | Theme package manifest, tokens and layout variants |
| [docs/architecture/permalinks.md](docs/architecture/permalinks.md) | Shared permalink pattern rules, routing and resolver flow |\n| [docs/architecture/customizer.md](docs/architecture/customizer.md) | Appearance → Customize data, validation and rendering |\n| [docs/architecture/admin-color-schemes.md](docs/architecture/admin-color-schemes.md) | Per-user admin colour schemes: storage, caching and CSS variables |\n| [docs/architecture/spam-guard.md](docs/architecture/spam-guard.md) | Bundled comment spam guard: signals, thresholds and moderation flow |
| [docs/architecture/system-overview.md](docs/architecture/system-overview.md) | Components, boundaries, request/content flow and local runtime |
| [docs/architecture/code-standards.md](docs/architecture/code-standards.md) | Module boundaries, SOLID/DRY rules, error/logging, testing and scalability conventions |
| [docs/design/wordpress-admin-target.md](docs/design/wordpress-admin-target.md) | WordPress-style admin design target (tokens, shell contract, screen patterns, parity roadmap) |
| [docs/design/reference-cms-design-inventory.md](docs/design/reference-cms-design-inventory.md) | Design system extracted from the qrolichealth reference CMS |
| [docs/design/reference-cms-feature-matrix.md](docs/design/reference-cms-feature-matrix.md) | Feature/screen matrix of the reference CMS and MERNPress gap analysis |
| [docs/architecture/authentication.md](docs/architecture/authentication.md) | Phase 2 auth scope, schema, flows, CSRF, sessions, rate limiting and config |
| [docs/architecture/content-model.md](docs/architecture/content-model.md) | Entities, lifecycle, slugs, media, taxonomy, revisions and migrations |
| [docs/architecture/gutenberg-and-rendering.md](docs/architecture/gutenberg-and-rendering.md) | Content format, block registry, editor and renderer |
| [docs/architecture/plugins-and-themes.md](docs/architecture/plugins-and-themes.md) | Extension contracts and safety boundaries |
| [docs/adr/0001-baseline-stack.md](docs/adr/0001-baseline-stack.md) | Why this stack, what was rejected and what remains uncertain |
| [docs/adr/0002-authentication-foundation.md](docs/adr/0002-authentication-foundation.md) | Auth slice boundaries, Argon2id, sessions, CSRF, rate limiting and bootstrap |
| [docs/adr/0003-phase-3-content-and-taxonomy.md](docs/adr/0003-phase-3-content-and-taxonomy.md) | Phase 3 content model, slug/taxonomy scope, hooks and deferred fields |
| [docs/adr/0004-roles-and-capabilities.md](docs/adr/0004-roles-and-capabilities.md) | Five roles, code capability map and object-level content authorization |
| [docs/adr/0005-content-visibility-policy.md](docs/adr/0005-content-visibility-policy.md) | Admin content read visibility and the 403/404 mutation residual |
| [docs/adr/0006-gutenberg-editor-integration.md](docs/adr/0006-gutenberg-editor-integration.md) | Phase 5 block editor integration, package set, bundling, undo and validation |
| [docs/adr/0007-server-renderer-and-sanitizer.md](docs/adr/0007-server-renderer-and-sanitizer.md) | P5-06 server renderer, DOMPurify allowlist sanitization, deterministic output and failure modes |
| [docs/adr/0008-media-revisions-preview-scheduling.md](docs/adr/0008-media-revisions-preview-scheduling.md) | Media pipeline, revisions, preview tokens and first-publish scheduling designs |
| [docs/roadmap/roadmap.md](docs/roadmap/roadmap.md) | Phase-by-phase implementation order, gates and acceptance criteria |
| [docs/roadmap/mvp-definition.md](docs/roadmap/mvp-definition.md) | MVP scope, non-goals and definition of done |
| [docs/testing/strategy.md](docs/testing/strategy.md) | Unit, integration, E2E, migration, serialization, security and a11y testing |
| [docs/security/threat-model.md](docs/security/threat-model.md) | Assets, trust boundaries, threats, mitigations and residual risks |

## Licensing status

The MERNPress project licence is **not chosen yet**. Do not distribute the
project publicly until it is. The reference Qrolic repositories have **no root
LICENSE file and no `package.json` licence field**; treat them as
proprietary/unclear and do not copy their source. WordPress is GPLv2-or-later,
and the official `@wordpress/*` packages are GPL-2.0-or-later; a dependency and
licence review is required before shipping a Gutenberg-based distribution.
Details are in the
[reference audit](docs/research/reference-codebase-audit.md#9-licensing-observations).

## Next step

Phase 3 was accepted by the owner on 2026-10-27 and published as `46bd5c1`
(CI run `40507958602`). Phase 4 is implemented locally and awaits owner review;
its changes are uncommitted and not CI-verified. Do not commit, push or start
Phase 5 without explicit owner authorization. P2-05 user administration remains
deferred, as do the Phase 5–10 editor, media, rendering, reliability, plugin and
theme slices.

- [WordPress 7.1.4 parity matrix](docs/verification/wordpress-parity-matrix.md) — screen-by-screen status.

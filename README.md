# MERNPress

MERNPress is a Node.js/TypeScript content management system inspired by WordPress:
a familiar admin, a real Gutenberg block editor, a theme/template layer, and a
versioned plugin API. It is a **new, clean project**. The Qrolic CMS repositories
and the supplied WordPress source are reference material only; they are not part
of this repository and must not be modified.

The name is a project name, not a database mandate. MERNPress uses **PostgreSQL**.

## Current phase

**Phase 1 — Repository foundation: implemented and verified locally and in CI,
pending the owner's manual acceptance test.**

There is a bootable API, admin SPA and public Next.js placeholder, plus the
database/tooling foundation. There is **no CMS feature yet**: no authentication,
users, posts/pages, editor, media, taxonomy, themes or plugin runtime. Phase 2 is
secure admin authentication and starts only after Phase 1 approval.

## Quick start

Prerequisites: Node.js **24.22.1**, pnpm **12.15.0**, PostgreSQL **18.x**. Docker is
optional and not required.

```bash
nvm install 24.22.1
nvm use 24.22.1
npm install -g pnpm@12.15.0

pnpm install --frozen-lockfile
cp .env.example .env
# set DATABASE_URL in .env (see docs/operations/local-setup.md)

pnpm setup
pnpm dev
```

Open:

| Application | URL | Purpose |
| --- | --- | --- |
| API | http://127.0.0.1:4000/api/health | Liveness |
| API | http://127.0.0.1:4000/api/ready | Readiness (PostgreSQL check) |
| Admin | http://127.0.0.1:5173 | React/Vite placeholder |
| Public web | http://localhost:3000 | Next.js App Router placeholder |

No-sudo local database (uses the installed PostgreSQL binaries, no Docker):

```bash
pnpm db:local:init     # prints the DATABASE_URL to put in .env
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
| `pnpm test` | Vitest unit/integration tests (needs PostgreSQL) |
| `pnpm test:e2e` | Playwright smoke test for admin, web and API liveness |
| `pnpm db:generate` | Generates the Prisma client |
| `pnpm db:migrate` | Applies migrations (currently zero) and verifies connectivity |
| `pnpm db:seed` | Idempotent Phase 1 no-op; creates no CMS data |
| `pnpm db:verify` | Checks PostgreSQL connectivity, UTC session and `uuidv7()` |
| `pnpm setup` | Validates Node/pnpm, generates client, migrates, seeds |
| `pnpm db:local:*` | Optional loopback-only PostgreSQL cluster in `.local/` |

## What Phase 1 actually implements

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
- Vitest tests, Playwright smoke tests and a GitHub Actions pipeline with a
  PostgreSQL service.

## What Phase 1 deliberately does not implement

No authentication, sessions, CSRF, users, roles, posts/pages, content API,
Gutenberg editor, media, taxonomy, themes, plugins, dashboards or fake buttons.
The placeholders link only to real endpoints and are marked as foundation pages.

## Database behavior in Phase 1

The Prisma schema is intentionally **empty** (datasource and generator only).
There is no initial migration.

- `pnpm db:migrate` runs `prisma migrate deploy`. It reports no migration files
  and no pending migrations, then verifies connectivity. On a fresh database,
  Prisma creates only its own `_prisma_migrations` ledger table.
- `pnpm db:seed` connects, verifies the UTC session and prints an explicit
  no-op message. It creates no users, content, terms, media or settings. It is
  deterministic and idempotent.
- The first migration and first seed data belong to Phase 2 auth. No empty
  migration or fake CMS rows were added just to make the commands look busy.
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
| Admin | React + Vite | React **19.3.1**, Vite **8.3.5** |
| Editor | official `@wordpress/*` packages | Phase 5; not installed in Phase 1 |
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
apps/api        Fastify API, env validation, health/readiness, DB client
apps/admin      React + Vite admin placeholder
apps/web        Next.js App Router public placeholder
packages/database  Prisma schema/config/client, DB/seed/verify scripts
scripts         setup and optional local PostgreSQL helper
tests/e2e       Playwright smoke tests
docs            research, architecture, ADR, operations, testing, security
```

Only `packages/database` exists in Phase 1. `contracts`, `cms-core`,
`block-system`, `plugin-sdk` and `theme-sdk` are created when their first real
consumer exists, per the system overview.

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

`pnpm test` expects a reachable PostgreSQL. It covers API liveness, readiness
200 with the database, readiness 503 without it while liveness stays 200, the
404 error envelope and environment validation. Admin and web have minimal
render tests. Playwright opens both placeholders and fails on console errors or
failed document/script/stylesheet requests.

CI is configured in `.github/workflows/ci.yml` with an ephemeral PostgreSQL 18
service and **passes on GitHub Actions** (run `40127072446`, 2026-10-25). The
first run exposed a Turborepo environment-filtering bug: `DATABASE_URL` was not
passed into package tasks. It is now declared in `turbo.json` `globalEnv`, and
the re-run is green.

## Documentation

Start here, then follow the links.

| Document | Purpose |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Permanent instructions for AI agents and contributors |
| [TASKS.md](TASKS.md) | Staged backlog, statuses, dependencies and acceptance criteria |
| [DECISIONS.md](DECISIONS.md) | Decision index and links to ADRs |
| [docs/operations/local-setup.md](docs/operations/local-setup.md) | Prerequisites, PostgreSQL, env, commands and troubleshooting |
| [docs/testing/phase-1-manual-test.md](docs/testing/phase-1-manual-test.md) | Owner's step-by-step Phase 1 acceptance checklist |
| [docs/implementation-log.md](docs/implementation-log.md) | Dated record of what was actually done and verified |
| [docs/research/reference-codebase-audit.md](docs/research/reference-codebase-audit.md) | What was inspected in WordPress and the reference archives |
| [docs/research/feature-matrix.md](docs/research/feature-matrix.md) | Feature comparison and MVP/next/later/out classification |
| [docs/research/wordpress-core-audit.md](docs/research/wordpress-core-audit.md) | WordPress 7.1.3 mechanisms worth emulating, adapting or avoiding |
| [docs/research/stack-comparison.md](docs/research/stack-comparison.md) | Versions, compatibility evidence, alternatives and trade-offs |
| [docs/research/opencode-tooling.md](docs/research/opencode-tooling.md) | OpenCode tooling history from Phase 0 |
| [docs/architecture/system-overview.md](docs/architecture/system-overview.md) | Components, boundaries, request/content flow and local runtime |
| [docs/architecture/content-model.md](docs/architecture/content-model.md) | Entities, lifecycle, slugs, media, taxonomy, revisions and migrations |
| [docs/architecture/gutenberg-and-rendering.md](docs/architecture/gutenberg-and-rendering.md) | Content format, block registry, editor and renderer |
| [docs/architecture/plugins-and-themes.md](docs/architecture/plugins-and-themes.md) | Extension contracts and safety boundaries |
| [docs/adr/0001-baseline-stack.md](docs/adr/0001-baseline-stack.md) | Why this stack, what was rejected and what remains uncertain |
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

Owner manually tests the Phase 1 checklist. If approved, implement only
**Phase 2 — secure admin authentication**: first-admin bootstrap, Argon2id,
opaque hashed sessions, cookie flags, CSRF, login rate limiting, roles and
object-level capabilities, and the login/logout/profile UI. No other refactor
comes first.

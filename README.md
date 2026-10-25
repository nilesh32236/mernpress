# MERNPress

MERNPress is a Node.js/TypeScript content management system inspired by WordPress:
a familiar admin, a real Gutenberg block editor, a theme/template layer, and a
versioned plugin API. It is a **new, clean project**. The Qrolic CMS repositories
and the supplied WordPress source are reference material only; they are not part
of this repository and must not be modified.

The name is a project name, not a database mandate. MERNPress uses **PostgreSQL**.

## Current phase

**Phase 2 — the first authentication slice is implemented with post-review
hardening, CI-green; owner manual acceptance pending.** Phase 1 foundation and
CI are complete. This slice adds a
single administrator, Argon2id credentials, database-backed sessions,
login/logout/current-session, CSRF/Origin protection, login rate limiting and a
minimum accessible login UI. There is still **no content/CMS feature**: no
posts/pages, editor, media, taxonomy, themes or plugin runtime. Roles,
capabilities, user administration, password reset/email and MFA remain deferred.

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
| `pnpm test` | Vitest unit/integration tests (needs dev + test PostgreSQL) |
| `pnpm test:e2e` | Playwright login/logout and placeholder smoke tests (test DB) |
| `pnpm auth:bootstrap` | Creates the first administrator; refuses if one exists |
| `pnpm db:generate` | Generates the Prisma client |
| `pnpm db:migrate` | Applies the auth migration and verifies connectivity |
| `pnpm db:seed` | Idempotent no-op; creates no administrator or CMS data |
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
- Same-origin deployment contract: the admin calls relative `/api` URLs and is
  served with the API behind one HTTPS reverse proxy (Vite proxies `/api` in
  development). A separate-origin API client is not supported yet.
- Vitest unit/integration/security tests, Playwright auth + placeholder smoke tests
  and a GitHub Actions pipeline with a PostgreSQL service.

## What is deliberately not implemented

No editor/author roles or capability matrix, user administration, profile editing,
password reset/email, MFA/SSO, posts/pages, content API, Gutenberg editor, media,
taxonomy, themes, plugins, dashboards or fake buttons. The public web app remains
a Phase 1 placeholder; the admin has only login/logout/session UI.

## Database behavior

Phase 2 adds two additive migrations: the initial auth schema (`users`,
`sessions`, `audit_events`, `login_attempts`) and the
`login_attempts(attempted_at)` hardening index.

- `pnpm db:migrate` runs `prisma migrate deploy` and verifies connectivity. On a
  fresh database it applies the auth migration and creates only those auth
  tables plus Prisma's `_prisma_migrations` ledger.
- `pnpm db:seed` connects, verifies the UTC session and prints an explicit
  no-op message. It creates no administrator, content, terms, media or settings.
- Create the first administrator with `pnpm auth:bootstrap`. It is CLI-only,
  advisory-locked, refuses if any administrator exists, and never accepts a
  password in argv or logs it.
- `pnpm test` uses `TEST_DATABASE_URL` (a dedicated database whose name contains
  `test` or `e2e`) and truncates only auth tables between tests. Never point it
  at development data.
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
packages/cms-core  Framework-agnostic auth domain (passwords, tokens, sessions, rate limit)
packages/database  Prisma schema/config/client, migrations, DB/seed/test scripts
scripts         setup and optional local PostgreSQL helper
tests/e2e       Playwright smoke tests
docs            research, architecture, ADR, operations, testing, security
```

`packages/cms-core` and `packages/database` now exist. `contracts`,
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
request IDs, log redaction, admin UI states and web placeholder rendering.
Playwright signs in, signs out, keyboard-submits, checks browser storage and
opens both placeholders without unexpected console/asset errors.

CI is configured in `.github/workflows/ci.yml` with an ephemeral PostgreSQL 18
service. Phase 1 passed in run `40127072446`; the Phase 2 auth slice passed in
run `40166039330` (2m17s, commit `3f29e9f`). The earlier Turborepo
`DATABASE_URL` filtering bug is fixed via `globalEnv`.

## Documentation

Start here, then follow the links.

| Document | Purpose |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Permanent instructions for AI agents and contributors |
| [TASKS.md](TASKS.md) | Staged backlog, statuses, dependencies and acceptance criteria |
| [DECISIONS.md](DECISIONS.md) | Decision index and links to ADRs |
| [docs/operations/local-setup.md](docs/operations/local-setup.md) | Prerequisites, PostgreSQL, env, commands and troubleshooting |
| [docs/testing/phase-1-manual-test.md](docs/testing/phase-1-manual-test.md) | Owner's step-by-step Phase 1 acceptance checklist |
| [docs/testing/phase-2-manual-test.md](docs/testing/phase-2-manual-test.md) | Owner's step-by-step auth-slice acceptance checklist |
| [docs/implementation-log.md](docs/implementation-log.md) | Dated record of what was actually done and verified |
| [docs/research/reference-codebase-audit.md](docs/research/reference-codebase-audit.md) | What was inspected in WordPress and the reference archives |
| [docs/research/feature-matrix.md](docs/research/feature-matrix.md) | Feature comparison and MVP/next/later/out classification |
| [docs/research/wordpress-core-audit.md](docs/research/wordpress-core-audit.md) | WordPress 7.1.3 mechanisms worth emulating, adapting or avoiding |
| [docs/research/stack-comparison.md](docs/research/stack-comparison.md) | Versions, compatibility evidence, alternatives and trade-offs |
| [docs/research/opencode-tooling.md](docs/research/opencode-tooling.md) | OpenCode tooling history from Phase 0 |
| [docs/architecture/system-overview.md](docs/architecture/system-overview.md) | Components, boundaries, request/content flow and local runtime |
| [docs/architecture/code-standards.md](docs/architecture/code-standards.md) | Module boundaries, SOLID/DRY rules, error/logging, testing and scalability conventions |
| [docs/architecture/authentication.md](docs/architecture/authentication.md) | Phase 2 auth scope, schema, flows, CSRF, sessions, rate limiting and config |
| [docs/architecture/content-model.md](docs/architecture/content-model.md) | Entities, lifecycle, slugs, media, taxonomy, revisions and migrations |
| [docs/architecture/gutenberg-and-rendering.md](docs/architecture/gutenberg-and-rendering.md) | Content format, block registry, editor and renderer |
| [docs/architecture/plugins-and-themes.md](docs/architecture/plugins-and-themes.md) | Extension contracts and safety boundaries |
| [docs/adr/0001-baseline-stack.md](docs/adr/0001-baseline-stack.md) | Why this stack, what was rejected and what remains uncertain |
| [docs/adr/0002-authentication-foundation.md](docs/adr/0002-authentication-foundation.md) | Auth slice boundaries, Argon2id, sessions, CSRF, rate limiting and bootstrap |
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

Owner manually tests the Phase 2 auth checklist. If approved, complete the
remaining Phase 2 work as the next single slice: roles/capabilities and user
administration (including last-administrator protection), then profile/password
management. No Phase 3 content work starts before that. No other refactor
comes first.

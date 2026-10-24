# Local setup

Status: Phase 1 implementation. This page is the supported local path; Docker is
optional and not required.

## 1. Prerequisites

| Tool | Version | Check |
| --- | --- | --- |
| Node.js | 24.22.1 LTS | `node --version` |
| pnpm | 12.15.0 | `pnpm --version` |
| PostgreSQL | 18.x (18.3 verified locally, 18.6 baseline) | `psql --version` |

The repository pins Node in `.nvmrc` and pnpm in `package.json#packageManager`.
Do not run the foundation checks on Node 22 and call them verified.

```bash
nvm install 24.22.1
nvm use 24.22.1
npm install -g pnpm@12.15.0
```

`pnpm install` uses the checked-in `pnpm-lock.yaml`. Use
`pnpm install --frozen-lockfile` in CI or when reproducing a clean clone.

## 2. Create PostgreSQL

Choose one path.

### Option A — system PostgreSQL (recommended when you have admin access)

Create a local role and database. Use a unique local password; never reuse a
production credential.

```bash
sudo -u postgres psql -c "CREATE ROLE mernpress LOGIN PASSWORD 'replace-me';"
sudo -u postgres createdb -O mernpress mernpress_dev
```

Then set:

```dotenv
DATABASE_URL=postgresql://mernpress:replace-me@127.0.0.1:5432/mernpress_dev
```

### Option B — project-local cluster (no sudo, no Docker)

This uses the installed PostgreSQL binaries and creates a loopback-only cluster
under the gitignored `.local/` directory on port `55432`.

```bash
pnpm db:local:init
pnpm db:local:status
```

The command prints the URL to use:

```dotenv
DATABASE_URL=postgresql://mernpress@127.0.0.1:55432/mernpress_dev
```

Stop it with `pnpm db:local:stop`; start it again with `pnpm db:local:start`.
The local cluster uses trust authentication on `127.0.0.1` only. It is a
development convenience, not a production database.

## 3. Configure the environment

```bash
cp .env.example .env
# edit .env and replace DATABASE_URL with the value from step 2
```

`.env` is ignored by git. Only placeholders belong in `.env.example`. The API
validates the environment at startup and fails with an actionable message when a
required value is missing or malformed. `CORS_ORIGINS` must be an explicit
comma-separated list; wildcards are rejected because credentialed CORS is
enabled.

## 4. Install and initialize

```bash
pnpm install --frozen-lockfile
pnpm setup
```

`pnpm setup` checks Node/pnpm, refuses the placeholder `change-me` password,
generates the Prisma client, applies migrations, and runs the idempotent seed.

### What the database commands actually do in Phase 1

Phase 1 deliberately has **no domain models**. The Prisma schema contains only
the PostgreSQL datasource and the `prisma-client` generator.

- `pnpm db:generate` generates the typed Prisma client into
  `packages/database/src/generated/prisma` (gitignored).
- `pnpm db:migrate` runs `prisma migrate deploy`. There are zero migration files,
  so it applies nothing and exits successfully. On a brand-new database Prisma
  creates only its own `_prisma_migrations` ledger table. No CMS tables exist.
- `pnpm db:seed` connects, verifies the UTC session, prints an explicit message,
  and exits 0. It creates no users, posts, pages, terms, media or settings.
  Re-running it is safe and produces the same result.
- `pnpm db:verify` checks the connection, the UTC session timezone and
  PostgreSQL 18's `uuidv7()`.

The first real migration and the first seed data arrive in Phase 2 with the
authentication models. Do not add an empty migration or fake CMS rows to make
these commands look busier.

## 5. Run

```bash
pnpm dev
```

| Application | URL | Notes |
| --- | --- | --- |
| API | http://127.0.0.1:4000 | `/api/health`, `/api/ready` |
| Admin | http://127.0.0.1:5173 | Vite dev server; proxies `/api` to 4000 |
| Public web | http://127.0.0.1:3000 | Next.js App Router |

Each app can also be started alone:

```bash
pnpm --filter @mernpress/api dev
pnpm --filter @mernpress/admin dev
pnpm --filter @mernpress/web dev
```

## 6. Verify

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

The Playwright suite needs a browser once:

```bash
pnpm exec playwright install chromium
```

`pnpm test` includes a database readiness test, so PostgreSQL must be running.
The readiness test also verifies the 503 path against an unreachable database.

## 7. CI

`.github/workflows/ci.yml` runs install, lint, format check, typecheck, tests,
migrations, seed, build, Playwright and `pnpm audit --audit-level=high` against
an ephemeral PostgreSQL 18 service. CI is configured but was not executed from
this machine; see the implementation log for that limitation.

## Troubleshooting

### `ERR_PNPM_IGNORED_BUILDS`

pnpm 12 blocks dependency build scripts unless they are explicitly allowed.
This repository allows only Prisma, esbuild and the Tailwind native package in
`pnpm-workspace.yaml`. Do not use `--force`, `--legacy-peer-deps` or
`dangerouslyAllowAllBuilds` to get past an unexpected package: review the
package and add a narrow `allowBuilds` entry only when justified.

### `Invalid environment configuration: DATABASE_URL is required`

There is no `.env`, or `DATABASE_URL` is empty. Copy `.env.example` to `.env`
and set a working PostgreSQL URL.

### `password authentication failed` or `ECONNREFUSED`

Check the role, password, host and port in `DATABASE_URL`. With the project-local
cluster, run `pnpm db:local:status`; with a system server, run `pg_isready`.
PostgreSQL must be reachable before `pnpm test`, `pnpm db:migrate` or
`pnpm db:seed`.

### Port already in use

The apps use strict ports: API `4000`, admin `5173`, web `3000`. Stop the old
process (for example `lsof -i :4000`) instead of changing the documented ports.

### Playwright says the browser is missing

```bash
pnpm exec playwright install chromium
```

### `uuidv7() does not exist`

The database is older than PostgreSQL 18. MERNPress requires PostgreSQL 18; do
not substitute a random UUIDv4 and call the check passed.

# Local setup

Status: phased implementation through Phase 8 (content, editor, media, public
site with SEO, archives/search) is in the source and released; see `TASKS.md` and
`README.md` for the current phase. This page is the supported local path; Docker
is optional and not required.

## 1. Prerequisites

| Tool | Version | Check |
| --- | --- | --- |
| Node.js | 24.22.1 LTS | `node --version` |
| pnpm | 12.15.0 | `pnpm --version` |
| PostgreSQL | 18.x (18.3 verified locally, 18.6 baseline) | `psql --version` |

The repository pins Node in `.nvmrc` and pnpm in `package.json#packageManager`.
Do not run the foundation checks on Node 22 and call them verified.

Use whichever Node version manager is installed. If neither is present, install
Node 24.22.1 by your OS package manager or from nodejs.org first.

```bash
# nvm (if installed)
nvm install 24.22.1 && nvm use 24.22.1
# fnm (if installed) — equivalent commands
fnm install 24.22.1 && fnm use 24.22.1
# fnm users can also rely on the committed .nvmrc:  fnm use
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
sudo -u postgres createdb -O mernpress mernpress_test
```

Then set:

```dotenv
DATABASE_URL=postgresql://mernpress:replace-me@127.0.0.1:5432/mernpress_dev
TEST_DATABASE_URL=postgresql://mernpress:replace-me@127.0.0.1:5432/mernpress_test
```

### Option B — project-local cluster (no sudo, no Docker)

This uses the installed PostgreSQL binaries and creates a loopback-only cluster
under the gitignored `.local/` directory. The default port is `55432`; set
`MERNPRESS_LOCAL_DB_PORT` if that port is taken (the printed URLs show the port
actually in use).

```bash
pnpm db:local:init
pnpm db:local:status
```

The command creates both databases and prints the URLs to use:

```dotenv
DATABASE_URL=postgresql://mernpress@127.0.0.1:55432/mernpress_dev
TEST_DATABASE_URL=postgresql://mernpress@127.0.0.1:55432/mernpress_test
```

Stop it with `pnpm db:local:stop`; start it again with `pnpm db:local:start`.
The local cluster uses trust authentication on `127.0.0.1` only. It is a
development convenience, not a production database.

## 3. Configure the environment

```bash
cp .env.example .env
# edit .env: DATABASE_URL and TEST_DATABASE_URL from step 2,
# and AUTH_HASH_PEPPER (a long random local value; never commit it)
```

`.env` is ignored by git. Only placeholders belong in `.env.example`. The API
validates the environment at startup and fails with an actionable message when a
required value is missing or malformed. `CORS_ORIGINS` must be an explicit
comma-separated list; wildcards are rejected because credentialed CORS is
enabled. **`NODE_ENV` is required even in development** — set
`NODE_ENV=development` in `.env` or a plain `pnpm dev` fails at startup with
`Invalid environment configuration`. `AUTH_HASH_PEPPER` and `CORS_ORIGINS` have
development fallbacks but should be set explicitly. Production also requires explicit non-loopback
HTTPS origins and a real `AUTH_HASH_PEPPER`; a partial production environment
fails closed.

## 4. Install and initialize

```bash
pnpm install --frozen-lockfile
pnpm setup
```

`pnpm setup` checks Node/pnpm, refuses the placeholder `change-me` password,
generates the Prisma client, applies migrations, and runs the idempotent seed.
Create the first administrator separately:

```bash
pnpm auth:bootstrap
```

The bootstrap is a no-echo TTY prompt. For automation outside production only,
`MERNPRESS_ADMIN_PASSWORD` may be set. Re-running bootstrap is refused once an
administrator exists.

### What the database commands actually do

Nine forward-only additive migrations exist: auth (`users`, `sessions`,
`audit_events`, `login_attempts`), the rate-limit index, content/taxonomy
(`posts`, `post_slug_history`, `terms`, `post_terms`), the roles enum, options,
media/revisions/preview/scheduling, revision kind, featured media and user
name/email. An applied migration is never edited.

- `pnpm db:generate` generates the typed Prisma client into
  `packages/database/src/generated/prisma` (gitignored).
- `pnpm db:migrate` runs `prisma migrate deploy`, applies **all** migrations on a
  fresh database, and verifies connectivity (UTC session + `uuidv7()`).
- `pnpm db:seed` connects, verifies the UTC session and inserts idempotent demo
  content (one post, one page, two categories, two tags) in development/test
  only. It refuses production, never creates an administrator and never
  overwrites existing content; re-running is safe.
- `pnpm db:verify` checks the connection, the UTC session timezone and
  PostgreSQL 18's `uuidv7()`.
- `pnpm auth:bootstrap` creates exactly one administrator. It is not a seed and
  not a public endpoint.
- `pnpm db:migrate:test` / `pnpm db:reset:test` migrate or truncate only the
  dedicated test database. **Destructive:** `reset:test` truncates every test
  table; it refuses a database name without `test`/`e2e`, but always confirm
  `TEST_DATABASE_URL` before running it. `pnpm test:e2e` invokes the reset.

## 5. Run

```bash
pnpm dev
```

| Application | URL | Notes |
| --- | --- | --- |
| API | http://127.0.0.1:4000 | `/api/health`, `/api/ready` |
| Admin | http://127.0.0.1:5173 | Vite login/logout shell; proxies `/api` to 4000 |
| API auth | http://127.0.0.1:4000/api/auth/* | Pre-auth CSRF, login, logout and current session |
| Public web | http://127.0.0.1:3000 | Next.js App Router |

The supported topology is **same-origin**: the admin page and `/api` share one
browser origin. In development Vite proxies `/api` to port 4000. In production an
HTTPS reverse proxy must serve the admin build and route `/api` to the API on the
same origin. The admin client intentionally uses relative `/api/...` URLs and
reads the path-`/` `mernpress_csrf` cookie; a separate-origin API deployment is
not supported or tested.

Cookies in the browser:

| Cookie | Purpose | Path | Readable by JS |
| --- | --- | --- | --- |
| `mernpress_session` | opaque session | `/api` | no (HttpOnly) |
| `mernpress_csrf` | session-bound logout CSRF | `/` | yes |
| `mernpress_csrf_preauth` | login double-submit (10 min) | `/` | yes |

Behind a proxy, set `TRUST_PROXY=true` only when it correctly supplies the client
address; otherwise rate limiting keys the proxy address. Keep `CORS_ORIGINS` set
to the browser origin even though the admin is same-origin, because mutating
requests are checked against it.

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

`pnpm test` uses the dedicated `TEST_DATABASE_URL` and truncates only auth tables;
never point it at development data. It covers bootstrap, Argon2id, generic login
failures, sessions, cookies, CSRF/Origin, pre-auth vs session CSRF separation,
rate limits with bounded retention and coalesced audit, oversized bodies,
request IDs and log redaction. The Phase 5 suite adds block-parser/limit tests
(`packages/block-system`), API block-content validation tests and admin
serializer tests. `pnpm test:e2e` also uses the test database, resets it, and
starts fresh servers on ports 4000/5173/3000; stop `pnpm dev` first because the
E2E web servers do not reuse existing processes.

When another service owns API port 4000 (for example the production service),
run the browser suite against an isolated API port:

```bash
E2E_API_PORT=4100 pnpm test:e2e
```

Playwright starts the API on 4100, points the Vite proxy at it, and still resets
only `TEST_DATABASE_URL`. Never stop a production service to free a port, and
never point E2E at the production database. The editor spec also runs at
375×812 and asserts no horizontal overflow.

## 7. CI

`.github/workflows/ci.yml` runs install, lint, format check, typecheck, tests,
migrations, seed, build, Playwright and `pnpm audit --audit-level=high` against
an ephemeral PostgreSQL 18 service. Phase 1 passed in run `40127072446`; the
Phase 2 auth slice passed in run `40166039330` (commit `3f29e9f`); the hardening
follow-up passed in run `40180070433` (commit `cd56d09`). The earlier Turborepo
`DATABASE_URL` filtering issue is fixed via `globalEnv`.

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

### `TEST_DATABASE_URL is required` / test database missing

Create `mernpress_test` (the project-local helper creates it) and set
`TEST_DATABASE_URL`. Then run `pnpm db:migrate:test`. API/E2E tests refuse to run
without a database whose name contains `test` or `e2e`.

### `AUTH_HASH_PEPPER must be set to a real secret in production`

Set a long random value in the server environment. It keys audit/rate-limit
HMACs; changing it makes old HMAC identifiers non-comparable. Never commit it.

### `An administrator already exists`

Bootstrap is intentionally one-shot. Use the existing administrator; there is no
public reset flow in this slice. Do not delete the only admin row to bypass it.

### Every login returns 429

Wait for `LOGIN_RATE_LIMIT_WINDOW_MINUTES` (default 15) or, only in the test
database, reset the dedicated DB. Do not disable the limiter to bypass it.

### `password authentication failed` or `ECONNREFUSED`

Check the role, password, host and port in `DATABASE_URL`. With the project-local
cluster, run `pnpm db:local:status`; with a system server, run `pg_isready`.
PostgreSQL must be reachable before `pnpm test`, `pnpm db:migrate` or
`pnpm db:seed`.

### Port already in use

The apps use strict ports: API `4000`, admin `5173`, web `3000`. Stop your own
stale dev process (for example `lsof -i :4000`) instead of changing the
documented ports. If the port is owned by a production service you must not
touch, use `E2E_API_PORT=4100` as described above. `pnpm test:e2e` deliberately
refuses to reuse an existing server so it cannot accidentally test the
development database.

### Playwright says the browser is missing

```bash
pnpm exec playwright install chromium
```

### `uuidv7() does not exist`

The database is older than PostgreSQL 18. MERNPress requires PostgreSQL 18; do
not substitute a random UUIDv4 and call the check passed.

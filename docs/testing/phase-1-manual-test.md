# Phase 1 manual test guide

Use this checklist after reading [local setup](../operations/local-setup.md).
Phase 1 is infrastructure only. You should not find a login form, dashboard,
post/page editor, media library, theme or plugin feature.

Record the date, OS, Node/pnpm/PostgreSQL versions and any failure output.

## A. Clean start

1. Confirm the expected runtime:

   ```bash
   node --version    # v24.22.1
   pnpm --version    # 12.15.0
   psql --version    # PostgreSQL 18.x
   ```

2. Confirm the repository is clean and only expected files are present:

   ```bash
   git status --short
   ```

   `.env`, `.local/`, `node_modules/`, `dist/`, `.next/` and generated Prisma
   code must not be tracked.

3. Install exactly from the lockfile:

   ```bash
   pnpm install --frozen-lockfile
   ```

   Expected: success without peer-dependency errors or ignored-build errors.

4. Start PostgreSQL:

   ```bash
   pnpm db:local:start
   pnpm db:local:status
   ```

   Or use your system server and confirm `pg_isready`.

## B. Environment and database

1. Ensure `.env` exists and does not contain `change-me`:

   ```bash
   cp .env.example .env   # only if .env is missing
   ```

2. Run the setup path:

   ```bash
   pnpm setup
   ```

   Expected:
   - Prisma client generated.
   - `migrate deploy` reports no migration files / no pending migrations.
   - `db:seed` prints the Phase 1 no-op message.
   - No user, post, page, term or media row is created.

3. Repeat the seed to prove idempotency:

   ```bash
   pnpm db:seed
   ```

   Expected: the same no-op message, exit code 0.

4. Inspect the database:

   ```bash
   psql "$DATABASE_URL" -c '\dt'
   ```

   Expected: only `_prisma_migrations` exists in Phase 1. There are no CMS
   tables. (The ledger table is Prisma bookkeeping, not product data.)

5. Check timezone and UUIDv7:

   ```bash
   pnpm db:verify
   ```

   Expected: `timezone=UTC`, and the printed UUID has `7` as its version
   character.

## C. Applications and health

1. Start everything:

   ```bash
   pnpm dev
   ```

   Expected: API `4000`, admin `5173`, web `3000`.

2. Open http://127.0.0.1:4000/api/health.

   Expected: HTTP 200 and
   `{"status":"ok","service":"mernpress-api",...}`.
   This endpoint must not need PostgreSQL.

3. Open http://127.0.0.1:4000/api/ready.

   Expected with PostgreSQL running: HTTP 200 and
   `{"status":"ready","checks":{"database":"ok"}}`.

4. Open http://127.0.0.1:5173.

   Expected: an accessible “MERNPress admin” placeholder. The skip link works
   with the keyboard. There is no login form and no content control.

5. Open http://localhost:3000.

   Expected: the public MERNPress placeholder with links to the admin and API
   health endpoint. No CMS content is rendered.

6. Check the browser console and network panel on both pages.

   Expected: no console errors and no failed document/script/stylesheet
   requests.

## D. Failure path: database down

1. Leave `pnpm dev` running.
2. Stop PostgreSQL:

   ```bash
   pnpm db:local:stop
   ```

3. Request readiness again:

   ```bash
   curl -i http://127.0.0.1:4000/api/ready
   ```

   Expected: HTTP 503,
   `{"status":"not_ready","checks":{"database":"unavailable"}}`.

4. Request liveness:

   ```bash
   curl -i http://127.0.0.1:4000/api/health
   ```

   Expected: HTTP 200. The API process must still be alive.

5. Restart PostgreSQL:

   ```bash
   pnpm db:local:start
   ```

6. Request readiness again.

   Expected: HTTP 200. The API recovers without a restart.

## E. Automated checks

Run each command and record the exit code:

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Expected:
- Lint/format/typecheck pass.
- API: health, 404 envelope, environment validation and readiness (200 and 503)
  tests pass.
- Admin: placeholder and no-fake-controls tests pass.
- Web: placeholder render test passes.
- Production builds succeed for API, admin and web.
- Playwright opens both placeholders without console/asset errors and checks API
  liveness.

## F. Scope and security checks

1. Confirm no Phase 2/CMS feature exists:

   ```bash
   find apps packages -type f | sort
   ```

   There must be no auth/session, user, post/page, editor, media, taxonomy,
   theme or plugin runtime implementation.

2. Confirm no secrets are tracked:

   ```bash
   git ls-files | grep -E '(^|/)\.env$|secret|credential'
   ```

   Expected: no tracked `.env` or credential file. `.env.example` is a
   placeholder-only template.

3. Confirm no reference repository was modified:

   ```bash
   git -C .. status --short
   ```

   The reference directories are outside this repository and must be unchanged.

## G. Sign-off

- [ ] Clean install succeeds with the frozen lockfile.
- [ ] Database setup is reproducible; migration is an explicit no-op; seed is
      idempotent and creates no CMS data.
- [ ] API/admin/web start together; health and readiness behave as specified.
- [ ] Readiness returns 503 while the database is down and recovers to 200.
- [ ] Both placeholders load with a clean console.
- [ ] Lint, format check, typecheck, tests and builds pass.
- [ ] Playwright smoke tests pass.
- [ ] No CMS feature and no secrets.
- [ ] CI configuration reviewed; CI execution status recorded.

If any item fails, stop and record the exact command, output and environment.
Do not approve Phase 2 until the failure is explained or fixed.

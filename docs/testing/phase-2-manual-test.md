# Phase 2 auth-slice manual test guide

Phase 2 first slice: first-administrator bootstrap, Argon2id login, sessions,
CSRF/Origin protection, rate limiting, request IDs and the minimum login/logout
UI. There is no dashboard, content, editor, media, taxonomy, theme or plugin UI.

Run this after [local setup](../operations/local-setup.md). Use your own local
administrator password; do not record it in the report.

## A. Preconditions

1. Confirm versions and a clean tree:

   ```bash
   node --version    # v24.22.1
   pnpm --version    # 12.15.0
   psql --version    # PostgreSQL 18.x
   git status --short
   ```

2. Start PostgreSQL and confirm both databases:

   ```bash
   pnpm db:local:status
   # or pnpm db:local:start
   ```

3. Confirm `.env` has `DATABASE_URL`, `TEST_DATABASE_URL`, `CORS_ORIGINS` and
   `AUTH_HASH_PEPPER`. Never paste the pepper or passwords into a report.

## B. Migration and seed

```bash
pnpm db:migrate
pnpm db:seed
pnpm db:seed
```

Expected:
- both additive auth migrations applied: the initial auth schema and the
  `login_attempts(attempted_at)` hardening index;
- `db:seed` prints the no-op message both times;
- no administrator/content row is created by the seed.

Inspect tables:

```bash
psql "$DATABASE_URL" -c '\dt'
```

Expected: `_prisma_migrations`, `users`, `sessions`, `audit_events`,
`login_attempts`. No posts/pages/media/terms tables.

Confirm the hardening indexes on the attempts table:

```bash
psql "$DATABASE_URL" -c '\d login_attempts'
```

Expected indexes: primary key, `(key_hash, attempted_at)` and
`(attempted_at)`. The latter supports bounded retention cleanup.

## C. First administrator

```bash
pnpm auth:bootstrap
# Username: admin
# Password: ********
# Confirm password: ********
```

Expected: `Created administrator "admin".`

Run it a second time:

```bash
pnpm auth:bootstrap
```

Expected: refusal because an administrator exists. The command exits non-zero;
no second user is created. Do not delete the first admin to force a reset.

Check the database (do not print a raw password or token):

```bash
psql "$DATABASE_URL" -c "select username, role, status from users;"
```

Expected: exactly one `administrator`, `active`.

## D. Login UI

1. `pnpm dev`
2. Open http://127.0.0.1:5173.
3. Confirm:
   - “MERNPress admin” heading and visible Username/Password labels;
   - skip link and keyboard focus ring;
   - no content/dashboard controls.
4. Sign in with the administrator credentials.
5. Confirm the signed-in state shows the username, role `administrator` and a
   **Sign out** button. No CMS content controls exist.
6. Reload the page. Expected: still signed in (session cookie is valid).
7. Open DevTools Application/Storage. Expected: no session token in
   localStorage, sessionStorage or the URL. The HttpOnly session cookie is not
   readable by JavaScript.
8. With the session still active, open DevTools Console and run:

   ```js
   await (await fetch('/api/auth/csrf', { credentials: 'include' })).json()
   ```

   Expected: a token is returned. In Application → Cookies, `mernpress_csrf`
   (the session token) is unchanged; `mernpress_csrf_preauth` is new. This is
   the regression check: refreshing the login token must not break logout.
9. Click **Sign out**. Expected: login form returns with no CSRF error; reload
   remains anonymous. If this fails, stop and record the exact response.
10. Sign in again, then submit a wrong password. Expected generic “Invalid
    username or password.” — no account-existence detail.

## E. Session and audit evidence

With a signed-in session, inspect the DB:

```bash
psql "$DATABASE_URL" -c "select length(token_hash), length(csrf_hash), revoked_at from sessions order by created_at desc limit 3;"
psql "$DATABASE_URL" -c "select event_type from audit_events order by created_at;"
```

Expected:
- token/CSRF columns are 64-character hashes, never raw tokens;
- audit events include `auth.bootstrap`, `auth.login.success` and `auth.logout`;
- `auth.login.failure` appears per accepted failed attempt;
- `auth.login.rate_limited` has `reason=threshold_reached` and is not written
  once per blocked retry;
- no password, raw username, raw session token or CSRF token is stored in audit
  metadata.

Do not paste hashes or tokens into a report.

## F. Optional CHANGELOG: disabled user

On a test/local DB only, after signing in:

```bash
psql "$DATABASE_URL" -c "update users set status='disabled' where username='admin';"
```

Reload `/api/auth/session` or the admin page. Expected: 401/login form; the
session is revoked. Re-enable with `status='active'` only if you intend to keep
using this account. Record the result and restore the account.

## G. CSRF/Origin and rate-limit expectations

The automated tests cover these in depth; manual spot checks:

- Login requests without an allowed `Origin` are 403.
- Login/logout without the CSRF token are 403.
- After 5 failed logins in 15 minutes, the API returns 429 with `Retry-After`.
  Retrying while blocked keeps returning 429. Count durable rows, not requests:

  ```bash
  psql "$DATABASE_URL" -c "select event_type, count(*) from audit_events group by 1 order by 1;"
  ```

  Expected: `auth.login.rate_limited` stays small (at most a few threshold
  events), while the number of blocked requests is larger. Do not disable the
  limiter; wait for the window or use the dedicated test DB.
- After the limiter window has passed and a login attempt runs, inspect
  `login_attempts`: no row older than the configured window remains, up to the
  bounded batch per attempt. One-off usernames must not leave permanent rows.
- `GET /api/auth/session` returns 401 when anonymous and 200 when signed in.
- `/api/auth/session` and `/api/auth/login` responses carry `Cache-Control:
  no-store`.

## H. Automated verification

Stop `pnpm dev` first; E2E starts fresh servers on 4000/5173/3000 and refuses to
reuse existing processes.

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm audit --audit-level=high
```

Expected (current slice):
- 58 Vitest tests pass (API 47, admin 10, web 1);
- 7 Playwright tests pass (4 auth, 3 foundation);
- builds pass;
- audit reports no known vulnerabilities.

Also verify the test DB is separate and `.env` is not tracked:

```bash
git status --short
git ls-files | grep -E '(^|/)\.env$' || echo 'no .env tracked'
```

## I. Scope check

```bash
find apps packages -type f | sort
```

Confirm there is no content CRUD, posts/pages, Gutenberg editor, media upload,
taxonomy, theme runtime, plugin runtime, dashboard or user-administration screen.
The only admin authenticated view is the session placeholder and sign-out.

## J. Sign-off

- [ ] Bootstrap creates exactly one administrator; repeat is refused.
- [ ] Login succeeds with Argon2id; wrong/unknown credentials are generic.
- [ ] Session cookie is HttpOnly/SameSite and not in browser storage.
- [ ] Pre-auth and session CSRF cookies are separate; refreshing `/api/auth/csrf`
      while signed in leaves `mernpress_csrf` unchanged.
- [ ] Reload keeps the session; logout revokes it even after a CSRF refresh.
- [ ] CSRF/Origin, rate-limit, bounded retention, coalesced audit and request-ID
      behavior matches the guide/tests.
- [ ] DB stores only token/CSRF hashes and safe audit events.
- [ ] 58 unit/integration tests and 7 browser tests pass.
- [ ] No CMS/content/editor/media/theme/plugin feature exists.
- [ ] CI result for the exact commit is recorded separately.

If an item fails, stop and record the exact command, output, environment and
whether it is reproducible. Do not approve the next slice until it is resolved.

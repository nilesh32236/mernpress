# Authentication foundation

Status: Phase 2 first vertical slice implemented (2026-10-25), including the
post-review hardening follow-up; owner manual acceptance pending. Decisions and
rationale: [ADR 0002](../adr/0002-authentication-foundation.md#auth-hardening-follow-up-2026-10-25).

## 1. Scope

Implemented:

- one administrator identity (`users`);
- Argon2id password hashes;
- opaque database-backed sessions with idle/absolute expiry and revocation;
- first-admin CLI bootstrap;
- `GET /api/auth/csrf`, `POST /api/auth/login`, `POST /api/auth/logout`,
  `GET /api/auth/session`;
- CSRF and exact-Origin checks;
- database-backed login rate limiting;
- request-ID validation and bounded auth bodies;
- audit events;
- minimum accessible login/logout UI in `apps/admin`.

Deferred: editor/author roles and capability matrix, user administration,
profile editing, password reset/email, MFA/2FA/SSO, audit UI, and every content,
editor, media, taxonomy, theme and plugin feature.

## 2. Data model

| Table | Purpose | Key constraints |
| --- | --- | --- |
| `users` | administrator identity | `username` normalized lowercase, unique; `password_hash` Argon2id PHC; `role=administrator`; `status=active/disabled`; UUIDv7 |
| `sessions` | server-side sessions | `token_hash` SHA-256 hex, unique; `csrf_hash` SHA-256 hex; `expires_at`; `last_used_at`; `revoked_at`; FK user cascade |
| `audit_events` | security audit | event type, optional actor/target user, HMAC IP hash, reason-only JSON metadata, timestamp |
| `login_attempts` | rate limiting | HMAC key hash, timestamp; indexes `(key_hash, attempted_at)` and `(attempted_at)` for bounded pruning |

`tests` use a dedicated `TEST_DATABASE_URL` and truncate only these auth tables.
The seed remains an idempotent no-op; it creates no administrator or CMS data.
The first administrator is created only by `pnpm auth:bootstrap`.

## 3. Bootstrap

```bash
pnpm db:migrate
pnpm auth:bootstrap
# Username: admin
# Password: ********
# Confirm password: ********
```

- Username: 3–32 chars, normalized lowercase, `[a-z0-9._-]`, starts/ends
  alphanumeric.
- Password: 12–128 characters, not trimmed, at least one non-whitespace
  character. No composition rules.
- Password is read from a no-echo TTY prompt, or from
  `MERNPRESS_ADMIN_PASSWORD` only outside production for automation/tests.
  It is never accepted in argv and never logged.
- Runs in a transaction with `pg_advisory_xact_lock`; refuses if any
  administrator exists. Re-running is a refusal, not a reset.
- There is no public bootstrap route. Lost-sole-admin recovery needs a separate,
  explicitly approved operator procedure; no reset endpoint exists.

## 4. Login and sessions

1. The admin fetches `GET /api/auth/csrf`, which sets a readable
   `mernpress_csrf_preauth` cookie (path `/`, SameSite=Lax, 10 min) and returns
   the token. The route writes only this login token: it never reads, rotates or
   clears the session or `mernpress_csrf`, so it is safe while authenticated.
2. The login form posts `{ username, password }` with `X-CSRF-Token` and the
   pre-auth cookie, using `credentials: 'include'` through the same-origin `/api`
   proxy.
3. The API checks the exact `Origin`, CSRF match, DB-backed rate limit, username,
   Argon2id password, and user status. Unknown user, wrong password and disabled
   user all return the same generic `INVALID_CREDENTIALS` response. Unknown
   usernames still verify a dummy hash to reduce timing differences.
4. On success the API creates a new opaque session:

   | Value | Design |
   | --- | --- |
   | session token | 32 random bytes, base64url; raw value only in the HttpOnly cookie |
   | stored token | SHA-256 hex in `sessions.token_hash` |
   | CSRF token | fresh 32 random bytes; raw in the readable `mernpress_csrf` cookie and login response; SHA-256 in `sessions.csrf_hash`; pre-auth cookie cleared |
   | absolute TTL | 8 hours (`SESSION_TTL_MINUTES`) |
   | idle TTL | 30 minutes (`SESSION_IDLE_MINUTES`) |
   | cookie | `mernpress_session`, HttpOnly, SameSite=Lax, Path=/api, Secure in production, Max-Age = absolute TTL |

5. `GET /api/auth/session` validates the cookie, user status, absolute expiry and
   idle expiry, refreshes `last_used_at`, and returns the safe user DTO.
6. `POST /api/auth/logout` requires the session plus `X-CSRF-Token` whose hash
   matches `sessions.csrf_hash`; it revokes the session and clears the session
   and session-CSRF cookies. Expired, idle, disabled and logged-out sessions all
   return 401; detectable expiries are audited.
7. No session token is placed in localStorage, sessionStorage or a URL. The admin
   keeps only the readable `mernpress_csrf` value (from its cookie) and never
   reads the HttpOnly session cookie.

### Supported deployment topology

The admin and API share one browser origin: in development Vite proxies `/api`
to the API; in production an HTTPS reverse proxy serves the admin build and
routes `/api` to the API. The client uses relative `/api/...` URLs, so it reads a
path-`/` cookie it owns and CORS is not needed for the admin. A separate-origin
API client is **not supported or tested**; that would need a validated API base
URL, a returned CSRF token instead of `document.cookie`, exact CORS origins and
`SameSite=None; Secure` review. `TRUST_PROXY` is false by default; set it only
behind a trusted reverse proxy so rate limiting sees the client IP.

## 5. CSRF and Origin

- Every POST/PUT/PATCH/DELETE requires an exact `Origin` in `CORS_ORIGINS`.
  Missing, `null` or unknown origins return 403 `ORIGIN_NOT_ALLOWED`.
- Login uses pre-auth double-submit: header and `mernpress_csrf_preauth` cookie
  must hash-match. The session-bound `mernpress_csrf` cookie is separate and is
  set only at login; logout requires its hash.
- `GET /api/auth/csrf` is a login-token bootstrap endpoint for anonymous and
  authenticated callers. It never mutates session state, so a CSRF refresh
  cannot invalidate logout.
- CORS alone is not treated as CSRF protection. CORS uses exact origins with
  credentials, `POST` and only `content-type`, `x-csrf-token`, `x-request-id`.
- No state-changing GET exists; all auth responses are `Cache-Control: no-store`.

## 6. Rate limiting

`login_attempts` is checked before username/password validation:

| Setting | Default |
| --- | --- |
| `LOGIN_RATE_LIMIT_MAX` | 5 failures |
| `LOGIN_RATE_LIMIT_WINDOW_MINUTES` | 15 minutes |

Two HMAC keys are recorded per failure: `ip:<client>` and `user:<normalized>`.
A hit returns 429 with `Retry-After` and a generic message; a successful login
clears both keys. This is database-backed, so it is not an in-memory
single-process claim.

Expired rows are pruned on every login attempt before the counts are read, so
abandoned one-off keys cannot accumulate forever. Cleanup deletes at most 100
rows per invocation, oldest first, with `FOR UPDATE SKIP LOCKED`; the cutoff is
the limiter window start, so recent attempts survive and a live limiter is never
reset early. The `login_attempts(attempted_at)` index supports the prune.

Rate-limit audit is coalesced: one `auth.login.rate_limited` event is written by
the failure that makes a key reach the threshold. Later rejected requests return
429 without a durable row, so a blocked client cannot turn throttling into
unbounded writes. A small race can produce more than one threshold event, but
the count is bounded by concurrent requests, not by total rejections.

## 7. Configuration

| Variable | Required | Notes |
| --- | --- | --- |
| `NODE_ENV` | yes | no default; production fails closed |
| `DATABASE_URL` | yes | PostgreSQL 18; UTC pinned by the adapter |
| `CORS_ORIGINS` | production | comma-separated exact origins; HTTPS, non-loopback in production |
| `AUTH_HASH_PEPPER` | production | ≥32 chars; HMAC key for audit/rate-limit hashes; never commit |
| `TEST_DATABASE_URL` | tests | dedicated database whose name contains `test`/`e2e` |
| `SESSION_TTL_MINUTES` | no | default 480; absolute session lifetime |
| `SESSION_IDLE_MINUTES` | no | default 30; must not exceed absolute TTL |
| `LOGIN_RATE_LIMIT_MAX` | no | default 5 |
| `LOGIN_RATE_LIMIT_WINDOW_MINUTES` | no | default 15 |
| `TRUST_PROXY` | no | `true` only behind a trusted proxy |
| `HOST`, `PORT`, `LOG_LEVEL` | no | local defaults `127.0.0.1`, `4000`, `info` |

## 8. Audit and logging

Events: `auth.bootstrap`, `auth.login.success`, `auth.login.failure`,
`auth.login.rate_limited`, `auth.logout`, `auth.session.revoked`.
`auth.login.failure` is per accepted failed attempt; `auth.login.rate_limited`
means the key reached the threshold (`reason: threshold_reached`), not that every
later request was persisted. Failed-login metadata contains a reason plus an
IP/identifier HMAC, never the raw username, password, token, cookie or body. The API logger redacts authorization/cookie
headers, session cookies and password/CSRF fields; auth request bodies are never
logged.

## 9. Tests and residual risks

Covered: empty-DB bootstrap, repeat refusal, concurrent bootstrap, Argon2
parameters, generic failures, disabled users, token-hash storage, cookie flags,
idle/absolute expiry, logout/revocation, CSRF/Origin missing/wrong/valid,
CSRF refresh while authenticated, separate pre-auth cookie, rate-limit/recovery,
invalid-username limiting, bounded retention of one-off attempts, coalesced
rate-limit audit under a 20-request burst, oversized/malformed bodies,
request-ID sanitization, log redaction, login UI, keyboard-only sign-in,
relative `/api` client URLs and browser storage checks.

Residual: no MFA/password reset/email; a sole admin password loss requires a
separate recovery procedure; no WAF; rate-limit IP depends on `TRUST_PROXY`
correctness; pruning runs only while login traffic exists (a static table does
not grow); rate-limit audit can emit a few threshold events under a race; no
formal penetration test.

## 10. Code map

The auth slice follows the repository's
[engineering standards](code-standards.md): one reason to change per module, no
HTTP types in the domain, and bounded database work.

| File | Responsibility |
| --- | --- |
| `packages/cms-core/src/auth/service.ts` | bootstrap, login, session validation and logout orchestration |
| `packages/cms-core/src/auth/rate-limit.ts` | `login_attempts` checks, bounded pruning, threshold detection |
| `packages/cms-core/src/auth/audit.ts` | the only auth audit writer; safe metadata and event names |
| `packages/cms-core/src/auth/identifiers.ts` | HMAC domain separation for IP/username identifiers |
| `packages/cms-core/src/auth/password.ts` | Argon2id parameters, password policy, dummy verification |
| `packages/cms-core/src/auth/tokens.ts` | opaque token generation and hash comparisons |
| `packages/cms-core/src/auth/username.ts` | normalization and format policy |
| `packages/cms-core/src/auth/types.ts` | service/config contracts and `AuthError` |
| `apps/api/src/routes/auth.ts` | HTTP validation, CSRF/Origin enforcement, cookie writes |
| `apps/api/src/auth/cookies.ts` | cookie names, paths, flags and TTLs |
| `apps/api/src/config/env.ts` | fail-closed environment validation |
| `apps/api/src/http/request-id.ts` | canonical UUID request IDs |

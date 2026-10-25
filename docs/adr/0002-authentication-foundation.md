# ADR 0002 — Authentication foundation (Phase 2, first slice)

- Status: Accepted
- Date: 2026-10-25
- Deciders: project owner (Phase 1 approval) + implementation review
- Supersedes: none
- Related: [threat model](../security/threat-model.md),
  [content model](../architecture/content-model.md),
  [system overview](../architecture/system-overview.md),
  [Phase 1 ADR](0001-baseline-stack.md)

## Context

Phase 1 produced a bootable API/admin/web foundation with an empty database
schema. The owner approved Phase 1 and requested only the first vertical slice
of Phase 2:

- secure first-administrator bootstrap;
- Argon2id password hashing;
- database-backed sessions;
- login, logout and current-session endpoints;
- CSRF and Origin protection;
- login rate limiting;
- request-ID validation;
- a minimum accessible login/logout UI.

User administration, additional roles/capabilities, password reset, email, MFA,
profile editing, content, editor, media, taxonomy, themes and plugins are
explicitly deferred. This ADR records the choices that must be stable before the
first auth migration is written.

The project is a single-site, self-hosted, modular monolith. In development the
Vite dev server proxies `/api` to the API, so the browser sees one origin. In
production the supported topology is the same: serve the admin build and
reverse-proxy `/api` behind one HTTPS origin (D-024). A separate-origin API
client is not implemented or tested. The API is the only component that touches
PostgreSQL. No paid service, email provider or external identity provider is
assumed.

## Decision summary

| Area | Decision |
| --- | --- |
| Login identifier | `username`, 3–32 characters, normalized to lowercase, unique |
| User model | one `administrator` role in this slice; `active`/`disabled` status |
| Password hash | Argon2id via `@node-rs/argon2` 2.2.2, 64 MiB memory, 3 passes, 1 lane, 32-byte output, 16-byte random salt, PHC string |
| Password policy | 12–128 characters, no composition rules, not trimmed, all-whitespace rejected |
| Session token | 32 random bytes, base64url; only SHA-256 hex stored in `sessions.token_hash` |
| Session lifetime | 8 hours absolute, 30 minutes idle; rotation on login; revoke on logout, expiry, idle timeout or disabled user |
| Session cookie | `mernpress_session`: HttpOnly, SameSite=Lax, Path=/api, Secure in production, Max-Age = absolute TTL |
| Pre-auth CSRF | `GET /api/auth/csrf` sets a readable `mernpress_csrf_preauth` cookie (Path=/, 10 min) and returns the token; login requires the cookie and `X-CSRF-Token` header to match |
| Session CSRF | `mernpress_csrf` (readable, Path=/) is issued at login, bound to the session; only its SHA-256 hash is stored; logout requires the matching header. Refreshing the pre-auth token never changes it |
| Deployment | same-origin admin + `/api` reverse proxy; no separate-origin API base in the MVP |
| Origin | every state-changing request (POST/PUT/PATCH/DELETE) must carry an `Origin` exactly matching `CORS_ORIGINS`; GET remains non-mutating |
| Rate limit | database-backed `login_attempts`, keyed by HMAC-SHA256(IP) and HMAC-SHA256(normalized username), 5 failures per 15 minutes, 429, success clears keys, bounded time-based pruning |
| Rate-limit audit | one coalesced `auth.login.rate_limited` event when a key reaches the threshold; rejected requests do not write an event each |
| Bootstrap | local CLI with PostgreSQL advisory lock; refuses if any administrator exists; TTY password prompt or non-production env input; never argv/logs |
| Audit | `audit_events` for bootstrap, login success/failure, logout and session invalidation; hashed IP; no passwords, tokens or cookies |
| Request ID | accept only a canonical UUID from `X-Request-ID`; otherwise generate a UUID |
| Body limit | 16 KiB for the API in this slice |
| CORS | exact configured origins, credentials enabled, POST allowed, `content-type`, `x-csrf-token`, `x-request-id` allowed |
| CSP | API returns JSON and keeps Helmet CSP disabled; the login UI uses no inline/eval policy exceptions; Gutenberg CSP is a later gate |
| Migration | one additive initial auth migration; never destructive |

## First-slice boundary

Included:

- `users`, `sessions`, `audit_events`, `login_attempts` tables.
- One administrator role, active/disabled status.
- `packages/cms-core` auth domain service and `packages/database` migration.
- `pnpm auth:bootstrap` local CLI.
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`,
  `GET /api/auth/csrf`.
- Login/logout UI in `apps/admin`.
- API/integration/browser/security tests and documentation.

Deferred explicitly:

- editor/author roles, capability table, object-level content authorization;
- user list/create/edit/deactivate, last-admin protection;
- profile editing, password change/reset, email verification, MFA, 2FA, SSO;
- account lockout notifications, email, audit UI;
- content, Gutenberg, media, taxonomy, themes, plugins, dashboard metrics;
- password recovery. If the only administrator password is lost, recovery needs
  a separately approved operator procedure; there is no public reset endpoint.
  Do not re-run bootstrap to silently reset an existing administrator.

## Decisions and rationale

### Username, not email, in this slice

A username is the minimum unique login identifier. It avoids email delivery,
verification and GDPR surface that are not part of this slice. Normalization:
trim outer whitespace, lowercase, require
`^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])?$` (3–32 characters, starts/ends
alphanumeric). The unique database constraint is on the normalized value.
Email/display name/slug are deferred to the user-administration slice.

### Argon2id parameters

`@node-rs/argon2` 2.2.2 is MIT-licensed and ships prebuilt NAPI binaries for
Node 24 (no node-gyp/postinstall requirement). The measured hash time on this
machine was ~64 ms for 64 MiB, 3 passes, 1 lane. Parameters are stored in the
PHC string, so future changes can be detected with `parseOptions` and rehashed on
a successful login in a later slice.

Unknown usernames still verify a dummy Argon2id hash so the response time does
not trivially reveal account existence. Login failures always return the same
generic code/message. Disabled users follow the same password verification path
before the generic failure.

The rejected alternative was the `argon2` npm package: it is MIT too, but its
native build/postinstall is more fragile under pnpm's blocked-build policy and
Node upgrades. No bcrypt fallback is implemented.

### Session storage and lifecycle

- Raw token: `randomBytes(32).toString('base64url')` (256 bits).
- Stored value: SHA-256 hex (64 chars) in `sessions.token_hash`; the raw token is
  only in the HttpOnly cookie.
- `expires_at` is the absolute deadline; `last_used_at` supports idle expiry.
- Login always creates a new session; no session fixation.
- Logout sets `revoked_at`, clears both cookies, and records an audit event.
- A missing, expired, idle-expired, revoked or disabled-user session returns 401
  and the session is revoked when the cause is detectable. Expiry/invalidations
  are audited without token material.
- The session cookie's Max-Age matches the absolute TTL. Idle expiry is enforced
  server-side even if the cookie still exists.
- `Secure` is set whenever `NODE_ENV=production`; local HTTP uses `Secure=false`
  and is documented separately. SameSite=Lax relies on the admin and API being
  same-site (different ports are same-site); a cross-site deployment needs an
  explicit ADR and `SameSite=None; Secure`.

### CSRF and Origin

CORS is not a CSRF defense. Two layers are used:

1. **Origin allowlist**: every POST/PUT/PATCH/DELETE must carry an `Origin`
   exactly matching `CORS_ORIGINS`. Missing, `null` or unknown origins are 403.
   GET/HEAD/OPTIONS are not state-changing.
2. **CSRF tokens** (two separate cookies, D-023):
   - Before login, `GET /api/auth/csrf` issues a random token in a readable
     `mernpress_csrf_preauth` cookie (SameSite=Lax, Path=/, 10-minute lifetime)
     and returns it. Login requires the header and cookie to match. This
     protects login CSRF without a session. The route overwrites only this
     pre-auth cookie; it never reads, rotates or clears session state, so it is
     safe to call while authenticated.
   - On successful login, a fresh session CSRF token is generated, its SHA-256
     hash is stored on the session, and it is set in the readable
     `mernpress_csrf` cookie (Path=/). Logout requires `X-CSRF-Token` whose hash
     matches the session. The pre-auth cookie is cleared at login.
   - The token is not a session credential and is never stored in
     localStorage/sessionStorage. No state-changing GET exists; the pre-auth
     cookie write is the documented GET contract.
   - The admin reads `mernpress_csrf` and sends it in `X-CSRF-Token`. It is not
     retried automatically. This works because the admin and API share one
     browser origin (D-024); a separate-origin client would need a returned
     token flow rather than `document.cookie`.

The pre-auth cookie is double-submit; the authenticated value is also bound to a
server-side session hash. An attacker who can set arbitrary cookies on the API
origin is already outside the browser CSRF model; the session-bound hash still
prevents using a guessed token.

### Login rate limiting

`login_attempts` stores only `key_hash` (HMAC-SHA256 of `ip:<ip>` and
`username:<normalized>` with `AUTH_HASH_PEPPER`) and `attempted_at`. A login
checks both keys for failures inside the window; a hit returns 429 with a generic
message and `Retry-After`. Failures insert rows for both keys. A success deletes
both keys.

Expired rows are pruned opportunistically on each login attempt, before the
counts are read (D-021). The delete is bounded to 100 rows, oldest first, with
`FOR UPDATE SKIP LOCKED`, so concurrent API instances do not block or delete
unbounded work. The cutoff is the same window start used by the limiter, so live
attempts are never removed. A new `attempted_at` index supports the prune. This
is database-backed, so it works across API processes and restarts; it is not an
in-memory claim, and no scheduler/worker is added.

Rate-limit audit is coalesced (D-022). A durable `auth.login.rate_limited` event
is written by the failed attempt that makes a key reach the threshold; requests
rejected afterwards return 429 without another durable audit row. Up to a small
number of racing requests can each observe the threshold, so the event count is
bounded but not perfectly deduplicated under concurrency. Per-attempt
`auth.login.failure` rows remain the primary evidence.

`TRUST_PROXY` is false by default; operators behind a reverse proxy must set it
explicitly so `request.ip` is the client address. Without that, rate limiting is
by proxy address; this is documented, not hidden.

### Bootstrap and recovery

`pnpm auth:bootstrap`:

- parses only a non-secret `--username` argument (or prompts);
- takes the password from a no-echo TTY prompt (twice) or, only outside
  production, `MERNPRESS_ADMIN_PASSWORD` for automation/tests;
- never accepts the password in argv, never prints it, and never logs it;
- opens a transaction, takes `pg_advisory_xact_lock` for the bootstrap name,
  refuses if any administrator exists, validates/normalizes the username and
  password, hashes with Argon2id, creates the administrator and writes an audit
  event;
- is safe to run against an empty database and refuses repeat execution.

There is no public bootstrap route. If the only administrator is lost, recovery
is an operator-only, separately approved procedure; this slice does not add a
reset password endpoint or a silent re-bootstrap.

### Audit

Audit event names in this slice: `auth.bootstrap`, `auth.login.success`,
`auth.login.failure`, `auth.login.rate_limited`, `auth.logout`,
`auth.session.revoked`. Rows store event type, optional actor/target user IDs,
hashed IP, optional JSON metadata (reason only), and UTC timestamp. Raw
passwords, session tokens, CSRF tokens, cookies and full request bodies are never
stored or logged.

### Request IDs and request limits

`X-Request-ID` is accepted only when it is a canonical UUID (versions 1–8);
otherwise a new UUID is generated. The response and logs use the sanitized value.
The API body limit is 16 KiB. Auth bodies are additionally validated with Zod and
strict object shapes (unknown keys rejected).

### CSP and CORS

Helmet CSP remains disabled on the API because it serves JSON, not HTML. The
admin login UI is plain React with no inline scripts/eval and does not require
CSP exceptions. The future Gutenberg editor CSP is a Phase 5 decision. CORS uses
an exact origin allowlist with credentials; wildcards are rejected by environment
validation. `POST` and the required headers are allowed; no arbitrary headers or
methods are enabled early.

<a id="phase-2-implementation-amendments"></a>
## Phase 2 implementation amendments (2026-10-25)

After implementation, tests and an independent adversarial review, these
changes were made without widening the slice:

- `AUTH_HASH_PEPPER` (HMAC-SHA256) keys audit `ip_hash` and identifier hashes
  and the `login_attempts` keys. Production refuses a missing/placeholder
  pepper; development/test use an explicit local value. Session and CSRF tokens
  remain plain SHA-256 because they are random server-generated values.
- `NODE_ENV` is required (no development default). Production requires explicit
  `CORS_ORIGINS`, HTTPS only, no loopback origins, and a real pepper. This makes
  a partial production environment fail closed instead of silently using dev
  localhost CORS and non-Secure cookies.
- Session cookie path is `/api`; the readable CSRF cookie path is `/` because
  the admin page must read it. Both are cleared with matching paths.
- Invalid usernames are rate-limited before the password-policy rejection, so
  malformed identifiers cannot bypass the limiter and consume unbounded Argon2
  work. Cleanup is scoped to the current rate-limit keys, using the composite
  index.
- The CLI secret reader consumes CSI escape sequences so arrow keys cannot
  corrupt a password. A lone ESC is consumed; this is cosmetic.
- Production non-`AuthError` responses use generic messages (`Request rejected`
  for non-500, `Internal server error` for 500). Development/test keep details.
- Bootstrap audit events no longer store the plaintext username in metadata;
  actor/target IDs identify the user.

The independent reviewer re-checked every fix and returned **PASS** with no
blockers; the API security suite is 37 tests plus admin/web/browser tests.
Under concurrent login attempts the dual-key count/insert check can overshoot
the threshold by a small amount; this is accepted at MVP login volume and is
recorded as a residual, not a cross-process bypass.

<a id="auth-hardening-follow-up-2026-10-25"></a>
## Auth hardening follow-up (2026-10-25)

A post-implementation static review found five issues. A–C were reproduced with
failing tests before the fix; D was a deployment-contract review and E a
documentation/code path check. No scope was added.

### A. Bounded retention for `login_attempts` (D-021)

**Problem:** cleanup deleted only rows whose HMAC key matched the current
request, so abandoned usernames/IPs left rows forever.

**Decision:** keep opportunistic cleanup during login, but make it global and
bounded: `DELETE ... WHERE id IN (SELECT id ... WHERE attempted_at < cutoff
ORDER BY attempted_at LIMIT 100 FOR UPDATE SKIP LOCKED)`, parameterized through
Prisma. Add `login_attempts(attempted_at)`. The cutoff is the limiter window
start, so recent rows survive and a live limiter cannot be reset early. One
migration is added; the existing migration is untouched.

**Evidence:** with the previous code the new retention test left 6 expired rows
and deleted 0 of 150 expired rows. With the fix the old rows are gone, recent
rows remain, and a single invocation deletes exactly one bounded batch of 100.

**Residual:** pruning only runs while login traffic exists. If traffic stops, the
table stops growing too; a future operational task can add a maintenance command.

### B. Coalesced rate-limit audit (D-022)

**Problem:** every rejected request wrote an `auth.login.rate_limited` row, so an
attacker could convert throttled traffic into unbounded database writes.

**Decision:** write the event once, when a failed attempt makes a key reach the
threshold. Rejected requests only return 429 + `Retry-After`. Failure events stay
per attempt and are themselves bounded by the limit. Under a race, a few
requests can each observe the threshold; the event count is bounded by the number
of concurrent requests that pass the pre-insert check, not by total rejections.

**Evidence:** a 20-request limited burst produced 21 durable rate-limit events
before the fix and at most 2 after it, while every response remained 429 with
`Retry-After`.

### C. CSRF refresh must not break an active session (D-023)

**Problem:** `GET /api/auth/csrf` always overwrote `mernpress_csrf`. If called
after login, the browser kept a pre-auth token that no longer matched
`sessions.csrf_hash`, so logout failed with `CSRF_INVALID`.

**Decision:** separate the two purposes:

| Cookie | Purpose | Path | Lifetime | Set by |
| --- | --- | --- | --- | --- |
| `mernpress_csrf_preauth` | login double-submit | `/` | 10 min | `GET /api/auth/csrf` |
| `mernpress_csrf` | session-bound logout/CSRF | `/` | session TTL | login only |

`GET /api/auth/csrf` is a login-token bootstrap endpoint for anonymous and
authenticated callers. It never validates, rotates or clears the session, so no
GET mutates session state. Invalid/expired session cookies are ignored on this
route; the session endpoints still return 401 and clean up as before.

**Evidence:** before the fix, login → `GET /api/auth/csrf` → logout returned 403
in the regression tests. After the fix the endpoint sets only the pre-auth
cookie and logout returns 204 for valid, invalid and expired session inputs.

### D. Supported topology is same-origin (D-024)

**Decision:** the MVP supports one browser origin: the admin build and `/api`
behind the same HTTPS reverse proxy (Vite proxies `/api` in development). The
admin client intentionally uses relative `/api/...` URLs, `credentials:
'include'` and reads the path-`/` CSRF cookie. A separate API origin is **not**
supported: it would require a validated API base URL, a returned CSRF token (a
host-only cookie is not readable by the admin origin), exact CORS origins,
`SameSite=None; Secure` review and new tests.

Operators must terminate TLS at the proxy, forward the client IP only when
`TRUST_PROXY=true` is correct, and keep `CORS_ORIGINS` set to the browser origin.

### E. Session cookie path

The decision summary and all docs now agree with the implementation:
`mernpress_session` uses `Path=/api`; the two CSRF cookies use `Path=/` because
the admin page reads them. Cookie clears use the same paths.

## Consequences

Positive:

- A database leak does not reveal usable session tokens.
- Login is resistant to account enumeration, simple brute force, login CSRF and
  cross-origin state changes.
- The auth domain is framework-agnostic and reusable by future routes/CLI.
- The migration is additive and the bootstrap path cannot silently reset an
  existing admin.

Costs/risks:

- No password reset/MFA/2FA; a lost sole-admin password needs an approved
  recovery procedure.
- No email field or display name yet; user administration is deferred.
- Rate limiting relies on `request.ip`; proxy misconfiguration weakens it.
- SameSite=Lax relies on the supported same-origin admin/API deployment; a
  separate-origin deployment is not supported in the MVP.
- Session writes on each authenticated request; acceptable at MVP scale.
- The CSRF cookie is readable by JavaScript by design; XSS remains a higher-order
  threat handled by CSP/sanitization in later phases.
- No formal penetration test; automated tests + independent review only.

## Revisit triggers

- Adding editor/author roles or content object authorization: extend capabilities
  and test the matrix before exposing content routes.
- Adding password reset/email/MFA: new ADR; do not add a public reset route
  without enumeration/rate-limit design.
- Cross-site/separate-origin admin/API deployment: build a real API base URL,
  host-owned cookie handling and `SameSite=None; Secure`, then add integration
  and browser tests before claiming support.
- Reverse-proxy deployment: set/verify `TRUST_PROXY`; test client IP handling.
- Argon2 parameter or library change: migration/rehash plan and timing test.
- Gutenberg CSP: separate editor policy; do not weaken auth endpoints.

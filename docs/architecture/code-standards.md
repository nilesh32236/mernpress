# Engineering standards

Status: active from Phase 2 (2026-10-25). Read this before changing code in any
package. [AGENTS.md](../../AGENTS.md) is the binding project instruction; this
page records the concrete conventions those instructions expect so a new session
does not have to infer them from the code.

## 1. Principles and how they apply here

| Principle | Concrete rule in MERNPress |
| --- | --- |
| Single responsibility | One module owns one concern. Example: `auth/rate-limit.ts` owns every `login_attempts` read/write; `auth/audit.ts` is the only audit writer; `auth/service.ts` orchestrates use cases. |
| Dependency inversion | `packages/cms-core` depends on the `DatabaseClient` type and plain config, never Fastify, cookies, HTTP or React. `apps/api` adapts HTTP to the domain. |
| Interface segregation | Small exported interfaces (`IdentifierHasher`, `AuthAudit`, `LoginRateLimiter`, `AuthService`) rather than one large "auth utils" surface. |
| Open/closed | Add a new auth flow/module beside existing ones; do not grow a shared function with mode flags. Extend `AuthService` deliberately with an ADR-worthy decision. |
| DRY, but rule of three | Extract on the third real duplication, not the first resemblance. One source of truth for: env schema, cookie options, identifier hashing, error envelope, audit metadata. |
| KISS | Prefer a straight function and explicit data flow. No scheduler, queue, event bus or plugin framework until a phase needs it. |
| YAGNI | No speculative package, adapter, configuration knob or abstraction. `packages/contracts`, `block-system`, `plugin-sdk` and `theme-sdk` wait for a real consumer. |
| Fail closed | Missing production config, unknown origin, missing CSRF, invalid session and unknown role/status all reject. Never "default allow" because a value is absent. |
| Least privilege | The admin DTO exposes only `id/username/role/status`; passwords, hashes, session tokens and CSRF tokens never cross the API boundary. |
| Explicit over implicit | Typed error codes, named event types, named cookie constants. No stringly-typed behavior spread across files. |

SOLID is a design aid, not a reason to create one-class hierarchies. A module
with a clear contract and one reason to change is the target.

## 2. Package and layer boundaries

```text
apps/api            HTTP adapters: routes, cookies, env, request IDs, error mapping
apps/admin          browser UI and API client; relative /api URLs only
apps/web            public Next.js site (Phase 1 placeholder)
packages/cms-core   framework-agnostic domain: auth now, content later
packages/database   Prisma schema, migrations, client, DB scripts
```

Rules:

- `packages/cms-core` must not import Fastify, `@fastify/*`, React or cookie
  helpers. It may import Node built-ins and the database client type.
- `apps/api` routes translate HTTP to a service call, then map domain errors to
  the error envelope. They do not contain SQL, password logic or session rules.
- `packages/database` owns schema/migrations; domain modules use the generated
  client. No raw SQL string interpolation anywhere.
- `apps/admin` never imports server-only packages or reads the HttpOnly session
  cookie. It reads only the readable `mernpress_csrf` cookie it owns.
- A new package needs a real consumer and a documented boundary; do not create
  placeholders.

## 3. Auth module map (reference example)

| File | Owns | Must not own |
| --- | --- | --- |
| `auth/service.ts` | bootstrap, login, session validation, logout orchestration | rate-limit/audit persistence details, cookie names, HTTP status mapping |
| `auth/rate-limit.ts` | `login_attempts` checks, bounded pruning, threshold detection | audit events, HTTP status mapping |
| `auth/audit.ts` | the only audit-event writer and safe metadata | deciding when an event happened |
| `auth/identifiers.ts` | HMAC domain separation for IP/username | policy decisions |
| `auth/password.ts` | Argon2id parameters, policy, dummy verification | user lookup, sessions |
| `auth/tokens.ts` | opaque token generation, SHA-256/CSRF comparisons | cookie attributes, expiry policy |
| `auth/username.ts` | normalization and format policy | uniqueness, persistence |
| `auth/types.ts` | contracts and typed errors | implementation |
| `apps/api/src/routes/auth.ts` | HTTP validation, CSRF/Origin enforcement, cookie writes | business rules, SQL, password/session policy |
| `apps/api/src/auth/cookies.ts` | cookie names, paths, flags, TTLs | session decisions |

When adding a module here, update this table and the architecture doc.

## 4. Functions, naming and errors

- Export factories as `createX(options)`; keep dependencies explicit in the
  options object. No module-level mutable state or hidden singletons.
- Accept a clock (`now`) and configuration through options in domain code. Never
  call `Date.now()` directly in a module that tests need to control.
- Domain errors are typed (`AuthError` with a stable `code` and status). Routes
  map them; services do not build HTTP responses.
- External messages stay generic (`Invalid username or password`). Internal
  reasons (`unknown_user`, `invalid_password`) are audit-only.
- Never include secrets, raw tokens, cookies or raw usernames/IPs in errors,
  logs, audit metadata or test snapshots.
- File names are kebab-case; exports are named; prefer `type`-only imports.
  Relative imports keep the `.js` extension (NodeNext).
- Comments explain *why* and invariants, not line-by-line mechanics. Public
  module contracts get JSDoc.

## 5. Data and persistence

- PostgreSQL only; UTC (`timestamptz`) for every instant.
- Prisma Migrate is the only migration mechanism. Deployed migrations are
  forward-only and never edited; corrections are new additive migrations.
- Use Prisma APIs or parameterized tagged SQL. Table names may be literals;
  values are always bound parameters.
- Every query on a growing table needs a bound: pagination, a `LIMIT`, an index,
  or a documented reason. Per-request cleanup must be bounded.
- State that must survive restarts or span API instances belongs in PostgreSQL,
  not process memory.
- Tests use `TEST_DATABASE_URL` and truncate only their tables; never point a
  test at development data.

## 6. Testing expectations

- Test behavior and invariants, not implementation details.
- Every security finding adds a regression test that fails before the fix.
- Use the injected fake clock for expiry/window tests; never `sleep`.
- Cover the negative path: missing/invalid/oversized input, wrong origin, wrong
  CSRF, disabled user, expired session, rate-limited retry.
- Browser tests exercise the real same-origin topology (`/api` through the Vite
  proxy), not an absolute API URL that production does not use.
- Unit tests must not need a database unless they are integration tests; the API
  suite is integration-style and uses the dedicated test DB.
- New test files must match the package's Vitest `include` glob.

## 7. Formatting and static checks

- Prettier is authoritative; `pnpm format` before committing and
  `pnpm format:check` in the gate.
- ESLint 10 + typescript-eslint + import boundaries; no warnings accepted.
- TypeScript strict with `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`; do not weaken these flags.
- Exact version pins; do not use `latest` for Prisma or framework packages.
- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`,
  `pnpm test:e2e`, `pnpm audit --audit-level=high` before claiming completion.

## 8. Documentation expectations

- A material decision gets an ADR or dated `DECISIONS.md` entry **before** code.
- Architecture docs describe the implemented contract; mark deferred behavior as
  deferred, not as if it exists.
- Update `TASKS.md`, `README.md` (when behavior/commands change), the relevant
  architecture/security/testing doc and `docs/implementation-log.md` at the end
  of every slice.
- Distinguish observed facts, decisions and hypotheses; cite paths, commands,
  versions and run IDs.
- No secrets, credentials or private tokens in docs, fixtures or memory.

## 9. Scalability rules for the MVP

- API processes are stateless; sessions, rate limits and audit live in
  PostgreSQL so multiple instances agree after restart.
- Work per request is bounded: body limit, cleanup batch, rate-limit window,
  indexed lookups. Avoid full-table scans on request paths.
- Add an index with the feature that needs it, in the same additive migration.
- Pagination, background jobs and caches arrive with the feature that requires
  them, under a new decision — not "just in case".
- Prefer one clear code path over a configuration matrix until a second real
  deployment/deployment topology is tested.

## 10. Review checklist

Before a slice is called complete, confirm:

- [ ] Domain modules have one responsibility; routes contain no business rules.
- [ ] No raw SQL interpolation; every growing-table query is bounded/indexed.
- [ ] Errors and logs contain no secrets; auth responses are generic.
- [ ] New decision is recorded; docs and status claims match the code.
- [ ] Regression test exists for each fixed bug; fake clock used for time.
- [ ] Format, lint, typecheck, unit/integration, build, E2E and audit pass.
- [ ] Independent review has no open blockers/high findings.
- [ ] Scope boundary respected; no next-phase feature slipped in.

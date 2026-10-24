# AGENTS.md — permanent project instructions

These instructions apply to every session, human or AI, working in this
repository. They override convenience. If a request conflicts with them, stop and
ask rather than silently weakening a boundary.

## 1. Current state and the approval gate

- Phase 0 is approved. **Phase 1 (repository foundation) is implemented and
  awaiting the owner's manual acceptance test.**
- No CMS product feature exists. Do not start Phase 2 (authentication) or any
  content, editor, media, theme or plugin work until the owner explicitly
  approves Phase 1.
- After approval, implement **one feature/slice at a time**. At the end of each
  slice: report changed files, exact commands, test results, manual test steps,
  limitations, and **stop**. Do not start the next slice without explicit
  approval.
- Do not treat "the build passes" as "the feature works". Acceptance criteria and
  the manual test must pass.

## 2. Read before acting

At the start of every implementation session, read:

1. This file.
2. `README.md` and the current phase in `TASKS.md`.
3. The relevant ADRs and architecture docs (start at `DECISIONS.md`).
4. The last entry in `docs/implementation-log.md`.
5. `git status` and the current diff.

Do not start from stale assumptions or from a previous chat summary. The
repository is the source of truth.

## 3. Repository boundaries

The new project lives in this repository. The reference material lives outside it:

- `../wordpress` — WordPress 7.1.3 source, read-only reference.
- `../qrolic-cms-main` — reference CMS, read-only.
- `../qrolichealth-cms-main` — reference Health CMS, read-only.
- `../qrolic-frontend-main` — reference public frontend, read-only.
- `../qrolichealth-main` — reference Health frontend, read-only.

**Never** modify, rename, delete, reformat, migrate or install dependencies in
those directories. Never copy large source blocks from them. A design lesson is
not a licence to copy code; check the licence before reusing anything beyond a
small, attributed, independently written implementation.

## 4. Architecture boundaries (target)

```text
apps/admin   React/Vite admin SPA; browser-only; may import editor packages.
apps/api     Fastify API + server-side renderer; Node-only; owns persistence.
apps/web     Next.js public site; consumes the API over HTTP; owns presentation.
packages/contracts   isomorphic DTOs, Zod schemas, route/error types.
packages/database    Prisma schema, migrations, client, repositories.
packages/cms-core    domain services: content, auth, capabilities, hooks.
packages/block-system block contracts, registry, parser, server renderer.
packages/plugin-sdk  public plugin interfaces and test helpers.
packages/theme-sdk   theme manifest/template/style contracts.
themes/*             trusted theme packages.
plugins/*            trusted local plugin packages.
docs/*               research, architecture, ADRs, roadmap, testing, security.
```

Rules:

- `apps/admin` must never import server-only packages (`packages/database`,
  Prisma client, Node `fs`, server renderer internals).
- `apps/web` talks to the API over HTTP. It may import `packages/contracts` and
  `packages/theme-sdk`; it must not import the Prisma client or API internals.
- `packages/contracts` is isomorphic: no Node built-ins, no React, no database.
- `packages/block-system` exposes separate entrypoints for contracts (isomorphic),
  editor code (browser), and render code (Node). Do not create a barrel that
  accidentally pulls React into the API or database code into the browser.
- The API renderer is the canonical renderer for MVP. Themes compose API-rendered
  HTML; they do **not** re-implement core block rendering.
- No speculative packages. Create a package only when it has a real consumer and
  a documented boundary.

## 5. Content and editor rules

- Canonical content is **WordPress-compatible serialized block markup** stored in
  `posts.content` with `content_format = 'wp_block_html'` and a content version.
- Never silently drop unknown or unavailable blocks. Preserve raw content and
  render unknown blocks as their original inner HTML.
- One block registry/schema source. Editor defaults and renderer defaults must not
  be duplicated by hand.
- Server rendering escapes text and attributes, validates URLs and sanitizes
  allowed HTML. Raw HTML is not a free pass.
- Any block change requires serialization round-trip tests and golden render
  tests. Any editor dependency change requires a production build and a browser
  smoke test.

## 6. Database and migration rules

- PostgreSQL only. Do not add SQLite as a second production schema path.
- Prisma Migrate is the migration mechanism. Migrations are forward-only in
  deployed environments; destructive changes require a backup and an explicit
  approval.
- Never edit an applied migration. Add a new migration.
- Seed/bootstrap must be idempotent.
- Plugin-owned migrations are versioned, transactional and run under an advisory
  lock; they never modify core tables directly.
- Use UTC (`timestamptz`) for instants. The database session timezone is UTC.
- No raw SQL string interpolation. Use Prisma's parameterised APIs or tagged
  `Prisma.sql`.

## 7. Security rules

- Deny by default. Every admin/API mutating route checks authentication **and**
  object-level capability on the server. UI hiding is not authorization.
- Passwords use Argon2id (preferred) or bcrypt with an explicitly reviewed cost.
  Never store or log plaintext passwords or session tokens.
- Session cookies are `HttpOnly`, `Secure` in production, `SameSite=Lax` (or
  stricter), with a narrow path and expiry. State-changing requests require CSRF
  protection in addition to SameSite.
- Uploads: validate size, real MIME (magic bytes), extension allowlist; re-encode
  images; strip metadata; random filenames; no executable formats; no SVG until a
  sanitizer and a documented decision exist.
- Treat all block content as untrusted HTML. Use an allowlist sanitizer at render
  time, not regex-only escaping.
- Do not fetch arbitrary user-supplied URLs (SSRF). No external fetch in MVP
  beyond configured services.
- Secrets live in environment variables, never in docs, git, fixtures or logs.
  Redact tokens, cookies, passwords and PII from logs.
- Plugin code runs in the server process with server privileges. It is **not**
  sandboxed. Only trusted/reviewed local plugins may run; no automatic download
  or execution of remote plugins.
- Do not claim production security because a framework is used. Record residual
  risks in `docs/security/threat-model.md`.

## 8. Documentation rules

- Any material technical decision gets an ADR (or a dated entry in
  `DECISIONS.md`) **before** code changes.
- Record alternatives, evidence, trade-offs, security/compatibility impact and
  the reason for the choice.
- Update `docs/implementation-log.md` and `TASKS.md` at the end of every slice.
- Link documents from `README.md`; keep cross-links valid.
- Do not put secrets, credentials, customer data or private tokens in docs,
  fixtures or AI memory.
- Distinguish observed facts, recommendations and hypotheses. Cite file paths,
  commands, versions and URLs.

## 9. Testing and verification

Before claiming a slice is complete:

1. Run formatting/lint, typecheck, unit tests, integration tests and the relevant
   browser/E2E tests.
2. For content/editor changes: serialization round trips, golden HTML, unknown
   block preservation and XSS payload tests.
3. For auth/authorization changes: unauthenticated, wrong-role, wrong-object and
   malformed-input tests.
4. For migrations: apply from an empty database and from the previous schema;
   verify rollback/restore notes.
5. Inspect `git diff` for secrets, unsafe HTML, missing authorization, dead code,
   scope creep and generated artifacts.
6. Record exact commands and results. Label skipped tests and blockers.

Minimum commands once Phase 1 exists (names may be refined there):

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

## 10. Local development (implemented in Phase 1)

```bash
# Optional no-sudo PostgreSQL; or use a system PostgreSQL 18 server
pnpm db:local:init            # prints DATABASE_URL; loopback-only, port 55432
pnpm db:local:start

cp .env.example .env          # fill local values; never commit .env
pnpm install --frozen-lockfile
pnpm setup                    # generate client, apply migrations, idempotent seed
pnpm dev                      # api + admin + web
```

Expected local ports: API `4000`, admin `5173`, web `3000`. PostgreSQL 18 on
`5432` (or the project-local cluster on `55432`). Docker Compose is optional;
native PostgreSQL is the verified path. Phase 1 has no domain models and no
initial migration; `db:migrate` is a documented no-op and `db:seed` creates no
CMS data. See [local setup](docs/operations/local-setup.md).

## 11. Dependency and version policy

- Node is pinned to `24.22.1` (`.nvmrc`, `engines`); pnpm is pinned to
  `12.15.0` (`packageManager`). Do not float either in a way that changes the
  verified path.
- Pin exact versions in `package.json` for runtime/framework/editor packages;
  use the lockfile as the source of truth.
- Do not use `latest` for Prisma: the `latest` tag currently points at an 8.0 RC.
  Pin `prisma`, `@prisma/client` and `@prisma/adapter-pg` to the same stable
  version (7.10.1 at Phase 0).
- Do not install prereleases/RCs without an ADR and explicit approval.
- Before adding a dependency, check maintenance, licence, security advisories,
  bundle/runtime impact and whether the platform already provides the capability.
- Keep one copy of store-owning `@wordpress/*` packages. Verify with
  `pnpm why`/lockfile inspection and a production build.

## 12. What not to do

- Do not build a plugin marketplace, billing, multi-tenancy, cloud hosting,
  comments, forms, CRM, outreach, compliance workflows or e-commerce in the MVP.
- Do not port Qrolic's `qrolic/*` blocks or its Service/Job/Portfolio/Team CPTs
  into core. They are site-specific.
- Do not claim WordPress parity. Document differences.
- Do not run destructive commands (`rm -rf`, force-push, reset --hard, clean -fdx)
  against this repository or the references.
- Do not change global OpenCode configuration without a timestamped backup and a
  rollback note.

## 13. Reporting format for every slice

Report:

- What changed (files and user-visible behaviour).
- Exact commands to run and their results.
- How the owner can manually test it, step by step.
- Known limitations, skipped tests and security notes.
- The next proposed slice, without starting it.

Then stop and wait for approval.

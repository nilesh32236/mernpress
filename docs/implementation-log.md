# Implementation log

Append-only. Newest entries at the top. Record what was actually done, commands
and results, decisions, limitations and the next step. Do not record secrets.

---

## 2026-10-25 — Phase 1: repository foundation

**Status:** Phase 1 implementation complete and verified locally; **owner manual
test pending**. No Phase 2 or CMS feature code was started.

### Summary

- Added a pnpm 12.15.0 + Turborepo 2.11.10 workspace with Node 24.22.1 pinned.
- Added strict shared TypeScript, ESLint 10 + typescript-eslint + jsx-a11y +
  Prettier, import-boundary rules, `.editorconfig`, `.gitignore`, `.env.example`
  and environment validation.
- Added `packages/database` (Prisma 7.10.1 + `@prisma/adapter-pg`, UTC-pinned
  session, empty schema, connectivity/seed scripts).
- Added `apps/api` (Fastify 5 app factory, logging/request IDs, error envelope,
  helmet, explicit CORS, graceful shutdown, `/api/health`, `/api/ready`).
- Added `apps/admin` (React 19 + Vite 8 placeholder) and `apps/web` (Next.js 16
  App Router + Tailwind 4 placeholder). Neither contains CMS features.
- Added Vitest tests, Playwright smoke tests, a setup script, an optional
  no-sudo local PostgreSQL helper, CI, and operator/testing documentation.
- Did not copy reference code, did not touch the reference repositories, and did
  not run `codegraph init`.

### Preflight findings and decisions

| Check | Result |
| --- | --- |
| Node 24.22.1 available | Yes, Krypton LTS; installed with `nvm install 24.22.1` |
| pnpm line | 12.15.0 is current stable (12.0.0 2026-08-26, 12.15.0 2026-10-21); Node `>=18`; adopted for a new workspace. D-001/ADR 0001 updated |
| ESLint line | ESLint 9.39.5 is marked "no longer supported"; ESLint 10.13.0 + `@eslint/js` 10.0.1 adopted. `eslint-plugin-jsx-a11y` 6.10.2 declares ESLint ≤9 but its `alt-text` rule was verified failing correctly on ESLint 10.13.0, so an explicit `peerDependencyRules` override is documented (D-016) |
| Prisma 7 config | `prisma7.config.ts` + `prisma-client` generator + `@prisma/adapter-pg`; schema has no models; client generation and adapter verified in a throwaway project first |
| Empty-schema migrations | `prisma migrate deploy` exits 0 with "No migration found"; it creates only `_prisma_migrations`. No empty migration or fake CMS rows were added (D-017) |
| UTC | Adapter pool uses `options: '-c timezone=UTC'`; verified `SHOW TimeZone` = UTC |
| UUIDv7 | PostgreSQL 18 `uuidv7()` verified; Prisma `@default(uuid(7))` also verified in the throwaway probe (not needed without models) |
| Local PostgreSQL service | System server runs 18.3 but the current OS user has no role and no sudo; verification used a loopback-only project cluster on port 55432. CI uses PostgreSQL 18 as a service |
| Peer graph | Install passes with the pinned graph; only the documented jsx-a11y/ESLint override is declared |

### Commands and results

All commands ran with Node `v24.22.1` and pnpm `12.15.0` unless stated.

| Command | Status | Evidence / summary |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | PASS | 5 workspace projects; lockfile up to date; no peer/build errors |
| `pnpm setup` | PASS | Generated Prisma client; migrate no-op; seed no-op |
| `pnpm db:migrate` | PASS | "No migration found in prisma/migrations"; "No pending migrations to apply"; `_prisma_migrations` exists |
| `pnpm db:seed` (twice) | PASS | Identical no-op message; exit 0 both times; no CMS rows |
| `pnpm db:verify` | PASS | `timezone=UTC`; UUIDv7 printed |
| `pnpm lint` | PASS | ESLint 10, 0 errors |
| `pnpm format:check` | PASS | All code/config files formatted; Markdown intentionally excluded from Prettier |
| `pnpm typecheck` | PASS | 5 turbo tasks: database build/typecheck, API, admin, web |
| `pnpm test` | PASS | 12 tests: API 9 (health, readiness 200/503, error envelope, env), admin 2, web 1 |
| `pnpm build` | PASS | API/database tsc; admin 221.26 kB JS (69.18 kB gzip), 2.74 kB CSS; Next 4 static routes |
| `pnpm dev` | PASS | API 4000, admin 5173, web 3000 all started |
| `curl /api/health` | PASS | 200, `{"status":"ok","service":"mernpress-api",...}` |
| `curl /api/ready` with DB | PASS | 200, `{"status":"ready","checks":{"database":"ok"}}` |
| DB stopped: `/api/ready` | PASS | 503, `{"status":"not_ready","checks":{"database":"unavailable"}}` |
| DB stopped: `/api/health` | PASS | 200; API process remained alive |
| DB restarted: `/api/ready` | PASS | 200 again without restarting the API |
| `pnpm test:e2e` | PASS | 3 Playwright tests; both placeholders clean console/assets; API liveness 200 |
| `pnpm audit --audit-level=high` | PASS | "No known vulnerabilities found" |
| CI YAML parse | PASS | `.github/workflows/ci.yml` parsed with PyYAML |
| GitHub Actions run | BLOCKED / UNVERIFIED | No remote/runner available from this machine; CI is configured, not executed |
| `codegraph init` | SKIPPED | Indexing is the owner's decision; the MCP was verified in Phase 0 and no index was created |
| `opencode-mem` update | SKIPPED | Not part of Phase 1; global OpenCode config was not modified |

### Database semantics

- The Prisma schema is intentionally empty; no migration directory exists.
- `db:migrate` is a documented no-op that also verifies connectivity. On a new
  database Prisma creates `_prisma_migrations` (bookkeeping only).
- `db:seed` is a deterministic, idempotent no-op. It creates no administrator,
  user, post, page, term, media or settings row.
- The first migration and seed data are Phase 2 work.

### Scope and security checks

- No authentication/session, user, content CRUD, editor, media, taxonomy, theme
  or plugin runtime code exists.
- `.env` is ignored; only `.env.example` placeholders are tracked.
- API CORS uses explicit origins with credentials and rejects wildcards.
- Readiness responses expose no connection details.
- Health/readiness headers include the standard helmet set; the API returns a
  request-id response header.
- No reference repository or global OpenCode configuration was modified.
- `.local/`, generated Prisma code, build output and Playwright artifacts are
  gitignored.

### Clean-clone verification (2026-10-25)

A separate clone of commit `48bdbc5` was tested against a brand-new database
(`mernpress_clean_1792869640` on the project-local PostgreSQL 18.3 cluster).

| Step | Status | Evidence |
| --- | --- | --- |
| `git clone` + `git log -1` | PASS | Clone at commit `48bdbc5` |
| `pnpm install --frozen-lockfile` | PASS | Cold install completed (6m due to registry latency); no peer/build bypass |
| `pnpm setup` | PASS | No migrations; seed no-op; UTC/UUIDv7 verified |
| `pnpm lint` | PASS | 0 errors |
| `pnpm format:check` | FAIL → PASS | First run flagged Next-regenerated `apps/web/next-env.d.ts`; excluded that generated file from Prettier in `f344791`, fast-forwarded the clone and re-ran: PASS |
| `pnpm typecheck` | PASS | `next typegen` + 5 turbo tasks |
| `pnpm test` | PASS | 12 tests (API 9, admin 2, web 1) |
| `pnpm build` | PASS | Admin, API, database and Next production builds |
| `pnpm dev` | PASS | API 4000, admin 5173, web 3000 |
| Health/readiness | PASS | 200/200 on the fresh database |
| Database inspection | PASS | Only `_prisma_migrations` exists |
| `pnpm test:e2e` | PASS | 3 Playwright tests |

The clone's dev servers were stopped afterward so the owner's manual test starts
from free ports.

### Final re-verification (2026-10-25)

After the generated-file cleanup and the `test:e2e` precondition fix, the clean
clone was fast-forwarded to `b69e043` and re-tested with no `apps/web/.next` and
no `apps/web/next-env.d.ts` present:

- `pnpm typecheck` regenerated Next route types and passed.
- `pnpm test` passed.
- `pnpm build` passed.
- `pnpm test:e2e` generated the Prisma client first and passed 3/3.
- `git status` remained clean; all dev-server ports were free afterward.

This is the authoritative clean-clone result for the final Phase 1 code state.

### Independent review (2026-10-25)

A read-only review used a different configured free model
(`opencode/glm-5.3-flash-free`) against commit `7b4ad5a`. It did not edit files
and did not re-run build/test/dev; it inspected code, config and the recorded
evidence.

**Verdict: PASS WITH ISSUES — all 10 acceptance gates satisfied, no blocking
issues, no CMS feature and no tracked secret found.** Findings and actions:

| Finding | Action |
| --- | --- |
| `test:e2e` did not generate the Prisma client first, so an isolated fresh-clone E2E run could fail | Fixed: `test:e2e` now runs `pnpm db:generate` first; re-ran Playwright: 3/3 pass |
| Next regenerates `apps/web/next-env.d.ts`, causing format churn | Resolved: `next-env.d.ts` is gitignored and regenerated by `next typegen` / dev / build; Next's generated `apps/web/AGENTS.md` is committed as Next intends |
| `pnpm audit --audit-level=high` can fail CI on a newly published advisory | Intentional: keep the blocking gate; review the advisory rather than weakening it |
| Readiness logs only a generic message, losing the failure cause | Intentional anti-leak default; revisit structured debug-level diagnostics in a later phase |
| Stale ADR line said Node 24 was not installed | Fixed: ADR 0001 now records the Phase 1 installation/verification |
| Reviewer shell exposed Node 22/pnpm 11 | Environment mismatch, not a repo defect; Node/pnpm pins, setup checks, CI and `.nvmrc` defend against it |

The reviewer did not run the commands itself (read-only constraint), so the
command evidence above remains the authoritative record.

### Limitations / unfinished checks

- Owner manual acceptance has not run yet.
- CI has not run on GitHub Actions.
- The clean clone surfaced and fixed one formatting-gate issue: Next regenerates
  `apps/web/next-env.d.ts`, so it is excluded from Prettier. No code behavior
  changed.
- The local verification database was PostgreSQL 18.3 (project-local cluster),
  not 18.6; the SQL used is compatible with PostgreSQL 18.
- `pnpm dev` scripts use POSIX `NODE_OPTIONS`; Windows native shells are not a
  supported Phase 1 path.
- The admin/web pages are placeholders; accessibility is limited to semantic
  structure, skip link, focus styles and a clean browser smoke test. A full axe
  pass belongs to Phase 4.
- `docs/research/opencode-tooling.md` still records the Phase 0 decision to skip
  `opencode-mem`; it was not rewritten because Phase 1 did not change OpenCode
  tooling.

### Next step

Owner manually tests [the Phase 1 checklist](testing/phase-1-manual-test.md) and
approves or rejects the foundation. If approved, implement only **Phase 2 —
secure admin authentication**; do not start content, editor or theme work.

---

## 2026-10-25 — Phase 1 preflight

Short preflight entry required before implementation.

- Read `AGENTS.md`, `README.md`, `TASKS.md`, `DECISIONS.md`, ADR 0001, the system
  overview, threat model, testing strategy, roadmap Phase 1 and the Phase 0 log.
- `pwd` = `/home/nilesh/Documents/big-project/mernpress`; branch `master`; commit
  `60cc1d1`; working tree clean before changes.
- Installed Node 24.22.1 with nvm and pnpm 12.15.0 globally.
- Checked current registry versions and peer ranges for Node, pnpm, Turbo,
  TypeScript, ESLint, typescript-eslint, jsx-a11y, Fastify, Prisma, adapter-pg,
  React, Vite, Next, Tailwind, Vitest and Playwright.
- Recorded D-016 (ESLint 10 + tested jsx-a11y override) and D-017 (no Phase 1
  migration, explicit no-op seed) before writing application code.
- Confirmed `prisma migrate deploy` on an empty schema is a successful no-op and
  that `@prisma/adapter-pg` can pin UTC and use PostgreSQL 18 `uuidv7()`.

## 2026-10-24 — Phase 0: research and architecture baseline

**Status:** Phase 0: planning only; **product feature code not started.**

### Summary

- Inspected the supplied WordPress 7.1.3 source and the four extracted reference
  projects: `qrolic-cms-main`, `qrolichealth-cms-main`,
  `qrolic-frontend-main`, `qrolichealth-main`.
- Produced read-only audits of CMS core, Health CMS delta, both frontends,
  WordPress core and the Gutenberg/block system.
- Compared the current stack options against official docs and npm registry
  metadata; verified a pinned Gutenberg package set with a throwaway Vite build.
- Audited the installed OpenCode environment, free-model inventory and tooling
  candidates; backed up config and installed CodeGraph CLI 1.6.2 with telemetry
  disabled.
- Wrote the Phase 0 documents listed below. Created no applications, packages,
  database migrations, themes or plugins.

### What was actually inspected

- `../wordpress`: `wp-includes/version.php` (`$wp_version = '7.1.3'`), core files
  for posts, revisions, capabilities, hooks, blocks, REST, templates, media,
  options, security.
- `../qrolic-cms-main`: README, codemap, package manifests, Prisma schema and
  migrations, API routes/controllers/services/middleware, admin structure,
  shared block registry, tests, docs, changelog, env names (no values).
- `../qrolichealth-cms-main`: `diff -rq` against the baseline, schema/migrations,
  forms/outreach/leads/Brevo/compliance code, tests, docs, env names.
- `../qrolic-frontend-main`: Next app structure, CMS client/cache/DTO/SEO,
  routes, tests, deploy config.
- `../qrolichealth-main`: Next app structure, CMS client, block adapters,
  preview, SEO, security headers, forms API integration.
- OpenCode: `opencode --version` (2.1.4), `opencode debug config`,
  `opencode plugin list`, `opencode mcp list`, `opencode models`, model cost
  metadata via the OpenCode tool catalog.

### Commands / evidence (key)

```bash
grep -E "wp_version =|wp_db_version" ../wordpress/wp-includes/version.php
# $wp_version = '7.1.3'; $wp_db_version = 61833

node --version        # v22.23.1
pnpm --version        # 11.13.1
psql --version        # PostgreSQL 18.3
docker --version      # not installed
opencode --version    # 2.1.4

npm view prisma dist-tags          # latest = 8.0.0-rc.27
npm view @prisma/client dist-tags  # latest = 7.10.1
npm view typescript dist-tags      # latest = 7.0.2
npm view typescript-eslint peerDependencies  # typescript <6.1.0
```

Gutenberg compatibility spike (throwaway, not committed):

```bash
cd /tmp/opencode/wp-compat-20261024
pnpm install --strict-peer-dependencies --ignore-scripts   # passed, 229 packages
pnpm exec vite build                                      # passed
node parse-test.mjs                                       # nested group/columns parsed
node roundtrip-test.mjs                                   # native Node import of @wordpress/blocks fails
```

Observed bundle: ~5,878 kB main JS (gzip ~1,342 kB), ~474 kB CSS, ~13,449 kB vips
worker, ~406 kB video-conversion worker. This is a Phase 5 performance gate.

### OpenCode tooling

- Config backup: `/home/nilesh/.config/opencode/backups/20261024-232029`
  (mode 700; files 600; `auth.json`/`service.json` excluded).
- Installed `@colbymchenry/codegraph@1.6.2` globally; `codegraph --version` =
  1.6.2; `codegraph telemetry off` succeeded. Not wired to OpenCode, not indexed.
- Context7 0.2.1 connected; gh_grep connected; opencode_console connected; GitHub
  MCP failed with a 404 for `@github/github-mcp-server` (known issue, not fixed).
- `opencode-mem` 2.33.0 skipped: Bun absent, 0.5–2 GB RAM for local embeddings,
  1–2 GB model cache, auto-capture privacy/storage, no code to remember yet.
- CodeGraphContext skipped: redundant with CodeGraph, Python/graph DB overhead.
- Playwright MCP skipped: project Playwright is the plan.
- No paid model/API was used. Free-model cross-check: DeepSeek V4.1 Flash Free and
  GLM-5.3 Flash Free; both preferred Drizzle and React Router 7, split on API.
  Final choices (Prisma/Next/Fastify) and dissent are recorded in the stack
  comparison and ADR.

### Decisions recorded

- ADR 0001: Node 24 LTS, Fastify 5, PostgreSQL 18, Prisma 7.10.1, React 19 + Vite
  8, official Gutenberg packages, Next 16, TypeScript 5.9.3, pnpm 11 + Turbo.
- D-002..D-015: PostgreSQL only; WordPress block markup canonical; API owns
  rendering; unknown blocks preserved; one block registry; trusted plugins; theme
  packages; modular monolith; Docker optional; TS 5.9.3; Prisma pinned; official
  parser first; Phase 1 first slice.

### Documents created

`README.md`, `AGENTS.md`, `TASKS.md`, `DECISIONS.md`,
`docs/research/reference-codebase-audit.md`, `docs/research/feature-matrix.md`,
`docs/research/wordpress-core-audit.md`, `docs/research/stack-comparison.md`,
`docs/research/opencode-tooling.md`, `docs/architecture/system-overview.md`,
`docs/architecture/content-model.md`,
`docs/architecture/gutenberg-and-rendering.md`,
`docs/architecture/plugins-and-themes.md`, `docs/adr/0001-baseline-stack.md`,
`docs/roadmap/roadmap.md`, `docs/roadmap/mvp-definition.md`,
`docs/testing/strategy.md`, `docs/security/threat-model.md`, this log.

### Not done / limitations

- No product feature code, apps, packages, migrations, themes or plugins.
- No reference repository was modified or run.
- No browser editor test; only dependency resolution and a production build.
- No real-corpus parser test; the synthetic nested fixture passed.
- No Node 24 run; the spike used Node 22.23.1.
- No Docker; native PostgreSQL is the verified local assumption.
- No reference test suite was executed (read-only).
- OpenCode config was not rewritten; the deprecated `plugin` key is still merged
  with `plugins` and should be cleaned up in a maintenance window.
- GitHub MCP remains broken; gh_grep/context7 are the working alternatives.

### Verification of Phase 0

- **Independent verifier:** read-only review returned **PASS WITH ISSUES (minor
  only, no blockers)**. All 19 required files present and non-trivial; coverage,
  cross-document versions, no-product-code, no-secrets and link checks passed.
- **Documentation link check:** passed on 2026-10-24 — 19 Markdown files, 46
  relative links, **0 missing files, 0 broken anchors**.
- **Consistency check:** baseline versions/decisions cross-referenced in README,
  ADR, stack comparison, roadmap and TASKS; no contradiction found. The deliberate
  free-model dissent on Drizzle/React Router is recorded rather than hidden.
- **Code check:** `find` shows only Markdown files plus `.git`; no
  `package.json`, `tsconfig`, source, migration, theme or plugin code.
- **Secret check:** regex scan for private keys, tokens, passwords and credential
  values returned no matches. (`auth.json`/`service.json` were never copied.)
- **Reference integrity:** reference directories were read-only; no files were
  modified. The existing `.codegraph` directory in `qrolichealth-main` predates
  this audit and was not created by it.
- **Known limitations:** local Node/pnpm/PostgreSQL versions differ from the
  pinned baseline (Node 22.23.1 vs 24.22.1; pnpm 11.13.1 vs 11.28.8; PostgreSQL
  18.3 vs 18.6). Phase 1 must install/pin Node 24 and re-run checks. The GitHub
  MCP is broken in the current OpenCode config but is not a Phase 0 deliverable.
- **Minor issue fixed:** the earlier "link check to be run" note in this log was
  replaced with the actual result above.

### Next step

Owner review. If approved, start **Phase 1 — repository foundation** only:
workspace, Node/pnpm/Postgres checks, Prisma baseline, health endpoints, app
skeletons, tests/CI, clean-clone setup. Then stop for testing. The first
user-facing product feature is Phase 2 authentication.

**Phase 0: planning only; product feature code not started.**

# Implementation log

Append-only. Newest entries at the top. Record what was actually done, commands
and results, decisions, limitations and the next step. Do not record secrets.

---

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

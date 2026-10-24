# DECISIONS.md — decision index

This is the index of material decisions. Each entry links to the full reasoning.
A decision is not final until it is recorded here (or in an ADR) before the
associated code changes. Superseded decisions stay visible.

## Accepted

| ID | Date | Decision | Status | Record |
| --- | --- | --- | --- | --- |
| D-001 | 2026-10-24 | Baseline stack: Node 24 LTS, Fastify 5, PostgreSQL 18, Prisma 7.10.1, React 19 + Vite 8, official Gutenberg packages, Next.js 16, TypeScript 5.9.3, pnpm 11 + Turborepo | accepted | [ADR 0001](docs/adr/0001-baseline-stack.md) |
| D-002 | 2026-10-24 | PostgreSQL is the only database; no SQLite production/dev schema split | accepted | [content model](docs/architecture/content-model.md#database-choice) |
| D-003 | 2026-10-24 | Canonical content is WordPress-compatible serialized block markup, versioned; not a proprietary JSON format in MVP | accepted | [Gutenberg](docs/architecture/gutenberg-and-rendering.md#content-contract) |
| D-004 | 2026-10-24 | The API owns canonical rendering for MVP; themes consume rendered HTML and do not re-implement core block rendering | accepted | [Gutenberg](docs/architecture/gutenberg-and-rendering.md#rendering-contract) |
| D-005 | 2026-10-24 | Unknown/unavailable blocks are preserved and rendered as safe inner HTML, never dropped | accepted | [Gutenberg](docs/architecture/gutenberg-and-rendering.md#unknown-blocks) |
| D-006 | 2026-10-24 | One block registry/schema source shared by editor and API; no hand-duplicated defaults | accepted | [Gutenberg](docs/architecture/gutenberg-and-rendering.md#block-registry) |
| D-007 | 2026-10-24 | Plugins are trusted local packages running in-process; no sandbox claim, no remote auto-install | accepted | [plugins/themes](docs/architecture/plugins-and-themes.md#plugin-security-boundary) |
| D-008 | 2026-10-24 | Themes are trusted local React/Next packages selected by config; no visual theme editor in MVP | accepted | [plugins/themes](docs/architecture/plugins-and-themes.md#theme-contract) |
| D-009 | 2026-10-24 | Modular monolith: separate apps/packages, one API deployment, no microservices in MVP | accepted | [system overview](docs/architecture/system-overview.md#deployment-model) |
| D-010 | 2026-10-24 | Docker Compose is optional; native PostgreSQL 18 is the verified local path because Docker is absent on the current machine | accepted | [stack comparison](docs/research/stack-comparison.md#local-runtime) |
| D-011 | 2026-10-24 | Use TypeScript 5.9.3, not 7.0.2, because `typescript-eslint` 8.72 declares TypeScript `<6.1.0`; revisit when the toolchain supports 7 | accepted | [ADR 0001](docs/adr/0001-baseline-stack.md#typescript-version) |
| D-012 | 2026-10-24 | Freeze Prisma at 7.10.1 (`prisma`, `@prisma/client`, adapter all aligned); the npm `latest` tag is an 8.0 RC | accepted | [stack comparison](docs/research/stack-comparison.md#orm-and-migrations) |
| D-013 | 2026-10-24 | Use the official `@wordpress/block-serialization-default-parser` 6.0.0 first; port `WP_Block_Parser` only if the real corpus reproduces a failure | accepted | [Gutenberg](docs/architecture/gutenberg-and-rendering.md#parser) |
| D-014 | 2026-10-24 | The first implementation slice is the Phase 1 foundation, not a CMS feature; the first product feature is Phase 2 authentication | accepted | [roadmap](docs/roadmap/roadmap.md#phase-1-foundation) |
| D-015 | 2026-10-24 | CodeGraph CLI 1.6.2 is installed for later use; telemetry disabled. opencode-mem and CodeGraphContext are not installed in Phase 0 | accepted | [OpenCode tooling](docs/research/opencode-tooling.md#installed-tooling) |

## Proposed / unresolved

These are deliberately not decided yet. Do not implement them as if settled.

| ID | Question | Why unresolved | Needed by |
| --- | --- | --- | --- |
| U-001 | Exact MVP block list after browser testing | Package compatibility is verified; editor UX and renderer coverage are not | Phase 5 |
| U-002 | Whether to import individual `@wordpress/block-library/build-module/*` blocks to cut the 5.9 MB bundle | Subpath is exported but not a stable public API; needs a build + upgrade test | Phase 5 |
| U-003 | Whether to keep `@wordpress/blocks` out of the API permanently | Its ESM build fails native Node import on JSON attributes; a bundler or a pure parser path is needed | Phase 5 |
| U-004 | Revision retention counts and autosave interval | Needs real editing tests and storage measurements | Phase 8 |
| U-005 | Plugin migration isolation (schema per plugin vs shared schema with prefixed tables) | Security and operational trade-offs; plugin SDK not built | Phase 9 |
| U-006 | Theme distribution model (workspace package vs npm package vs local directory) | Depends on whether themes are shipped with core or installed separately | Phase 10 |
| U-007 | Whether Next.js `use cache` is used for public pages or a simpler explicit cache | Cache correctness and self-hosting behavior need measurement | Phase 7 |

## Superseded

None yet.

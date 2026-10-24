# MERNPress

MERNPress is a Node.js/TypeScript content management system inspired by WordPress:
a familiar admin, a real Gutenberg block editor, a theme/template layer, and a
versioned plugin API. It is a **new, clean project**. The Qrolic CMS repositories
and the supplied WordPress source are reference material only; they are not part
of this repository and must not be modified.

The name is a project name, not a database mandate. MERNPress uses **PostgreSQL**.

## Current phase

**Phase 0 — research, audit and architecture baseline.** Complete pending review.

> **Not implemented yet.** There are no applications, packages, database
> migrations, themes or plugins in this repository. This phase contains
> documentation only. Product-feature implementation starts only after explicit
> approval and begins with the Phase 1 foundation slice.

The reference archives were inspected read-only and are deliberately outside
this repository (see [reference audit](docs/research/reference-codebase-audit.md)).
No CMS feature code was copied, generated or migrated.

## What MERNPress is intended to become

- A small but useful CMS for pages, posts, media, taxonomies, users and settings.
- A WordPress-style editing experience built on the official `@wordpress/*`
  block editor packages where practical.
- A public site rendered by a separately managed theme/template package.
- An extensible core: hooks/filters, custom content types, custom blocks, admin
  pages, settings, routes and plugin-owned migrations.
- A monorepo with clear application boundaries and independently buildable apps.
- Easy to run locally without paid services or mandatory cloud infrastructure.

## Baseline stack (decided in Phase 0)

| Area | Choice | Version / note |
| --- | --- | --- |
| Runtime | Node.js Active LTS | **24.22.1** (Krypton, 2026-10-20); local Node 22.23.1 must be upgraded in Phase 1 |
| Package manager | pnpm workspaces | **11.28.8** |
| Build orchestration | Turborepo | **2.11.10** |
| Language | TypeScript strict | **5.9.3** (latest is 7.0.2; deferred — see ADR 0001) |
| API | Fastify | **5.12.7** |
| Database | PostgreSQL | **18.6** current major (local 18.3) |
| ORM / migrations | Prisma | **7.10.1** pinned; do **not** use the `latest` tag (currently 8.0.0-rc) |
| Validation | Zod | **4.6.7** across contracts and env |
| Admin | React + Vite | React **19.3.1**, Vite **8.3.5** |
| Editor | official `@wordpress/*` packages | `@wordpress/block-editor` **19.0.0** and a pinned companion set |
| Public frontend | Next.js App Router | **16.4.3**, React 19.3.1, Tailwind **4.3.3** |
| Unit/integration tests | Vitest | **5.0.5** |
| Browser tests | Playwright | **1.64.1** |

The evidence, alternatives and rejected options are in
[stack comparison](docs/research/stack-comparison.md) and
[ADR 0001](docs/adr/0001-baseline-stack.md).

## Prerequisites (once Phase 1 exists)

- Node.js 24.22.x LTS
- pnpm 11.28.x
- PostgreSQL 18.x (native install works; Docker is optional, not required)
- No paid service is required for local development.

This machine currently has Node 22.23.1, pnpm 11.13.1, PostgreSQL 18.3 and no
Docker. Phase 1 must install/pin Node 24 and verify the clean-clone path; the
absence of Docker is why Docker Compose is offered as an option rather than a
hard requirement.

## Licensing status

The MERNPress project licence is **not chosen yet**. Do not distribute the project
publicly until it is. The reference Qrolic repositories have **no root LICENSE
file and no `package.json` licence field**; treat them as proprietary/unclear and
do not copy their source. WordPress is GPLv2-or-later, and the official
`@wordpress/*` packages are GPL-2.0-or-later; a dependency/licence review is
required before shipping a Gutenberg-based distribution. Details are in the
[reference audit](docs/research/reference-codebase-audit.md#9-licensing-observations).

## Documentation map

Start here, then follow the links.

| Document | Purpose |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Permanent instructions for AI agents and contributors |
| [TASKS.md](TASKS.md) | Staged backlog, statuses, dependencies and acceptance criteria |
| [DECISIONS.md](DECISIONS.md) | Decision index and links to ADRs |
| [docs/research/reference-codebase-audit.md](docs/research/reference-codebase-audit.md) | What was inspected in WordPress, Qrolic CMS, Health CMS and both frontends |
| [docs/research/feature-matrix.md](docs/research/feature-matrix.md) | Feature-by-feature comparison and MVP/next/later/out classification |
| [docs/research/wordpress-core-audit.md](docs/research/wordpress-core-audit.md) | WordPress 7.1.3 mechanisms worth emulating, adapting or avoiding |
| [docs/research/stack-comparison.md](docs/research/stack-comparison.md) | Current versions, compatibility evidence, alternatives and trade-offs |
| [docs/research/opencode-tooling.md](docs/research/opencode-tooling.md) | OpenCode version, free-model inventory, installed/skipped tooling and backups |
| [docs/architecture/system-overview.md](docs/architecture/system-overview.md) | Components, boundaries, request/content flow and local runtime |
| [docs/architecture/content-model.md](docs/architecture/content-model.md) | Entities, lifecycle, slugs, media, taxonomy, revisions and migrations |
| [docs/architecture/gutenberg-and-rendering.md](docs/architecture/gutenberg-and-rendering.md) | Content format, block registry, editor integration, renderer and parity tests |
| [docs/architecture/plugins-and-themes.md](docs/architecture/plugins-and-themes.md) | Versioned plugin and theme contracts, lifecycle and safety boundaries |
| [docs/adr/0001-baseline-stack.md](docs/adr/0001-baseline-stack.md) | Why this stack, what was rejected and what remains uncertain |
| [docs/roadmap/roadmap.md](docs/roadmap/roadmap.md) | Phase-by-phase implementation order, gates and acceptance criteria |
| [docs/roadmap/mvp-definition.md](docs/roadmap/mvp-definition.md) | Explicit MVP scope, non-goals and definition of done |
| [docs/testing/strategy.md](docs/testing/strategy.md) | Unit, integration, E2E, migration, serialization, security and a11y testing |
| [docs/security/threat-model.md](docs/security/threat-model.md) | Assets, trust boundaries, threats, mitigations and residual risks |
| [docs/implementation-log.md](docs/implementation-log.md) | Dated record of what was actually done |

## Phase 0 evidence summary

- WordPress **7.1.3** verified in `wp-includes/version.php`; WordPress API reports
  7.1.3 as current on 2026-10-24.
- The supplied CMS archives are near-forks of one Node.js CMS. The Health version
  is a healthcare lead-generation/compliance fork, not a generic skin.
- The reference CMS already stores WordPress-compatible block markup and renders
  it server-side. That is the strongest reusable design lesson; its 30+ custom
  `qrolic/*` blocks and CPTs are site-specific and stay out of core.
- Gutenberg dependency resolution was tested with React 19.3.1 and the pinned
  package set: strict peer resolution passed, a Vite 8 production build succeeded,
  and the official block parser 6.0.0 parsed nested `group/columns/column` markup
  correctly in Node. The editor bundle is large (≈5.9 MB minified JS plus a
  ≈13.4 MB vips worker artifact); this is a Phase 5 performance gate.
- The reference's old parser workaround is **not** assumed to apply to v6. We will
  test the official parser against the real corpus and only port `WP_Block_Parser`
  if a reproducible failure remains.
- Free-model cross-check was performed with two distinct free models. They
  disagreed with two of the three provisional choices; the dissent and the
  evidence used to overrule it are recorded in the stack comparison.

## Next step

Review the Phase 0 documents. If approved, implementation starts with
**Phase 1 — repository foundation**, a small bootable slice: pnpm/Turborepo
workspace, Node/Postgres checks, Prisma migration, `/api/health`, admin/web dev
servers, lint/typecheck/test/build, and a clean-clone setup path. The first
user-facing product feature after that is secure admin authentication (Phase 2).

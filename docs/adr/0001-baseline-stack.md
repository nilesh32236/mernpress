# ADR 0001 — Baseline stack

- Status: Accepted (Phase 0)
- Date: 2026-10-24
- Deciders: project owner + Phase 0 architecture review
- Supersedes: none
- Related: [stack comparison](../research/stack-comparison.md),
  [content model](../architecture/content-model.md),
  [Gutenberg](../architecture/gutenberg-and-rendering.md)

## Context

MERNPress is a new Node.js/TypeScript CMS inspired by WordPress. It is a hobby
project that should run locally without paid services and be deployable later. It
needs a WordPress-like admin, a real Gutenberg editor, a theme layer, and a
versioned plugin API. The reference CMSes are Express/React/Prisma/PostgreSQL;
WordPress 7.1.3 is the behavioural reference.

The stack must balance:

- maintainability for a small/solo team;
- a real block editor, not a lookalike;
- relational content and safe migrations;
- SEO/SSR for the public site;
- local setup without Docker or cloud dependencies;
- security patch discipline and a credible upgrade path;
- the ability to change course without rewriting the content contract.

The stack was not chosen by benchmark or popularity. Versions were checked on
2026-10-24; compatibility claims are separated from judgement.

## Decision

| Area | Decision |
| --- | --- |
| Runtime | **Node.js 24.22.1 LTS** (`>=24 <25`), pnpm **11.28.8**, Turborepo **2.11.10** |
| Language | **TypeScript 5.9.3**, strict mode |
| API | **Fastify 5.12.7**, modular monolith, Zod 4.6.7 boundary validation |
| Database | **PostgreSQL 18.6** (current major; local 18.3) |
| ORM/migrations | **Prisma 7.10.1**, pinned exactly (`prisma`, `@prisma/client`, `@prisma/adapter-pg`) |
| Admin | **React 19.3.1 + Vite 8.3.5** SPA |
| Editor | official `@wordpress/*` set: `block-editor 19.0.0`, `blocks 17.0.0`, `block-library 12.0.0`, etc. |
| Public web | **Next.js 16.4.3** App Router, React 19.3.1, Tailwind 4.3.3, Node self-hosting |
| Tests | **Vitest 5.0.5**, **Playwright 1.64.1**, Testing Library 16.3.3, jsdom 30.1.3 |
| Lint/format | **ESLint 10.13.0 + typescript-eslint 8.72.0 + jsx-a11y + Prettier 3.9.10** |
| Content | WordPress-compatible serialized block markup, versioned; API renders canonical HTML |
| Local DB | Native PostgreSQL 18 verified; Docker Compose optional (Docker is absent here) |

## Why these choices

### Node 24 LTS

Node 24 is the Active LTS line in October 2026. Prisma 7.10.1 (`^20.19 || ^22.12
|| >=24`), Vite 8 (`^20.19 || >=22.12`) and Vitest 5 (`^22.12 || ^24 || >=26`) all
support it. Node 25 is Current, not a baseline. The local machine has Node 22.23.1;
Phase 1 must install/pin 24 and run verification there.

### Fastify 5, not NestJS or Express 5

Fastify gives schema-based validation/serialization, pino logging, a small core
and official plugins. The API is a modular monolith; domain services stay
framework-agnostic. NestJS's DI/modules are valuable for a large team but add
decorator/metadata/abstraction overhead and complicate dynamic plugin modules.
Express 5 would work, but the reference already shows route/controller growth
without a strong validation/logging boundary.

This is a reversible choice at the HTTP layer. If the module graph becomes hard
to reason about, the services can be wrapped in Nest later.

### PostgreSQL 18 + Prisma 7.10.1

PostgreSQL is the right fit for relational content, terms, media, revisions,
capabilities and jobs. It provides transactions, constraints, JSONB, full-text
search and `FOR UPDATE SKIP LOCKED`. MongoDB is rejected because the CMS is
relationship-heavy; SQLite is rejected as a second schema path.

Prisma 7.10.1 is stable, has a mature migration workflow and a declarative schema.
**Critical version trap:** the npm `latest` tag for `prisma` points at
`8.0.0-rc.27`, while `@prisma/client` latest is `7.10.1`. Using `latest` would
install an RC/mismatched pair. Pin all three Prisma packages to 7.10.1.

Drizzle 0.45.4 was the strongest alternative (both free reviewers preferred it).
It is SQL-first, has no engine binary and is attractive for plugin-owned tables.
It is still pre-1.0 with less settled migration tooling. For a first CMS where
migration safety and documentation matter, Prisma wins. This is a judgement call;
the repository layer isolates it, but migrations make a late switch expensive.

### React 19 + Vite 8 admin

The admin is a client-heavy SPA; SSR adds little. Vite 8 + plugin-react 6.1.2 is
current and fast. The selected `@wordpress/*` 19.0.0 packages declare React
`^18 || ^19`, and a strict peer install with React 19.3.1 passed. A single React
copy is mandatory.

### Official Gutenberg packages

The official packages are the only credible way to get a real WordPress-like
editor without rebuilding it. The selected set is pinned; a throwaway Vite
production build succeeded, CSS paths exist, and the official parser 6.0.0 parsed
nested group/columns markup correctly in Node. Risks remain: the editor was not
opened in a browser, the bundle is large (≈5.9 MB JS + 13.4 MB vips worker
artifact), and `@wordpress/blocks` cannot be imported natively in Node. These are
Phase 5 gates, not reasons to invent an editor.

### Next.js 16 public web

Both reference frontends use Next 16 App Router; the ecosystem provides SSR,
metadata, sitemap/robots and image optimization; self-hosting is documented. The
alternative (React Router 7 SSR) is simpler and was preferred by both free
reviewers, but it would require rebuilding more platform behavior and diverges
from existing knowledge. Mitigation: theme components stay framework-agnostic;
Next-specific APIs live in a thin `apps/web` adapter. React Router 7 remains the
documented fallback.

<a id="typescript-version"></a>
### TypeScript 5.9.3, not 7.0.2

TypeScript 7.0.2 is the npm `latest`, but `typescript-eslint` 8.72.0 declares a
peer range of `>=4.8.4 <6.1.0`. Choosing TS 7 would mean giving up type-aware
ESLint or running unsupported. For a new project, a supported lint/typecheck
toolchain is more valuable than the newest compiler. Revisit when typescript-eslint
supports TS 7. This is an intentional, documented lag, not an oversight.

### pnpm 11.28.8, not 12.15.0

pnpm 12 is the latest major, but 11.28.8 is the mature line and is close to the
local pnpm 11.13.1, reducing bootstrap friction. No feature in 12 is required.
The `packageManager` field pins the version; CI uses the same.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| MongoDB | CMS relationships, constraints and migrations favor PostgreSQL; the name is not a mandate |
| SQLite for local | Dialect/locking/migration drift; a second schema path; not worth the setup saving |
| NestJS 12 + Fastify | More structure than a solo project needs; plugin architecture is domain-level; decorators/DI add debugging overhead |
| Express 5 | Familiar but weaker built-in validation/logging/structure; the reference's shape is not a template |
| Drizzle 0.45 | Pre-1.0, migration tooling less settled; strong fallback, not the first choice |
| Prisma 8 RC | RC; `latest` tag trap; not stable |
| Next.js admin | SSR unnecessary for a client-heavy editor; duplicates the web framework |
| React Router 7 web | Simpler caching/portability, but less incumbent knowledge and more platform work; fallback |
| Biome instead of ESLint | Faster/simpler, but weaker type-aware/a11y ecosystem for this project |
| Turborepo alternative (Nx, plain scripts) | Nx is heavier; plain scripts become manual as apps grow |
| Docker-only local setup | Docker is not installed here; native PostgreSQL must work |
| Custom block editor | Too much surface; official packages are the point |

## Consequences

Positive:

- A small, typed, testable API with explicit modules.
- Relational integrity and a real migration path.
- A real Gutenberg editor with a documented content contract.
- SSR/SEO for the public site without a paid host.
- A content format that can round-trip with WordPress.
- A stack that a solo developer can run locally without Docker or paid services.

Negative / costs:

- Two frameworks (Fastify + Next) and three apps to operate.
- Gutenberg integration is complex and the bundle is large.
- Prisma's generated client and single schema file add build steps.
- TypeScript 5.9.3 is behind the latest compiler.
- Next caching/RSC has a learning curve; theme portability needs discipline.
- Native modules (`argon2`, `sharp`) add install/platform work.
- The free-model dissent on Drizzle/React Router means those decisions should be
  revisited if the selected tools become a burden.

## Unresolved risks

1. Editor runtime/browser behavior is not yet proven (Phase 5).
2. Bundle size and vips worker; lazy loading/subsetting required.
3. Official parser v6 vs the reference corpus; port only on reproducible failure.
4. Prisma 8 upgrade path; 7.10.1 is pinned.
5. Next 16 cache semantics; explicit policy and preview no-store.
6. Theme portability; no Next-only APIs in theme packages.
7. Node 24 not installed locally yet; Phase 1 must verify.
8. Native module builds on the target OS.
9. No Docker; native Postgres path must be documented/tested.
10. WordPress-compatible block markup is a deliberate lock-in to the Gutenberg
    contract; a future format migration needs an ADR.

## Follow-ups

- Phase 1: pin versions, verify Node 24 + PostgreSQL 18, add lint/typecheck/test/
  build, and record evidence.
- Phase 5: browser editor smoke test, parser corpus test, bundle budget, block
  subset decision.
- Phase 7: measure Next caching and self-hosting.
- Phase 9: evaluate plugin migration isolation (U-005).
- Revisit Drizzle/React Router only with a written trigger and a migration plan.

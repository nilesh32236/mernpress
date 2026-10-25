# Stack comparison and baseline decision

Date: 2026-10-24. All versions were checked against the npm registry and official
project documentation on this date unless stated otherwise. Reproducible commands
are listed at the end. This document distinguishes **observed** version/compat
facts from **judgement** calls.

## 1. Baseline versions (observed)

| Component | Selected | Latest / note | Evidence |
| --- | --- | --- | --- |
| Node.js | **24.22.1** LTS (Krypton) | 24.22.1 released 2026-10-20; Node 25.9.0 is current, not LTS | `https://nodejs.org/dist/index.json` |
| PostgreSQL | **18.6** | 18 is the current major; EOL 2030-11-14; local install 18.3 | `https://www.postgresql.org/versions.json`; `psql --version` |
| pnpm | **12.15.0** | current stable line; 12.0.0 released 2026-08-26, 12.15.0 on 2026-10-21; Node `>=18` | `npm view pnpm dist-tags`; `npm view pnpm@12.15.0 engines` |
| Turborepo | **2.11.10** | latest | `npm view turbo version` |
| TypeScript | **5.9.3** | 7.0.2 is latest; `typescript-eslint` 8.72 peers `<6.1.0` | `npm view typescript dist-tags`; `npm view typescript-eslint peerDependencies` |
| Fastify | **5.12.7** | Fastify 6 is alpha (`6.0.0-alpha.5`) | `npm view fastify dist-tags` |
| Prisma | **7.10.1** | `prisma` npm `latest` is **8.0.0-rc.27**; `@prisma/client` latest is 7.10.1 | `npm view prisma dist-tags`; `npm view @prisma/client dist-tags` |
| Zod | **4.6.7** | latest | `npm view zod version` |
| React / React DOM | **19.3.1** | latest | `npm view react version` |
| Vite | **8.3.5** | latest; `@vitejs/plugin-react` 6.1.2 peers Vite ^8 | `npm view vite dist-tags`; `npm view @vitejs/plugin-react peerDependencies` |
| WordPress editor | **19.0.0** block-editor; pinned companion set | packages support React ^18 || ^19 | `npm view @wordpress/block-editor peerDependencies` |
| Next.js | **16.4.3** | latest; Node `>=20.9` | `npm view next dist-tags`; `npm view next engines` |
| Tailwind CSS | **4.3.3** | latest | `npm view tailwindcss version` |
| Vitest | **5.0.5** | latest; Node ^22.12 || ^24 || >=26 | `npm view vitest engines` |
| Playwright | **1.64.1** | latest | `npm view @playwright/test version` |
| ESLint | **10.13.0** | latest; `@eslint/js` latest is 10.0.1 | `npm view eslint version`; `npm view @eslint/js dist-tags` |
| typescript-eslint | **8.72.0** | peers ESLint 8/9/10, TypeScript >=4.8.4 <6.1.0 | `npm view typescript-eslint peerDependencies` |
| Prettier | **3.9.10** | latest | `npm view prettier version` |
| Password hashing | **@node-rs/argon2 2.2.2** | MIT, prebuilt NAPI for Node 24; Argon2id 64 MiB / 3 passes / 1 lane | `npm view @node-rs/argon2 version`; ADR 0002 |
| sharp | **0.35.5** | native module; verify libvips packaging | `npm view sharp version` |

Version policy: pin exact versions for runtime/framework/editor packages, keep a
single lockfile, and do not use floating `latest` tags in manifests. Patch/security
updates are applied deliberately with a lockfile diff and tests.

## 2. Runtime: Node.js 24 LTS

**Decision: Node.js 24.x Active LTS (24.22.1 at the time of writing).**

- Node 24 is the Active LTS line as of October 2026; Node 25 is Current and not
  suitable for a baseline.
- Prisma 7.10.1 declares `^20.19 || ^22.12 || >=24.0`; Vite 8 declares
  `^20.19.0 || >=22.12.0`; Vitest 5 declares `^22.12.0 || ^24.0.0 || >=26.0.0`.
  Node 24 satisfies all three.
- The local machine now has Node 24.22.1 and pnpm 12.15.0 (installed in Phase 1);
  Phase 0 originally ran on Node 22.23.1. Verify the clean-clone path on the
  pinned versions, not on 22.

**Risk:** native modules (`sharp` later) must be rebuilt for Node 24 and the
target OS. Phase 1/6 must test install and runtime on this machine.

## 3. API framework

### Options

| Option | Advantages | Disadvantages | Maturity / maintenance | Fit |
| --- | --- | --- | --- | --- |
| **Fastify 5** | Encapsulated plugin model, schema-based validation/serialization, built-in pino logging, fast routing, small core, official `@fastify/*` plugins | Less opinionated structure; you invent module/DI discipline; some ecosystem plugins lag majors | Stable 5.12.7; Fastify 6 alpha exists but not selected | **Selected** |
| NestJS 12 + Fastify adapter | Modules/DI/guards/interceptors/pipes, strong structure for large teams, OpenAPI ecosystem | Decorators/metadata, two abstraction layers, more boilerplate; dynamic plugin modules become complex; heavier learning/debug surface | Stable 12.2.0; Fastify adapter 12.2.0 | Good if the project becomes team-sized; not now |
| Express 5 | Familiar, huge middleware ecosystem, the reference uses it, simple mental model | Weak built-in validation/serialization/logging; middleware sprawl; async error handling still needs care; the reference shows route/controller growth without a strong boundary | Stable 5.3.0 | Viable, but not the best default for a new structured API |

### Decision

**Plain Fastify 5.12.7**, with an explicit composition root:

```text
apps/api/src/
  app.ts             createApp() wiring, plugins, error handler
  server.ts          listen/graceful shutdown
  modules/<domain>/  routes + controller + service + repository
  plugins/           fastify plugins (auth, csrf, rate-limit, uploads)
  lib/               errors, logging, validation, pagination
```

- Use `@fastify/cookie`, `@fastify/cors`, `@fastify/helmet`,
  `@fastify/rate-limit`, `@fastify/multipart`, `@fastify/static` (only if media is
  served by the API), `@fastify/sensible`.
- Validate at the boundary with Zod. A small `parseBody(schema)` helper is enough;
  `fastify-type-provider-zod` 7.0.0 is compatible with Fastify ^5.5 and Zod
  >=4.1.5, but it adds Swagger peers. Do not add it until an OpenAPI need is real.
- Keep domain services framework-agnostic. The HTTP layer is thin.

**Why not NestJS now:** the plugin/theme architecture is a domain concern, not an
HTTP-plugin concern. Nest's DI/dynamic modules would add ceremony without solving
the actual extension problem. The API is small enough that explicit modules are
clearer. Revisit if the team grows or if the module graph becomes hard to reason
about; the domain services are framework-agnostic, so a later Nest wrapper is
possible but not free.

**Why not Express 5:** it would work, but Fastify's built-in schema/logging/plugin
model reduces custom glue and makes request validation and error handling more
consistent. The reference's Express code is not a reason to repeat its structure.

<a id="orm-and-migrations"></a>
## 4. Database and ORM

### Database: PostgreSQL 18

**Decision: PostgreSQL only.** PostgreSQL fits relational CMS entities (content,
authors, terms, media, revisions, capabilities), gives transactions, constraints,
JSONB, full-text search, `FOR UPDATE SKIP LOCKED`, and a mature backup/restore
story. PostgreSQL 18 is the current major (18.6); the local machine has 18.3.

MongoDB is rejected: the CMS is relationship-heavy, and schema/migration
discipline is a core requirement. The project name "MERNPress" is not a database
mandate.

SQLite is rejected as a second path: it would create dialect drift, different
locking/concurrency behavior and a second migration/test matrix. It could be a
future "single-file demo" mode only if it shares the exact same schema semantics,
which is unlikely.

### ORM: Prisma 7.10.1 vs Drizzle 0.45

| Option | Advantages | Disadvantages | Maturity | Fit |
| --- | --- | --- | --- | --- |
| **Prisma 7.10.1** | Declarative schema, relations, generated typed client, `prisma migrate` with SQL migrations, Studio, strong docs, driver adapters | Generated client/build step; some complex queries need `$queryRaw`; schema is a single file; `latest` tag is currently an 8.0 RC (pin!) | Stable 7.10.1; Prisma 8 is RC | **Selected** |
| Drizzle 0.45.4 | SQL-shaped TypeScript, thin runtime, editable SQL migrations, no engine binary, good for custom queries | Pre-1.0 (0.x), migration tooling/ecosystem less settled, more manual relation/query work | 0.45.4 + drizzle-kit 0.31.11; pre-1.0 | Strong alternative; not selected for a first CMS |
| Raw SQL + query builder | Maximum control | No schema/migration discipline, more boilerplate, easy to drift | N/A | Not appropriate as the primary layer |

**Decision: Prisma 7.10.1**, pinned exactly for `prisma`, `@prisma/client` and
`@prisma/adapter-pg`. The npm `latest` tag for `prisma` points at
`8.0.0-rc.27`, while `@prisma/client` latest is 7.10.1; using `latest` would
create a mismatched/RC install. This is a concrete version trap, not a theoretical
risk.

Why Prisma over Drizzle despite the free-model reviews preferring Drizzle:

- Prisma 7 is stable; Drizzle is 0.x. For a solo hobby project, migration safety
  and documentation matter more than a thin runtime.
- The CMS schema is relational and benefits from Prisma's relation modeling and
  migration workflow.
- Plugin-owned tables can still use plain SQL migrations; Prisma does not prevent
  that. The "one schema file" concern is manageable with a documented plugin
  migration mechanism (Phase 9).
- The reference CMS already demonstrates Prisma 7 + PostgreSQL at this scale;
  the lessons (UTC sessions, driver adapter, migration discipline) transfer.

**Dissent recorded:** both free reviewers preferred Drizzle, citing SQL control,
no engine binary and plugin migration isolation. Those are legitimate. The
decision is reversible at the repository layer if Prisma's generated-client or
schema workflow becomes a real burden; it is not reversible for free after
migrations exist, so the Phase 1 schema must be reviewed carefully.

## 5. Admin application

**Decision: React 19.3.1 + Vite 8.3.5**, a client-side SPA.

- The admin is a highly interactive editor and content browser; SSR brings little
  value and complicates the Gutenberg environment.
- Vite 8 + `@vitejs/plugin-react` 6.1.2 is a current, compatible pair.
- React 19 is supported by the selected `@wordpress/*` packages (peer range
  `^18 || ^19`).
- Use React Router 7.18.4, TanStack Query 5.104.5, React Hook Form 7.91.0 with
  `@hookform/resolvers` 6.0.0, and Zod 4.6.7.
- Use `@wordpress/components` for editor-adjacent controls and a small custom
  admin shell. Do not try to clone the WordPress admin pixel-for-pixel.

**Why not Next.js for admin:** the editor is a client-heavy SPA; Next's routing/
server-component model would add complexity around a browser-only editor and
duplicate the public frontend's framework. Vite gives a fast dev loop and a clean
static build.

## 6. Public frontend

### Options

| Option | Advantages | Disadvantages | Fit |
| --- | --- | --- | --- |
| **Next.js 16 App Router** | SSR/SSG/ISR, metadata API, image optimization, sitemap/robots conventions, large ecosystem, both reference frontends use it, Node self-hosting via `output: "standalone"` | Caching semantics (`use cache`, revalidation) have a learning curve; framework lock-in; RSC boundaries affect theme authoring | **Selected** |
| React Router 7 framework mode (Vite) | Simpler mental model, explicit HTTP/cache control, one boring Node process, plain React themes | Re-implements image optimization/metadata/caching; smaller ecosystem; less incumbent knowledge | Strong fallback; not selected |
| Astro | Excellent content-site performance, islands | Different component model; dynamic CMS/editor preview integration less direct; theme SDK would be Astro-specific | Not selected |
| Plain React + custom SSR | Maximum control | Rebuilds routing, data loading, caching, metadata, image handling | Not appropriate |

**Decision: Next.js 16.4.3 App Router**, Node self-hosting (`output: "standalone"`),
no Vercel requirement. Reasons:

- The user's existing frontend knowledge and both reference frontends are Next 16.
- SEO/SSR, metadata, sitemap/robots and image optimization are first-class.
- A theme package can export React components; Next renders them as Server
  Components, with a thin adapter so theme components avoid Next-only APIs.
- Self-hosting is documented and portable.

**Dissent recorded:** both free reviewers preferred React Router 7, citing theme
portability and simpler caching. Mitigations:

- Keep theme components framework-agnostic: no `next/*` imports inside
  `packages/theme-sdk` or theme components except a single `apps/web` adapter.
- Use explicit cache tags and a revalidation webhook; avoid implicit caching for
  previews/admin.
- Treat React Router 7 as the documented fallback if Next's cache/RSC model
  becomes a maintenance burden. The API contract is framework-independent.

## 7. Gutenberg package set and compatibility evidence

### Selected set (admin)

Pin exact versions:

```text
@wordpress/block-editor                 19.0.0
@wordpress/blocks                       17.0.0
@wordpress/block-library                12.0.0
@wordpress/components                   43.0.0
@wordpress/data                         11.0.0
@wordpress/element                      10.0.0
@wordpress/format-library                6.0.0
@wordpress/hooks                         5.0.0
@wordpress/i18n                          7.0.0
@wordpress/icons                        19.0.0
@wordpress/keyboard-shortcuts            6.0.0
@wordpress/notices                       6.0.0
@wordpress/preferences                   5.0.0
@wordpress/primitives                    5.0.0
@wordpress/rich-text                     8.0.0
@wordpress/api-fetch                     8.0.0
@wordpress/url                           5.0.0
```

Server/parser-side packages:

```text
@wordpress/block-serialization-default-parser  6.0.0
@wordpress/autop                               5.0.0
@wordpress/escape-html                         4.0.0
@wordpress/token-list                          4.0.0
```

React 19.3.1 / React DOM 19.3.1.

### What was actually verified

A throwaway `/tmp/opencode/wp-compat-20261024` workspace was created. It is not
part of the repository and contains no product code.

1. **Strict peer resolution passed.** `pnpm install --strict-peer-dependencies`
   with React 19.3.1 and the set above completed with 229 packages. No peer
   warnings/errors.
2. **CSS paths exist**:
   - `@wordpress/components/build-style/style.css`
   - `@wordpress/block-editor/build-style/style.css`
   - `@wordpress/block-editor/build-style/content.css`
   - `@wordpress/block-library/build-style/{editor,style,theme}.css`
3. **Production build succeeded** with Vite 8.3.5 + `@vitejs/plugin-react` 6.1.2.
   The build transformed 6,180 modules. Output (uncompressed):
   - main JS ~5,878 kB (gzip ~1,342 kB)
   - CSS ~474 kB (gzip ~63 kB)
   - vips worker ~13,449 kB (gzip ~3,744 kB)
   - video-conversion worker ~406 kB
   This is a real bundle-size problem, not a theoretical one. The vips worker is
   pulled in by `@wordpress/upload-media` (a dependency of block-editor) for
   client-side media processing. Phase 5 must lazy-load the editor route, split
   chunks, and decide whether to import a subset of core blocks. Do not ship the
   editor on every admin page.
4. **The official parser 6.0.0 parsed nested Gutenberg markup correctly** in bare
   Node:
   `group → columns → column → paragraph` produced the correct tree, including
   `innerHTML`/`innerContent`. This contradicts the reference's v5-era failure.
   The reference's custom parser is **not** assumed necessary for v6. A Phase 5
   corpus test decides.
5. **`@wordpress/blocks` is not natively importable in Node** with the current
   ESM build: Node 22.23.1 throws `ERR_IMPORT_ATTRIBUTE_MISSING` for a JSON import
   inside the package. Vite/bundlers handle it; the API must not import
   `@wordpress/blocks`. Use the pure parser and server renderer instead.
6. **`@wordpress/autop` and `@wordpress/escape-html` work in bare Node.** Verified
   `autop("Hello\n\nWorld")` and escaping behavior.

### What was not verified

- The editor was built, not opened in a browser. A Playwright smoke test is a
  Phase 5 gate.
- No full `registerCoreBlocks()` interaction test (inserter, inspector, save).
- No test of the exact reference corpus; only a synthetic nested fixture.
- No measurement on Node 24 (the spike ran on Node 22.23.1).
- No test of `@wordpress/block-library/build-module/*` subpath imports for a
  reduced block set; this is a candidate optimization, not a decision.

### Package-set rules

- One copy of store-owning packages (`@wordpress/data`, `element`, `hooks`,
  `i18n`, `icons`, `notices`, `rich-text`, `url`, `components`, `blocks`,
  `block-editor`). Use pnpm overrides/dedupe and verify with `pnpm why` plus a
  production build.
- Import CSS from the exact `build-style/*` paths above. Pin them; they can move
  across majors.
- Keep `@wordpress/blocks` admin-only. Do not import browser-only packages
  (`@wordpress/dom`, `html-entities`, `rich-text`) into the API.
- Do not mix React 18 and 19 across the workspace. The selected packages support
  React 19, but a single React copy is mandatory.

## 8. Validation and shared contracts

**Decision: Zod 4.6.7** in `packages/contracts`, API boundary validation, env
validation and admin forms. One Zod major across the workspace. Do not repeat the
reference's Zod v3/v4 skew.

- Isomorphic schemas: no Node built-ins, no React.
- DTOs are inferred from schemas or explicitly mapped; do not leak Prisma models
  over HTTP.
- Error envelope is shared: `{ error: { code, message, details?, requestId } }`.
- `@hookform/resolvers` 6.0.0 supports Zod 4 schemas in the admin.

**Alternative:** framework-native JSON Schema (Fastify) only. Rejected because
the same contracts are needed in the browser and in tests, and Zod gives better
TypeScript inference.

## 9. Testing

| Layer | Tool | Scope |
| --- | --- | --- |
| Unit | Vitest 5.0.5 | pure functions, schemas, slug rules, renderers, capability checks |
| Integration | Vitest + real PostgreSQL | repositories, migrations, API routes, auth/session flows |
| Browser/E2E | Playwright 1.64.1 | login, content list/edit, Gutenberg load/save/reload, media, public rendering, a11y smoke |
| Component | Vitest + Testing Library 16.3.3 + jsdom 30.1.3 | admin forms/controls where useful; not a substitute for E2E |
| Serialization/parity | Vitest golden files | WordPress block round trips, unknown blocks, XSS, renderer output |
| Accessibility | axe-core in Playwright, manual keyboard pass | admin and public templates |

Database tests use a dedicated test database and `prisma migrate deploy`; they do
not require Docker. CI uses a PostgreSQL service. Tests run serially only where
the database requires it; otherwise Vitest parallelism is fine.

## 10. Workspace and build tooling

**Decision: pnpm workspaces + Turborepo 2.11.10.**

- pnpm's strict node_modules layout helps catch undeclared dependencies, which
  matters for the browser/server boundary.
- Turborepo gives a simple task graph (`build`, `typecheck`, `test`, `lint`) and
  remote-cache capability later. It is not required for correctness.
- Alternative: plain pnpm scripts. Simpler, but the task graph and caching become
  manual as apps/packages grow. Turborepo is justified by the multi-app layout.
- Alternative: Nx. More powerful, more configuration and concepts than a hobby
  project needs.
- pnpm 12 was selected during Phase 1 preflight after re-evaluating the Phase 0
  pnpm 11 choice: 12.15.0 is stable, supports Node 24, and the local pnpm 11
  bootstrap-friction reason no longer applies. See ADR 0001.

**Decision: ESLint 10.13.0 + @eslint/js 10.0.1 + typescript-eslint 8.72 +
jsx-a11y 6.10.2 + Prettier 3.9.10.** This gives type-aware linting and
accessibility rules. jsx-a11y 6.10.2 still declares ESLint ≤9; the workspace
uses an explicit peer override after verifying `jsx-a11y/alt-text` fires on
ESLint 10.13.0. Biome 2.6.3 is faster and simpler, but the type-aware ESLint
ecosystem is stronger for a CMS. The cost is more configuration; Phase 1 owns it.

<a id="local-runtime"></a>
## 11. Local runtime and deployment

- Local: native PostgreSQL 18 on `localhost:5432`, Node 24, pnpm 12. Docker is
  **not installed** on this machine, so Docker Compose cannot be the only setup
  path. A `docker-compose.yml` will be provided for portability, but native
  Postgres is the verified path.
- Deployment: one API process (or a small cluster) + one Next process + Postgres
  + object/disk storage for media. PM2/systemd/Docker are all viable. Do not
  assume Vercel or any paid platform.
- Media storage: local disk for MVP behind a storage interface; S3-compatible
  later.
- Backups: `pg_dump` + media directory; a restore drill is required before any
  public deployment.

## 12. Free-model cross-check

Two distinct free models were asked the same three questions, with no tools and
no access to this repository. The purpose was to surface disagreement, not to
outsource the decision.

| Question | DeepSeek V4.1 Flash Free | GLM-5.3 Flash Free | Decision | Why |
| --- | --- | --- | --- | --- |
| API | Plain Fastify 5 | NestJS 12 + Fastify | **Fastify 5** | Simpler for a solo project; domain plugins are not HTTP plugins; framework-agnostic services keep Nest a later option |
| ORM | Drizzle 0.45 | Drizzle 0.45 | **Prisma 7.10.1** | Prisma is stable, migrations/docs are stronger, and the reference proves the workflow; Drizzle is 0.x and its migration tooling is less settled. Dissent recorded. |
| Frontend | React Router 7 SSR | React Router 7 SSR | **Next.js 16** | Incumbent knowledge, SEO/image/metadata ecosystem, both references use Next; mitigate lock-in with framework-agnostic theme components. Dissent recorded. |

Both reviewers flagged factual uncertainties (Nest/Fastify major status, Prisma 8
RC, Drizzle 1.0, Next self-hosting/caching). Those were checked against the npm
registry and official docs; the version table above reflects the results. The
reviewers' agreement on Drizzle/RR7 is a genuine signal and is why those
alternatives are documented as fallbacks rather than dismissed.

## 13. Decision table (summary)

| Area | Selected | Strongest alternative | Revisit trigger |
| --- | --- | --- | --- |
| Runtime | Node 24.22.1 LTS | Node 22 LTS | A dependency blocks Node 24 |
| API | Fastify 5.12.7 | NestJS 12 + Fastify | Team grows; module graph becomes hard to reason about; need Nest-specific ecosystem |
| Database | PostgreSQL 18.6 | MongoDB / SQLite | Never for Mongo; SQLite only for a throwaway demo |
| ORM | Prisma 7.10.1 | Drizzle 0.45 | Prisma generation/migrations become a real bottleneck, or Drizzle reaches 1.0 with better migration tooling |
| Admin | React 19 + Vite 8 | Next.js admin | Need SSR for admin (unlikely) |
| Editor | Official WordPress packages 19.0.0 set | Custom block editor | Package incompatibility or bundle cost becomes unacceptable |
| Frontend | Next.js 16.4.3 | React Router 7 SSR | Next caching/RSC burden exceeds the SEO/image benefits |
| Validation | Zod 4.6.7 | Fastify JSON Schema only | Shared browser contracts no longer needed |
| Tests | Vitest 5 + Playwright 1.64 | Jest/Cypress | Ecosystem/tooling constraint |
| Workspace | pnpm 12 + Turborepo 2.11 | plain pnpm scripts | Task graph becomes trivial |
| Lint | ESLint 10 + typescript-eslint 8.72 | Biome 2.6 | jsx-a11y declares ESLint 10 support, or type-aware linting is no longer needed |

## 14. Unresolved risks

1. **Gutenberg runtime** is verified at dependency/build level, not in a browser.
   Phase 5 must prove load/edit/save/reload, keyboard shortcuts, media, undo/redo
   ownership and unknown-block preservation.
2. **Editor bundle size** is large (≈5.9 MB JS + 13.4 MB vips worker artifact).
   Lazy loading and block subsetting are required; the final budget is a Phase 5
   decision.
3. **TypeScript 7** is the latest stable but not supported by
   `typescript-eslint` 8.72. The project pins 5.9.3; revisit when the lint
   toolchain supports 6.x/7.x.
4. **Prisma 8** is an RC and the `latest` tag is misleading. Pin 7.10.1. Plan the
   upgrade only after 8.0 is stable and tested.
5. **Next 16 caching** (`use cache`, `cacheComponents`) needs a measured policy.
   Do not let public pages serve stale drafts; previews are always no-store.
6. **Theme portability:** Next-specific APIs must stay out of theme packages. A
   thin adapter is allowed; a hard dependency is not.
7. **Native modules** (`sharp` later) need install/rebuild tests on Node 24 and
   the target OS. Argon2 uses a prebuilt NAPI package and was verified in Phase 2.
8. **Local Node 22.23.1** was below the target at Phase 0 time. Resolved in
   Phase 1: Node 24.22.1 and pnpm 12.15.0 are installed and the foundation checks
   ran on them.
9. **No Docker** on this machine. The clean-clone path must work with native
   PostgreSQL; Compose is optional.
10. **Package subpath imports** (`@wordpress/block-library/build-module/*`) are
    exported but not a stable public API. If used for bundle reduction, pin and
    test upgrades.

## 15. Reproducible evidence commands

```bash
node --version
pnpm --version
psql --version
npm view next dist-tags
npm view react version
npm view prisma dist-tags
npm view @prisma/client dist-tags
npm view @wordpress/block-editor version peerDependencies
npm view typescript-eslint peerDependencies
npm view fastify dist-tags
npm view @nestjs/core dist-tags
npm view drizzle-orm dist-tags.latest
curl -s https://nodejs.org/dist/index.json
curl -s https://www.postgresql.org/versions.json
```

The Gutenberg spike commands are recorded in
[gutenberg-and-rendering.md](../architecture/gutenberg-and-rendering.md#compatibility-spike).
The spike directory is `/tmp/opencode/wp-compat-20261024` and is not part of the
repository.

## 16. Sources

- [Node.js release schedule](https://nodejs.org/en/about/previous-releases)
- [PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/)
- [Prisma ORM docs](https://www.prisma.io/docs/orm)
- [Drizzle ORM docs](https://orm.drizzle.team/docs/overview)
- [Fastify docs](https://fastify.dev/docs/latest/)
- [NestJS docs](https://docs.nestjs.com/)
- [Next.js docs](https://nextjs.org/docs)
- [Vite docs](https://vite.dev/)
- [Vitest docs](https://vitest.dev/)
- [Playwright docs](https://playwright.dev/)
- [WordPress Block Editor Handbook](https://developer.wordpress.org/block-editor/)
- npm registry queries listed above, accessed 2026-10-24.

# Reference codebase audit

Date: 2026-10-24. All reference material was inspected **read-only**. Nothing was
installed, migrated, reformatted or modified. No runtime tests were executed in
the reference repositories; claims below are source observations unless marked
otherwise.

## 1. Inventory and access

| Reference | Archive / path | Size | Version / identity | Evidence |
| --- | --- | --- | --- | --- |
| WordPress | `~/Downloads/wordpress-7.1.3.zip` → `../wordpress` | 36 MB zip | **7.1.3**, `$wp_db_version = 61833` | `wp-includes/version.php`; WordPress release API reports 7.1.3 current on 2026-10-24 |
| Qrolic CMS | `~/Downloads/qrolic-cms-main.zip` → `../qrolic-cms-main` | 3.2 MB zip | private `qrolic-cms`, pnpm 8.15.5, Turbo ^2.7.2 | `package.json`, lockfile |
| Qrolic Health CMS | `~/Downloads/qrolichealth-cms-main.zip` → `../qrolichealth-cms-main` | 2.2 MB zip | private `qrolic-cms` (same name), near-fork | `package.json`; `diff -rq` |
| Qrolic frontend | `~/Downloads/qrolic-frontend-main.zip` → `../qrolic-frontend-main` | 11 MB zip | `qrolic-frontend` 0.1.0, Next 16.4.2 | `package.json` |
| Qrolic Health frontend | `~/Downloads/qrolichealth-main.zip` → `../qrolichealth-main` | 96 MB zip | `qrolichealth` 0.1.0, Next 16.2.6 | `package.json`; **not named in the brief but present and relevant** |
| Empty directory | `../custom-cms` | 0 | empty | `ls -la` |

Notes:

- The archives were **already extracted** in the working directory when the audit
  began. The zip files were present but were not re-extracted, and no zip
  checksum/integrity comparison was performed. The extracted trees were the
  inspected source.
- None of the reference directories is a git repository. There is no history to
  inspect, only the extracted snapshot.
- Dependencies/build output were not present or were excluded from analysis.
- The supplied brief names three archives; a fourth frontend (`qrolichealth-main`)
  is also present. It was audited because it is the richest reference for block
  adapters and preview.
- The `qrolichealth-cms-main` and `qrolic-cms-main` repositories are forks of the
  same CMS. They are not two independent architectures. Their shared code is the
  same lineage; the Health fork removes some generic CPTs and adds healthcare
  lead-generation/compliance features.
- The reference CMS codemap calls the project "mernPress" in its opening sentence.
  That is a naming collision only. MERNPress is a new repository; the reference is
  a predecessor and must not be treated as the new codebase.

## 2. Common reference CMS architecture

Both CMS forks use the same monorepo shape:

```text
root
  apps/api        Express 5 REST API + server-side block renderer
  apps/admin      React 18 + Vite 7 SPA + Gutenberg editor
  packages/db     Prisma 7 / PostgreSQL client, schema, migrations, seed
  packages/shared Zod contracts + qrolic/* block schemas/defaults
  docs/           parity, authoring, CPT and migration notes
  .e2e/           browser/HTML parity audits (Health only)
```

Observed versions:

- API: Express `^5.2.1`, Prisma `^7.3.0`, Zod `^4.3.0`, JWT `9.0.3`,
  bcryptjs `3.0.3`, pino `^10`, multer `^2.2.0`, sharp `^0.35.3`.
- Admin: React `^18.3.1`, React Router `^7.11.0`, Vite `^7.2.4`, Tailwind
  `3.4.17`, TanStack Query `^5.90.19`, WordPress packages pinned around
  `@wordpress/block-editor 15.23.0`.
- DB: PostgreSQL provider (`packages/db/prisma/schema.prisma`), `@prisma/adapter-pg`,
  pg pool max 10, session timezone pinned to UTC. The API also lists `mysql2`,
  but the Prisma client and schema are PostgreSQL; treat `mysql2` as stale/import
  tooling unless proven otherwise.
- CI: Node 22, PostgreSQL 16 (`.github/workflows/ci.yml`), pnpm 8.15.5.
- Admin build: `NODE_OPTIONS=--max-old-space-size=4096`; the editor bundle is
  heavy (see Gutenberg audit).

## 3. Qrolic CMS — what it does well

### 3.1 Clear app/package split

- `apps/admin` and `apps/api` never import each other. Cross-app types and block
  contracts flow through `packages/shared`.
- `packages/db` owns the Prisma client and migrations; apps import `db`/`prisma`
  rather than constructing clients.
- Root `turbo.json` encodes the `generate → build → typecheck/test` graph and
  documents why Vite env values are build inputs.

**Lesson:** keep the boundary, but do not copy the package names or the
dual-build/`development` export-condition complexity. A clean package may export
source in the workspace and build only for deployment.

### 3.2 Real Gutenberg editor, not a lookalike

- `apps/admin/src/features/content/components/editor/gutenberg-editor.tsx` is a
  standalone editor built from `BlockEditorProvider`, `BlockTools`, `Inserter`,
  `WritingFlow`, `ObserveTyping`, `BlockInspector` and list view.
- Core blocks are registered with `registerCoreBlocks()`; custom blocks are
  registered from a shared registry.
- Undo/redo is owned locally (50 serialized snapshots), not by the WordPress
  `core/editor` store. Autosave is owned by the parent form.
- Content is serialized WordPress block markup via `parse`/`serialize`, not a
  proprietary JSON tree.

**Lesson:** a standalone editor is a viable WordPress-like experience. It is also
where most of the integration risk lives. Budget for it explicitly (Phase 5).

### 3.3 Server-side renderer and content preservation

- `apps/api/src/services/block-renderer/` parses stored markup and renders HTML.
- A local `wp-parser.ts` is a port of WordPress `WP_Block_Parser`, written because
  the installed `@wordpress/block-serialization-default-parser` v5 failed on the
  real corpus (nested `core/group` children collapsed to freeform).
- Unknown blocks fall back to inner HTML; the renderer does not silently drop
  content.
- Shared block schemas were introduced to stop editor/renderer default drift.
- A subtle finding: WordPress omits attributes equal to schema defaults during
  serialization. The reference's `typeOnlySchema` deliberately emits no `default`
  keys and materializes defaults on mount, so values persist.

**Lesson:** the hard problems are serialization fidelity, default materialization,
unknown-block preservation and editor/renderer parity. These are testable and must
be tested before the block list grows.

### 3.4 Generic CMS features that are worth reusing as design lessons

- Auth: access JWT (15 min) + rotating refresh token in an HttpOnly cookie
  (7 days), refresh hash stored in `Session`, reuse detection, `tokenVersion`,
  ADMIN/EDITOR RBAC.
- Content: posts and pages with draft/published/archived status, soft delete,
  unique slugs, revisions, preview tokens, scheduling.
- Media: multer disk storage, sharp processing, thumbnails JSON, static serving
  with traversal rejection.
- Taxonomies: categories and a generic `Tag` table with taxonomy, hierarchy,
  term meta and WordPress term id mapping.
- Operations: health/readiness, pino request logs, backups, redirects, 404 logs,
  settings/options, site health.
- Scheduling: six nullable columns on Post/Page, `TIMESTAMPTZ`, a sweeper with
  `FOR UPDATE SKIP LOCKED`, retry/backoff. It works, but the schema is a
  workaround-heavy patch on top of a simple status enum.
- Editor: real Gutenberg packages, shared block registry, golden render tests.

### 3.5 Tests that exist

- ~50 API Vitest files covering auth, posts, pages, categories/tags, media,
  comments, redirects, SEO, leads, events, backups, scheduling, users, taxonomy
  archives, title cards, block-render golden output and parser behavior.
- Five admin tests (`storage`, `publish-checklist`, `seo-analysis`, `useSeoForm`,
  `save-feedback`).
- One DB client test.
- No browser E2E suite in the CMS repos; `.e2e/` parity scripts exist in Health
  and depend on a sibling frontend checkout.

**Lesson:** the API test habit is good. The missing browser/editor E2E and the
thin admin test layer are the main quality gaps to avoid.

## 4. Qrolic CMS — weaknesses and risks

| Area | Observation | Consequence for MERNPress |
| --- | --- | --- |
| Schema duplication | Separate `Post` and `Page` models repeat title/slug/content/status/SEO/scheduling fields | Use one `posts` table with a `type` discriminator and a `parent_id`; avoid duplicated lifecycle logic |
| EAV metadata | `PostMeta`/`PageMeta`/`UserMeta`/`TermMeta` key-value tables for core and SEO fields | Keep typed columns for core; use namespaced JSONB metadata only for extension data |
| Site-specific CPTs in core | `Service`, `Job`, `Portfolio`, `TeamMember` and their taxonomies are first-class Prisma models | Keep core generic; model these as plugin content types or site plugins |
| Block explosion | ~35 shared `qrolic/*` modules in the base CMS; ~85 in Health | Ship a small core block set; site-specific blocks belong to plugins/themes |
| Dual parser/renderer complexity | A custom parser port plus a large `engine.ts` dispatch with many special cases | Prefer the official parser v6 if it passes the corpus; keep one registry dispatch path |
| Parser claim drift | `docs/gutenberg_parity_research_report.md` says the npm parser is used; `engine.ts` says it is not | Do not trust stale docs; tests and code are the truth |
| Default drift | Shared schemas fixed a real editor/renderer mismatch, but docs still show the old `default`-in-schema pattern | Encode the "no default in editor schema when it must persist" rule and test it |
| Auth hardening | No explicit CSRF token; refresh cookie relies on SameSite/CORS; no global API rate limit | Add CSRF defense-in-depth and a global rate limit |
| Admin bundle | Build needs 4 GB heap; Gutenberg + vips worker produce multi-MB artifacts | Lazy-load the editor, split chunks, consider a subset of core blocks |
| Version skew | Shared package uses Zod v3 while API uses Zod v4 | One Zod major across the workspace |
| Stale docs | CHANGELOG/parity reports describe states that code has moved past | Docs must be updated in the same change as code |
| Upload surface | Images/video/SVG/JSON up to 50 MB; SVG static serving is risky | No SVG until sanitized; MIME sniffing; re-encode images |
| Scheduling complexity | Six nullable columns, raw SQL to avoid `updatedAt` bumps, no scheduler unit tests | Use a dedicated job/schedule table or a clean status transition service with tests |
| Frontend coupling | Frontend rewrites WP URLs, extracts article bodies, imports vendor WP CSS | Theme SDK should consume a clean body/HTML contract, not scrape template chrome |
| No Docker requirement | Deployment uses PM2/nginx/Apache; local setup assumptions are environment-specific | Provide a portable native-Postgres path and an optional Compose file |

## 5. Qrolic Health CMS — what is actually different

The Health fork is **not** a generic CMS with a different theme. It removes
several baseline CPTs (comments, jobs, portfolios, services, teams, menus, tag
hierarchy) and adds a healthcare lead-generation/compliance stack:

- **Dynamic form builder**: `FormDefinition`, immutable `FormVersion`,
  `FormSubmission`, `FormActionOutbox`; pinned versions; consent evidence; file
  quarantine; HMAC report links; CSV export.
- **Outreach**: groups, contacts, templates, campaigns, recipients, Brevo delivery
  events, suppression list, consent fields, scheduler, webhook.
- **Leads**: contact/newsletter endpoints, honeypot, Turnstile (fail-closed in
  production), PHI deny-list, retention purge, internal proxy secret.
- **Compliance**: HIPAA checklist PDF delivery from a CMS page, consent evidence,
  privacy URL capture.
- **Email/Brevo**: SMTP sending, Brevo template listing, webhook verification,
  unsubscribe tokens.
- **Restore workflow**: `RestoreJob`/`RestoreEvent` and backup provenance. This is
  generic operations infrastructure, not healthcare-specific.
- **Site-specific blocks**: ~40+ compliance/service/industry/form blocks.

Security observations recorded during the audit:

- PHI deny-list has only three patterns (SSN/diagnosis/prescription); it is not a
  comprehensive HIPAA scanner. Do not claim compliance.
- Email subject lines include user-supplied names; SMTP header sanitization was
  not verified.
- Retention purge is off by default.
- Brevo webhook auth fails closed in production but is optional in dev.
- Uploads are quarantined outside the served tree and downloads are gated; this
  is a good pattern.
- Consent evidence pinned to form version and privacy URL is strong auditability.

**Classification:** forms, outreach, Brevo, lead capture, PHI/compliance and the
health marketing blocks are **business-specific**. They must not enter core. A
generic consent/lead module could be a later plugin, not an MVP feature.

## 6. Public frontend audit

### 6.1 `qrolic-frontend-main`

- Next 16.4.2 App Router, React 19.3.0, Tailwind 4, TypeScript strict.
- `trailingSlash: true`, `cacheComponents: true`, no basePath. Apache splits the
  blog surface to Next on port 3001 and the rest to WordPress. It mirrors WP URLs
  1:1.
- CMS access is server-only: `cmsFetch` with a serial spacing gate (default
  1200 ms), 15 s timeout, typed `CmsError`, bounded 429 retry.
- Reads use `'use cache'` + `cacheLife("hours")` + `cacheTag(cms:*)`.
  Revalidation is a secret-protected webhook with a tag allow-list.
- Consumes CMS-rendered HTML via `dangerouslySetInnerHTML`; normalizes WP uploads
  and internal links at the DTO boundary. Blocks are carried but not rendered.
- SEO is strong: metadata builders, canonical/OG/Twitter, JSON-LD modules,
  sitemap, robots, feeds.
- No preview route found; no Playwright config; 19 Node test files and CI.

**Transferable:** env validation, transport spacing/retry, typed errors, cache
tags, DTO normalization, media/srcset rewriting, SEO builders, empty states.

**Not transferable:** WP URL parity, Apache split-proxy, trailing slash policy,
article-body extraction, vendor WP CSS, site-specific CPT routes.

### 6.2 `qrolichealth-main`

- Next 16.2.6 App Router, React 19, Tailwind 4, Biome.
- Two rendering paths: CMS-rendered HTML (`CmsContent`) and native React block
  adapters (`components/cms/block-renderer.tsx`, `core-block.tsx`).
- Preview route `/preview/[slug]` with noindex; detects custom blocks.
- SEO: `resolveSeo` fallback chain, title templates, robots tokens, `seo/urls` and
  `seo/options` feeds, sitemap/robots.
- Caching: stale 300 / revalidate 3600 / expire 604800; webhook revalidates by
  type/kind/path and pings IndexNow.
- Security headers: CSP/HSTS/XCTO/Referrer-Policy; `/uploads` proxy; image memory
  caps; client-side sanitizer for core block HTML.
- Unit tests for CMS/SEO/forms/redirects; no Playwright config found.
- Site-specific healthcare sections/data and vendor CSP allowlists.

**Transferable:** block-adapter registry, preview route, kind-aware page model,
SEO options feed, revalidation with type/kind/path, security headers, upload
proxy, image memory caps, client sanitizer for core blocks.

**Not transferable:** healthcare content/data, hardcoded marketing pages, vendor
tag stack, site constants.

### 6.3 Cross-frontend lesson

Both frontends consume `{ html, blocks, seo, cover }` and render CMS HTML. The
Health frontend additionally proves that a React adapter registry is possible.
For MERNPress MVP, the API-rendered HTML is the canonical contract; the block tree
is available for advanced themes later. This avoids two renderers drifting.

## 7. WordPress core — reference summary

Full detail is in [wordpress-core-audit.md](wordpress-core-audit.md). The main
lessons:

- A unified insert/update entry point with explicit status transitions and hooks is
  a good content lifecycle contract.
- `map_meta_cap` (object-level meta capabilities) is better than scattering role
  checks.
- Trash stores the previous status, enabling reliable restore.
- Block markup is stored in `post_content` as HTML comments; `parse_blocks`,
  `serialize_block`, `render_block` and `do_blocks` are the public contracts.
- `register_block_type_from_metadata` + `block.json` is a clean block definition
  contract; dynamic blocks own their render callback.
- REST routes pair a schema with a `permission_callback`.
- Template hierarchy is a fallback chain, not a router.
- Nonces + `wp_kses` + prepared statements + capability checks are
  defense-in-depth.
- Do **not** copy: PHP global state, per-request bootstrap, frontend pseudo-cron,
  PHP object serialization in options, EAV meta as the primary model, same-process
  plugins described as sandboxed, or PHP template includes with implicit globals.

## 8. What to reuse, redesign, defer or avoid

| Area | Decision | Why |
| --- | --- | --- |
| Monorepo app/package split | Reuse the idea | Clear boundaries; independently buildable apps |
| Express 5 API | Redesign | Fastify gives schema/logging/plugin structure with less custom glue |
| Prisma/PostgreSQL | Reuse with a new schema | Proven in the reference; relational CMS fits |
| JWT access + refresh session | Redesign | Prefer opaque server-side sessions or short-lived access + rotation with CSRF defense; fewer token-handling pitfalls |
| RBAC enum | Redesign | Role + capability tables, object-level checks |
| Separate Post/Page models | Redesign | Unified `posts` table with type + parent |
| EAV meta tables | Redesign | Typed core columns + namespaced JSONB for extensions |
| Gutenberg block markup | Reuse the contract | Interoperable, preserves unknown blocks |
| Custom `qrolic/*` blocks | Avoid in core | Site-specific; huge maintenance surface |
| Server renderer | Reuse the idea, rebuild cleanly | Canonical HTML for themes; one registry |
| Scheduled publishing | Defer to Phase 8 | Useful but complexity; design a clean job model |
| Comments/menus | Defer | Generic but not MVP |
| Health forms/outreach/compliance | Avoid in core | Business-specific; future plugin territory |
| Frontend block adapters | Defer | API HTML is enough for MVP; adapters later |
| Preview tokens | Reuse in Phase 8 | Needed for editorial trust |
| Backups/site health | Defer to operations phase | Important before deployment, not MVP |
| SEO typed fields | Reuse a small subset | Title/description/canonical/OG are MVP |

<a id="licensing-observations"></a>
## 9. Licensing observations

This is not legal advice; it is a risk register for the project owner.

| Material | Observed licence | Risk / action |
| --- | --- | --- |
| WordPress 7.1.3 | GPLv2 or later (`license.txt`) | Copying core code would impose GPL obligations. Use it as a behavioural reference only. |
| Qrolic CMS | **No root LICENSE file; `package.json` has no `license` field** | Treat as proprietary/unclear until the owner confirms. Do not copy source into MERNPress. Design lessons and independently written code only. |
| Qrolic Health CMS | Same: no root LICENSE, no package `license` | Same. |
| Qrolic frontend | Same: no root LICENSE, no package `license` | Same. |
| Qrolic Health frontend | Same: no root LICENSE, no package `license` | Same. |
| `@wordpress/*` packages | GPL-2.0-or-later | Using them as npm dependencies is normal, but distribution/derivative obligations need a licence review before shipping. Do not copy their source into proprietary files. |
| Next.js, Fastify | MIT | Permissive; keep notices. |
| Prisma, Drizzle | Apache-2.0 | Permissive; keep notices and patent terms. |
| CodeGraph | MIT | Permissive; telemetry disabled. |

Before any public distribution, produce a dependency licence inventory and review
the GPL implications of shipping a Gutenberg-based editor. Do not assume that
"it is on npm" means "no obligations".

## 10. What was not verified

- No reference runtime, build, migration or test suite was executed (read-only
  constraint). Test counts and pass claims are from source/file inventory, not a
  run.
- The exact diff of two shared migrations between the CMS forks was not resolved.
- SMTP header-injection safety in the Health `email.service.ts` was not verified.
- Whether any reference logs emit raw PII beyond the hashed submitter was not
  exhaustively searched.
- The reference admin UI was read structurally, not exercised in a browser.
- The `qrolic-frontend-main` preview behavior was inferred from the absence of a
  route, not proven.
- The WordPress audit did not cover multisite, i18n or the block editor JS build
  in depth.
- The reference archives may contain generated/vendored assets that were excluded;
  the inventory is source-focused.

## 11. Bottom line

The reference CMS is a working, ambitious predecessor. Its most valuable
contributions are the **content contract** (WordPress block markup + server
renderer + unknown-block preservation) and the **operational surface** (auth,
media, taxonomies, scheduling, SEO, backups). Its biggest liabilities are the
site-specific CPT/block explosion, duplicated content models, EAV metadata,
stale documentation and a fragile hand-maintained editor integration.

MERNPress should keep the lessons, not the shape: a smaller generic core, a
unified content model, one block registry, one renderer, one Zod major, explicit
security defaults and a theme/plugin boundary designed before the feature list
grows.

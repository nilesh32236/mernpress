# Plugins and themes

Status: Phase 0 design baseline. No plugin or theme runtime exists yet. The first
implementation is Phase 9 (plugins) and Phase 10 (themes), after core content,
editor and rendering are stable.

The goal is a **small, versioned, documented extension contract** — not a
marketplace, not arbitrary remote code execution, and not WordPress plugin
compatibility.

## Part A — Plugin architecture

### 1. Goals and non-goals

Goals:

- Let a trusted local package add content types, taxonomies, blocks, admin pages,
  settings, capabilities, REST routes and background work.
- Keep plugin discovery deterministic and failures visible.
- Give plugins a versioned migration path without letting them mutate core tables
  silently.
- Preserve a stable contract across MERNPress releases using semver.

Non-goals for the first version:

- A plugin marketplace or remote installation UI.
- Running untrusted code from the internet.
- A sandbox or capability-based OS isolation.
- WordPress plugin compatibility.
- Hot-swapping plugin code in a running process.
- Multi-tenant plugin isolation.

### 2. Package and manifest

A plugin is a local npm/workspace package with a manifest. Two acceptable forms:

```jsonc
// package.json
{
  "name": "@acme/mernpress-events",
  "version": "1.2.0",
  "private": true,
  "mernpress": {
    "apiVersion": 1,
    "main": "./dist/plugin.js",
    "requires": {
      "mernpress": "^0.1.0",
      "plugins": { "@acme/mernpress-core-tools": "^1.0.0" }
    },
    "provides": {
      "capabilities": ["events.manage"],
      "contentTypes": ["event"],
      "taxonomies": ["event-category"]
    },
    "migrations": "./migrations"
  }
}
```

Or a separate `mernpress.plugin.json` with the same fields. One form must be
canonical; do not support both indefinitely. Recommendation: the `mernpress` field
in `package.json`, because it aligns with the package manager and lockfile.

Manifest fields:

| Field | Required | Meaning |
| --- | --- | --- |
| `apiVersion` | yes | Major plugin API contract (`1`, `2`, …) |
| `main` | yes | ESM entrypoint exporting `register(api)` |
| `requires.mernpress` | yes | Semver range of the core |
| `requires.plugins` | no | Dependency ranges; resolved before activation |
| `provides` | no | Declared capabilities/content types/taxonomies for conflict checks |
| `migrations` | no | Directory of ordered SQL migrations |
| `settingsSchema` | no | JSON Schema/Zod-shaped settings contract (documented subset) |
| `admin` | no | Optional admin entrypoint/nav metadata |

### 3. Discovery, enablement and order

- Discovery roots: workspace `plugins/*` plus an explicit allowlist in the site
  config. Do not scan arbitrary `node_modules` for packages with a `mernpress`
  field; that is a supply-chain surprise.
- Enablement is explicit in config or a `plugins` table. A discovered but disabled
  plugin is never imported.
- Order: topological sort by `requires.plugins`, then deterministic by package
  name. Core registers first. A cycle is a startup error.
- Duplicate block names, content types, taxonomies, capabilities, routes or
  settings keys are startup errors with both plugin names in the message.
- Compatibility check: `apiVersion` must match a supported major; the
  `requires.mernpress` range must include the running version. Fail closed with an
  actionable error; do not half-load a plugin.

### 4. Lifecycle

| Phase | What happens | Rules |
| --- | --- | --- |
| `install` | Package is present; migrations are available | No code execution until explicit activation; migration files are reviewed |
| `activate` | Run pending migrations, then call `register(api)` | Transaction where possible; if registration fails, roll back/disable and report |
| `deactivate` | Unregister hooks/routes/blocks; stop workers | Do not delete data; make the operation reversible |
| `uninstall` | Explicit destructive action | Requires confirmation + backup; drops plugin-owned tables/data only with a documented plan |

Activation order: dependencies first, then the plugin. Deactivation order:
reverse. A plugin that fails activation must not leave half-registered routes or
hooks; the host must track and unwind registrations.

### 5. Hook/filter API

A small typed hook bus in `packages/cms-core`:

```ts
api.addAction("post.published", handler, { priority: 10 });
api.addFilter("content.render.html", (html, ctx) => html, { priority: 20 });
api.addFilter("admin.nav.items", (items, ctx) => items);
api.addAction("plugin.activate", handler);
```

Rules:

- Names are versioned/documented; changing a payload is a breaking API change.
- Pass plain DTOs/read-only context, not Prisma clients or mutable internal
  objects.
- Priorities are integers (default 10), lower runs first. Async handlers are
  awaited in order; a handler error is isolated and logged, and does not take down
  an unrelated request. For critical filters, a documented failure policy decides.
- Do not expose a global mutable registry. The host owns registration and
  disposal.
- Filters must be pure where possible. Actions may have side effects; document
  idempotency expectations.
- Hook names are namespaced (`post.*`, `content.*`, `admin.*`, `media.*`,
  `auth.*`). Plugin-specific hooks use the plugin namespace.

### 6. Extension points (first version)

| Extension | Contract | Notes |
| --- | --- | --- |
| Custom content types | `api.registerContentType({ key, labels, supports, taxonomies, capabilities })` | Uses the core `posts.type` discriminator; no new table required |
| Custom taxonomies | `api.registerTaxonomy({ key, hierarchical, labels })` | Uses the core `terms`/`post_terms` tables |
| Blocks | `api.registerBlock(definition)` | Shared `BlockDefinition`; editor + renderer entrypoints |
| Admin navigation | `api.registerAdminPage({ path, title, capability, component })` | Component is a trusted browser module; route is registered statically at build |
| REST routes | `api.registerRoute({ method, path, schema, capability, handler })` | Namespaced under `/api/plugins/<plugin>/`; handler receives validated input |
| Settings | `api.registerSettings({ key, schema, defaults, capability })` | Stored in `options`; validated on write |
| Capabilities | `api.registerCapabilities([...])` | Seeded/assigned by an administrator; not auto-granted |
| Migrations | `migrations/001_*.sql`, … | Tracked in `plugin_migrations`; advisory lock |
| Background jobs | `api.registerJob({ type, handler })` | Uses the core `jobs` table/worker; idempotent |
| Media processors | `api.registerMediaProcessor(...)` | Optional; later, because of security/performance |

Admin page components are a hard problem: a plugin's React component must be
built into the admin bundle (or loaded as a trusted remote module). For the first
version, prefer **workspace-local plugins built with the admin**; do not invent a
runtime module federation system. If a plugin is installed later, a rebuild/restart
is acceptable.

### 7. Data ownership and migrations

- Core tables are owned by core. Plugins may read them through the public service
  API, not by importing Prisma models directly.
- Plugin-owned tables use a prefix (`plugin_<key>_...`) or a dedicated schema. The
  first version uses prefixed tables in the same schema; a schema-per-plugin
  design is an open question (U-005).
- Migrations are ordered, checksummed, forward-only in deployment. They run under
  `pg_advisory_lock('mernpress:plugin:<key>')` and are recorded in
  `plugin_migrations`.
- A plugin cannot alter core tables directly. If a feature needs a core column,
  it goes through a core migration and review.
- Uninstall must have an explicit data-retention choice: keep tables (default) or
  drop them after a backup. Never silently destroy data.
- Export: plugins register an export hook that returns namespaced JSON. Critical
  data must not be trapped in an opaque blob.

### 8. Versioning and compatibility

- Plugin API `apiVersion` is a major integer. Additive fields are minor; removing
  or changing a payload is a major bump.
- Core declares a supported plugin API range (e.g. `1.x`). The plugin manifest
  declares the core range it supports.
- Deprecations: log a warning with the plugin name and the replacement; keep the
  old behavior for at least one minor release, then remove in a major.
- Startup report: enabled plugins, versions, API versions, compatibility status,
  migration status, conflicts. Show it in the admin "Site Health" page later.
- Downgrade: not automatically supported. A plugin downgrade that would encounter
  unknown migrations must be refused with a clear message and a restore path.

<a id="plugin-security-boundary"></a>
### 9. Security boundary (non-negotiable)

**Plugin code runs in the API process with the server's privileges.** It can read
files, open sockets, use the database connection and access environment variables
unless the process is otherwise restricted. It is **not sandboxed**. Do not
describe it as sandboxed in docs, UI or marketing.

Consequences:

- Only trusted, reviewed local plugins. No automatic download/install/execute of
  remote plugins.
- The plugin allowlist is explicit; a package appearing in `node_modules` is not
  enough.
- Review plugin migrations and admin components like application code.
- Run the API with a least-privilege database user (no superuser, no `CREATEDB`,
  no access to other databases).
- Consider OS-level isolation (container, separate process, restricted user) for
  third-party plugins in the future. That is a separate design, not a claim.
- Supply chain: lockfile, provenance where available, dependency review, no
  postinstall scripts by default, vulnerability scanning.
- Plugin settings must not store secrets in `options`; use environment/config and
  a documented secret reference.
- A plugin can log; the host must redact known secret keys and never pass raw
  request bodies to logs by default.

### 10. Observability and health

- Log plugin activation/deactivation, migration start/finish/failure, hook errors
  and route registration with plugin key and version.
- Health check: enabled plugins load, migrations are current, no conflicts.
- A failing plugin should be disableable without editing code. The host should
  support a "safe mode" that loads core only (Phase 9).
- Hook errors are isolated per handler; repeated failures are visible in the
  admin health report.

### 11. Testing the plugin contract

- A test harness creates a temporary database/schema, runs core migrations, then a
  sample plugin's migrations and registration.
- Tests: dependency order, conflict detection, activation rollback, migration
  idempotency, hook priority/async/error isolation, route authorization, settings
  validation, uninstall retention.
- A sample plugin (`plugins/example-plugin`) exercises a custom content type, a
  block, an admin page, a setting, a capability and a migration. It is a fixture,
  not a product feature.

### 12. Plugin MVP boundary

Phase 9 is the first implementation. It should ship:

- manifest + discovery + enable/disable;
- lifecycle + plugin migrations;
- hook/filter bus;
- custom content types/taxonomies;
- block registration;
- settings and admin nav;
- capability registration;
- one sample plugin + test harness.

Not in the first version: marketplace, remote install, sandbox, hot reload,
automatic updates, dependency auto-install, multi-tenant isolation.

## Part B — Theme architecture

### 1. Goals and non-goals

Goals:

- A public site's presentation can be replaced without forking the CMS.
- Themes define templates, parts, layout and styles; content stays in the CMS.
- The same content renders correctly across themes.
- Theme switching is explicit and reversible.
- Themes are trusted local packages; no remote theme upload in MVP.

Non-goals: a visual theme editor, a marketplace, arbitrary PHP/WordPress themes,
or a theme that can execute database queries.

<a id="theme-contract"></a>
### 2. Theme package and manifest

```jsonc
{
  "name": "@mernpress/starter-theme",
  "version": "0.1.0",
  "private": true,
  "mernpress": {
    "apiVersion": 1,
    "templates": {
      "front-page": "./src/templates/front-page.tsx",
      "home": "./src/templates/home.tsx",
      "single-post": "./src/templates/single-post.tsx",
      "page": "./src/templates/page.tsx",
      "archive": "./src/templates/archive.tsx",
      "taxonomy": "./src/templates/taxonomy.tsx",
      "search": "./src/templates/search.tsx",
      "404": "./src/templates/404.tsx",
      "index": "./src/templates/index.tsx"
    },
    "parts": {
      "header": "./src/parts/header.tsx",
      "footer": "./src/parts/footer.tsx"
    },
    "styles": "./src/styles.css",
    "settingsSchema": "./src/settings.ts"
  }
}
```

A theme is a workspace/npm package. `apps/web` imports the selected theme at
build time (or through a small registry) and passes it the content context.

### 3. Template selection / fallback chain

Inspired by WordPress, adapted to React routes:

| Route | Candidate order (first match wins) |
| --- | --- |
| `/` | `front-page` → `home` → `index` |
| `/blog` | `home` → `archive` → `index` |
| `/blog/:slug` | `single-post` → `single` → `index` |
| `/:slug` (page) | `page-{slug}` → `page` → `index` |
| `/category/:slug` | `taxonomy-category-{slug}` → `taxonomy-category` → `taxonomy` → `archive` → `index` |
| `/tag/:slug` | `taxonomy-tag-{slug}` → `taxonomy-tag` → `taxonomy` → `archive` → `index` |
| `/search` | `search` → `archive` → `index` |
| unmatched | `404` |

- The route resolver computes a template context (`type`, `slug`, `terms`,
  `query`, `seo`, `content`) and asks the theme registry for the first existing
  template.
- A theme may omit `index`; the web adapter then uses a minimal built-in fallback
  so a broken theme produces a safe page, not a crash.
- Template filenames are declared in the manifest; no filesystem magic at request
  time. This keeps bundling deterministic.

### 4. Theme component contract

A template/part receives a read-only context:

```ts
type ThemeContext = {
  site: { name: string; url: string; locale: string; };
  content?: {
    id: string;
    type: string;
    title: string;
    slug: string;
    excerpt?: string;
    html: string;          // API-rendered, sanitized
    blocks?: unknown[];    // optional; advanced themes only
    toc?: TocItem[];
    publishedAt?: string;
    author?: { name: string; slug: string; avatarUrl?: string };
    featuredMedia?: MediaDto;
  };
  archive?: { title: string; description?: string; items: ContentSummary[]; pagination: ... };
  seo: SeoDto;
  menus?: ...;             // later
  settings: ThemeSettings; // validated against settingsSchema
};
```

Rules:

- Templates are React components; they must not import the Prisma client, API
  services or Node `fs`.
- Templates may use `next/image`, `next/link` only through the `apps/web` adapter
  or a documented compatibility layer. `packages/theme-sdk` itself stays
  framework-agnostic so a future React Router host is possible.
- The API-rendered `html` is trusted only after server-side sanitization; themes
  should not re-sanitize with a different policy. If they inject it, use the
  documented `<CmsHtml html={...} />` adapter.
- Themes must handle empty/missing content and provide accessible markup.
- No hard-coded site content in a generic theme; use site settings/content.

### 5. Layout, parts and styles

- `header`/`footer` parts are composed by the web app's root layout; a theme can
  provide alternatives (`header-minimal`, etc.) later.
- Design tokens are CSS custom properties defined by the theme
  (`--mp-color-*`, `--mp-space-*`, `--mp-font-*`, `--mp-radius-*`). The CMS can
  expose global settings (site name, logo, colors) that map to a documented
  subset. This is a smaller contract than WordPress `theme.json`.
- A theme may ship CSS; the web app loads it after a reset/base layer. Avoid
  global selectors that break the admin (separate apps, but shared brand tokens
  can be exported).
- Accessibility: skip link, landmarks, heading order, focus styles, color
  contrast, reduced motion and responsive behavior are theme acceptance criteria.

### 6. Theme selection and switching

- Selection: `MERNPRESS_THEME` env or a site option (`theme.active`). The value
  must match an installed theme package.
- Because Next bundles imports, switching themes in MVP requires a rebuild (or a
  restart with a prebuilt registry). Document this. A runtime dynamic import of
  arbitrary packages is not supported.
- Rollback: keep the previous theme package installed and switch back via config;
  no data migration is needed because content is theme-independent.
- Theme compatibility: `apiVersion` and `requires.mernpress` are checked at build/
  startup. A theme built for another API major is refused.

### 7. Content/presentation boundary

- Content stores semantic block markup. Themes style it; they do not own it.
- Core block classes are a stable contract (`wp-block-*` or MERNPress-prefixed
  equivalents). If we keep WordPress class names, document it; if we use our own,
  provide a compatibility map. Recommendation: keep WordPress-compatible class
  names for core blocks so editor markup and theme CSS remain portable.
- Site-specific blocks (services, team, etc.) are plugins/themes, not core.
- A theme change must not require re-saving content. If a block's markup is
  theme-coupled, that is a design defect.

### 8. Preview, cache and revalidation

- Preview: signed, short-lived token; fetch draft content; `noindex`; `no-store`.
  The preview route uses the same theme/template chain so editors see the real
  layout.
- Public cache: tag by content type/id/slug and site settings; revalidate on
  publish/update/delete and theme settings changes. A theme switch requires a
  full revalidation/rebuild.
- The API sends `Cache-Control`/`ETag` hints; the web app owns its cache policy.
- Never cache a preview or an authenticated admin response in a shared cache.

### 9. Theme security

- Themes are trusted code, like plugins. They run in the web process and can read
  environment variables; do not install untrusted themes.
- No remote theme upload/install in MVP.
- Theme settings are validated; do not allow arbitrary HTML/JS injection through
  settings. If a setting is "custom CSS", sanitize/scope it and document the risk.
- The theme cannot query the database; it receives DTOs. This limits blast radius
  and keeps the boundary clear.

### 10. Theme MVP boundary

Phase 10 ships:

- manifest + loader + compatibility check;
- template/fallback chain;
- header/footer parts;
- tokens/styles;
- one accessible starter theme;
- config-based switching with rebuild/restart;
- preview + revalidation hooks.

Not in the first version: visual editor, marketplace, remote install, per-page
theme overrides, multi-theme A/B testing, arbitrary runtime modules.

### 11. Open questions

- U-006: distribution model (workspace package vs npm vs local directory).
- Whether to keep WordPress core block class names or a MERNPress prefix with a
  compatibility map.
- Whether theme settings live in `options` or a dedicated `theme_settings` table.
- How much of `theme.json` semantics to support (colors, spacing, typography)
  without building a global styles editor.
- Whether the web host remains Next-only or the theme SDK needs a second adapter
  (React Router) sooner than expected.

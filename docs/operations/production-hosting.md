# Production hosting — DuckDNS, Caddy, systemd

Status: **LIVE AND VERIFIED** for the deployed Phase 4 build at
`https://mernpress.duckdns.org` (verified 2026-10-28).

## Host

- Debian 13 (trixie), x86-64, kernel 6.12.113 cloud-amd64.
- AWS EC2 `c7i-flex.large`, `ap-south-1b`; 2 vCPU, 3.7 GiB RAM, 4 GiB swap,
  49 GiB disk (38 GiB free at deployment).
- Public IPv4: `43.204.100.114`; no globally routable IPv6 (only link-local).
- No AWS credentials are available on the host, so the EC2 security group
  cannot be inspected from here. Existing public sites prove 80/443 are
  reachable. Ports 22, 80 and 443 are the only public listeners; PostgreSQL and
  the API are loopback-only.
- The public IPv4 is currently stable; the DuckDNS timer is enabled as a
  resilience measure in case the instance public address changes.

## Public routing

`https://mernpress.duckdns.org` serves (since 2026-10-30):

- `/api` and `/api/*` → `127.0.0.1:4000` (Fastify API, systemd
  `mernpress-api.service`).
- `/admin*` → `/opt/mernpress/current/apps/admin/dist` with SPA fallback
  (`uri strip_prefix /admin`).
- everything else (the public site) → `127.0.0.1:3100` (Next.js standalone,
  systemd `mernpress-web.service`, enabled 2026-10-30; env
  `MERNPRESS_API_URL=http://127.0.0.1:4000`).

Caddy site block: `/etc/caddy/Caddyfile` (backups:
`/etc/caddy/Caddyfile.bak.20261027T140907Z`,
`/etc/caddy/Caddyfile.bak-20261030`). Caddy access log:
`/var/log/caddy/mernpress-access.log`. Caddy 2.11.2 manages TLS automatically;
no DuckDNS token is stored in the Caddyfile.

## DNS and TLS

- DuckDNS subdomain `mernpress` is registered in the account; the regenerated
  token is stored only in `/etc/mernpress/duckdns.env` (`root:duckdns`, `0640`).
- `mernpress.duckdns.org` resolves to `43.204.100.114` via Cloudflare
  `1.1.1.1` and Google `8.8.8.8`; there is no AAAA record.
- Caddy obtained a publicly trusted Let's Encrypt production certificate
  (`issuer C=US, O=Let's Encrypt, CN=YE1`), valid
  `2026-10-28` → `2027-01-26`, SAN `mernpress.duckdns.org`.
- HTTP redirects to HTTPS (308); certificate verification returns code 0.
- The DuckDNS updater runs every five minutes under
  `mernpress-duckdns-update.timer`; the last run reported `OK`.

## Release

- Current release: `/opt/mernpress/releases/20261103T095101Z-ba2360f`
  (switched 2026-11-03, WordPress 6.8 parity pass): full-screen Gutenberg
  editor, WordPress welcome panel + postboxes, list screens with
  subsubsub tabs/comments column/tfoot/hover actions, WordPress media grid and
  list views, users text row actions, Screen Options/Help panels with working
  per-page pagination, wp-login card with Remember Me, profile/terms/settings
  form-table layouts. All tests green (537 unit/integration, 23 E2E).
- Previous release: `/opt/mernpress/releases/20261103T074100Z-dadce21`
  (switched 2026-11-03, design pass): reference-matched editor top bar +
  sidebar, list toolbars with category/date filters, dashboard Quick Draft +
  Site Health (new `/api/admin/health`), media toolbar + list view, users
  Name/Email (migration `20261103070000_add_user_name_email`), Media/Posts
  submenu structure. Backup before migration:
  `/opt/mernpress/backups/pre-design-pass-20261103T064105Z.sql`.
- Previous release: `/opt/mernpress/releases/20261103T063000Z-e31a5b5`
  (switched 2026-11-03; adds the editor Block tab opening the real block
  settings inspector). Prior same-day release `20261103T060000Z-cd203ed`
  carried the WordPress-parity fixes and web URL correctness.
- Earlier release: `/opt/mernpress/releases/20261103T060000Z-cd203ed`
  (switched 2026-11-03): WordPress-parity fixes (scheduling UI, single-row
  list toolbar, real dashboard activity, terms pluralization) and web URL
  correctness (sitemap/robots/canonical/og:image use
  `MERNPRESS_SITE_URL=https://mernpress.duckdns.org`; turbo `globalEnv`
  includes the site/media vars so cached builds cannot bake stale URLs).
  Media root chowned to `mernpress:mernpress` (the API user) — uploads now
  writable. Rollback: re-point the symlink to the previous release.
- Previous release: `/opt/mernpress/releases/20261030T053600Z-2bf2809`
  symlinked as `/opt/mernpress/current` (switched 2026-10-30; previous release
  `/opt/mernpress/releases/20261029T103000Z-7dd1a1d` retained for rollback).
  Deployed: **CMS completion** at Git HEAD `2bf2809` (master, pushed;
  `feat/cms-completion` merged fast-forward) — server renderer + DOMPurify
  sanitizer (ADR 0007), media library (sharp raster pipeline, derivatives,
  confinement serving, admin UI, Gutenberg upload), revisions (retention 50),
  autosave (recovery banner), preview tokens (+ web `/preview/[token]`),
  first-publish scheduling (60 s sweeper), bulk actions, editor SEO tab,
  featured image, and the Next.js public site (new `mernpress-web.service`).
  Three additive migrations applied to production after a full `pg_dump`
  backup (`/opt/mernpress/backups/pre-cms-completion-20261030T053550Z.sql`).
  New env: `MEDIA_STORAGE_DIR=/opt/mernpress/media` (persistent),
  `SCHEDULER_ENABLED=true`. Verified live: `/` 200 (public site), `/admin/`
  200, API health ok, public API serves sanitized `renderedContent`, single
  post page 200, media upload 401/403 correctly rejected, preview 400/404
  contract, zero API errors in journal.
- Previous release: `/opt/mernpress/releases/20261029T103000Z-7dd1a1d`
  (reference-CMS-matched admin design; rollback: re-point symlink, restore
  pre-migration dump only if schema rollback is needed — the new columns are
  additive and inert to the old build).
- Earlier release record: `/opt/mernpress/releases/20261029T103000Z-7dd1a1d`
  symlinked as `/opt/mernpress/current` (switched 2026-10-29; previous release
  `/opt/mernpress/releases/20261029T091500Z-274a28c` retained for rollback).
  Deployed: reference-CMS-matched admin design at Git HEAD `7dd1a1d` (master,
  pushed) — dark admin bar (brand/Visit Site/+ New/user dropdown), sidebar
  collapse + chevron submenus, dashboard widgets, tabbed editor sidebar; three
  z-index/structure fixes (topbar dropdown, editor tab panels, mobile drawer).
  Code-only release (no migration). Verified: `/admin/` 200, assets correct
  MIME, API health ok. Earlier same day: release `20261029T091500Z-274a28c`
  (WordPress redesign + users/settings) — superseded.
- Previous release record: `/opt/mernpress/releases/20261029T091500Z-274a28c`
  (switched 2026-10-29; previous release
  `/opt/mernpress/releases/20261028T060614Z-dd6e16b` retained for rollback).
  Deployed: WordPress-style admin redesign + users/profile/settings parity
  slice at Git HEAD `274a28c` (master, pushed). Additive migration
  `20261029090000_add_options` applied to the production database. Verified:
  `/admin/` 200 with correct asset MIME types, `/` → 302 `/admin/`,
  `/api/health` ok, `/api/options` + `/api/users` 401 unauthenticated.
  Earlier 2026-10-29 morning: release `20261029T080000Z-06e46a6` (admin at
  `/admin` base path) — superseded the same day.
- Build identity: `BUILD-INFO` in the release.
- Build identity: `BUILD-INFO` in the release. Deployed source identity is Git
  HEAD `dd6e16bdb79be9bd6bd6b99948bec029ac104af6` plus **20 uncommitted
  dashboard paths** (D-036 Terms management + D-037 admin shell; unit gates
  green: 273 tests, lint/format/typecheck/build/audit clean; Playwright e2e
  not run against production — port 4000 owned by the live API).
- Node runtime: `/opt/node24/bin/node` (v24.22.1), independent of unrelated
  system Node packages.
- API start: `/opt/node24/bin/node dist/server.js` from
  `/opt/mernpress/current/apps/api`.

## Services and secrets

- `mernpress-api.service` — enabled, API on `127.0.0.1:4000`, runs as
  `mernpress` with hardening (`ProtectSystem=strict`, `ProtectHome`, no new
  privileges, no capabilities, private tmp). Health and readiness both 200.
  `ProtectSystem=strict` makes the whole filesystem read-only for the service,
  so uploads require `ReadWritePaths=/opt/mernpress/media` in the unit **in
  addition** to owning that directory as `mernpress`; without it Site Health
  reports `Media storage: Critical` and every upload fails. The unit is backed
  up as `mernpress-api.service.bak-<timestamp>` before edits.
- `/etc/mernpress/mernpress.env` — production environment, `root:mernpress`
  mode `0640`. Never copy it into the repository.
- `/etc/mernpress/duckdns.env` — `DUCKDNS_DOMAIN=mernpress` and the regenerated
  token, `root:duckdns` `0640`.
- `/usr/local/sbin/mernpress-set-duckdns-token` — root-only no-echo prompt used
  to store the token securely.
- `/usr/local/sbin/mernpress-duckdns-update` — Python HTTPS updater; reads the
  token file, logs only success/failure, never logs the token or URL.
- `mernpress-duckdns-update.service` / `.timer` — oneshot + five-minute timer;
  timer enabled and active. Successful run: `DuckDNS update OK`.
- First administrator password: `/root/mernpress-admin-initial-password`
  (mode `0600`, root-only). Retrieve it with `sudo cat`, store it in a password
  manager, then delete the file.
- The public admin is `noindex, nofollow` and response headers include HSTS,
  `X-Content-Type-Options: nosniff` and `Referrer-Policy:
  strict-origin-when-cross-origin`.

## Database

- Dedicated database `mernpress_prod`, owner/login role `mernpress_prod`.
- PostgreSQL 18 listens on loopback only (`localhost`, port 5432); public 5432
  is unreachable.
- Four forward-only migrations applied; no demo seed, no test accounts and no
  content were created in production.
- Backup: `/var/backups/mernpress/mernpress_prod-20261027T141718Z.dump`
  (custom format, mode 0600), taken after migration.

## Verification performed

- `pnpm install --frozen-lockfile`, lint, format, typecheck, 264 unit/integration
  tests, build, 12 Playwright tests, audit and `git diff --check`: all pass.
- Public `/api/health` and `/api/ready`: 200; readiness reports the production
  database reachable.
- Anonymous public `/api/auth/session`: 401 with the documented
  `UNAUTHENTICATED` envelope.
- Public browser: administrator login, dashboard/nav, posts list API, 375 px
  layout, and logout all verified. Session cookie is HttpOnly/Secure/SameSite=Lax
  with path `/api`; CSRF cookie is Secure and non-HttpOnly; browser
  localStorage/sessionStorage are empty; no unexpected console errors.
- Production admin build served through Caddy: root HTML, hashed JS asset, SPA
  fallback and `/api` isolation verified; `/api/*` never falls back to the SPA.
- Existing `nilesh-opencode.duckdns.org` site remains 200 after the Caddy
  configuration change.
- Direct public ports 3000, 4000, 5173 and 5432 are closed/unreachable.
- `mernpress-api.service` restart: health and readiness returned 200 afterward.

## Operations

- API status/logs: `systemctl status mernpress-api`, `journalctl -u mernpress-api`.
- Caddy: `systemctl status caddy`, `journalctl -u caddy`,
  `caddy validate --config /etc/caddy/Caddyfile`.
- DuckDNS: `systemctl status mernpress-duckdns-update.timer`,
  `systemctl start mernpress-duckdns-update.service`,
  `journalctl -u mernpress-duckdns-update`.
- Health: `curl -sS http://127.0.0.1:4000/api/health`,
  `curl -sS http://127.0.0.1:4000/api/ready`.
- Release switch: point `/opt/mernpress/current` at a new release, then
  `systemctl restart mernpress-api` and reload Caddy.
- Rollback: restore the timestamped Caddyfile, reload Caddy, disable/stop
  `mernpress-api`, and leave the production database intact. The rollback was
  not destructively tested.

## Pending cutover to `b3fc337` (NOT EXECUTED — needs separate authorization)

Branch `feat/gutenberg-editor` (Phase 5) is **not** part of this cutover. It has
no published revision, CI run or owner acceptance yet; a Phase 5 release needs
its own reviewed plan and explicit deploy authorization.

### Caddy routing for the new admin base path

The WordPress-style admin branch serves the admin SPA under `/admin/` (Vite
`base: '/admin/'`). The production Caddyfile at `/etc/caddy/Caddyfile` has been
updated (but not reloaded) to:

- Serve `/admin` and `/admin/*` from `/opt/mernpress/current/apps/admin/dist`
  with `uri strip_prefix /admin` and `try_files {path} /index.html`.
- Redirect `/` to `/admin/` (302).
- Keep `/api` and `/api/*` routed to Fastify on :4000.

To apply: `sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy`.

Branch `feat/gutenberg-editor` (Phase 5) is **not** part of this cutover. It has
no published revision, CI run or owner acceptance yet; a Phase 5 release needs
its own reviewed plan and explicit deploy authorization.

Target: commit `b3fc337f2dfd660b5ee24c3ca0523faa5a72d662` (D-036 Terms, D-037
shell, D-038 status tabs), CI run `40652450339` = success, working tree clean.
Owner accepted D-036/D-037/D-038 as implementation-complete on 2026-10-28.
Delta vs the live release (`20261027T140348Z-46bd5c1`): admin SPA only, plus
the D-035 `PUT /api/admin/posts/:id/terms` `baseVersion` contract (no
migration; uses the existing `posts.version` column). No Prisma/schema/env
changes. Compatible: admin and API deploy together, so no mixed-version window.

Preconditions (verify, do not change anything yet):
1. `git rev-parse HEAD` == `git rev-parse origin/master` == `b3fc337...`; `git
   status --porcelain` empty.
2. CI run `40652450339` conclusion is `success` on that exact SHA.
3. Current release dir retained at `/opt/mernpress/releases/20261027T140348Z-46bd5c1`
   for rollback; never delete it during cutover.

Release build (execute in order):
1. `REL=20261028Txxxxxx-b3fc337; sudo mkdir -p /opt/mernpress/releases/$REL`
2. Exclude-filtered copy of the exact commit (same exclude list as the previous
   release: `.git`, `.turbo`, dotenv files, `playwright-report`, `test-results`,
   `_tmp_*`; keep `.env.example`). Verify: no `.env*` secret files, no
   `playwright-report`, no `.git` under the new dir; admin `dist/index.html`
   references the new hashed bundle.
3. Write `BUILD-INFO` (timestamp, HEAD SHA, `git diff`/`status` SHAs — expect
   all-clean, test counts 216+61+1, Playwright 14 via CI, lint/format/typecheck/
   build/audit results).
4. `sudo chown -R root:root` the release dir (match existing releases); confirm
   `mernpress` can read `apps/admin/dist` and `caddy` can read the same path.
5. `sudo ln -sfn /opt/mernpress/releases/$REL /opt/mernpress/current`.
6. `sudo systemctl restart mernpress-api && sleep 2 && curl --fail http://127.0.0.1:4000/api/health && curl --fail http://127.0.0.1:4000/api/ready`.
7. `sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy` (config unchanged; reload only to pick up the new static files — optional but harmless).

Post-deployment health + dashboard smoke checks:
1. `curl -sS https://mernpress.duckdns.org/api/health` → 200 `{"status":"ok"}`; `/api/ready` → 200 `{"checks":{"database":"ok"}}`.
2. Anonymous `GET /api/auth/session` → 401 `UNAUTHENTICATED` JSON (not HTML).
3. `GET /` → 200 admin HTML referencing the new bundle hash; unknown path (e.g. `/no-such-page`) → 200 SPA fallback.
4. Browser: sign in as admin → sidebar (Dashboard/Posts/Pages/Terms), Dashboard counts, Posts tab counts + status filter + pagination, create/edit/publish/trash/restore a post, create/rename/delete a term, sign out. Expect no console errors; 375px viewport without horizontal overflow.
5. `https://nilesh-opencode.duckdns.org/` still 200.
6. Direct public ports 3000/4000/5173/5432 remain closed.

Rollback (code-only; no DB change involved):
1. `sudo ln -sfn /opt/mernpress/releases/20261027T140348Z-46bd5c1 /opt/mernpress/current`.
2. `sudo systemctl restart mernpress-api && sudo systemctl reload caddy`.
3. Re-run the health checks above; confirm the old bundle hash is served.

## Not implemented

Media, Gutenberg editor, revisions, scheduled publishing, preview, plugin
runtime, public rendering/themes and user administration remain future phases.
The public site is not rendered by this deployment; `/` is the admin SPA.

### 2026-11-03 — WordPress parity releases

Two code-only releases were published after backup/migration checks:

- `20261103T140623Z-97e9053` — WordPress 7.1 parity pass across lists, media,
  users, terms, settings, profile, dashboard and editor. Prod migrations were
  confirmed up to date (10 applied, none pending).
- `20261103T225305Z-5b5a655` — Attachment-details media modal, Writing/Reading
  settings rebuild, editor empty-canvas appender and sidebar order.

Both releases: `pnpm install --frozen-lockfile`, `pnpm build` with
`DATABASE_URL` (prod), `MERNPRESS_SITE_URL=https://mernpress.duckdns.org`,
`MERNPRESS_API_URL=http://127.0.0.1:4000`; `BUILD-INFO` written; symlink
switched; `mernpress-api`/`mernpress-web` restarted; `/`, `/admin/` and
`/api/health` verified 200. Rollback: repoint `/opt/mernpress/current` to the
previous release and restart both services (no schema change in either).

- `20261103T231210Z-61be777` — Add User screen, Quick Edit inline row, dashboard
  Quick Draft/At a Glance tuning and users/terms table parity. Built and
  verified 200 on `/`, `/admin/` and `/api/health`; no schema change (website
  already existed).

- `20261103T232157Z-9c167d2` — WordPress Screen Options (columns, pagination,
  view mode) across list screens.
- `20261103T233411Z-d987dce` — WordPress sidebar icons, dashboard widget
  metrics and media modal navigation.
Both verified 200 on `/`, `/admin/` and `/api/health`; no schema changes.

- `20261103T234032Z-a6a8aff` — dashboard Screen Options (boxes + layout).
- `20261103T234540Z-d76eeec` — WordPress tablenav pagination across lists.
Both verified 200 on `/`, `/admin/` and `/api/health`; no schema changes.

- `20261103T235422Z-c235736` — WordPress contextual Help tabs and docs sidebar.
  Verified 200 on `/`, `/admin/` and `/api/health`; no schema change.

- `20261104T001136Z-f850de3` — global body typography, profile keyboard
  shortcuts, default post format and login button height. Verified 200 on `/`,
  `/admin/` and `/api/health`; no schema change.

### 2026-11-04 — Public-site rebuild, standalone asset fix and parity releases

The Next.js standalone bundle omitted `.next/static` and `public`; production
served unstyled HTML. `apps/web/scripts/copy-standalone.mjs` now copies both in
`postbuild`, and the deployed release includes them. Releases `13ba317` through
`bd7eb77` were built with
`DATABASE_URL=<prod> MERNPRESS_SITE_URL=https://mernpress.duckdns.org
MERNPRESS_API_URL=http://127.0.0.1:4000 pnpm build`, symlinked at
`/opt/mernpress/current`, and verified 200 on `/`, `/admin/`, `/api/health`,
`/api/public/site`, `/feed` and `/robots.txt`. Migration
`20261104010000_add_user_name_parts` was applied to `mernpress_prod`.
Rollback: repoint the symlink to the previous release and restart
`mernpress-api`/`mernpress-web`; the name-part columns are additive and inert to
the previous build.

- `20261104T025333Z-87e4eae` — final parity batch (Dashicons, media infinite
  scrolling/Profile preference, Tools categories/tags converter, Updates
  screen, postbox controls, General Settings detail). Production `/`,
  `/admin/`, `/api/health` verified 200; no schema change.

## Outbound mail

Comment notifications and Add User → Send User Notification need an SMTP relay.
Set these in `/etc/mernpress/mernpress.env` and restart `mernpress-api`:

```bash
MAIL_TRANSPORT=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
MAIL_FROM="MERNPress <no-reply@example.com>"
```

`SMTP_HOST` and `MAIL_FROM` must be set together; `SMTP_USER`/`SMTP_PASS` must be
set together. With no `SMTP_HOST`, the API starts normally, `/api/admin/mail/status`
reports `configured: false`, the Discussion e-mail preferences are stored but
nothing is sent, and the Add User checkbox is disabled with that explanation.
`MAIL_TRANSPORT=memory` is a development/test sink and is rejected in production.
Credentials belong only in this environment file; never commit them.

The lost-password form uses the same transport: without SMTP it returns
`503 MAIL_NOT_CONFIGURED` and tells the user delivery is not configured. When
mail is enabled, reset links are valid for 24 hours, single-use, and resetting a
password signs out every existing session. `ADMIN_URL` is only needed when the
admin is served from a different origin (development); production uses the site
origin.

## Plugin packages

Plugins are trusted local packages stored outside releases so deleting a plugin
survives deploys:

```bash
sudo mkdir -p /opt/mernpress/plugins
sudo chown mernpress:mernpress /opt/mernpress/plugins
```

Set the store in `/etc/mernpress/mernpress.env`:

```
PLUGIN_STORAGE_DIR=/opt/mernpress/plugins
# optional; defaults to <release>/plugins
PLUGIN_SEED_DIR=/opt/mernpress/current/plugins
```

The API unit already declares `ReadWritePaths=/opt/mernpress/plugins`. On first
start the release `plugins/` directory seeds an empty store once (marker
`.initialized`); afterwards the store is authoritative. Deleting a plugin
removes its directory, and a restart does not re-create it. Reinstalling is an
operator action: copy the package directory back into the store.

## Theme packages

Themes follow the plugin-store model:

```bash
sudo mkdir -p /opt/mernpress/themes
sudo chown mernpress:mernpress /opt/mernpress/themes
```

```bash
THEME_STORAGE_DIR=/opt/mernpress/themes
THEME_SEED_DIR=/opt/mernpress/current/themes
```

The release `themes/` directory seeds an empty store once. Activating a theme in
Appearance → Themes is immediate: `/api/public/site` is fetched with
`cache: 'no-store'`, so the public site renders the new tokens on the next
request. Adding a theme is an operator copy into the store; there is no
marketplace.

## Backups

```bash
sudo mkdir -p /opt/mernpress/backups
sudo chown mernpress:mernpress /opt/mernpress/backups
sudo chmod 700 /opt/mernpress/backups
```

```bash
BACKUP_STORAGE_DIR=/opt/mernpress/backups
BACKUP_RETENTION=5
# optional; defaults to pg_dump on PATH
PG_DUMP_PATH=/usr/bin/pg_dump
```

The API unit declares `ReadWritePaths=/opt/mernpress/backups`. Restore is a CLI
procedure: [backup-restore.md](backup-restore.md). The archives contain password
hashes and media, so keep the directory `0700`/files `0600` and copy backups to
encrypted storage off the server.

## Page and object cache (deployment guide)

Status: **documented 2026-11-07**. MERNPress ships its own cache layers;
no Redis/Memcached object cache is required for the deployed single-host
topology. This section records what exists, what is recommended at larger
scale, and how to verify it — it closes the "Page/object cache integration"
roadmap item as a deployment concern (WordPress itself leaves caching to
plugins such as LiteSpeed Cache, 7M+ installs).

### What ships today

| Layer | Behaviour | Invalidation |
| --- | --- | --- |
| Next.js `public-content` tag | Public home/blog/single/page/archive/search HTML is cached under one tag | The API calls the secret-protected `POST /api/revalidate` endpoint after content changes (ADR 0056), so published edits are visible on the next request — no repository-wide purge needed |
| Next `<Link prefetch="auto">` | Viewport-visible links prefetch in production | Cache-tag invalidation above keeps prefetches fresh |
| Gated speculation rules | `prefetch`/`prerender` hints only when the field-data gate passes (ADR 0060) | Rules are computed per request from `speculation_mode` + 28-day vitals |
| Caddy static | `/admin` hashed assets are immutable and served from disk | New release = new hashes; no purge needed |
| API responses | No per-request object cache; Postgres is the store; `GET /api/public/vitals-summary` is `no-store` | N/A |
| Media derivatives | WebP/AVIF derivatives are generated at upload/regeneration and served as files | Overwrite on regenerate |

No Redis/Memcached client is configured in the app. Adding one without a
measured need would add a failure domain (stale objects, connection
pooling, Docker networking) for no user-visible gain on a single host.

### When to add an object cache or CDN

Add a layer only when field vitals show it is needed:

1. **Field data first.** Dashboard → Analytics → Core Web Vitals (by template)
   shows whether LCP/TTFB p75 is `needs-improvement`/`poor` on a template.
   Do not add cache to fix a content or image problem.
2. **Edge CDN (preferred first step).** Put Cloudflare (free tier) in front of
   `mernpress.duckdns.org` and cache HTML for anonymous visitors only:
   - Bypass cache for `/admin*`, `/api/*`, `/preview/*` and any request with
     `Cookie` or `Authorization` headers.
   - Cache `text/html` for `GET /` and public post/page paths with a short
     TTL (60s) and let the app's webhook be the primary invalidation; a
     "Purge everything" is the emergency lever, not the workflow.
   - Keep `MERNPRESS_SITE_URL` on the canonical host so origin redirects
     never leak the CDN hostname into canonical/OG URLs.
3. **Origin page cache (alternative).** If a CDN is not acceptable, run the
   Caddy cache plugin (`caddy-cache`) in front of Next only (not the API),
   with the same bypass rules and 60s TTL. Never cache `/api/*` admin
   responses.
4. **Object cache (last).** Only if Postgres CPU saturates under read load:
   add Redis for rate-limit/session-adjacent reads behind an env flag, with
   cache-aside reads and explicit invalidation on write. Session and CSRF
   tokens stay in Postgres (hashed, per the security rules) — do not move
   them to a cache that logs payloads.

### Verification

```bash
# Cache is serving fresh content after an edit (no stale snapshot):
curl -s https://mernpress.duckdns.org/posts/testcom | grep -c speculationrules
# Field vitals after the change (Dashboard → Analytics, By template):
curl -s https://mernpress.duckdns.org/api/public/vitals-summary
```

A new deployment must not bake stale URLs into the cache: release builds set
`MERNPRESS_SITE_URL` and `MERNPRESS_API_URL` at build time (see Release
above), and the E2E suite asserts the same-origin proxy behaviour.

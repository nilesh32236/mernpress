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

`https://mernpress.duckdns.org` serves:

- `/api` and `/api/*` → `127.0.0.1:4000` (Fastify API, systemd
  `mernpress-api.service`).
- everything else → `/opt/mernpress/current/apps/admin/dist` with SPA fallback
  to `index.html` (Caddy `handle` blocks are mutually exclusive).

Caddy site block: `/etc/caddy/Caddyfile` (backup:
`/etc/caddy/Caddyfile.bak.20261027T140907Z`). Caddy access log:
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

- Current release: `/opt/mernpress/releases/20261028T060614Z-dd6e16b`
  symlinked as `/opt/mernpress/current` (switched 2026-10-28; previous release
  `/opt/mernpress/releases/20261027T140348Z-46bd5c1` retained for rollback).
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

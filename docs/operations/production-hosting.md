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

- Current release: `/opt/mernpress/releases/20261027T140348Z-46bd5c1`
  symlinked as `/opt/mernpress/current`.
- Build identity: `BUILD-INFO` in the release. Deployed source identity is Git
  HEAD `46bd5c160b78ae5ed6ae560cc1414928c5632b16` plus **36 uncommitted Phase 4
  paths** (locally verified: 264 tests, 12 Playwright tests; not CI-verified).
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

## Not implemented

Media, Gutenberg editor, revisions, scheduled publishing, preview, plugin
runtime, public rendering/themes and user administration remain future phases.
The public site is not rendered by this deployment; `/` is the admin SPA.

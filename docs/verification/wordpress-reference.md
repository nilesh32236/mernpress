# WordPress reference — measuring parity

MERNPress is measured against a real WordPress 7.1.4 + Twenty Twenty-Five
install, not against memory. Every "matches WordPress" claim in an ADR, the
design audit or a decision entry points at a measurement taken with this
harness.

## The install

`/tmp/opencode/wp-site` is a throwaway WordPress 7.1.4 with the Twenty
Twenty-Five theme, a local MySQL database (`wp` / `wp-local-2026`, database
`wordpress`) and the `wp` CLI on `PATH`. It is outside the repository on
purpose: never commit it, never copy its code into MERNPress (licence and
provenance), and never point it at project data.

## Start and stop

```bash
cd /tmp/opencode/wp-site
# PHP's built-in server is single-threaded by default; the admin fires several
# parallel requests, so without workers wp-admin pages time out.
(setsid env PHP_CLI_SERVER_WORKERS=6 php -S 127.0.0.1:8080 -t . \
  > /tmp/opencode/wp-ref.log 2>&1 < /dev/null &)
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/wp-login.php

# Stop it by name. NEVER `pkill -f "php -S"`: that pattern also matches the
# agent's own shell command line and kills the session.
pkill -x php
```

## Temporary administrator

The reference install has no MERNPress accounts. Create one for the pass and
delete it afterwards:

```bash
cd /tmp/opencode/wp-site
wp user create audit-admin audit-admin@example.com \
  --role=administrator --user_pass='Audit-WP-2026!x'
# ...measure...
wp user delete audit-admin --yes
```

Use the same discipline as the production probes: create → measure → delete.
Do not leave `audit-admin` behind; the next pass should not depend on a user it
did not create.

## Measuring

Drive the reference with the browser and read computed values, not impressions:

```js
// Generic hooks survive theme changes better than element ids.
document.querySelector('[class*="sidebar"]')?.getBoundingClientRect();
getComputedStyle(document.querySelector('#menu-posts .wp-submenu'));
```

Login gotcha: `getByLabel('Password')` matches both the field and WordPress's
"Show password" button (strict-mode violation). Target the input directly:

```js
await page.locator('#user_pass').fill('Audit-WP-2026!x');
```

Give wp-admin 3–5 seconds after login; the dashboard fetches several endpoints.
Capture the value you need (rect, computed style, text) and, when the shape
matters, a screenshot.

## Recording the result

- A numeric comparison goes into
  [`docs/verification/design-audit-2026-11-05.md`](design-audit-2026-11-05.md)
  as a table row (WordPress value | MERNPress before | after).
- A behaviour that changes a contract gets an ADR or a dated `DECISIONS.md`
  entry that cites the measurement.
- The implementation log records the commands and the numbers for the slice.

State the reference version every time ("measured against WordPress 7.1.4").
Different WordPress versions move these values, and an unlabelled number ages
badly.

## Cleanup checklist

- [ ] `wp user delete audit-admin --yes`
- [ ] `pkill -x php`
- [ ] No screenshots or measurement scripts left inside the repository
- [ ] `/tmp` still has free space (`df -h /tmp`) — a full tmpfs breaks MySQL

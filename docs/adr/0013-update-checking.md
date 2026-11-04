# ADR 0013 — Update checking (expanded scope)

- Status: accepted (owner scope decision, 2026-11-04)
- Consumes: theme/plugin auto-update preferences from ADR 0011 and ADR 0012

## Context

WordPress's Dashboard → Updates screen shows the current core version, the last
check time with a "Check again" link, and whether core, plugins and themes are
current. MERNPress deploys from source, has no package registry of its own and
must not fetch arbitrary URLs (AGENTS §7). The screen still has to be real: it
may not claim "you have the latest version" without comparing against something.

## Decision

1. **One update service.** `packages/cms-core/src/updates/service.ts` reports the
   current core version (`CORE_VERSION`), the installed theme(s) and plugins
   (from their registries), the stored auto-update preferences, and the last
   check time. Every item has `installedVersion`, `availableVersion`, `status`
   (`current`/`update`) and `autoUpdates`.
2. **A real check against a configured manifest.** `UPDATE_MANIFEST_URL` (env,
   with an `update_manifest_url` option as fallback) points at a JSON document:
   `{ "core": "0.2.0", "themes": { "mernpress": "0.1.1" }, "plugins": { "hello-mernpress": "1.0.1" } }`.
   The service fetches it with a 5-second timeout, validates the shape, compares
   versions with a numeric semver comparison and records the result. A transport
   failure surfaces as `502 UPDATE_CHECK_FAILED`; nothing is silently assumed.
3. **No manifest, no false claim.** Without a configured endpoint the check
   re-reads the installed versions, records the time, and the screen says that
   no update service is configured. "You have the latest version" and "Your
   plugins/themes are all up to date" appear only after a completed manifest
   check (or when a stored result says so).
4. **Result persistence.** The last published versions are stored in
   `updates_last_result` so revisiting the screen still shows available updates
   instead of reverting to "current" until the next check.
5. **No auto-install.** Updates are discovered and shown; applying them is the
   existing release/deploy process. The theme and plugin auto-update
   preferences are displayed and remain consumed by this screen (the stored
   flags are the same ones ADR 0011/0012 introduced).
6. **Administrators only.** Both routes use the administrator guard and the
   service requires `manage_options` (WordPress `update_core`).

## Consequences

- Two additive options rows (`updates_last_checked`, `updates_last_result`); no
  migration.
- The Updates screen becomes a real version report with a working "Check again"
  against a configured service, and an explicit local-only mode otherwise.
- The Events/News dashboard widget and Appearance → Editor/Fonts remain later
  slices.

# ADR 0012 — Plugins and bundled extensions (expanded scope)

- Status: accepted (owner scope decision, 2026-11-04)
- Extends: admin shell, `packages/cms-core`, `apps/api`

## Context

The owner approved matching every WordPress screen. WordPress's Plugins screen
lists installed plugins with activate/deactivate row actions, status filters,
bulk actions, automatic-update controls and an Add Plugins directory. MERNPress
has an internal hook registry but no public plugin SDK, manifest discovery,
sandbox or installer (AGENTS §7: plugin code runs in the server process with
server privileges, trusted local packages only, no automatic download).

## Decision

1. **Bundled registry, not an installer.** `packages/cms-core/src/plugins/registry.ts`
   declares the plugins shipped in the repository. Activation is persisted as
   an `options` row (`active_plugins`, group `plugins`) and consumed at runtime;
   no third-party code is loaded, uploaded or downloaded. The service accepts an
   injected registry so the activation/toolbar contract is testable without
   shipping extra plugins.
2. **One real bundled plugin.** "Hello MERNPress" mirrors WordPress's Hello
   Dolly: when active it contributes a rotating lyric to the admin toolbar,
   served by `GET /api/admin/plugins/toolbar`. It is inactive by default, like
   Hello Dolly. There is no fake Akismet equivalent: comment spam handling is
   the Discussion setting implemented in ADR 0010.
3. **The Installed Plugins screen matches WordPress 7.1.** Title count bubble,
   Add Plugin button, All/Active/Inactive filters with counts, "Search installed
   plugins" label + input, bulk actions (Activate/Deactivate over the current
   selection), a list table with checkbox / Plugin (name + row actions) /
   Description (version + author line) / Automatic Updates, and active rows with
   the `#f0f6fc` background and 4px `#72aee6` edge. Screen Options can hide the
   description/auto-update columns and set the per-page value.
4. **Add Plugins is honest.** The screen keeps the WordPress header, count,
   search and Installed list, and states that WordPress.org browsing, ZIP upload
   and runtime install are not enabled. `Upload Plugin` is disabled rather than
   simulated.
5. **Automatic updates are a stored preference.** The column toggles
   `plugin_auto_updates`; the update-checking slice consumes it. Nothing
   downloads or replaces plugin code today.
6. **Administrators only.** All plugin routes use the administrator guard
   (WordPress `activate_plugins`), and the sidebar entry is administrator-only.

## Consequences

- Additive `options` rows only; no migration.
- The Hello MERNPress plugin is the first runtime consumer of the plugin state,
  proving activation has a visible effect (toolbar lyric appears/disappears).
- Appearance → Editor/Fonts, update checking and the Events/News widget remain
  later slices.

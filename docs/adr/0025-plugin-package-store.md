# ADR 0025 — Plugin package store and real removal

- Status: accepted (owner scope decision, 2026-11-05)
- Supersedes the tombstone delete semantics in ADR 0020

## Context

Deleting a plugin previously wrote a `deleted_plugins` tombstone while the
plugin package (a hard-coded registry entry) stayed in the codebase. That hid
the plugin but did not remove anything, so it was not a real delete.

## Decision

1. **Plugins are packages on disk.** Each package is a directory with a
   `plugin.json` manifest (`id`, `name`, `version`, `author`, `description`,
   `details`, optional `toolbarLyrics`). The bundled Hello MERNPress package now
   lives at `plugins/hello-mernpress/plugin.json` in the repository.
2. **A writable store is authoritative.** `PLUGIN_STORAGE_DIR` (production:
   `/opt/mernpress/plugins`, outside releases) holds the installed packages.
   `PLUGIN_SEED_DIR` (default: the repository/release `plugins/` directory)
   seeds an empty store **once**, guarded by a `.initialized` marker. After that
   the store is authoritative: a restart or a new release does not re-create a
   deleted package, and an intentionally empty store is not re-seeded.
3. **Delete removes the package directory.** `DELETE /api/admin/plugins/:id`
   refuses active plugins (409), then recursively removes
   `PLUGIN_STORAGE_DIR/<id>` (manifest and assets) and the plugin disappears
   from lists, counts, updates and the toolbar. A restart keeps it removed.
   Reinstalling is an operator action (copy a package into the store); there is
   no marketplace.
4. **Reads are always from disk.** Listing, activation, toolbar output and
   update checks load the store, so deleting or adding a package is reflected
   without code changes. Invalid manifests are skipped and logged. Toolbar
   lyrics come from the manifest, keeping the bundled plugin data-driven.
5. **Production hardening.** The API runs with `ProtectSystem=strict`; the unit
   declares `ReadWritePaths=/opt/mernpress/plugins` in addition to the media
   directory. `PLUGIN_STORAGE_DIR` is required in production so the API cannot
   silently fall back to a read-only release path.
6. **Trust boundary is unchanged.** Packages are local trusted files, not
   downloaded or executed as arbitrary code; a package's runtime contribution
   remains the manifest-defined behaviour. A future Phase 9 plugin runtime can
   load code modules under the same store/install model.

## Consequences

- No migration: the store is on disk and the old `deleted_plugins` option is
  ignored (and can be removed).
- `hello-mernpress` lives in `plugins/hello-mernpress/plugin.json`; its lyrics
  moved out of TypeScript into the manifest.
- Update checks now ask the plugin service for installed packages, so deleted
  plugins disappear from Dashboard → Updates.

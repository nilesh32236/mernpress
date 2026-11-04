# ADR 0020 — Plugin row actions: details and delete

- Status: accepted (owner scope decision, 2026-11-04)
- Extends: ADR 0012 (bundled plugins)

## Context

WordPress's Installed Plugins table offers, per row, Activate/Deactivate,
Delete (inactive plugins only) and View details. MERNPress had only
Activate/Deactivate and Automatic Updates, so the last two row actions were
missing.

## Decision

1. **View details is real, from the registry.** The dialog shows the plugin's
   name, version, author, description, short details line and the current
   automatic-update preference. MERNPress has no WordPress.org metadata API, so
   no installs/ratings/last-updated figures are invented.
2. **Delete removes the plugin from the site, with one honest limitation.** An
   inactive plugin can be deleted after a confirmation dialog. The API adds its
   id to a `deleted_plugins` option, clears it from the active list, and every
   list/count/toolbar query filters it out; deleting it again returns 404, as if
   the package were gone. Because plugins are bundled into MERNPress releases,
   the code itself stays in the release. The confirmation and Help say this
   explicitly instead of implying file removal.
3. **Active plugins cannot be deleted.** The API returns 409
   "Deactivate the plugin before deleting it." and the row hides Delete while
   active, matching WordPress.
4. **The footer select-all mirrors the header.** It now selects/deselects the
   visible plugins and reflects their state instead of staying disabled.

## Consequences

- No migration: the tombstone is an additive `options` row.
- A future plugin installer can replace the tombstone with real package removal;
  until then, deletion is a site-level hide rather than a filesystem operation.
- The Plugins table now matches WordPress's row actions except Edit (file
  editor, excluded by the owner).

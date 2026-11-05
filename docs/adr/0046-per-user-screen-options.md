# ADR 0046 — Per-user Screen Options and editor panel visibility

- Status: accepted (owner scope decision, 2026-11-05)
- Closes the "Screen Options per screen" deviation in the design audit

## Context

MERNPress already had a Screen Options panel (columns, items per page, view
mode, dashboard boxes/columns), but every value lived in `localStorage` and was
therefore per browser, not per user. WordPress stores these choices in user meta
(`screen_options`, `screen_layout_*`, hidden columns) and the classic editor also
remembers which panels are hidden. The parity matrix still recorded the panels as
narrower than WordPress.

## Decision

1. **One per-user map.** `users.screen_options` (`jsonb`, default `{}`) stores
   the complete map: `perPage`, `hiddenColumns`, `viewMode`, `dashboardHidden`,
   `dashboardColumns` and `editorHiddenPanels`. `GET/PUT
   /api/profile/screen-options` (any authenticated user, own data only) reads and
   replaces it. `POST` is not needed: the map is small and writes are whole-map
   replacements.
2. **Shared validation.** `packages/contracts/src/screen-options.ts` defines the
   shape, the screen list, the dashboard widget ids and the editor panel ids, and
   exports `normalizeScreenOptions`. Unknown screens, columns, widgets and panels
   are dropped instead of rejected, so stale or hand-edited values cannot break
   the admin. Items-per-page is clamped to 1–100 and dashboard columns to 1–4.
3. **Local cache, server truth.** `localStorage` keeps the last map under
   `mernpress.screenOptions` so the admin paints correctly before the profile
   request. `App` fetches the server map after the session and calls
   `hydrateScreenOptions`, replacing the cache. Every setter updates the cache
   immediately, dispatches the existing custom events and mirrors the whole map
   through a debounced PUT. A failed sync leaves the local UI usable; the next
   change retries.
4. **Legacy migration.** The previous per-key layout (`mernpress.perPage.*`,
   `mernpress.hiddenColumns.*`, `mernpress.viewMode.*`,
   `mernpress.dashboardHidden`, `mernpress.dashboardColumns`) is read once when
   the new key is absent, so existing users keep their choices.
5. **Editor panels.** The editor's **Preferences** dialog gains a "Document
   panels" fieldset for Author, Template, Discussion, Format, Slug, Categories
   and tags and Sticky. This is the block-editor equivalent of the classic
   editor's Screen Options. Hidden panels are removed from the Post tab but the
   data is untouched; re-enabling restores them. The choices persist in the same
   per-user map.
6. **Sticky parity.** The post editor now exposes WordPress's "Stick to the top
   of the blog" checkbox in the publish panel (posts only), persisted like Quick
   Edit's sticky field. `POST /api/admin/posts` accepts `sticky` and the service
   stores it for posts only.
7. **Per-page where applicable.** Posts, pages, users, terms, media, comments and
   plugins keep their "Number of items per page" control; all now persist per
   user through the same map.

## Consequences

- One additive migration `20261105165111_add_user_screen_options`.
- Screen Options changes are now server-backed across browsers/devices, at the
  cost of one profile request per admin load and a debounced PUT per change.
- The cache key is cosmetic (no auth state); the E2E storage assertion lists it
  alongside the colour-scheme cache.
- Editor panel visibility is deliberately limited to the seven panels above;
  WordPress's classic editor has more (excerpt, custom fields, page attributes)
  because it has different panels. Adding one means extending the shared list and
  wrapping the panel, no API change.

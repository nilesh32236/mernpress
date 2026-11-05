# Screen Options — developer guide

## Data

`users.screen_options` (`jsonb`) holds the complete map:

```json
{
  "perPage": { "posts": 25 },
  "hiddenColumns": { "posts": ["author"] },
  "viewMode": { "posts": "compact" },
  "dashboardHidden": ["events"],
  "dashboardColumns": 2,
  "editorHiddenPanels": ["format"]
}
```

The canonical types and `normalizeScreenOptions` live in
`packages/contracts/src/screen-options.ts`. The API service is
`packages/cms-core/src/preferences/screen-options.ts`; routes are
`GET/PUT /api/profile/screen-options` (own profile, session + CSRF).

## Client flow

1. `screenOptions.ts` loads `localStorage['mernpress.screenOptions']` at module
   load (migrating the old per-key layout once).
2. `App` fetches the server map after the session and calls
   `hydrateScreenOptions`, which replaces the cache and dispatches every
   Screen Options event so mounted screens re-read their values.
3. Components keep using the existing getters/setters (`screenPerPage`,
   `screenHiddenColumns`, `screenViewMode`, `dashboardHiddenWidgets`,
   `dashboardColumns`, `editorHiddenPanels`).
4. Setters mutate the map, persist the cache, dispatch the matching event and
   schedule a 300 ms whole-map PUT. `flushScreenOptionsSync()` forces the write
   in tests.

## Editor panels

`EDITOR_PANELS` (contracts) lists the seven hideable editor panels. The editor's
Preferences dialog renders the checkboxes; `ContentEditor` wraps each publish
field (and the taxonomies section) with `hiddenPanels.has('<id>')`. The Sticky
field is part of the same list and is posts-only. Hiding a panel never changes
or deletes saved data.

## Adding a screen or panel

1. Add the screen id to `SCREEN_OPTION_SCREENS` (or the panel to
   `EDITOR_PANELS`).
2. Add the column list to `SCREEN_COLUMNS` in `apps/admin/src/screenOptions.ts`
   if the screen has columns.
3. Wrap the UI and read the option through the existing getter.
4. Extend `packages/contracts/test/permalink.test.ts` and
   `apps/api/test/screen-options.test.ts`.

## Limits

- Unknown values are dropped on read; writes normalize too.
- The map is replaced as a whole; concurrent tabs last-write-wins.
- The local cache is cosmetic and can be cleared without losing server state.

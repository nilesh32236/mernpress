# Administration colour schemes — developer guide

## Data

| Layer | Value |
| --- | --- |
| `users.admin_color` | Stored scheme id (`fresh` by default) |
| `PublicUser.adminColor` | Session response field |
| `UserProfile.adminColor` | Profile API field |
| `GET/PUT /api/profile` | `adminColor` (validated against the shared list) |

The canonical list lives in `packages/contracts/src/admin-colors.ts`:
`ADMIN_COLOR_SCHEMES` (id, label, swatch), `ADMIN_COLOR_SCHEME_IDS`,
`DEFAULT_ADMIN_COLOR_SCHEME` and `isAdminColorScheme`.

## Rendering

1. `apps/admin/src/main.tsx` reads the `localStorage` cache and sets
   `document.documentElement.dataset.colorScheme` before React mounts.
2. `App` applies `sessionUser.adminColor` when the session arrives, replacing
   the cache.
3. `ProfilePage` applies `profile.adminColor` and previews a radio choice
   immediately through `applyColorScheme`; **Update Profile** persists it.
4. `styles.css` defines one block per id under
   `:root[data-color-scheme='<id>']` that overrides the `--wp-*` variables.

## Adding a scheme

1. Add `{ id, label, swatch }` to `ADMIN_COLOR_SCHEMES`.
2. Add a `:root[data-color-scheme='<id>']` block with the full `--wp-*` set.
3. Extend `packages/contracts/test/permalink.test.ts` (id list) and the admin
   profile test if the default changes.
4. No API change is needed: validation reads the shared list.

## Defaults and fallbacks

- The default is `fresh`, labelled "Default", matching WordPress's scheme key.
- `("default")` stored by very old builds maps to `fresh`.
- Unknown stored values (direct DB edits) are read as the default by
  `toPublicUser`/`toProfile`; the next save writes a valid id.

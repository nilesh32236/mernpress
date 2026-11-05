# ADR 0044 — Per-user administration colour schemes

- Status: accepted (owner scope decision, 2026-11-05)
- Closes the "admin colour schemes" deviation in the design audit

## Context

The admin already shipped the nine WordPress palettes (Default, Light, Modern,
Blue, Coffee, Ectoplasm, Midnight, Ocean, Sunrise) and a Profile picker, but the
choice lived only in `localStorage`: it did not follow the user to another
browser or device, and the server had no idea which scheme was active. WordPress
stores `admin_color` in user meta.

## Decision

1. **Server-side, per-user preference.** `users.admin_color` (`VarChar(20)`,
   default `fresh`) is the source of truth. `GET /api/profile` returns
   `adminColor`; `PUT /api/profile` accepts it. The session response also carries
   `adminColor` so the chrome can be correct on first paint.
2. **One shared scheme list.** `packages/contracts/src/admin-colors.ts` defines
   the ids, labels and swatches; the API validates against it, the admin imports
   the same list for the picker, and the palette is still applied through the
   `data-color-scheme` attribute and the CSS variables in `styles.css`.
3. **Labels match WordPress.** The default key is `fresh` and is labelled
   "Default"; `modern` is labelled "Modern". (The previous build had these two
   labels reversed.)
4. **Local storage is a cache only.** `main.tsx` applies the cached scheme
   before React mounts to avoid a flash; `App` replaces it with the session
   value, and `ProfilePage` applies the profile value. Choosing a scheme previews
   immediately and persists on **Update Profile**; `updateProfile` returns the
   stored value.
5. **Validation is server-side.** Unknown ids are rejected with
   `400 VALIDATION_ERROR` by the route (Zod custom guard) and again by
   `UserAdminService` (`INVALID_ADMIN_COLOR`) so direct service callers cannot
   store arbitrary strings. Reading a row with an unknown value falls back to
   the default rather than failing the session.
6. **No migration of existing prefs.** Existing users get `fresh`, which is what
   the browser cache already defaulted to; the cache is overwritten by the
   session value on the next load.

## Consequences

- One additive migration `20261105161547_add_user_admin_color`.
- The profile update payload carries one extra field; every existing client
  keeps working because the field is optional.
- Admin storage now contains exactly one cached key (`mernpress.colorScheme`);
  the E2E storage assertion documents that it is cosmetic, not auth state.
- Adding a scheme requires a contracts entry and a matching CSS block; the API
  and picker pick it up automatically.

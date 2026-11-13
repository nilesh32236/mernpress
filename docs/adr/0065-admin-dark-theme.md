# ADR 0065 — Admin dark theme (`dark` palette) and the admin-bar switch

- Status: accepted (2026-11-13)
- Related: [ADR 0044](0044-admin-color-schemes.md) (admin colour schemes),
  [ADR 0064](0064-public-colour-scheme.md) (public light/dark switch)

## Context

The admin's nine colour schemes are WordPress chrome palettes: they recolour
the admin bar and the sidebar, and the content area stays light in all of them.
That is faithful to WordPress, but it left two problems:

1. **Form controls followed the operating system, not the admin.** `index.html`
   declares `<meta name="color-scheme" content="light dark">`, so a visitor
   whose desktop is in dark mode got dark inputs, textareas, checkboxes and
   radio buttons inside the light admin. The owner reported exactly that.
2. **There was no way to work in a dark admin.** The owner asked for a theme
   switch on the admin side as well as the public one.

Fixing (1) is a one-line declaration (`color-scheme: light` on `:root`, so the
browser draws the controls light). Fixing (2) needs a palette that darkens the
content area, which no WordPress palette does.

## Decision

1. **A tenth palette id, `dark`.** It joins the shared list in
   `packages/contracts/src/admin-colors.ts`, so the profile picker (which is
   data-driven), the API validator and the session response all understand it
   without a schema change — `users.admin_color` already stores a scheme id.
2. **The dark look lives in a separate stylesheet.** `apps/admin/src/dark-theme.css`
   is loaded after `styles.css` and every rule is scoped to
   `:root[data-color-scheme='dark']`. The light palettes therefore cannot
   change: the 108 visual baselines keep guarding the light rendering, and the
   dark layer can be extended surface by surface without touching 15,000 lines
   of base CSS.
3. **A switch in the admin bar.** `ColorSchemeToggle` sits next to the user
   menu. It toggles between `dark` and the palette that was in use; the palette
   to return to is remembered in `localStorage` (a display preference, not
   data). The choice is persisted per user through the existing
   `PATCH /api/admin/profile` (`adminColor`), so it follows the account to
   another browser.
4. **The content area owns its own surface tokens.** The dark block redefines
   `--wp-bg`, `--wp-card`, `--wp-alt-row`, `--wp-hover-row`, `--wp-border`,
   `--wp-input-border`, `--wp-text`, `--wp-muted` and the status pills, and sets
   `color-scheme: dark` so native controls, scrollbars and text selection match.
5. **The default stays light.** Nothing changes for an account that never
   touches the switch.

## Alternatives considered

- **Tokenise every literal colour in `styles.css`** (~1,000 literals) and make
  the nine palettes theme-aware. Correct long-term, but it rewrites the base
  stylesheet and risks the visual baselines for a feature that only needs one
  palette. The separate layer reaches the same result with a much smaller blast
  radius.
- **A `users.admin_dark_mode` boolean column.** Cleaner semantically, but it
  needs a migration, an API field and a profile form field for a value the
  palette id already expresses. The palette list is the existing extension
  point.
- **Dark variants for all nine palettes.** Eight of them are chrome palettes
  with no dark content design; inventing eight dark variants would be
  speculative. One dark palette (dark chrome + dark content) is the coherent
  choice, and the other palettes stay the light WordPress looks.
- **Dark mode for the site editor canvas only.** Does not answer the request;
  the editor is already its own surface.

## Consequences

- WordPress has no dark admin, so `dark` is a documented difference from the
  reference, like the public colour scheme (ADR 0064).
- The visual baseline suite captures the light theme. The dark layer is checked
  by a dedicated E2E contract (the palette attribute, the computed surface
  colours, form-control colour scheme, persistence across a reload) plus a
  manual screenshot pass over the main screens. New admin surfaces must use the
  `--wp-*` tokens, or be added to `dark-theme.css`, to stay dark.
- The Profile picker now lists ten schemes; `dark` is the only one whose content
  area is dark.
- The `color-scheme: light` declaration also fixes the light palette for any
  visitor whose desktop is dark: form controls now match the admin instead of
  the operating system.

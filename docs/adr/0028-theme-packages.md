# ADR 0028 — Theme packages and a second public theme

- Status: accepted (owner scope decision, 2026-11-05)
- Extends: ADR 0011 (appearance/themes), ADR 0025 (package-store pattern)

## Context

The Appearance screen listed one hard-coded theme and the public site had no way
to change its design. The owner asked for themes that can actually be used.

## Decision

1. **Themes are packages on disk.** `themes/<id>/theme.json` holds identity,
   description, tags, features, fonts, a layout variant and design tokens. A
   writable store (`THEME_STORAGE_DIR`, production `/opt/mernpress/themes`) is
   seeded once from the release `themes/` directory behind an `.initialized`
   marker; after that the store is authoritative.
2. **Themes change design tokens, not server code.** Tokens are a fixed,
   validated set: background, surface, text, muted, accent, heading/body font,
   content width, radius and header alignment. The public layout injects them as
   CSS custom properties (`--site-bg`, `--content-width`, …). A theme cannot
   execute code or reach storage paths.
3. **One bounded layout variant.** `layout` is `classic` or `journal`. The
   journal variant adds a centred masthead, double rule, serif headings, warm
   surface and boxed post rules. More variants must be added in code and
   documented; arbitrary templates are out of scope.
4. **Activation is instant.** `POST /api/admin/themes/:id/activate` stores
   `active_theme`; the public site reads the active theme from
   `/api/public/site`. That endpoint is fetched with `cache: 'no-store'`, so a
   switch appears on the next request instead of waiting for a cache window.
5. **Two themes ship.** `MERNPress` (classic, the previous design expressed as
   tokens) and `MERNPress Journal` (editorial). The admin list, count, details,
   screenshot, search and Activate/Active states read the store.
6. **Update checks read the store.** Dashboard → Updates now asks the theme
   service for installed themes instead of a hard-coded registry.

## Consequences

- No migration: the active theme and auto-update preference are options.
- Production needs `THEME_STORAGE_DIR` plus `ReadWritePaths` for the store.
- Theme packages are trusted local files. A future installer/marketplace is
  still out of scope; adding a theme is an operator copy into the store.
- The public site keeps one template hierarchy; a theme cannot add PHP-like
  templates. This is documented rather than simulated.

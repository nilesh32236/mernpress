# Theme packages — developer guide

Themes are trusted local packages in the writable theme store
(`THEME_STORAGE_DIR`, production `/opt/mernpress/themes`). The release
`themes/` directory seeds an empty store once (`.initialized` marker), exactly
like plugins.

```
themes/my-theme/
  theme.json
```

## Manifest

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "version": "1.0.0",
  "author": { "name": "You", "url": null },
  "description": "What it looks like and who it is for.",
  "tags": ["Blog", "Editorial"],
  "screenshot": "/theme-my-theme.svg",
  "layout": "journal",
  "features": ["Editorial typography"],
  "fonts": [{ "family": "Georgia", "weights": [400, 700], "source": "system" }],
  "tokens": {
    "background": "#f7f2e8",
    "surface": "#fffdf8",
    "text": "#1f1b16",
    "muted": "#6b6157",
    "accent": "#8a3b2e",
    "headingFont": "Georgia, 'Times New Roman', serif",
    "bodyFont": "var(--font-manrope), Manrope, sans-serif",
    "contentWidth": "700px",
    "radius": "10px",
    "headerAlign": "center",
    "dark": {
      "background": "#16130f",
      "surface": "#1f1a15",
      "text": "#ece5d8",
      "muted": "#a89c8c",
      "accent": "#e08a6b"
    }
  }
}
```

Validation rejects a missing/oversized token, an unknown `layout` or an invalid
`id`. Invalid packages are skipped and logged; they do not break the Themes
screen.

`tokens.dark` is optional. When it is present it must carry the same five
colours; a malformed dark palette rejects the whole manifest instead of
falling back to a half-dark theme.

## How tokens are applied

`apps/web/app/layout.tsx` reads `settings.theme` from `/api/public/site` and
publishes **both** palettes as inline custom properties on `<html>`:

| Token | CSS custom property | Used by |
| --- | --- | --- |
| background | `--theme-light-bg` → `--site-bg` | `body` |
| surface | `--theme-light-surface` → `--site-surface` | journal header/footer |
| text | `--theme-light-text` → `--site-text` | body text |
| muted | `--theme-light-muted` → `--site-muted` | dates, metadata |
| accent | `--theme-light-accent` → `--site-accent` | journal links |
| dark.background | `--theme-dark-bg` → `--site-bg` in dark mode | `body` |
| dark.surface | `--theme-dark-surface` → `--site-surface` in dark mode | journal header/footer |
| dark.text | `--theme-dark-text` → `--site-text` in dark mode | body text |
| dark.muted | `--theme-dark-muted` → `--site-muted` in dark mode | dates, metadata |
| dark.accent | `--theme-dark-accent` → `--site-accent` in dark mode | journal links |
| headingFont | `--theme-heading-font` → `--site-heading-font` | headings, site title |
| bodyFont | `--theme-body-font` → `--site-body-font` | body |
| contentWidth | `--content-width` | `.site-content` |
| radius | `--site-radius` | images/comment cards |
| headerAlign | (journal layout) | centred masthead |

The `--site-*` names are the semantic layer in `apps/web/app/globals.css`: they
are defined once with `light-dark()`, so the stylesheet picks the light or the
dark palette from the used colour scheme. Do **not** set `--site-*` inline —
an inline declaration beats every stylesheet rule and would break the switch.

The visitor's choice lives in the `mernpress_color_scheme` cookie
(`light`/`dark`). The layout reads it and renders `data-color-scheme` on
`<html>`; without a cookie the site follows the operating-system preference.
See [ADR 0064](../adr/0064-public-colour-scheme.md).

`data-theme` and `data-layout` are set on `<html>`, so theme-specific CSS can be
scoped to `[data-layout='journal']`.

## Screenshots

The admin serves screenshots from `apps/admin/public/` under `/admin/`. Ship a
PNG or SVG and reference it as `/theme-<id>.svg`.

## Adding a theme

1. Create `themes/<id>/theme.json` with a valid manifest.
2. Add a screenshot to `apps/admin/public/`.
3. Copy the directory into the store on a running server (or remove the store's
   `.initialized` marker in development to reseed).
4. Activate it in Appearance → Themes.

## Changing a bundled theme

The store is writable and is seeded once (`.initialized` marker), but the
bundled themes ship with the release: on every start the seed compares the
release manifest's `version` with the installed one and copies the release
package over an older installed copy. **Bump `version` in `themes/<id>/theme.json`
whenever you change a bundled manifest** (the dark palette shipped as 1.1.0) or
existing installations will keep the old one. An installed package that is the
same version or newer is never touched.

Themes cannot execute code, add templates or change content queries. Layout
variants are a closed set implemented in `apps/web/app/globals.css`; adding one
requires code and documentation.

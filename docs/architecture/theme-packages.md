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
    "headerAlign": "center"
  }
}
```

Validation rejects a missing/oversized token, an unknown `layout` or an invalid
`id`. Invalid packages are skipped and logged; they do not break the Themes
screen.

## How tokens are applied

`apps/web/app/layout.tsx` reads `settings.theme` from `/api/public/site` and
sets:

| Token | CSS custom property | Used by |
| --- | --- | --- |
| background | `--site-bg` | `body` |
| surface | `--site-surface` | journal header/footer |
| text | `--site-text` | body text |
| muted | `--site-muted` | dates, metadata |
| accent | `--site-accent` | journal links |
| headingFont | `--site-heading-font` | headings, site title |
| bodyFont | `--site-body-font` | body |
| contentWidth | `--content-width` | `.site-content` |
| radius | `--site-radius` | images/comment cards |
| headerAlign | (journal layout) | centred masthead |

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

Themes cannot execute code, add templates or change content queries. Layout
variants are a closed set implemented in `apps/web/app/globals.css`; adding one
requires code and documentation.

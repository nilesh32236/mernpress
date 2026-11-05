# Appearance → Customize — developer guide

## Data

| Option key | Type | Meaning |
| --- | --- | --- |
| `customizer_colors` | `{background?,surface?,text?,muted?,accent?}` hex strings | Theme-token overrides |
| `customizer_menu` | `{label,url}[]` (max 20) | Header navigation |
| `customizer_css` | string (max 20,000) | Additional CSS |
| `show_on_front` | `posts` \| `page` | Front-page mode |
| `page_on_front` | page UUID \| null | Static homepage |
| `page_for_posts` | page UUID \| null | Blog index page |

All six live in the `appearance` option group. `GET /api/public/site` returns
`customColors`, `customMenu`, `customCss`, `showOnFront`, `pageOnFrontSlug` and
`pageForPostsSlug` (slugs only, and only while the page is published).

## Service and routes

- `packages/cms-core/src/customizer/validation.ts` — validators and types.
  `validateColors`, `validateMenu`, `validateCustomCss` throw
  `ContentError('VALIDATION_ERROR', …, 400)`.
- `packages/cms-core/src/customizer/service.ts` — `get`/`update`; validates
  that front/posts pages exist, are pages, are published and differ, then writes
  all six options in one transaction.
- `apps/api/src/routes/customizer.ts` — `GET/PUT /api/admin/customizer`,
  administrator-only, 64 KB body limit.
- `apps/admin/src/CustomizePage.tsx` — the panel UI; client-side hex and menu
  checks are duplicated only for fast feedback (the server is authoritative).

## Rendering

`apps/web/app/layout.tsx`:

1. starts from the active theme's `tokens`,
2. overrides `--site-bg`, `--site-surface`, `--site-text`, `--site-muted` and
   `--site-accent` from `customColors`,
3. injects `customCss` into `<style id="customizer-css">`,
4. renders `customMenu` in `.site-nav` (falling back to published pages).

`apps/web/app/page.tsx` renders the static front page (`PostView`) when
`showOnFront === 'page'`; `apps/web/app/[slug]/page.tsx` renders the blog loop
when the requested page equals `pageForPostsSlug`.

## Adding a colour token

1. Add the key to `CUSTOM_COLOR_KEYS` in `validation.ts`.
2. Map it to a CSS variable in `apps/web/app/layout.tsx`.
3. Use the variable in `globals.css` / theme CSS.
4. Extend `apps/api/test/customizer.test.ts` and the admin test.

## Security notes

- Colours are hex-only; menu URLs are paths or `http(s)`; CSS rejects
  element-escape, script, legacy-execution and remote-import constructs.
- Additional CSS is injected into a style element, not evaluated as markup.
  It cannot add scripts; it can still restyle the site, so only administrators
  with `manage_options` can edit it.

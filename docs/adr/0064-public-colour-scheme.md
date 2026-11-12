# ADR 0064 — Public light/dark colour scheme (theme palettes, cookie, no-flash SSR)

- Status: accepted (2026-11-12)
- Related: [theme packages](../architecture/theme-packages.md),
  [admin colour schemes](../architecture/admin-color-schemes.md),
  [ADR 0044](0044-admin-color-schemes.md)

## Context

The public site rendered one hard-coded light palette. The theme manifests
carry their own colours (`tokens.background`, `tokens.text`, …) and the
admin already offers nine colour schemes, so the two halves of the product
disagreed: the admin could switch, the public site could not.

Two properties matter for a public switch:

1. **No flash.** The palette must be correct on the first painted byte. A
   client-side script that flips a class after hydration shows the light
   palette first and is unusable on slow connections.
2. **The palette belongs to the theme.** A generic dark palette would ignore
   the theme's own colours (the journal theme is warm cream; its dark
   counterpart should stay warm).

WordPress 7.1.4 has no public dark mode, so this is a documented difference
from the reference, not a parity gap.

## Decision

1. **The theme publishes two palettes.** `ThemeTokens` gains an optional
   `dark` object with the same five colours (`background`, `surface`, `text`,
   `muted`, `accent`). A present but malformed palette rejects the manifest
   instead of silently falling back to a half-dark theme. All three bundled
   themes (`mernpress`, `journal`, `minimal`) ship a dark palette.
2. **The layout publishes both palettes; the stylesheet switches.** The
   inline custom properties on `<html>` are now `--theme-light-*` and
   `--theme-dark-*`. The stylesheet maps them onto the semantic names with
   `light-dark()`:
   ```css
   --site-bg: var(--theme-light-bg, #ffffff);
   --site-bg: light-dark(var(--theme-light-bg, #ffffff), var(--theme-dark-bg, #121212));
   ```
   The first declaration is the fallback for browsers without `light-dark()`
   (they stay light). The old inline `--site-*` variables are gone: an inline
   declaration beats every stylesheet rule, so it could never be switched.
3. **One attribute switches the scheme.** `:root { color-scheme: light dark }`
   lets the browser follow the operating-system preference.
   `:root[data-color-scheme='light'|'dark']` pins the scheme to an explicit
   visitor choice and wins over the OS. Because `light-dark()` resolves
   against the used colour scheme, no colour rule is duplicated.
4. **The choice is a cookie.** `mernpress_color_scheme` holds `light` or
   `dark`. The root layout reads it with `cookies()` and renders
   `data-color-scheme` on `<html>`, so the first byte already carries the
   right palette — no flash, and the choice survives a reload. The layout is
   already `force-dynamic`, so the cookie read adds no caching regression.
5. **The toggle is a client component.** `apps/web/components/ThemeToggle.tsx`
   flips the attribute, writes the cookie and updates its own label. It renders
   the icon for the *target* scheme, and the accessible name comes from the
   theme strings (`toggleDarkMode` / `toggleLightMode`), so a translated site
   can localise it.
6. **Customizer colours stay light-only.** The customizer overrides the
   *light* palette; the dark palette stays the theme's own. A customizer
   colour that is not legible on a dark background is therefore never
   combined with the dark palette.

## Alternatives considered

- **Duplicate the colour rules for dark mode** (`:root[data-color-scheme='dark']`
  with every token repeated, plus a `prefers-color-scheme` block): works
  without `light-dark()`, but every new token has to be written three times
  and the two copies drift.
- **`prefers-color-scheme` only, no switch**: simpler, but the visitor cannot
  override the OS and the theme cannot offer a dark palette.
- **Inline `<script>` before first paint** (the admin's `main.tsx` approach):
  works without a cookie, but the first paint is decided by a script rather
  than the document, and it is invisible to the server — the RSS/SEO side
  would still describe a light site.
- **Store the preference in the user profile**: it only works for signed-in
  visitors; the public site must work for anonymous readers.
- **Derive the dark palette from the light one in code** (invert the
  luminance): produces muddy results for a warm theme such as `journal`, and
  hides the intent of the theme author. The explicit palette is reviewable.

## Consequences

- The public site now follows the operating system when the visitor has no
  cookie. This is a visible change for dark-OS visitors and is documented as
  a difference from WordPress.
- `light-dark()` needs a browser from 2024 (Chrome 123, Safari 17.5,
  Firefox 120). Older browsers keep the light palette — the site never
  renders unstyled or colourless.
- Authored post content may carry inline `color`/`background` (the block
  sanitizer allows them). Such colours do not flip; a post that hard-codes
  `#000` on white stays black on white in dark mode. This is the documented
  behaviour of authored markup, not a theme bug.
- The public admin bar, the consent banner and the language switcher keep
  their WordPress chrome colours; they are admin UI, not site chrome.
- A theme without a `dark` palette falls back to a neutral dark palette in
  the stylesheet (`#121212` background, `#e8e8e8` text).

# ADR 0015 — Appearance → Editor and Fonts (expanded scope)

- Status: accepted (owner scope decision, 2026-11-04)
- Completes the Appearance menu started in ADR 0011

## Context

WordPress's Appearance menu has three screens: Themes, Editor (the Site Editor)
and Fonts (the font library). Themes shipped in ADR 0011. The Site Editor edits
block templates and template parts in the browser; the Fonts screen installs and
activates font families. MERNPress's public templates are Next.js routes in
`apps/web/app` and its fonts are bundled with the theme package
(`next/font`, Manrope), so neither can be edited at runtime without a theme
runtime and a font installer.

## Decision

1. **The Editor is a real template browser, not a fake editor.** Appearance →
   Editor reproduces the WordPress chrome (300px dark "Design" sidebar, nav
   items, templates list, white canvas) and previews the actual public pages in
   an iframe. The template list resolves real content: the latest published post
   (single post), latest page (page), that post's first category and tag
   (archives), plus the static front page, blog index, search and 404 routes.
   Templates with no content yet show an explicit "No published post yet."
   state instead of a broken preview.
2. **Implemented panels link to where the work actually happens.** Identity
   opens Appearance → Customize (the real site title/tagline editor); Pages opens
   the Pages list.
3. **Unavailable panels say so.** Styles, Navigation and Patterns are rendered
   (WordPress shows them) but report that templates and styles are defined in
   code and ship with releases. In-browser template editing is not simulated.
4. **Fonts lists the real theme fonts.** The Fonts screen mirrors the WordPress
   font library (Library / Upload / Install Fonts tabs, THEME section, "N of N
   active" rows, expandable sample at each weight, bottom Update bar). Data comes
   from the active theme's registry entry (`fonts` on `ThemeManifest`), so the
   Themes screen and the Fonts screen cannot drift.
5. **Upload and provider install are disabled with an explanation.** Fonts ship
   with the theme package; there is no font installer.
6. **Administrators only.** Both screens are administrator routes, and the
   Appearance submenu lists Themes, Editor and Fonts like WordPress 7.1.

## Consequences

- No new tables, options or migrations; the theme registry gains a `fonts`
  field (surfaced through the existing themes API).
- The Appearance menu now matches WordPress 7.1 exactly (Themes, Editor, Fonts).
- The Site Editor preview needs the public site origin: same origin in
  production, `VITE_SITE_URL` or the web dev server locally.

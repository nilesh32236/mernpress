# ADR 0041 — Appearance → Customize panels

- Status: accepted (owner scope decision, 2026-11-05)
- Closes the "Customizer panels" deviation in the design audit

## Context

Before this slice Appearance → Customize edited only the site title and tagline.
WordPress's Customizer also offers Colors, Menus, Homepage Settings and
Additional CSS for classic themes. MERNPress themes are token packages
(ADR 0028), so the equivalent settings must map onto design tokens, the header
navigation and the front-page query rather than PHP template code.

## Decision

1. **One appearance option group.** `customizer_colors`, `customizer_menu`,
   `customizer_css`, `show_on_front`, `page_on_front` and `page_for_posts` live
   in the option store under the new `appearance` group. `GET/PUT
   /api/admin/customizer` is administrator-only; the public site receives the
   safe subset through `GET /api/public/site`.
2. **Colors are token overrides.** Five hex tokens (`background`, `surface`,
   `text`, `muted`, `accent`) override the active theme's tokens on `<html>`.
   Only hex values are accepted (no CSS expressions), so the value is safe in a
   style attribute. Empty fields fall back to the theme.
3. **Menus are label/URL items.** Up to 20 items, each with a 1–80 character
   label and a site path (`/about`) or `http(s)` URL. A custom menu replaces the
   published-page links in the header; with no items the page links return.
   Internal links use `next/link`, external links open with
   `rel="noopener noreferrer"`. WordPress's drag-and-drop multiple menus and
   widget areas are out of scope: this theme has one header location.
4. **Homepage Settings are real routing.** `show_on_front` chooses latest posts
   or a static page; `page_on_front` must be a published page and is rendered at
   `/`; `page_for_posts` must be a different published page and renders the blog
   loop at its own slug. Switching back to latest posts clears both selectors.
5. **Additional CSS is validated, not trusted.** Text up to 20,000 characters.
   The validator rejects control characters, `</style`, `<script`, `<!--`,
   `expression(`, `javascript:`, `@import`, `behavior:` and `-moz-binding`.
   Accepted CSS is injected into a dedicated `<style id="customizer-css">` in
   the document. It is styling, not a script sandbox, and the screen says so.
   The route raises Fastify's 16 KB body limit to 64 KB so a valid 20,000
   character stylesheet is not rejected with 413 before validation.
6. **The screen mirrors WordPress's shape.** A left control column with Site
   Identity, Colors, Menus, Homepage Settings and Additional CSS, and a live
   iframe of the public site with Refresh preview. Each panel saves
   independently and reports a per-panel notice. Site Identity still writes the
   General options, so Settings → General and the Customizer cannot disagree.
7. **Public rendering reads the same settings.** The layout applies colours,
   menu and CSS; `app/page.tsx` renders the configured front page; the
   `[slug]` route renders the posts loop when the page is the posts page. The
   API resolves the page slugs and only returns a static front page while the
   page is published, so unpublishing it falls back to latest posts instead of
   serving a 404 at `/`.

## Consequences

- No migration: options only.
- Settings changes apply on the next request (no cache); the Customizer preview
  reloads its iframe after a save.
- The theme's CSS variables remain the contract: a future theme automatically
  supports colour overrides and Additional CSS without code changes.
- Multiple menus, per-menu locations and the WordPress Customizer's
  postMessage live preview are not implemented; the preview is a reloaded
  iframe.

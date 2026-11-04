# ADR 0011 — Appearance and installed themes (expanded scope)

- Status: accepted (owner scope decision, 2026-11-04)
- Extends: admin shell, `packages/cms-core`, `apps/api`

## Context

The owner approved matching every WordPress screen. WordPress's Appearance menu
opens on a Themes grid with Theme Details, an Add Themes screen that browses
WordPress.org, and a Customizer/Site Editor for site identity. MERNPress has one
public presentation layer (`apps/web`) and no theme package loader, uploader or
remote marketplace, and installing arbitrary PHP/JS theme code into a running
server would repeat the plugin trust problem before a plugin system exists
(AGENTS §7, Phase 9).

## Decision

1. **Theme registry, not a loader.** `packages/cms-core/src/themes/registry.ts`
   declares the installed theme(s) as data (`id`, `name`, `version`, `author`,
   `description`, `tags`, `features`, `screenshot`). The active theme is an
   `options` row (`active_theme`, group `appearance`) defaulting to
   `mernpress`. There is no runtime upload, ZIP extraction or remote install.
2. **Real screens over simulated marketplaces.** Appearance → Themes renders the
   WordPress 7.1 grid (379×304 cards, 283px screenshot, 51px dark name bar,
   active card with Customize, hover Activate/Theme Details, dashed Add Theme
   card), a count bubble next to the title, "Search installed themes" and the
   Theme Details modal (Active Theme badge, 32px/100 name, version, author,
   auto-update link, description, tags, footer actions).
3. **Add Themes is honest.** The screen keeps the WordPress header, count and
   search, lists the installed theme under "Installed", and states that
   browsing WordPress.org, uploading a ZIP and installing themes at runtime are
   not enabled. The Add New button and Upload Theme control do not pretend to
   work.
4. **Customize maps to existing options.** WordPress block themes customize in
   the Site Editor; MERNPress's public theme reads `site_title` and
   `site_tagline` from the General options. Appearance → Customize edits exactly
   those values with a live preview of the public site and a Save & Publish
   action. No parallel settings store.
5. **Automatic update preference is stored, not simulated.** "Enable
   auto-updates" persists `theme_auto_updates`; the update-checking slice will
   consume it. Nothing downloads or replaces theme code today.
6. **Administrators only.** Every themes API route uses the administrator guard
   (WordPress `switch_themes`/`manage_options`), and the sidebar entry is hidden
   for other roles.

## Consequences

- One additive `options` row on first save; no migration.
- The Theme Details screenshot is a real capture of the public site stored at
  `apps/admin/public/theme-screenshot.png` and served under `/admin/`.
- Appearance → Editor and Fonts were added in ADR 0015.
- Plugins, update checks and the Events/News widget remain separate slices.

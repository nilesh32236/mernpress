# WordPress-style admin — design target (canonical)

Status: accepted target for the admin SPA restyle (2026-10-29). Derived from the
reference CMS analysis in [reference-cms-design-inventory.md](reference-cms-design-inventory.md)
and [reference-cms-feature-matrix.md](reference-cms-feature-matrix.md) (extracted from
`qrolichealth-cms-main`, a WordPress-style headless CMS; design lessons adopted, no
code copied).

This file is the quick brief every future session should read before touching
`apps/admin` visuals. The two linked documents carry the full detail.

## Design tokens (wp-admin palette)

| Role | Value |
| --- | --- |
| Sidebar / admin bar bg | `#1d2327` |
| Sidebar hover/active bg | `#2c3338`; deep submenu `#23282d` |
| Primary (WP blue) | `#2271b1`; hover `#135e96`; menu hover accent `#72aee6` |
| Content bg | `#f0f0f1`; cards `#ffffff`; alt rows `#f6f7f7` |
| Card/input borders | `#c3c4c7` / `#8c8f94` |
| Text | `#2c3338`; muted `#646970`; disabled `#8c8f94` |
| Status pills | published `#d1e7dd/#0a3622`, draft `#fff3cd/#664d03`, archived `#f0f0f1/#50575e`, trash `#f8d7da/#58151c` |
| Danger | `#b32d2e`; success `#00a32a`; warning `#dba617` |
| Focus ring | 2px `#2271b1`, offset 2px |

Typography: system sans stack; body 13px; small 11–12px; card titles 14px;
page H1 23px **font-normal** (WP style — not bold). Radii 4px inputs/buttons,
6px cards/modals. Shadows: cards `shadow-sm`, modals `shadow-xl`.

## App shell contract

- Dark sidebar `#1d2327`, 220px, **always visible on desktop (≥1024px)**; active
  item = 4px left border `#2271b1` + `#2c3338` bg + white text. Collapse toggle
  → 52px icon rail. Below 1024px: off-canvas drawer + backdrop + hamburger.
- Dark admin bar (36px, `#1d2327`) across the top; sidebar footer holds
  username/role/sign-out.
- Content: `#f0f0f1`, max width ~1200px, padding 12–20px.
- Editor routes may break out of the shell (fullscreen Gutenberg with dark
  60px header) — see reference inventory §3 editor pattern.

## Screen patterns

- **List screens**: status filter tabs with `|` separators and counts
  (All | Published | Drafts | Trash), bulk-actions select + Apply, right-aligned
  search, white table card, `thead #f6f7f7`, row hover `#f0f6fc`, hover-revealed
  row actions, pagination footer. Title row = 23px title + "Add New" button.
- **Dashboard**: welcome banner card + "At a Glance" card, WP widget style.
- **Terms**: two columns — add-form card left, table card right.
- **Login**: centered card on `#f0f0f1`, brand mark, WP-blue submit.
- **Settings (future)**: WP nav-tabs sharing an edge with a `#f6f7f7` panel.

## Feature parity roadmap (from the matrix)

- P1 (WordPress core parity): media library, users management UI, profile
  screen, settings (General/Reading/Writing via an options store), editor media
  picker. Each needs its own phase-gate approval before backend work.
- P2: scheduling engine+UI, revisions, site health, preview tokens, redirects,
  about/docs, audit-log UI.
- P3 (out of scope): comments, menus, widgets, plugin/theme install UI,
  Qrolic CPT set, leads/outreach/forms.

## Hard rules for admin UI work

- One design system in `styles.css` — never append a second shell/component
  system beside the first (this caused the 2026-10-29 broken-sidebar incident:
  duplicate `.app-shell`/`.admin-sidebar` blocks; the later fixed off-canvas
  rules won and the sidebar vanished on desktop).
- 74 admin unit tests encode the a11y contract (roles/labels like "Sign out",
  `.top-bar-title`, breadcrumb nav). Keep them green without editing tests.
- No new npm dependencies without an ADR; `@wordpress/icons` is already
  available for iconography.

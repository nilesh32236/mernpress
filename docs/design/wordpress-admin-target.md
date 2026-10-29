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

## App shell contract (verified against the live reference, 2026-10-29 PM)

- **Topbar**: dark 36–40px `#1d2327`, full width above sidebar+content.
  Left: logo box + site-title button, "Visit Site" pill (external icon),
  "+ New" dropdown (Post/Page). Right: "Hello, {username}" + avatar circle
  (initials) with dropdown (Profile, Sign Out).
- **Sidebar**: dark `#1d2327` 220px below the topbar; "Collapse menu" item at
  the top (toggles 52px icon rail); menu groups with chevrons expand to
  submenu rows (indented, dot bullets; active submenu = blue dot + `#2c3338`).
  Active top item = 4px left border `#2271b1` + `#2c3338` + white text.
  Below 1024px: off-canvas drawer + backdrop + hamburger.
- **Content**: `#f0f0f1`, max width ~1200px, padding 12–20px.
- **Editor**: fullscreen, dark 58–60px header (logo box, blue + inserter,
  undo/redo, list view; right: Save Draft, Publish, Schedule, gear), right
  sidebar with "Post | SEO | Block" tab strip, sections (STATUS select,
  PERMALINK, CATEGORIES with search + name/slug rows + inline add, TAGS inline
  add).

## Screen patterns (from live reference screenshots)

- **List screens**: plain 23px title + blue "+ Add New" top-right; status tabs
  as blue links with `|` separators (active = dark + 2px `#2271b1` underline);
  toolbar = funnel icon + Bulk actions select + Apply + filter selects;
  search input with magnifier icon + blue Search button right; white table card
  (`thead #f6f7f7`, row hover `#f0f6fc`); empty state = centered large icon +
  title + "Get started…" + blue CTA; footer "N items" left + "Prev | Page X of
  Y | Next" right.
- **Dashboard**: welcome banner card with 4 CTA buttons; 2-column widget grid —
  "At a Glance" (icon+count chips + "Site-wide totals" note), "Activity",
  "Quick Draft", "Site Health" pills.
- **Users**: icon-badge + title + adjacent "Add New User"; subheader
  "All Users (n) | You are signed in as …"; circle-user icon in username cell,
  light "you" badge, icon-only action buttons.
- **Settings**: icon nav-tabs sharing an edge with the panel; icon-prefixed
  field labels; "Save Changes" with check icon.
- **Media (Phase 6 target)**: icon-badge + adjacent "Add New Media File"
  outline button; filter selects; search; "N items"; Bulk select; Grid/List
  toggle; empty state with Upload CTA.
- **Terms**: two columns — add-form card left, table card right.
- **Login**: centered card on `#f0f0f1`, brand mark, WP-blue submit.
- **Notices**: bottom-right floating toast cards (green success, red error).

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

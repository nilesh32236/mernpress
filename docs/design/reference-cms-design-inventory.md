# Reference CMS Design Inventory

Reference: `/tmp/opencode/qrolichealth-ref/qrolichealth-cms-main` (admin SPA at `apps/admin`).

This inventory extracts the **WordPress wp-admin–like** design system of the
reference CMS so MERNPress can restyle to match. Reusability tags:
`[REUSE-DIRECT]`, `[REUSE-ADAPT]`, `[REFERENCE-ONLY]`.

## 1. Design tokens

### 1.1 Color palette (hex)

| Token / role | Hex | Where used |
|---|---|---|
| WP admin bar/sidebar bg | `#1d2327` | `WpTopBar`, `WpSidebar` bg `[REUSE-DIRECT]` |
| Sidebar darker hover/panel | `#2c3338` | sidebar hover/active bg, dropdowns `[REUSE-DIRECT]` |
| Sidebar deep panel | `#23282d` | submenu bg `[REUSE-DIRECT]` |
| Border (chrome) | `#3c434a` | topbar dropdown borders `[REUSE-DIRECT]` |
| WP blue (primary) | `#2271b1` | primary buttons, focus rings, links `[REUSE-DIRECT]` |
| WP blue hover | `#135e96` | button hover `[REUSE-DIRECT]` |
| Menu link accent (hover) | `#72aee6` | sidebar icons/links on hover `[REUSE-DIRECT]` |
| Admin grey bg (content area) | `#f0f0f1` | `main` bg, table zebra `[REUSE-DIRECT]` |
| Card/panel bg | `#ffffff` | cards, tables, modals `[REUSE-DIRECT]` |
| Alt row / header bg | `#f6f7f7` / `#fbfbfc` | table headers, tab panels `[REUSE-DIRECT]` |
| Border (content) | `#c3c4c7` / `#8c8f94` | card borders, input borders `[REUSE-DIRECT]` |
| Text primary | `#1d2327` / `#2c3338` | headings/body `[REUSE-DIRECT]` |
| Text muted | `#646970` / `#50575e` | secondary text `[REUSE-DIRECT]` |
| Text disabled | `#8c8f94` / `#a7aaad` | placeholders `[REUSE-DIRECT]` |
| Success (green) | `#00a32a` / `#d1e7dd` / `#0a3622` | status pills `[REUSE-DIRECT]` |
| Warning (amber) | `#dba617` / `#fff3cd` / `#664d03` | status pills `[REUSE-DIRECT]` |
| Danger (red) | `#b32d2e` / `#f8d7da` / `#58151c` | delete actions `[REUSE-DIRECT]` |
| Site brand (login only) | `#0a6165` / `#095558` | login submit button `[REUSE-ADAPT]` |
| Focus ring | `#2271b1` (2px, offset 2px) | global `:focus-visible` `[REUSE-DIRECT]` |

Tailwind config adds named colors: `wp-dark #1d2327`, `wp-darker #101517`,
`wp-blue #2271b1`, `wp-blue-hover #135e96`, `wp-bg #f0f0f1`, `wp-border #c3c4c7`,
`wp-text #2c3338`, `wp-text-muted #646970`, `wp-menu-hover #72aee6`
(`apps/admin/tailwind.config.js`).

### 1.2 Typography

- Font stack (admin chrome): Tailwind default sans (system stack). Editor canvas
  uses `"Fustat", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, ...`
  (`src/styles/gutenberg.css:244`).
- Base text sizes: `13px` body, `11px` small/badges, `14px` card titles,
  `23px` page H1 (`font-normal`), `1.875rem–2.5rem` editor title.
- Headings in admin are `font-normal` (WP style), not bold.

### 1.3 Spacing / radii / shadows

- Radii: inputs/buttons `rounded` (4px), cards `rounded`/`rounded-md` (6px),
  modals `rounded-md` (6px), pills `rounded-full`, table container `rounded-md`.
- Shadows: cards `shadow-sm`; modals `shadow-xl`; dropdowns `shadow-2xl`;
  editor canvas `0 4px 12px rgba(0,0,0,0.05)`.
- Content max width: `max-w-[1200px]` (`WpAdminLayout` main, posts list).
- Main padding: `p-3 sm:p-5`.

### 1.4 CSS custom properties (design tokens)

From `src/index.css` (`:root`) — HSL shadcn-style variables:
`--background`, `--foreground`, `--primary` (208 72% 41% = #2271b1),
`--border`, `--input`, `--ring`, `--radius: 0.5rem`, `--card`, `--muted`,
`--accent`, `--secondary`, `--destructive`, `--sidebar` (200 12% 14% = #1d2327-ish).

From `src/styles/gutenberg.css` (`:root`):
`--wp-admin-theme-color: #2271b1`, `--wp-grey-bg: #f0f0f1`,
`--wp-border-color: #e0e0e0`, `--wp-canvas-bg: #ffffff`,
`--wp-text-color: #1e1e1e`, `--wp-title-placeholder: #646970`, plus qrolic
frontend-parity tokens `--qrolic-primary: #0a6165`, etc.

## 2. App shell anatomy

```
┌─────────────────────────────────────────────────────────────┐
│ WpTopBar (h-9, bg #1d2327, z-50)                           │
│ [☰ mobile] [W menu ▾] | SiteTitle | Visit Site | + New ▾ | Hello, User ▾ │
├──────────────┬──────────────────────────────────────────────┤
│ WpSidebar    │ main (bg #f0f0f1, p-3 sm:p-5)               │
│ w-[220px]    │ ┌────────────────────────────────────┐     │
│ bg #1d2327   │ │ mx-auto max-w-[1200px] <Outlet/>   │     │
│ (or 52px     │ └────────────────────────────────────┘     │
│ rail)        │ (overflow-y-auto)                          │
│ border-r     │                                            │
│ #2c3338      │                                            │
└──────────────┴──────────────────────────────────────────────┘
```

- Breakpoint: `1024px` (`useIsDesktop` via matchMedia). Below: sidebar becomes
  fixed overlay drawer `w-[85%] sm:w-[300px]`, `top-9`, `z-40`, backdrop `z-30`
  `bg-black/50`, hamburger in topbar. `[REUSE-ADAPT]`
- Desktop collapse: 220px expanded ↔ 52px icon rail with hover flyout. `[REUSE-ADAPT]`
- Topbar height `h-9` (36px); sidebar border `border-r border-[#2c3338]`.

Files: `src/components/layout/WpAdminLayout.tsx`, `WpSidebar.tsx`, `WpTopBar.tsx`.

Active menu item: `border-l-[4px] border-[#2271b1] bg-[#2c3338]`, text white,
icon `#72aee6`. Submenu: `bg-[#23282d]`, active row `bg-[#2c3338] text-white`
with `bg-[#72aee6]` dot. `[REUSE-DIRECT]`

## 3. Screen layout patterns

### Login (`src/pages/login.tsx`)
- Centered card on `bg-muted/30`: `flex min-h-screen items-center justify-center`.
- Card: `w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm`.
- Brand primary button uses `#0a6165` (site brand), not WP blue. `[REUSE-ADAPT]`

### Dashboard (`src/pages/dashboard/index.tsx`)
- Title row: icon badge `h-8 w-8 rounded bg-[#2271b1]` + `text-[23px] font-normal`.
- Welcome banner card: white, border `#c3c4c7`, `shadow-sm`, primary CTA buttons
  `bg-[#2271b1] hover:bg-[#135e96]`, secondary `border bg-white text-[#2271b1]`.
- "At a Glance" / "Activity" cards: `CardShell` — white card, header band
  `border-b px-3 py-2`, `text-[14px] font-semibold`.
- Status pills: colored rounded boxes (see badges). `[REUSE-DIRECT]`

### List table screen (`src/pages/posts/list.tsx`)
- Header: `text-[23px]` title + "Add New" primary button.
- Status filter tabs: inline row with `|` separators (WP style), active tab
  `font-semibold underline decoration-[#2271b1] decoration-2`.
- Toolbar: bulk actions select + category/date filters + search box (`h-8`,
  `border-[#8c8f94]`, focus `#2271b1`).
- Table: `rounded-md border border-[#c3c4c7] bg-white shadow-sm`,
  `thead bg-[#fbfbfc]`, `border-b`, zebra `odd:bg-white even:bg-[#fafbfc]`,
  hover `#f0f6fc`. `[REUSE-DIRECT]`
- Pagination footer: `Prev/Next` buttons + "Page X of Y". `[REUSE-DIRECT]`

### Editor screen (`src/pages/posts/edit.tsx` + `gutenberg-editor.tsx`)
- Fullscreen route (no admin shell). Dark header `h-[60px] bg-[#1d2327]`
  with WP logo, inserter (+), undo/redo, save/publish buttons.
- Canvas: `editor-canvas` white, `max-width: 85ch`, `box-shadow`, min-height 80vh.
- Right sidebar: resizable (280–600px, persisted localStorage), tabs
  document/seo/block, `SIDEBAR_SEO_WIDTH 360`. `[REUSE-ADAPT]`
- Document settings panel: stacked bordered sections (`border-b border-[#e0e0e0]`). `[REUSE-DIRECT]`

### Settings screen (`src/pages/settings/index.tsx` + `ui.tsx`)
- Title row + optional read-only note.
- WP-style nav tabs: `Tabs` rounded-t, active tab shares edge with panel
  (`-mb-px`, `bg-white`, border `#c3c4c7`); panel `bg-[#f6f7f7] rounded-b`.
- `Card`, `Field`, `inputClass`, `PrimaryButton/SecondaryButton/DangerButton`
  primitives in `src/pages/settings/ui.tsx`. `[REUSE-DIRECT]`

### Users list (`src/pages/users/index.tsx`)
- Title + "Add New User" button; "All Users (n) | you are signed in as …".
- Table with `thead bg-[#f6f7f7]`, rows `hover:bg-[#f6f7f7]`.
- Modals: fixed overlay `bg-black/40`, white card `max-w-md shadow-xl`. `[REUSE-DIRECT]`

## 4. Component styling patterns

- **Buttons**: custom Tailwind, no component lib. Primary `bg-[#2271b1] text-white hover:bg-[#135e96]`; secondary `border border-[#2271b1] bg-white text-[#2271b1]`; danger `border border-[#b32d2e] text-[#b32d2e] hover:bg-[#f8d7da]`; ghost icon buttons `rounded p-1.5`. `[REUSE-DIRECT]`
- **Tables**: custom HTML tables with WP styling (above). `[REUSE-DIRECT]`
- **Cards**: white, `border border-[#c3c4c7]`, `shadow-sm`, header band. `[REUSE-DIRECT]`
- **Form controls**: inputs `rounded border border-[#8c8f94] bg-white px-2.5 py-1.5 text-[13px]`, focus `border-[#2271b1] ring-1 ring-[#2271b1]`; selects `appearance-none` with chevron icon. `[REUSE-DIRECT]`
- **Modals/dialogs**: overlay `fixed inset-0 z-50 bg-black/40`, card `max-w-md rounded bg-white shadow-xl`, header/footer bands. `[REUSE-DIRECT]`
- **Notices/alerts**: `sonner` Toaster (`<Toaster richColors />` in `App.tsx`) for toasts; inline error text `text-red-600`. `[REUSE-ADAPT]`
- **Badges/status pills**: rounded-full/rounded boxes with semantic bg/text:
  published `#d1e7dd/#0a3622`, draft `#fff3cd/#664d03`, archived `#f0f0f1/#50575e`,
  trash `#f8d7da/#58151c`. `[REUSE-DIRECT]`
- **Pagination**: prev/next outlined buttons + count. `[REUSE-DIRECT]`
- **Tabs**: settings nav tabs (above); status filter tabs with `|` separators. `[REUSE-DIRECT]`
- **Tooltips**: native `title` attrs + `aria-label`. `[REUSE-DIRECT]`

## 5. Gutenberg integration styling

Imports in `src/features/content/components/editor/gutenberg-editor.tsx`:
```
@wordpress/components/build-style/style.css
@wordpress/block-editor/build-style/style.css
@wordpress/block-editor/build-style/content.css
@wordpress/block-library/build-style/editor.css
@wordpress/block-library/build-style/style.css
@wordpress/block-library/build-style/theme.css
@/styles/gutenberg.css
```
Overrides in `src/styles/gutenberg.css`: WP canvas tokens, `.editor-canvas` shadow,
`.wp-title-input` large title, popover/toolbar floating bar styling, dark-mode
`.dark` overrides. Framing: editor is fullscreen route with dark `#1d2327`
header and resizable settings sidebar. `[REUSE-ADAPT]`

## 6. UI dependencies (apps/admin)

- `@wordpress/*` 15.x/36.x — Gutenberg editor (pinned exact). `[REFERENCE-ONLY]` (only if adopting Gutenberg)
- `lucide-react ^1.33.0` — icons. `[REUSE-ADAPT]`
- `sonner ^2.0.7` — toasts. `[REUSE-ADAPT]`
- `@tanstack/react-query ^5.90.19` — data. `[REUSE-ADAPT]`
- `react-router-dom ^7.11.0` — routing. `[REUSE-ADAPT]`
- `tailwindcss 3.4.17` — styling. `[REUSE-DIRECT]`
- `@tiptap/* ^3.32.0` — rich text (outreach). `[REFERENCE-ONLY]`
- No component library (no shadcn/radix); everything is custom Tailwind. `[REUSE-DIRECT]`

## 7. Dark mode approach

- Admin chrome is light-only. Dark styling exists only for the Gutenberg
  editor canvas via `.dark` selector overrides in `gutenberg.css` (`.dark .components-*`).
  No runtime toggle found in admin (no classList/theme code). `[REFERENCE-ONLY]` /
  not implemented as a user-facing feature.

## 8. Reusability summary

- `[REUSE-DIRECT]`: color tokens, spacing, radii, shadows, focus rings, table
  styling, card styling, button variants, form control classes, modal shell,
  status pills, pagination, settings tabs, skip link, layout max-width.
- `[REUSE-ADAPT]`: responsive nav (1024px breakpoint, drawer widths), login
  (brand color), Gutenberg framing, toast library, icon library, resizable sidebar.
- `[REFERENCE-ONLY]`: Gutenberg itself, @tiptap, site-specific block library,
  dark-mode CSS, Qrolic brand colors.
# Feature check — does MERNPress have everything WordPress has?

Date: 2026-11-17. Owner-facing. This is a careful audit of what the project
actually contains, written for a person who does not code. It is **not** a work
order and nothing new was built while writing it.

## The short answer

**No — and that was intentional.** MERNPress is not a feature-for-feature
WordPress clone. It is a focused content-management system that covers the
main publishing workflow and a good deal more (media, revisions, preview,
scheduling, users, settings, a public site with SEO). WordPress is a much
larger product with a huge plugin ecosystem, and the project rules explicitly
say *do not claim WordPress parity*.

So the honest answer to "did we build all the features WordPress has?" is:
**a substantial, useful subset — not all of them.** The tables below show
exactly what I checked. `Yes` means I confirmed it in the source code,
`Partial` means it exists but is narrower than WordPress, and `No` means it is
not present.

## How I checked

- I read the project's own audits first: the capability-gap matrix, the feature
  matrix, `TASKS.md`, the improvement shortlist and the compliance review.
- Where those documents disagreed with each other, I did **not** guess. I opened
  the real source files and confirmed what is actually there: the database
  schema, the API routes, the admin menu, the editor block list and the public
  pages.
- This matters because two of those documents are out of date (see the section
  "Where the old documents were wrong" below). The code, not the old document,
  is the source of truth.

## What is there — verified in the code

| Area | Feature | Status | What I confirmed |
| --- | --- | --- | --- |
| Content | Posts and pages in one system | Yes | `Post` model + admin/content routes |
| Content | Draft, publish, trash, restore | Yes | content routes + lifecycle transitions |
| Content | Clean URLs (slugs) with history | Yes | slug service + `PostSlugHistory` table |
| Content | Revisions (50 kept, restore) | Yes | `PostRevision` table + revision endpoints |
| Content | Autosave with recovery | Yes | autosave route + recovery banner in the editor |
| Content | Private preview links | Yes | preview-token API + web `/preview/[token]` |
| Content | Scheduled publishing | Yes | schedule route + background sweeper + admin UI |
| Content | Bulk actions (publish/trash/delete…) | Yes | bulk route + real bulk toolbar in the list |
| Content | Edit conflicts (two people editing) | Yes | version check returns 409 + conflict panel |
| Content | Categories and tags | Yes | term model, taxonomy routes, Categories & Tags screen |
| Content | Featured image | Yes | media link on posts + shared image on public pages |
| Editor | Real Gutenberg block editor | Yes | official `@wordpress/*` packages, lazy-loaded route |
| Editor | Block markup stored WordPress-style | Yes | serialized block markup, unknown blocks preserved |
| Editor | Block settings inspector, undo/redo | Yes | editor inspector and history controls |
| Editor | Upload from device / by URL | Yes | image block uses the real media uploader |
| Media | Upload, thumbnails, metadata, search | Yes | media service + Media screen |
| Media | Safe, contained file serving | Yes | confined media route, no direct folder exposure |
| Users | 5 roles and permissions, checked on the server | Yes | capabilities map + object-level checks |
| Users | User list/create/role/status/password | Yes | Users screen + admin user routes |
| Users | Profile and password change | Yes | Profile screen + profile routes |
| Sign-in | Login/logout, sessions, CSRF, rate limit | Yes | auth routes and services |
| Admin | WordPress-style admin menu and dashboard | Yes | shell with real counts, status tabs, filters |
| Admin | Settings: General, Reading, Writing | Yes | options table + Settings screen |
| Public site | Home, post list, single post, page, preview | Yes | Next.js pages |
| Public site | SEO title/description/canonical/OG, sitemap, robots | Yes | metadata generation + sitemap/robots |
| Public site | Safe HTML rendering | Yes | sanitized output only; raw markup never injected |
| Code quality | Health checks, logs, migrations, automated tests, CI | Yes | health endpoints, CI workflow, large test suite |

## What is NOT there — the real gaps

| WordPress feature | Status | Why it is absent |
| --- | --- | --- |
| Full block library (~90 blocks) | Partial — 15 blocks | A deliberate tested subset: paragraph, heading, list (and list item), quote, image, separator, spacer, buttons (and button), columns (and column), group, code, preformatted |
| "Insert from library" media modal in the editor | Partial | Upload-from-device, URL and featured image work; the grid picker is a follow-up |
| Comments and moderation | No | Deferred; anti-spam is a large surface |
| Site menus / navigation editor | No | Deferred |
| Themes, theme switching, visual customizer | No | Deferred; the current look is built into the code |
| Plugins, plugin SDK, plugin marketplace | No | Only an **internal** hook system exists; no installable plugins |
| Custom post types / custom taxonomies | No | Deferred to a future plugin API |
| Custom fields / post meta | No | Not in the data model |
| Password reset by email ("forgot password") | No | Needs an email-delivery and token design |
| Two-factor sign-in / SSO | No | Deferred security work |
| Audit-log **screen** | No | Events are recorded, but there is no screen to view them |
| Archive, category, tag and search pages | No | Public site is home + posts + single pages |
| RSS/Atom feeds | No | Deferred |
| SVG, video, audio, document uploads | No | Raster images only by design (security) |
| Backup/restore button | No | Operator runbook only |
| Multilingual / multisite / e-commerce / forms / CRM | No | Explicitly out of scope in the project rules |

## Where the old documents were wrong

This is what the careful check corrected:

- `README.md` still described the project as "Phase 4" and listed the editor,
  media, rendering, revisions and plugins as *not implemented*. That is no
  longer true — the source shows them implemented and released. The README has
  been updated to point to this check and to `TASKS.md` for the real state.
- The capability-gap matrix (dated 2026-10-29) marked **bulk actions** and
  **autosave** as partial or pending. Both are now real, working features in
  the code.
- The improvement shortlist itself warned about this mismatch and asked for
  exactly this verification. This document is that verification.

One thing still cannot be confirmed from source alone: how the app behaves in
a live browser with a real database. That needs database credentials that are
not available in this environment, so the "Yes" items above mean *verified in
code*, not *clicked end-to-end today*.

## Legal and compliance (recap of the work already delivered)

- MERNPress now has a licence: **GPL-3.0-or-later** (`LICENSE`).
- Known third-party licences are listed in `THIRD_PARTY_NOTICES.md`.
- `docs/legal/compliance-review.md` is a plain-English risk register and
  pre-launch checklist. It is **not legal advice**.
- Still outstanding before any public distribution: a full tool-generated
  dependency licence scan, a GPL distribution review, and a decision on the
  audience and privacy regime. No GDPR/HIPAA/PCI/SOC 2 certification is claimed.

## What to do next

The grounded shortlist is `docs/roadmap/improvements-2026-11.md`. The smallest
high-value next slices are an **audit-log screen** (the events already exist)
and a **media "where used" view + editor library picker**. Bigger items such as
themes/plugins, comments/menus, and password reset by email need a decision
about audience, data and hosting first.

Nothing above was started as new work. Per the project rules, please choose one
slice to build next.

# ADR 0038 — WordPress-style WXR export filters

- Status: accepted (owner scope decision, 2026-11-05)
- Extends: the WXR export (ADR 0022) and the design-parity audit

## Context

WordPress's Tools → Export screen lets an administrator narrow an export by
author, date range, status and (for posts) category before downloading the WXR
file. MERNPress exported all posts/pages of a scope, so a site owner could not
produce a partial archive without exporting everything.

## Decision

1. **One filter set per export.** `GET /api/admin/export` accepts `author`,
   `startDate`, `endDate`, `status` and `category` in addition to `content`.
   The same filters apply to whichever post types the scope includes; `category`
   is posts-only and returns `400` when used with `pages` or `media`. WordPress
   renders separate Posts and Pages fieldsets; MERNPress keeps one set and labels
   it by scope (“Posts”, “Pages”, “Posts and pages”) rather than implying
   independent per-type filters.
2. **Status mapping matches the content model.**
   - `publish` → `PUBLISHED` and not private
   - `draft` → `DRAFT`, not private and not scheduled
   - `private` → `isPrivate = true`
   - `future` → `DRAFT` with `scheduledAt > now`
   WordPress's `pending` status has no MERNPress equivalent, so it is not
   offered instead of being faked.
3. **Dates are UTC and inclusive.** `YYYY-MM-DD`; the start is inclusive at
   00:00 UTC, the end covers the whole day (exclusive `< end + 24h`). The
   service validates real calendar dates and rejects a reversed range. The range
   applies to `publishedAt` when set and `createdAt` for drafts, mirroring
   WordPress's `post_date` (publish date once published, creation date for
   drafts).
4. **Route validation is strict.** Zod enforces UUIDs for `author`/`category`,
   the date shape and the status enum; the service re-validates calendar dates
   and ordering so direct service callers cannot bypass them.
5. **The admin screen shows the filters.** Tools → Export renders the WordPress
   fieldset layout: Authors, Categories (hidden for Pages), Start date, End
   date and Status, with “All …” defaults. Authors and categories load once via
   the existing admin APIs. A reversed range is rejected client-side with a
   notice before any request; the server enforces it too.
6. **Media exports keep the existing behaviour.** WordPress offers a date range
   for media as well; that is not part of this slice (media is exported whole).

## Consequences

- No migration or schema change: filters are query-time predicates.
- Exported WXR remains importable: filtering only changes which items are
  present, not the file structure. The existing round-trip parse test still
  passes.
- Authors in the WXR `<wp:author>` list are derived from the filtered posts, so
  an author filter produces a smaller, consistent author table.
- The UI and server both validate the range; the server remains authoritative.

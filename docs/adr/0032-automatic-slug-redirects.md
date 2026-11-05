# ADR 0032 — Automatic redirects when a published slug changes

- Status: accepted (owner scope decision, 2026-11-05)
- Extends: ADR 0030 (redirects), ADR 0003 (slug history)

## Context

Renaming a published post changes its URL and breaks inbound links. WordPress
core keeps old slugs in `wp_postmeta`/`wp_posts` history but does not redirect
without a plugin. MERNPress already records `post_slug_history` and has a
redirect manager, but the two were not connected.

## Decision

1. **One automatic 301 per published slug change.** After the version-checked
   update commits, the content service calls `onSlugChanged` when the row is
   `PUBLISHED` and the slug actually changed. Drafts and pages that are not
   published create no redirect.
2. **Paths respect the permalink setting.** The API callback reads the public
   settings and builds `/<permalinkBase>/<oldSlug>` for posts and `/<oldSlug>`
   for pages, matching the canonical route the public site serves.
3. **Retarget, don't duplicate.** `RedirectService.createAutomatic` normalizes
   both paths, refuses self/loops, updates an existing redirect for the old path
   to the newest destination, or inserts a new 301. A failure is logged and never
   fails the content save.
4. **No principal, no audit bypass.** The automatic call is internal to the
   server after an authorized edit; the manual redirect API still requires
   `manage_options`. Automatic redirects appear in Tools → Redirects like any
   other and can be edited or deleted.

## Consequences

- Renaming a published post twice leaves one redirect for the original path,
  retargeted to the latest slug; intermediate slugs are not separately
  redirected (the slug history table still records them for a future chain
  slice).
- Redirect middleware picks up the new row within its 10-second cache window.
- No migration: both tables already exist.

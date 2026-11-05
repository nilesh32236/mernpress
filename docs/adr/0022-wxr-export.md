# ADR 0022 — Tools → Export as WordPress WXR

- Status: accepted (owner scope decision, 2026-11-05)
- Complements ADR 0016 (WXR import)

## Context

WordPress's Tools → Export downloads a WordPress eXtended RSS (WXR) XML file.
MERNPress exported a bespoke JSON document, which WordPress cannot import and
which could not be round-tripped through MERNPress's own importer. The Export
screen also offered a single "All content" radio that the code ignored.

## Decision

1. **Export produces WXR 1.2.** `packages/cms-core/src/export/service.ts` writes
   the same channel/author/item structure WordPress uses, including
   `wp:wxr_version`, base URLs, authors, post dates (local and GMT columns),
   block content in `content:encoded`, excerpts, statuses, slugs, categories and
   tags with `domain`/`nicename`, comments and attachment items with
   `wp:attachment_url`.
2. **Scopes match WordPress.** `GET /api/admin/export?content=all|posts|pages|media`
   returns `application/rss+xml` with an XML attachment filename. `all` includes
   posts, pages, media, terms and comments; `posts`/`pages` restrict the post
   types; `media` exports only attachments. Trashed posts are excluded.
3. **Real data only.** Attachment URLs point at the API's public media route;
   the file bytes are not embedded (WordPress also exports URLs). Arbitrary
   custom fields do not exist in this schema; the featured-image relationship is
   exported as `_thumbnail_id` post meta.
4. **The screen matches WordPress.** Tools → Export shows the WordPress copy
   ("When you click the button below…", WXR explanation), a "Choose what to
   export" fieldset with All content / Posts / Pages / Media, and a
   "Download Export File" button. The previous JSON export is removed.
5. **Round-trip tested.** The export is parsed by MERNPress's own
   `parseWxr` in tests (titles, types, statuses, dates and terms), so the file is
   usable by the existing importer and by WordPress-compatible tools.
6. **Administrators only.** The route requires `manage_options` (WordPress's
   export capability), and the screen remains under the administrator-only Tools
   menu.

## Consequences

- No migration and no new stored data; the export is generated on demand.
- Large sites stream the whole XML into memory before responding. That matches
  the MVP's bounded content volume; a future slice can stream if needed.
- Comment IDs are UUIDs in `wp:comment_id` instead of WordPress integers; the
  importer ignores them.

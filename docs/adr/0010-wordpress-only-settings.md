# ADR 0010 — WordPress-only settings (expanded scope)

- Status: accepted (owner scope decision, 2026-11-04)
- Extends: `packages/cms-core/src/options` (general/reading/writing groups)

## Context

The owner approved matching every WordPress screen. WordPress's Settings menu
has five screens this build did not expose: Discussion, Media, Permalinks,
Privacy, plus extra fields on General (WordPress Address) and Writing (Post via
email, Update Services). Without them, several implemented features had no
control surface: comment moderation behaviour, upload sizes and post URLs.

## Decision

1. **One option registry.** New groups `discussion`, `media`, `permalinks` and
   `privacy` are declared alongside the existing ones in the option service.
   Each key has a default, a validator and a group; the API `group` enum and the
   admin `OptionGroup` type derive from the same list. No parallel config store.
2. **Discussion options drive behaviour, they are not decoration.**
   `default_comment_status`, `close_comments_for_old_posts`/`_days_old`,
   `comment_registration`, `comment_moderation`,
   `comment_previously_approved`, `comment_max_links`, `moderation_keys`,
   `disallowed_keys` and `comment_order` are read by the comment service on
   every public submission/listing. A first-time comment is `PENDING` by
   default, matching WordPress's "author must have a previously approved
   comment" default.
   `comments_per_page`, `default_comments_page`, `thread_comments` and
   `thread_comments_depth` are stored and shown, but the MVP comment list
   renders every approved comment on one page; the paging controls are not
   faked.
   `show_avatars` is honoured by the public list (initials instead of remote
   Gravatars, since no avatar service is configured).
3. **Media options are applied to new uploads.** `thumbnail_size_w/h` and
   `thumbnail_crop`, `medium_size_w/h`, `large_size_w/h` add extra WebP
   derivatives keyed `WxH` next to the fixed 300/600/1200 variants, so existing
   media and URLs keep working. `uploads_use_yearmonth_folders` stays stored
   only: the storage layout is fixed (`YYYY/MM`) by ADR 0008 and changing it
   would invalidate every stored path.
4. **Permalinks change real URLs.** `permalink_base` (default `posts`) drives
   `/<base>/<slug>/`; a catch-all `/[base]/[postSlug]` route serves posts under
   a custom base, `/posts/<slug>` 404s when the base is not `posts`, and the
   list/archive/single/feed/sitemap/canonical links all use the configured base.
5. **Privacy selects a page.** `wp_page_for_privacy_policy` stores the page id;
   an existing, published page is required. It is not linked from the footer
   because Twenty Twenty-Five's footer has no privacy link by default.
6. **Honest limitations instead of fake transports.** "Post via email" (mail
   server/login/password/default category) and "Update Services" (ping list)
   persist exactly like WordPress, and the screens state that no inbound mail or
   XML-RPC ping transport exists in this build. "Send User Notification" on Add
   User is rendered but disabled with the same explanation. Discussion email
   notification flags (`comments_notify`, `moderation_notify`) are stored with
   the same note.
7. **UUID validation accepts UUIDv7.** All new option keys that reference rows
   accept any RFC 9562 version; the previous `[1-5]` regex rejected this
   project's UUIDv7 ids (it also affected Site Icon and Default Author).

## Consequences

- New additive options only; no migration. Defaults come from the registry and
  are written lazily on first save.
- The public settings payload gains `permalinkBase` and `showAvatars`, so the
  web app can build post URLs and honour the avatar preference without an extra
  round trip per page.
- Appearance/Plugins/update checks and the Events/News widget remain separate
  expanded-scope slices.

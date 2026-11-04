# ADR 0009 — Comments (expanded scope)

- Status: accepted (owner scope decision, 2026-11-04)
- Supersedes: the comments exclusion in AGENTS.md §12 for this project

## Context

The owner asked for full WordPress screen parity and explicitly approved
expanding the project beyond the original MVP boundary (Comments, Appearance,
Plugins, update checks, WordPress-only settings and the Events/News widget).
Comments are the first missing core domain: the admin menu, Posts list comment
counts, Dashboard Activity widget and public single-post template all reference
them, but the repository has no comment storage.

## Decision

1. **Storage.** A new `comments` table stores `post_id`, optional `user_id`
   (registered author), `author_name`, `author_email`, `author_url`, `content`,
   `status` (`PENDING`, `APPROVED`, `SPAM`, `TRASHED`), optional `parent_id`,
   `created_at` and `updated_at`. Indexes cover `(status, created_at)`,
   `post_id`, `parent_id` and `author_email`.
2. **Public behaviour.** Public comment lists only return `APPROVED` comments
   for published posts. Submissions validate name/email/content, strip HTML
   (plain text only) and are created `APPROVED` by default, matching a default
   WordPress discussion configuration. A basic link-count/duplicate-content
   heuristic marks obvious spam; no email is sent in this slice.
3. **Moderation.** `administrator` and `editor` can list every status, approve,
   unapprove, mark spam, trash, restore, edit and delete. Authors/contributors
   may read comments on their own posts but cannot moderate.
4. **No public HTML.** Comment content is stored as plain text and escaped by
   the client; the renderer never injects it as HTML. URLs are validated.
5. **No outbound email.** Comment notification emails are out of scope until a
   mail transport is added; the screen will not pretend to send them.
6. **Admin surface.** The Comments menu, status tabs, list table, row actions,
   bulk actions, Dashboard "Recent Comments" widget and Posts list comment
   counts read the same service.

## Consequences

- New additive migration and Prisma relations.
- Public single-post pages gain a comment list and form.
- Comment moderation becomes a capability-checked API surface.
- Appearance/Plugins/update checks remain separate expanded-scope slices; this
  ADR only unblocks the Comments slice.

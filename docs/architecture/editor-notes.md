# Editor notes — developer guide

## Data

`post_notes`:

| Column | Meaning |
| --- | --- |
| `id` | UUIDv7 |
| `post_id` | Post; `ON DELETE CASCADE` |
| `author_id` | User; `ON DELETE SET NULL` (the note survives) |
| `parent_id` | Null for a thread root, the root id for a reply |
| `content` | 1–2,000 characters, trimmed |
| `block_name`, `block_path`, `block_hash`, `block_text`, `block_anchor_id` | Optional root anchor (name, dot path, 16-hex hash, 200-char text fingerprint, stable id) |
| `resolved_at`, `resolved_by_id` | Set on the root by Resolve |
| `created_at`, `updated_at` | UTC instants |

## API

| Route | Behaviour |
| --- | --- |
| `GET /api/admin/posts/:id/notes` | `{ notes, trash }`, oldest first; `?status=trash` returns only the trash |
| `POST /api/admin/posts/:id/notes` | `{ content, parentId?, block? }` → 201 note; `block` is `{name,path,hash,text}` |
| `PATCH /api/admin/posts/:id/notes/:noteId` | `{ resolved: boolean }` → updated root |
| `DELETE /api/admin/posts/:id/notes/:noteId` | 204; moves to Trash (root cascades replies) |
| `POST /api/admin/posts/:id/notes/:noteId/restore` | 200 restored note; a root restores its trashed replies |
| `DELETE /api/admin/posts/:id/notes/:noteId/permanent` | 204; only when already trashed |

All require a session and CSRF, then `canEditPost` (administrators/editors may
act on any post; authors/contributors only their own). A post the caller cannot
edit returns 403 even when it exists.

## Service and UI

- `packages/cms-core/src/notes/service.ts` owns validation and authorization.
- `apps/api/src/routes/notes.ts` registers the routes.
- `apps/admin/src/editor/usePostNotes.ts` fetches and mutates notes for the
  current post; `NotesPanel.tsx` renders the composer/threads.
- `ContentEditor` adds the **Notes** sidebar tab and the **All notes** header
  button with an unresolved-count bubble. The tab only appears for a saved post
  the user can edit.

## Block anchors

The editor passes the selected block's anchor through `onSelectionAnchor`.
`blockAnchors.ts` computes the hash from the block name, sorted attributes and
its own HTML (children excluded), a plain-text fingerprint and the block's
stable `metadata.anchorId` (if present).

When a note is anchored, `NotesPanel` calls `prepareAnchor` →
`BlockCanvas.ensureSelectedBlockAnchor`. That method assigns a random 16-hex id
to the selected block when missing (writing it through the controlled block tree,
because the provider maps external to internal client ids), returns the anchor
with the id, and the post content is saved with the note. Resolution prefers an
id match (`exact` regardless of path or text), then falls back to the heuristic
(`exact` path+hash, `moved`, `changed`, `missing`) for legacy notes or when the
attribute was removed. Hiding/moving/editing/removing a block never deletes the
note.

`metadata.anchorId` is excluded from the structure-lock signature in
`packages/block-system/src/structure.ts`; anchor ids are annotation metadata and
must be writable on a locked post. Other metadata keys (for example block
bindings) remain structural.

## Trash, restore and purge

`NoteService.trash` re-checks `canEditPost`, then allows the note author or a
principal with `content.edit.any`. It stamps `deleted_at`/`deleted_by_id` on the
note and (for a root) its active replies, and writes a `content.note.trashed`
audit event in the same transaction. `restore` clears those fields on the note
and its trashed replies and writes `content.note.restored`. `purge` deletes the
row permanently (replies cascade) and writes `content.note.deleted` with
`permanent: true`; it refuses notes that are not in the trash. Trashed notes are
excluded from the active list, cannot be resolved and cannot receive replies.
The panel hides actions for users who cannot use them and confirms every
transition; the API is authoritative.

## Notifications

`MailService.notifyNote` sends `created`, `reply` and `deleted` messages to the
post author or note author, falling back to the administration address when the
recipient has no email. Delivery is controlled by `posts.notes_notify` when set
(true = always, false = never) and otherwise by the `notes_notify` Discussion
option (default true). The same resolution applies to mention mail. The service
passes `enabled` explicitly; the mail layer falls back to the option when it is
undefined. Only metadata is logged, and delivery is always best effort.

## Mentions

`packages/cms-core/src/notes/mentions.ts` extracts `@username` tokens with the
account policy, ignores email addresses, deduplicates and caps at ten. On note
or reply creation, `NoteService` looks the users up, skips disabled accounts,
the actor, the post author (already notified) and anyone failing
`canEditPost`, then calls `MailService.notifyNoteMention`. Mention mail shares
the `notes_notify` switch and the mail log; it is best effort.

The composer uses `apps/admin/src/editor/MentionTextarea.tsx`: typing `@query`
debounces 150 ms and calls `GET /api/admin/posts/:id/note-mentions?search=`,
which returns up to eight active users who can edit the post, excluding the
caller. Arrow Up/Down move the active option; Enter or a click inserts
`@username `; Escape closes. The panel always states that only people who can
edit the post receive mention emails.

## Retention sweep

`notes_trash_retention_days` (Discussion option, 0–365, default 30; 0 disables)
bounds how long Trash is kept. `NoteService.purgeExpiredTrash({ retentionDays,
now? })` removes expired roots (replies cascade) and then standalone expired
replies whose parent is active, writing `content.note.deleted` with
`permanent: true, automatic: true`.

- The API scheduler (`apps/api/src/scheduler.ts`) runs the sweep every six hours
  and eight seconds after boot when `SCHEDULER_ENABLED=true`; a corrupt option
  read falls back to 30.
- The operator command is `pnpm --filter @mernpress/api notes:purge-trash`
  (`-- --days 7` overrides the option; `--days 0` is a no-op). It loads the same
  environment as the API, prints the purged count and disconnects.

## Rules and limits

- One reply level; replying to a reply is 400.
- Replying to a resolved thread is 400 until Reopen.
- Resolve applies to the root only; resolving a reply is 400.
- Deleting a note is permanent and writes an audit event; there is no trash.
- Mentions only notify accounts that can edit the post at send time; there is no
  per-user mention preference beyond the global/per-post switch.
- Mentions are plain text (`@username`); there is no autocomplete picker.
- Notes never appear in public routes, feeds, the sitemap or search.
- New notes carry stable ids and stay exact across moves/edits. Legacy notes
  (no `block_anchor_id`) still use the content heuristic, so identical blocks
  can make "moved" ambiguous and a same-type replacement with similar text can
  read as "changed". Replies cannot be anchored separately. The anchor id is
  persisted with the post content, not by the note request itself.

## Adding notifications

A mail hook would go in `NoteService.create` after the insert, using
`MailService`; keep it failures-tolerant like the comment notifications so a
mail outage never loses a note.

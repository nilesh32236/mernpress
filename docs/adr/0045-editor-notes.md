# ADR 0045 — Editor notes (per-post threads)

- Status: accepted (owner scope decision, 2026-11-05)
- Closes the "Editor notes" deviation in the design audit

## Context

WordPress 7.1 exposes an editor Notes feature: internal comments attached to a
post, with replies, a resolved state and an "All notes" list. MERNPress had no
equivalent, so editorial feedback had to leave the product. The feature must
never leak to the public site.

## Decision

1. **Per-post, one-level threads with optional block anchors.** `post_notes`
   stores a root note (parent null) and replies (parent = root). Replies to
   replies are rejected. The root carries `resolved_at`/`resolved_by`;
   resolving a thread is a single record. A root may also carry a block anchor:
   the registered block name, its 0-based dot path, an FNV-1a hash of the
   block's name/attributes/own HTML, a short plain-text fingerprint and a stable
   `anchorId`. The editor attaches the currently selected block automatically
   when a note is created (the composer can make it a general note instead) and
   writes that id into the block's `metadata.anchorId` attribute, saving it with
   the post. Resolution prefers the stable id — the block can move or its text be
   rewritten and the note still points at it (exact) — and falls back to the
   content heuristic for legacy notes or when the anchor was removed: same
   path+hash (exact), same hash elsewhere (moved), similar text with a changed
   hash (changed), otherwise missing. `metadata.anchorId` is excluded from the
   structure-lock signature (it is annotation, not structure); other metadata
   keys remain structural. Replies inherit the thread and are never anchored
   separately.
2. **Same permission as editing.** List, create, reply and resolve all call the
   existing `canEditPost` policy (othered by role: administrators/editors any
   post, authors/contributors their own). Read-only users and anonymous callers
   get 403/401; notes are never exposed by a public route.
3. **State-changing API.** `GET/POST /api/admin/posts/:id/notes` and
   `PATCH /api/admin/posts/:id/notes/:noteId`. Creation returns 201; resolve
   accepts `{ resolved: true|false }` and returns the updated note. Bodies are
   strict Zod schemas; content is trimmed, 1–2,000 characters.
4. **Thread rules.** A reply must reference an existing root on the same post
   and a root that is not resolved. Resolving a reply is rejected; replies to a
   resolved thread require reopening it first.
5. **UI.** The document settings sidebar gains a **Notes** tab and the editor
   header an **All notes** button with an unresolved-count bubble. The panel
   contains a composer, threads sorted open-first/newest-first, author display
   names and relative timestamps (full timestamp on hover), Reply, Resolve and
   Reopen. New, unsaved content shows "save the draft first" because notes need
   a post id.
6. **Two-stage deletion with an audit trail.** `DELETE
   /api/admin/posts/:id/notes/:noteId` moves a note to Trash (`deleted_at`,
   `deleted_by_id`); trashing a root also trashes its replies. `GET
   …/notes` returns `{ notes, trash }` and the panel has a Trash (n) toggle with
   Restore and Delete permanently per item. `POST …/:noteId/restore` clears the
   trash state (restoring a thread restores its trashed replies) and `DELETE
   …/:noteId/permanent` removes the row only when it is already trashed, so a
   stray click in the thread list cannot destroy a note. The note author may act
   on their own note; users with `content.edit.any` may act on any note on a post
   they can edit. Trashed notes cannot be resolved or replied to. Each
   transition writes an audit event (`content.note.trashed`,
   `content.note.restored`, `content.note.deleted` with `permanent: true`) with
   the post, note, parent, anchored flag and reply count. Actions are only shown
   to users who may use them and always ask for confirmation.
7. **Optional notifications.** When outbound mail is configured and
   `notes_notify` is enabled (Settings → Discussion, default on), creating or
   replying to someone else's note emails the post author; deleting someone
   else's note emails the note author. Delivery is best effort and never fails
   the note operation. Messages contain the post title/link, actor and a note
   excerpt — never tokens or credentials.
8. **@username mentions with a picker.** Mentions are parsed server-side with
   the account username policy (3–32 characters, lowercase letters/digits/
   dots/underscores/hyphens; email addresses are not mentions), deduplicated
   and capped at ten per message. A mentioned user is emailed only when the
   account is active, has an email, is not the note author and is **eligible to
   edit the post** (`canEditPost`); the post author is skipped because they
   already receive the note/reply mail. The mention mail (`notifyNoteMention`)
   is controlled by the same `notes_notify` option and is best effort. The note
   composer (root and reply) has an autocomplete picker: typing `@query` calls
   `GET /api/admin/posts/:id/note-mentions`, which returns at most eight active
   users who can edit the post (excluding the caller), and the author selects
   with the mouse or Arrow Up/Down + Enter/Escape. The panel states that only
   people who can edit the post receive mention emails.

9. **Retention sweep.** `notes_trash_retention_days` (Settings → Discussion,
   0–365, default 30; 0 disables) governs how long trash is kept. The API
   scheduler runs `NoteService.purgeExpiredTrash` every six hours when
   `SCHEDULER_ENABLED` is on (with a boot catch-up), purging expired roots (their
   replies cascade) and then standalone replies whose parent is still active.
   Each removal writes a `content.note.deleted` audit event marked
   `permanent: true, automatic: true`. Operators without the scheduler can run
   `pnpm --filter @mernpress/api notes:purge-trash` (optionally `-- --days N`);
   both paths are idempotent and `0` is a no-op.

## Consequences

- Four additive migrations in total: `20261105163351_add_post_notes`,
  `20261105172228_add_note_block_anchor` (name/path/hash),
  `add_note_block_text` (the text fingerprint) and `add_post_note_trash`
  (`deleted_at`/`deleted_by_id`). Deleting a post cascades its notes; deleting a
  user nulls the author. Trashed notes still count as rows until purged.
- Notes are not revisions, do not bump the post version, and do not affect the
  public site, sitemap or feeds.
- One extra request per editor load; a failed fetch shows an inline error and
  does not block editing.
- A note created before stable ids (or whose anchor attribute was stripped)
  still resolves heuristically: a same-type replacement with similar text can
  read as "changed", and identical blocks can make "moved" ambiguous. New notes
  store `metadata.anchorId` and stay exact across moves/edit; the note itself is
  never lost. The id is saved with the post, so discarding the content changes
  after adding a note degrades that note to the heuristic.
- Mention eligibility is checked at send time; a user who loses post access
  will not receive later mentions. There is no per-user mention digest or
  preference yet beyond the global `notes_notify` toggle.
- Note mail is governed by the global `notes_notify` option with an optional
  per-post override; there is no per-user subscription beyond that. The override
  cannot send mail when the server has no transport.

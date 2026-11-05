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
| `block_name`, `block_path`, `block_hash`, `block_text` | Optional root anchor (name, dot path, 16-hex hash, 200-char text fingerprint) |
| `resolved_at`, `resolved_by_id` | Set on the root by Resolve |
| `created_at`, `updated_at` | UTC instants |

## API

| Route | Behaviour |
| --- | --- |
| `GET /api/admin/posts/:id/notes` | `{ notes: PostNote[] }`, oldest first |
| `POST /api/admin/posts/:id/notes` | `{ content, parentId?, block? }` → 201 note; `block` is `{name,path,hash,text}` |
| `PATCH /api/admin/posts/:id/notes/:noteId` | `{ resolved: boolean }` → updated root |

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
its own HTML (children excluded) and a plain-text fingerprint. Notes store the
anchor; the panel resolves it against `listBlockAnchors(form.content)` and shows
`exact`, `moved`, `changed` or `missing`. Hiding/moving/removing a block never
deletes the note.

## Rules and limits

- One reply level; replying to a reply is 400.
- Replying to a resolved thread is 400 until Reopen.
- Resolve applies to the root only; resolving a reply is 400.
- No delete endpoint yet; removing a post removes its notes.
- Notes never appear in public routes, feeds, the sitemap or search.
- Anchors are resolved by content, not persistent block ids; identical blocks
  can make "moved" ambiguous and a same-type replacement with similar text can
  read as "changed". Replies cannot be anchored separately.

## Adding notifications

A mail hook would go in `NoteService.create` after the insert, using
`MailService`; keep it failures-tolerant like the comment notifications so a
mail outage never loses a note.

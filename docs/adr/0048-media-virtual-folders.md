# ADR 0048 — Virtual media folders

- Status: accepted (owner scope decision, 2026-11-05)
- Implements the P1 item from
  [wordpress-feature-gaps.md](../research/wordpress-feature-gaps.md)

## Context

WordPress core has no folder concept in the Media Library; users install
FileBird (200k+ active), Real Media Library (100k+) or WP Media Folder (90k+) to
organize uploads. MERNPress stored files flat under `MEDIA_STORAGE_DIR` with
month directories and no organisational layer. Moving files on disk would break
existing URLs, the derivative paths and the immutable-cache headers.

## Decision

1. **Folders are metadata, not directories.** A new `media_folders` table holds
   `id`, `name`, timestamps; `media_items.folder_id` is a nullable FK with
   `ON DELETE SET NULL`. Files never move on disk and every URL stays stable.
2. **Nested folders, one parent and one folder per item.**
   `media_folders.parent_id` is a self-referencing nullable FK (`ON DELETE SET
   NULL`), so folders form a tree. A media item still belongs to zero or one
   folder (no many-to-many). `PUT /folders/:id/move` reparents a folder and is
   cycle-safe: a folder cannot be its own parent or move under one of its
   descendants (`400 FOLDER_CYCLE`); a missing parent is
   `400 FOLDER_PARENT_INVALID`. The admin build a depth-first indented tree for
   the filter/create/move selects.
   Deleting a folder moves its **child folders** to the deleted folder's parent
   (one transaction) and its media items to Uncategorized (`ON DELETE SET
   NULL`), so nothing is silently deleted except the folder itself.
   All folder mutations (create/rename/move/delete) serialize on one
   transaction-scoped PostgreSQL advisory lock, so concurrent moves cannot
   create a cycle and duplicate/case-variant names cannot race the uniqueness
   check. `P2002`/`P2003` from the database are mapped to
   `409 FOLDER_EXISTS` / `400 FOLDER_PARENT_INVALID` instead of a 500.
   Drag-and-drop and bulk move are not built.
3. **Case-insensitive unique names.** The service trims the name, requires
   1–100 characters and rejects a duplicate (case-insensitive) with
   `409 FOLDER_EXISTS`. The database unique index is a final guard. Names are
   globally unique across the tree (not just among siblings), so a folder can be
   identified unambiguously in the flat list; this is a deliberate limitation.
4. **API.** `GET/POST /api/admin/media/folders`,
   `PATCH/DELETE /api/admin/media/folders/:id`, plus `folderId` on
   `PATCH /api/admin/media/:id` and a `folder` filter on the media list
   (`<uuid>` or `none`). Reading requires `content.read.any`; mutations require
   `content.create` (the upload capability). CSRF and admin session apply as
   usual.
5. **UI.** The Media Library gains a Folder bar: filter (All / Uncategorized /
   the indented tree with direct item counts), create (with a parent select),
   rename, move and delete (with confirmation), plus the same indented tree in
   the attachment drawer's Folder select. A **Manage folders** panel shows the
   whole nested tree with per-row New subfolder / Rename / Move / Delete
   actions, so management is not hidden behind the filter select; the panel and
   rows wrap on narrow screens. Selecting a folder filters the grid/list to that
   folder's direct items (not its descendants) and resets pagination.
   Uploads while a folder is selected go **into that folder** (`folderId` on
   the multipart upload); the grid only inserts the new item locally when it
   matches the active folder/search/month filters, otherwise it refetches.
   Changing the folder/search/month filter clears the bulk selection, and the
   list-view Apply button requires choosing an action before it runs.
6. **Counts are derived.** `itemCount` comes from a Prisma `_count` on the
   relation, so it cannot drift from the rows.

## Consequences

- No migration of files, no URL churn, no change to the public media route.
- Deleting a folder is reversible in the sense that items survive, but the
  folder assignment is lost; the UI says so before deleting.
- The folder list is small and unpaginated; a site with thousands of folders
  would need pagination or a tree, which is not built.
- Bulk assignment is not implemented; items are moved one at a time from the
  drawer.
- Folder names are globally unique, children inherit nothing from a parent, and
  the folder filter shows direct items only. Drag-and-drop is not implemented.

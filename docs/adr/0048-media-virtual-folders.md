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
2. **Flat folders, one per item.** No nesting and no many-to-many in this slice.
   A media item belongs to zero or one folder; deleting a folder moves its items
   to Uncategorized instead of deleting them. Nesting/drag-and-drop would need a
   separate model decision.
3. **Case-insensitive unique names.** The service trims the name, requires
   1–100 characters and rejects a duplicate (case-insensitive) with
   `409 FOLDER_EXISTS`. The database unique index is a final guard.
4. **API.** `GET/POST /api/admin/media/folders`,
   `PATCH/DELETE /api/admin/media/folders/:id`, plus `folderId` on
   `PATCH /api/admin/media/:id` and a `folder` filter on the media list
   (`<uuid>` or `none`). Reading requires `content.read.any`; mutations require
   `content.create` (the upload capability). CSRF and admin session apply as
   usual.
5. **UI.** The Media Library gains a Folder bar: filter (All / Uncategorized /
   named folders with counts), create, rename and delete (with confirmation),
   and a Folder select in the attachment drawer to move the item. Selecting a
   folder filters the grid/list and resets pagination.
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

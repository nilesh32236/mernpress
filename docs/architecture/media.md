# Media storage, derivatives and regeneration

## Storage

- Canonical files and derivatives live under `MEDIA_STORAGE_DIR`, outside the
  release directory. Paths are random base names in `YYYY/MM`.
- Uploads accept JPEG, PNG, WebP and GIF, are sniffed by magic bytes, capped at
  the configured upload size and re-encoded to WebP. SVG stays excluded.
- Every path is resolved and confined to the storage root before any read or
  write; a path outside it is treated as not found.

## Derivatives

`packages/cms-core/src/media/service.ts` writes, for each image:

| Size | Formats |
| --- | --- |
| 300, 600, 1200 px wide (fixed) | WebP + AVIF |
| Configured thumbnail/medium/large (`thumbnail_size_*`, `medium_size_*`, `large_size_*`) | WebP + AVIF |

The `derivatives` JSON maps keys (`300`, `300:avif`) to stored relative paths;
the API exposes them as URLs. The public renderer serves a `<picture>` element
with AVIF/WebP sources and the canonical file as fallback. Missing derivative
files fall back to the canonical image at request time.

## Virtual folders

Folders are metadata only (`media_folders` + `media_items.folder_id`); files stay
flat on disk and URLs never change. A media item belongs to zero or one folder.

Folders form a tree via `media_folders.parent_id` (nullable self FK,
`ON DELETE SET NULL`). A folder cannot be its own parent or move under one of
its descendants; the service walks the parent chain and rejects cycles with
`400 FOLDER_CYCLE`. A missing parent is `400 FOLDER_PARENT_INVALID`. Deleting a
folder reparents its child folders to the deleted folder's parent in one
transaction; its media items become Uncategorized. Names remain globally unique
(case-insensitive) across the tree.

Every folder mutation runs inside a transaction that first takes
`pg_advisory_xact_lock` (one constant key) and then performs the name/parent
checks and the write. This closes the check-then-write race: concurrent moves
cannot create a cycle and concurrent case-variant creates cannot both pass.
Database `P2002`/`P2003` errors are mapped to `FOLDER_EXISTS` (409) and
`FOLDER_PARENT_INVALID` (400).

| Route | Behaviour |
| --- | --- |
| `GET /api/admin/media/folders` | `{ items: MediaFolderDto[] }` ordered by name, with `itemCount` |
| `POST /api/admin/media/folders` | `{ name }` → 201 folder; names are trimmed, 1–100 chars, case-insensitively unique (`409 FOLDER_EXISTS`) |
| `PATCH /api/admin/media/folders/:id` | `{ name }` → renamed folder |
| `PUT /api/admin/media/folders/:id/move` | `{ parentId: uuid \| null }` → reparented folder (cycle-safe) |
| `DELETE /api/admin/media/folders/:id` | 204; assigned items become Uncategorized |
| `PATCH /api/admin/media/:id` | accepts `folderId: uuid \| null` |
| `GET /api/admin/media?folder=` | `uuid` for one folder, `none` for Uncategorized, omitted for all |

Reads require `content.read.any`; folder mutations require `content.create`
(the upload capability). The UI keeps the filter, create/rename/delete controls
and the drawer's Folder select in sync with the list.

The admin renders a depth-first indented tree in the filter, create-parent, move
and attachment-drawer selects, plus a **Manage folders** panel with per-folder
New subfolder / Rename / Move / Delete actions (wrapping on mobile). Uploads
accept an optional `folderId` multipart field and go into the browsed folder;
the grid inserts them locally only when they match the current filters. Filter
changes clear the bulk selection, and list-view Apply requires selecting an
action. Selected items can be moved in bulk from the grid selection toolbar or
the list-view “Move to folder” action (one authorized PATCH per item, then a
refetch). Limits: one folder per item, globally unique names, the folder filter
and counts show direct items only, and no drag-and-drop.

## Bulk regeneration

`MediaService.regenerateDerivatives(principal, { after?, limit? })`:

1. selects image rows ordered by id, after the cursor, up to `limit` (1–50,
   default 20);
2. for each row, resolves the canonical path inside the storage root, rebuilds
   all derivatives and updates `derivatives`;
3. counts failures (missing file, decode error) without aborting the batch;
4. returns `{ processed, failed, remaining, nextAfter }`.

Route: `POST /api/admin/media/regenerate` (administrators; the service requires
`content.create`). The Media Library button loops until `nextAfter` is null.

Use it after changing image sizes/quality or importing files outside the upload
path. It re-encodes from the canonical WebP, so keep the original upload when
quality matters. It never changes the canonical file or its URL.

## Relevant files

- `packages/cms-core/src/media/service.ts` — upload, derivatives, editing,
  regeneration, confinement.
- `apps/api/src/routes/media.ts` — admin routes + public file serving.
- `apps/admin/src/MediaPage.tsx`, `MediaImageEditor.tsx` — UI.
- `packages/cms-core/src/media/types.ts` — DTOs and `MEDIA_DERIVATIVE_WIDTHS`.

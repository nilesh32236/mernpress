# ADR 0024 — Media → Edit Image

- Status: accepted (owner scope decision, 2026-11-05)
- Extends: media library (ADR 0008)

## Context

WordPress's media library includes an image editor: rotate, flip, crop with
aspect ratios, scale, undo/redo, save/cancel, and restore the original upload.
MERNPress had upload, metadata editing, derivatives and delete, but no image
editor.

## Decision

1. **The editor is client-side, the commit is server-side.** The browser composes
   rotate, flip, crop and scale operations on a canvas with undo/redo; nothing
   touches the server until **Save**. Cancel discards the stack. This mirrors
   WordPress's edit-then-save workflow and keeps undo cheap.
2. **Saving replaces the canonical file through the same pipeline as an upload.**
   `POST /api/admin/media/:id/edit` accepts one image part (multipart), sniffs
   and re-encodes it to WebP, enforces the 10 MB / 40 MP limits and the 2560 px
   cap, then regenerates every fixed (300/600/1200) and configured derivative.
   The main file is written to a temporary name and renamed into place so readers
   see either the old or the new file.
3. **One backup, restore in one click.** The first save copies the untouched file
   to `<storagePath>.original` and records `original_path`; later saves keep that
   first backup. `POST /api/admin/media/:id/restore` copies it back, regenerates
   derivatives, clears `edited_at`/`original_path` and deletes the backup.
   `MediaItem` gains `editedAt` and `hasOriginal` for the UI. Deleting the media
   row also removes the backup.
4. **The UI matches WordPress.** The attachment drawer has **Edit Image**; the
   modal has a dark toolbar with rotate left/right, flip vertical/horizontal,
   undo/redo and crop, an aspect-ratio selector (Free, 1:1, 4:3, 3:2, 16:9 and
   portrait equivalents), a drag-to-select crop area with corner handles, a
   Scale panel with width/height, **Restore original image** when a backup
   exists, and Save/Cancel in the header. Edited files are served with a
   cache-busting `?v=` so the drawer and grid show the new bytes immediately.
5. **Capabilities and failures are explicit.** Editing uses the existing media
   edit capability (own or any), requires an authenticated session and CSRF, and
   returns `400` for invalid/empty images, `404` for missing rows, and `403` for
   unauthorized users. It never reports success without a committed row.

## Consequences

- One additive migration `20261105060220_add_media_edit`
  (`media_items.edited_at`, `media_items.original_path`).
- Crop is a rectangle with four corner handles; WordPress also shows edge
  handles and a grid. The functional result is the same.
- An edit failure after the main rename rolls the original back from the backup
  when possible and logs the failure.

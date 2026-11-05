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

# ADR 0047 — Bulk media derivative regeneration

- Status: accepted (owner scope decision, 2026-11-05)
- Closes the bulk-image gap identified in
  [wordpress-feature-gaps.md](../research/wordpress-feature-gaps.md)

## Context

Uploads are converted to WebP and get WebP + AVIF derivatives for every
configured size. Two cases still leave stale derivatives: media uploaded before
an image size or quality change, and media imported outside the normal upload
path. WordPress core explicitly leaves this to plugins ("Not directly in core,
plugins should let you do this" — see the 6.5 AVIF announcement comments), and
Regenerate Thumbnails has 1M+ active installs. MERNPress already owns the
pipeline, so exposing it is a small, high-value addition.

## Decision

1. **Service method with bounded batches.** `MediaService.regenerateDerivatives`
   walks image rows by an id cursor (`after`), default 20 and at most 50 per
   call, rebuilds every fixed and configured derivative with `writeDerivatives`
   (WebP + AVIF), and updates the stored `derivatives` JSON.
2. **Failure isolation.** A missing/corrupt canonical file or an out-of-root
   path counts as a failure for that item; the batch continues and the cursor
   still advances, so one bad row cannot wedge the library.
3. **API surface.** `POST /api/admin/media/regenerate` with `{ after?, limit? }`
   returns `{ processed, failed, remaining, nextAfter }`. It requires
   `content.create` (the upload capability) after the normal admin session +
   CSRF guard.
4. **UI loop.** The Media Library title row gains "Regenerate image sizes". It
   calls the endpoint repeatedly with the returned cursor, shows progress, and
   finishes with "Regenerated N image(s)" plus a failure count. It never blocks
   the page; each batch is a normal request.
5. **No schema change.** Only the existing `derivatives` JSON is rewritten;
   canonical files are never modified.

## Consequences

- Existing libraries can adopt new sizes/formats without re-uploading.
- Large libraries take several bounded requests instead of one long one; the
  operator sees progress.
- Regeneration re-encodes from the canonical WebP, so it cannot recover quality
  lost at upload and does not replace the canonical file.
- Failures are logged (`media derivative regeneration failed`) and counted; they
  are not silently swallowed. There is no persistent job/queue in this build.

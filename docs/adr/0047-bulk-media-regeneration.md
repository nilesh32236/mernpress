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

## Amendment 2026-11-06 — durable, folder-scoped job (ADR 0054)

The client-side batch loop moved into the durable queue:

- `MediaService.regenerateDerivativesSystem(input)` is the worker variant; the
  existing `regenerateDerivatives(principal, input)` keeps its capability check
  for direct callers. Both accept `folderId` (`undefined` = whole library,
  `null` = Uncategorized) in addition to the id cursor and 1–50 limit.
- `POST /api/admin/media/regenerate` now accepts `{ folderId?: uuid | null }`,
  checks `content.create`, rejects an active `media.regenerate` job with
  `409 MEDIA_REGENERATE_IN_PROGRESS`, and enqueues `media.regenerate` with
  `maxAttempts: 2`, returning **202** with the job. The cursor/limit route
  parameters are gone from the public API; the worker owns batching.
- The worker loops 20-item batches to exhaustion for the selected scope,
  logging processed/failed counts. If any item fails (missing/corrupt canonical
  file or path escape), the job retries once and then FAILS with the count in
  `last_error`; already-updated derivatives are written idempotently.
- The Media Library button queues the job for the library or the currently
  browsed folder/Uncategorized, shows a queued notice and a direct link to
  Scheduled Actions. It no longer blocks the page and no longer shows a batch
  progress loop; the job’s status, attempts and last error are visible on
  Tools → Scheduled Actions.

Consequences: regeneration survives a request timeout/API restart and is
visible to operators; a folder can be regenerated without touching the rest of
the library. The job still re-encodes from the canonical WebP and does not
recover quality lost at upload. One active regeneration job is enforced at the
route (and the service still has its single-run guard).

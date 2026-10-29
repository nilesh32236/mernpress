# ADR 0008 — Media library, revisions, preview tokens, scheduled publishing

- Status: proposed
- Date: 2026-10-29
- Depends on: ADR 0003 (content model), ADR 0004 (capabilities), ADR 0007
  (renderer/sanitizer), threat model T-09…T-12, T-26
- Reference: adapted from qrolichealth-cms (owner-authorized reuse; the
  mechanisms are ported to MERNPress's Fastify/Prisma/capability architecture,
  not copied verbatim)

## Context

Four roadmap gaps share one migration and one design pass: the media library
(Phase 6), revisions (P8-01), preview tokens (P8-03) and first-publish
scheduling (P8-04). The reference CMS implements all four; its designs were
audited and the sound parts adapted.

## Decision

### 1. Media: raster-only uploads, sharp-processed, controlled serving

- **Types**: JPEG/PNG/WebP/GIF only. GIF is re-encoded to a static first
  frame (no animation). **No SVG** (T-12), no video/documents in this slice.
- **Pipeline**: `@fastify/multipart` single-file upload (10 MB cap) → real
  content validation via `sharp().metadata()` (a file that sharp cannot parse
  as raster is rejected regardless of extension/MIME) → EXIF stripped by
  re-encoding to WebP q85 (capped inside 2560×2560, no enlargement) →
  derivatives at 300/600/1200 px width, WebP q80 (reference pattern) →
  random 16-hex base name under `MEDIA_STORAGE_DIR/YYYY/MM/`.
- **Serving**: `GET /api/media/:id/:name` streams files through the API with
  path confinement (`path.resolve` must stay under the storage root),
  `X-Content-Type-Options: nosniff`, and
  `Cache-Control: public, max-age=31536000, immutable` (random names are
  effectively content-addressed). Unknown names/paths are 404, never 403.
- **Metadata**: alt text, caption, description, dimensions, uploader;
  editable by owner-or-editor (same capability semantics as posts).
- **Storage root**: `MEDIA_STORAGE_DIR` env (default `<repo>/var/media`),
  created at startup, excluded from git and from release rsync; served only
  through the API (no static exposure of the directory).

### 2. Revisions: pre-update snapshots in-transaction, retention 50

- Every `updatePost` that changes a snapshotted field (title, excerpt,
  content, SEO fields) writes a `post_revisions` row with the **pre-update**
  state inside the same transaction and increments `posts.revisionCount`
  (cumulative, never reset by pruning).
- Terms-only/status-only operations do not snapshot.
- Retention: newest 50 per post, pruned inside the same transaction
  (reference pattern). `revisionCount` preserves the total for UI.
- Restore routes through the normal `updatePost` path: the restore itself is
  snapshotted, so it is undoable, and optimistic concurrency (`baseVersion`)
  applies unchanged.
- `revisionNumber` exposed to the admin is the per-post ordinal ascending by
  creation time (stable; 1 = oldest surviving).

### 3. Preview: revocable 256-bit token column

- `posts.preview_token`: unique nullable 64-hex token
  (`crypto.randomBytes(32)`), rotated/revoked via admin endpoints with
  `canEditPost` authorization.
- Public route `GET /api/public/preview/:token`: format-validated, compared
  with `timingSafeEqual` semantics (unique-column lookup; malformed or absent
  tokens are the same 404 shape as drafts — no existence leak), works for any
  status except TRASHED, renders through the **same** sanitized renderer as
  public content (no weaker preview path), sends `Cache-Control: no-store`
  and `X-Robots-Tag: noindex, nofollow`, and never echoes the token.
- Trade-off vs stateless HMAC tokens: a database column allows instant
  revocation and per-post rotation; cost is one indexed column.

### 4. Scheduling: first-publish only, `scheduled_at` column + sweeper

- Scope cut vs the reference: the reference stages full update payloads
  (`publish_update` envelopes with conflict detection). MERNPress's editor
  saves directly, so the only scheduled operation is **first publish of a
  draft**: a DRAFT with `scheduledAt` in the past is promoted to PUBLISHED.
  Scheduling an update to an already-published post is out of scope
  (documented difference; the payload-envelope design can be adopted later if
  needed).
- Editor/API set `scheduledAt` (must be > now + 60 s; cleared on manual
  publish/trash). Public queries already exclude future-dated publication
  (`publishedAt <= now`); scheduled drafts stay invisible because they are
  drafts.
- Sweeper: in-process interval (60 s, plus a boot catch-up) claims due rows
  with `UPDATE … WHERE scheduled_at <= now() AND status = 'DRAFT'` in one
  statement (atomic claim; safe for the single-process deployment). A
  multi-instance future needs `FOR UPDATE SKIP LOCKED` or an advisory lock —
  noted as an operational dependency, matching the reference's raw-SQL
  approach for the same reason (`@updatedAt` must not fire).
- Publish-through-the-service keeps lifecycle invariants (`publishedAt` set,
  slug history, hooks) — the sweeper calls the same service transition the
  Publish button uses.

### 5. Alternatives considered

- Reference's static `/uploads` directory serving: rejected; API-mediated
  serving keeps one access-control point and works without nginx changes.
- Stateless signed preview tokens: rejected (no revocation without a denylist).
- `SCHEDULED` post status: rejected for now; a status enum change ripples
  through every visibility/transition rule, while the column approach keeps
  drafts as drafts until the sweeper flips them.
- `node-cron`/external scheduler: rejected; an in-process interval with an
  atomic claim is sufficient at one instance and has no new dependency.

## Consequences

- New dependencies: `@fastify/multipart` 11.0.3, `sharp` 0.35.5 (native;
  pinned; already present transitively in the lockfile).
- Migration `20261029140000_add_media_revisions_preview_schedule` is additive
  and applied to dev/test only.
- Media uploads are a new attack surface: mitigations are the
  raster-only/sharp-re-encode pipeline, random names, confinement checks,
  and the serving tests (traversal, spoofed MIME, oversized files).
- Preview links are bearer secrets: they are shown only in the admin single
  post view and rotatable at any time.

## Verification

- Media: upload/list/edit/delete/serve integration tests incl. SVG-rejection,
  MIME spoofing, traversal, oversize, wrong-role access.
- Revisions: snapshot content correctness, no-snapshot operations, retention,
  restore + conflict, authorization.
- Preview: draft visibility with token, sanitized output, revocation,
  malformed token, headers, no token leakage.
- Scheduler: due-row promotion, not-yet-due invisibility, conflict-free
  republish, disabled flag.

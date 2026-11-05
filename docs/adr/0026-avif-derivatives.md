# ADR 0026 — AVIF derivatives and responsive content images

- Status: accepted (owner scope decision, 2026-11-05)
- Extends: ADR 0008 (media pipeline)

## Context

Every upload is re-encoded to WebP and gets 300/600/1200 derivatives plus the
configured thumbnail/medium/large sizes. WebP is a good universal fallback, but
AVIF is typically 20–50 % smaller for photographs, so serving it to browsers
that support it is a direct Core Web Vitals win (LCP and transfer size).

## Decision

1. **Every derivative is generated twice.** `writeDerivatives` now writes
   `<name>-<width>.webp` and `<name>-<width>.avif` (quality 52) for each fixed
   width and each configured size. The canonical file stays WebP, because the
   edit/restore pipeline reads and rewrites it.
2. **Keys are explicit.** The media DTO keeps plain width keys for WebP and adds
   `<width>:avif` keys for AVIF. Nothing about the existing WebP contract
   changes, so the admin grid/drawer and older rows keep working.
3. **Serving is extension-driven.** `resolvePublicFile` chooses the
   `Content-Type` from the served file extension (`image/avif`, `image/webp`)
   before falling back to the row MIME. The allow-list stays basename-only.
4. **The public site negotiates format.** A new `ResponsiveImage` component
   renders `<picture>` with an AVIF `<source>`, a WebP `<source>` and a WebP
   `<img>` fallback, a `sizes` attribute, intrinsic `width`/`height` (no layout
   shift), lazy loading for lists and eager/high-priority loading for the single
   post's hero image.
5. **Failure containment.** AVIF generation runs inside the existing derivative
   write; a failure aborts the upload with the image cleaned up, exactly like a
   WebP failure. There is no silent partial upload.
6. **No migration.** Derivatives are already a JSON column; new keys are
   additive. Legacy rows simply have no `:avif` key and fall back to WebP.

## Consequences

- Storage per image grows by the AVIF variants (roughly +30–60 % of WebP bytes,
  offset by smaller transfers to modern browsers).
- `sharp` must be built with libavif; the current pinned build supports it and a
  regression test asserts `heif` output and `image/avif` serving.
- Uploads are slightly slower (one extra encode per size). Derivate generation
  remains bounded by the 10 MB / 40 MP limits.
- A future slice can add a setting to disable AVIF generation, but it is on by
  default because it is a pure performance win.

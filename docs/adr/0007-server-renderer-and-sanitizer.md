# ADR 0007 — Server renderer and allowlist sanitizer (P5-06)

- Status: proposed
- Date: 2026-10-29
- Depends on: ADR 0001 (content format), ADR 0003 (content model), ADR 0006
  (Gutenberg editor), threat model T-07
- Unblocks: Phase 7 public rendering, preview tokens (P8-03), media image
  rendering (Phase 6)

## Context

Block markup is stored as WordPress-compatible serialized HTML and
structurally validated on write (D-040), but nothing renders it. The public
API (`/api/public/posts*`) returns **raw stored markup**, and the threat model
rates stored XSS in block content High (T-07): stored markup is inert only
because nothing renders it. Public rendering, preview and the Next.js site all
require a render path that treats persisted content as untrusted.

The architecture contract (gutenberg-and-rendering.md §7) prescribes: parse →
validate → per-block render → allowlist sanitize → deterministic output, with
unknown blocks preserved, per-block error isolation and render limits.

## Decision

### 1. Renderer ownership and shape

`packages/block-system` gains a **Node-only** `./render` entrypoint:

```text
renderBlockMarkup(markup: string): { html, toc, warnings }
```

- Validates with the existing `validateBlockMarkup` (2 MB / 5,000 blocks /
  depth 20). Violations raise `RenderError` with the validation code; nothing
  renders.
- Reassembles each block from the parsed tree: `innerContent` strings are
  literal chunks, `null` placeholders are replaced by the rendered inner
  blocks in order; defensive append if placeholders and children disagree.
- A heading pass assigns deterministic anchor ids to `core/heading` output
  (slugified text, de-duplicated with `-2`, `-3` suffixes; an explicit
  `anchor` attribute wins) and builds `toc: [{ level, id, text }]`.
- Per-block try/catch: a failing block falls back to its sanitized
  `innerHTML` (fail closed to `''` if that also fails) and records a
  `warnings` entry instead of taking down the page.
- Output is deterministic for the same input: no random ids, no
  module-level counters leaking into markup, slug counters are per render
  call.

### 2. Static blocks render from saved markup + sanitization (not attr re-render)

The MVP block set is static (the editor's `save` output is authoritative
markup). The renderer therefore **reassembles and sanitizes the saved inner
HTML** instead of re-generating markup from attributes. Re-implementing
Gutenberg's save output for 15 core blocks would duplicate upstream behavior,
diverge on upgrades, and add no security: the allowlist sanitizer is the
security boundary either way. Dynamic blocks (editor `save: () => null`,
server-owned markup) will introduce a per-block registry when they arrive;
the current uniform path remains correct for them because their saved
`innerHTML` is empty.

### 3. Sanitizer: DOMPurify + jsdom, tight allowlist, strict URLs, style property filter

Server-side sanitization uses `dompurify` 3.4.17 over a `jsdom` 30.1.3
window — the same proven pattern as the reference CMS, without the wrapper
dependency. `src/sanitize.ts`:

- JSDOM window is recreated every 2,000 sanitizations to bound the
  per-window cache growth in a long-lived process (documented reference
  workaround; output unchanged).
- `ALLOWED_TAGS` covers exactly the MVP block set: `p h1..h6 div span a ul ol
  li blockquote cite figure figcaption img code pre hr br strong em b i u s
  del ins mark sub sup kbd small button`. No `script/style/iframe/svg/math/
  form/input/object/embed/link/meta/template` — SVG stays out until a
  reviewed design exists (T-12).
- `ALLOWED_ATTR`: `id class href target rel src srcset sizes alt title width
  height loading decoding style role start type reversed lang dir` plus
  `aria-hidden/aria-label/aria-describedby/aria-current`. `ALLOW_DATA_ATTR`
  is **false** (the MVP set needs no `data-*`; tighter than the reference).
- `ALLOWED_URI_REGEXP` allows only `https?`, `mailto:`, `tel:` and
  non-scheme (relative/fragment) URLs. `javascript:`, `data:`, `vbscript:`,
  `file:`, `ftp:` and protocol-relative tricks are rejected; DOMPurify drops
  the whole attribute.
- `style` attributes pass through a `uponSanitizeAttribute` hook that keeps
  only an allowlisted CSS property set (colors, spacing, typography, layout
  primitives used by block supports) and rejects any value containing
  `url(`, `expression(`, `@`, `import`, or positioning/overlay properties
  (`position`, `z-index`, `inset`, `transform`, `filter`, …). Gradients
  (`linear-gradient(...)` etc.) used by block backgrounds are allowed.
- `KEEP_CONTENT: true`: disallowed tags are unwrapped, preserving their
  text; `script`/`style` contents are dropped by DOMPurify as usual.

### 4. API integration: rendered output on public reads, raw markup never rendered client-side

- `PublicPost` gains `renderedContent: string` and `toc`. The content service
  renders on read (deterministic, no cache column yet — the
  `rendered_html`/`render_hash` cache from gutenberg-and-rendering.md §2.2 is
  deferred until measurement justifies it; a `RENDER_VERSION` constant marks
  the contract for a later cache).
- Stored `content` remains the canonical source and is still returned for
  consumers that need it; clients must never inject it unsanitized.
- Render warnings are logged via the service's logger with the post id.
- Public GETs send short `Cache-Control: public, max-age=60` (published
  content only); preview stays `no-store` (P8-03).

### 5. Limits and failure modes

- Content size/block-count/depth limits are enforced before any rendering
  (existing validator).
- Sanitizer and renderer are synchronous; a 2 MB document renders in bounded
  time (parser is linear; DOMPurify is linear in markup size).
- If rendering cannot complete, the service fails closed: no partial HTML,
  no raw fallback.

## Alternatives considered

- **sanitize-html (htmlparser2)**: lighter, no DOM; but its forgiving parser
  has a weaker mutation-XSS track record than DOMPurify's browser-grade
  parse5. T-07 is rated High, so the stronger parser wins; cost is the jsdom
  footprint (server-only).
- **isomorphic-dompurify**: thin wrapper around exactly the two packages we
  pin directly; skipping it removes a dependency for zero behavior change.
- **Per-block attr-driven re-rendering now**: rejected for MVP (see §2).
- **Client-side sanitization in Next.js**: rejected; sanitization must happen
  once, server-side, before any client sees markup.

## Consequences

- `packages/block-system` exports gain `./render` and `./sanitize`
  (Node-only); the isomorphic `./contracts`, `./parser`, `./validate`
  entrypoints are unchanged and must not import jsdom.
- New pinned dependencies: `dompurify` 3.4.17, `jsdom` 30.1.3 (MIT both),
  `@types/jsdom` 30.0.0 (dev).
- Unknown blocks keep rendering as their sanitized inner HTML; nothing is
  dropped silently and stored markup is never rewritten.
- Golden-output tests pin deterministic HTML per block; an XSS payload suite
  guards the sanitizer; both run in CI on every change.

## Verification

- Unit: golden HTML per MVP block (bare + attributed), unknown block
  preservation, nested blocks, malformed markup, heading-id determinism,
  limits.
- XSS suite: `<script>`, event handlers, `javascript:`/`data:` URLs, encoded
  payloads, SVG/MathML, `<style>`, CSS overlay/URL payloads, mXSS strings,
  `srcset` payloads, unknown-tag unwrapping.
- Integration: public API returns sanitized `renderedContent`; stored raw
  content unchanged; 2 MB/5,000-block/depth-20 ceilings still enforced.

# ADR 0006 — Gutenberg block editor integration (Phase 5)

- Status: proposed (implemented locally; owner acceptance pending)
- Date: 2026-10-28
- Depends on: ADR 0001 (stack and editor package set), ADR 0003 (content model),
  ADR 0004 (roles/capabilities)
- Supersedes: the Phase 4 textarea-only editor; resolves U-001/U-002/U-003 for
  the MVP scope

## Context

Phase 4 shipped a working content workflow (dashboard, lists, status tabs,
taxonomy, lifecycle) with a `<textarea>` for body content. The accepted content
contract is WordPress-compatible serialized block markup
(`posts.content`, `content_format = 'wp_block_html'`), but nothing produced or
consumed blocks: authors typed raw comment-delimited HTML by hand.

The Phase 5 goal is a genuine block editor, not a textarea with block-shaped
marketing. The architecture (docs/architecture/gutenberg-and-rendering.md) had
already selected the official `@wordpress/*` packages and recorded a
compatibility spike: React 19 peers resolved, CSS paths existed, a Vite build
succeeded, the official parser v6 handled nested blocks, and the standalone
editor bundle was ~5.9 MB. What was not proven was browser integration, save/
reload, unknown-block preservation, or behaviour inside the existing MERNPress
admin shell.

## Decision

### 1. Use the official standalone editor, inside the MERNPress shell

The admin mounts the official packages through a lazily-loaded chunk:

```tsx
<ShortcutProvider>
  <SlotFillProvider>
    <BlockEditorProvider value={blocks} onInput={…} onChange={…} settings={settings}>
      <BlockEditor />   {/* custom toolbar, canvas, inspector, list view */}
      <Popover.Slot />
    </BlockEditorProvider>
  </SlotFillProvider>
</ShortcutProvider>
```

MERNPress owns the document workflow around it: header, title, slug/excerpt,
taxonomy, status, save/publish/trash, conflict handling and dirty guards. This
is the same division the reference CMS converged on and avoids dragging the
WordPress `core/editor` store (and its post/title/media assumptions) into a
CMS that already has its own API contract.

Rejected alternatives:

- **Custom block editor implementation.** Full control and a smaller bundle,
  but it would fork the block API/serializer contract that the architecture
  deliberately borrowed from WordPress, and would make future block portability
  a hand-written migration problem.
- **Embed Gutenberg's iframe canvas.** Better CSS isolation, but iframe
  messaging, media, focus and slot/fill plumbing add cost without changing the
  user-visible capability for this slice.
- **Use `@wordpress/edit-post`/`core/editor`.** Brings WordPress admin
  assumptions (post entity, media, preferences, notices) and a second source of
  truth for document state. We only need the block canvas.

### 2. Pin the package set; lazy-load the whole editor

Admin runtime dependencies (exact versions):

```text
@wordpress/block-editor 19.0.0   @wordpress/blocks 17.0.0
@wordpress/block-library 12.0.0  @wordpress/components 43.0.0
@wordpress/data 11.0.0           @wordpress/element 10.0.0
@wordpress/format-library 6.0.0  @wordpress/hooks 5.0.0
@wordpress/i18n 7.0.0            @wordpress/icons 19.0.0
@wordpress/keyboard-shortcuts 6.0.0  @wordpress/notices 6.0.0
```

React/React DOM stay at 19.3.1 (single copy; pnpm dedupes). Vite pre-bundles the
five heavyweight editor entries and keeps the store owners (`data`, `element`,
`notices`, …) as singletons. Dev pre-bundling initially embedded `rungen` (a
CommonJS dependency of `redux-routine`) without interop, which broke the editor
with `does not provide an export named 'create'`; including the direct
store-owning packages in `optimizeDeps` fixed it. Production Rollup was never
affected.

The editor route uses `React.lazy`; the main admin bundle is 276 kB and the
editor chunk is 5.98 MB (1.34 MB gzip) plus 478 kB CSS (64 kB gzip). The vips
and video-conversion workers are emitted but never fetched during editing
because client-side media processing is not initialised. A production build
completes in ~4–11 s with Node's default heap; no 4 GB override.

### 3. MVP block allowlist

Registered: core paragraph, heading, list/list-item, quote, image, separator,
spacer, buttons/button, columns/column, group, code, preformatted. The inserter
and provider settings both use the same allowlist (`SUPPORTED_BLOCKS`), so a
future renderer can be tested against exactly the set authors can insert. Cover,
gallery, media-text, embeds, raw HTML, reusable blocks and query loops remain
out of scope.

Media upload is not part of this slice. `settings.mediaUpload` reports a clear
message; the image block's **Insert from URL** path works today. Client-side
vips processing is never initialised.

### 4. Serialization and unknown blocks

The editor is the only writer and uses the official parser/serializer. Loading
empty content creates one empty paragraph but serializes to `''` until the
author types, so a new post is not falsely dirty. Unknown blocks are left to
the editor's `core/missing` placeholder and serialized back byte-for-byte;
verified in the browser with an `acme/widget` fixture (attributes and inner HTML
unchanged after load/save).

The API does **not** import `@wordpress/blocks` (native Node still fails on its
JSON import attribute). It uses only
`@wordpress/block-serialization-default-parser` through
`@mernpress/block-system`, which is isomorphic and keeps the parser replaceable.

### 5. Structural validation at the API boundary, never rewriting

`packages/block-system` exposes the official parser adapter plus
`validateBlockMarkup()`: size (2 MB), block count (5 000), nesting depth (20).
The content service runs this on the filtered draft before persistence and
returns `400` with a stable code (`CONTENT_TOO_LARGE`, `TOO_MANY_BLOCKS`,
`BLOCK_NESTING_TOO_DEEP`). Freeform HTML and unregistered block names remain
valid; the stored markup is never normalised or rewritten. This is a structural
guard, not a sanitizer; render-time sanitization remains the Phase 5/7 gate.

### 6. Undo/redo and document state

The standalone provider has no editor-wide undo store. MERNPress keeps a
bounded (50-entry) snapshot history of serialized documents:

- typing bursts are coalesced after a 250 ms pause;
- structural changes snapshot the pre-change document first, so undoing an
  insert/move/delete does not discard text typed before it;
- Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y are handled on the canvas root
  (the block-editor keyboard-shortcuts component was not available in this
  release line);
- the dirty guard flushes pending keystrokes before save, and an external
  content change (conflict reload) replaces the document without clobbering
  in-progress typing.

This is burst-level undo, not per-keystroke parity; it is documented in the UI
copy ("Undo (Ctrl/Cmd+Z)") and in the limitations.

### 7. Document workflow stays in MERNPress

- One `<h1>` per view (`New post` / `Edit post`); the app breadcrumb is hidden on
  editor routes so the shell does not collide with the editor header.
- Primary action per state: **Publish** for a publishable draft (with secondary
  **Save draft**), **Update** for published/trashed content, **Save draft** for
  roles that cannot publish. Publishing an unchanged draft transitions directly;
  dirty drafts save first and then publish.
- The sidebar carries slug, excerpt, categories/tags, status metadata and
  unpublish/trash/restore. Publish is never rendered twice.
- React component tests mock the lazy canvas and cover the document workflow;
  the real canvas is covered by five Playwright tests.

## Evidence

- Build: `pnpm --filter @mernpress/admin build` → 6 222 modules, main 271.2 kB
  (83 kB gzip), editor 5 836.3 kB (1.34 MB gzip), CSS 467.1 kB (64 kB gzip);
  `vips-worker` 13.4 MB emitted, not fetched. `pnpm check:bundle` enforces the
  budgets in CI.
- Tests: 222 API + 73 admin + 15 block-system + 1 web = 311 unit/integration;
  21/21 Playwright (auth 4, content 5, editor 7, placeholders 3, terms 2).
- Browser scenarios proven: paragraph typing, heading via searchable inserter,
  list with two items, save/reload, canonical `wp:paragraph`/`wp:heading`/
  `wp:list`/`wp:list-item` markup, publish + public API, undo/redo of a
  structural insert with text preserved, unknown-block byte equality, 375 px
  layout with off-canvas settings, no unexpected console errors.
- E2E can run locally without touching production: `E2E_API_PORT=4100
  pnpm test:e2e` starts the API on an isolated port and keeps the test database.

## Consequences and residual risks

- Editing routes load a large chunk on first navigation. This is accepted for
  the admin (WordPress itself ships a comparable editor); the dashboard/lists/
  login do not pay it. A reduced block-subset import (U-002) remains an
  optimisation, not a requirement.
- WordPress CSS is global, not iframe-isolated. Popovers/inserter portal to
  `body`; the admin shell uses its own classes, and the editor's overrides are
  scoped to `.block-canvas-*`/`.editor-*`. Visual regression coverage is manual.
- `deepmerge` (transitive through `@wordpress/data`/`components`) has an
  unpatched low-severity prototype-poisoning advisory; no user-controlled merge
  path is exposed by MERNPress. `pnpm audit --audit-level=high` passes.
- No preview: the public renderer is Phase 7. The UI does not offer a dead
  preview control. Media upload is Phase 6 (URL insertion only).
- Server-side block rendering, golden HTML and the sanitizer are **not**
  implemented; the API stores markup and validates structure only. Public
  rendering must not trust it until Phase 7 lands.
- The missing-block placeholder is Gutenberg's; authors can remove an unsupported
  block deliberately. Saving unchanged content preserves it byte-for-byte.

## Follow-up

1. Phase 6: media upload + chooser wired to `settings.mediaUpload`; featured
   image.
2. Phase 7: API renderer + allowlist sanitizer + golden/XSS tests; only then
   expose a preview action.
3. Optional: reduced block-subset import and a bundle budget check in CI (U-002).
4. Optional: per-keystroke undo via `@wordpress/undo-manager` integration.

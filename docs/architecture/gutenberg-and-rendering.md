# Gutenberg and rendering

Status: Phase 0 design baseline, updated after the Phase 5 MVP implementation
(ADR 0006). The editor and structural validation exist; the server renderer
(P5-06) does not.

## 1. Goal

Use the **official WordPress block editor packages** to provide a familiar
editing experience, while keeping the content contract understandable, portable
and safe in a Node/React stack. Do not rebuild Gutenberg's UI from scratch. Do
not promise full WordPress parity.

The MVP is a deliberately small, tested block set plus a server renderer. The
architecture must make it possible to add blocks and plugin blocks later without
rewriting the content format.

<a id="content-contract"></a>
## 2. Content contract

### 2.1 Canonical format

`posts.content` stores **WordPress-compatible serialized block markup**:

```html
<!-- wp:paragraph {"align":"left"} -->
<p class="has-text-align-left">Hello <strong>world</strong>.</p>
<!-- /wp:paragraph -->
```

Metadata:

- `content_format = 'wp_block_html'`
- `content_version = 1` (format version, incremented only for a breaking format
  change)

Why this format:

- It is what the official editor reads and writes.
- It preserves unknown blocks and their inner HTML.
- It is importable/exportable to WordPress, which is valuable for a CMS inspired
  by WordPress.
- It avoids inventing a proprietary format before the editor is proven.

This choice is **not** a claim that comment-delimited HTML is a great general
format. It is fragile outside Gutenberg. Mitigations:

- one hardened parser with malformed-input tests;
- a versioned format and a documented migration path;
- a derived AST/render cache, never the source of truth;
- explicit unknown-block handling;
- a future ADR if a structured JSON store is ever justified.

### 2.2 Raw vs derived

| Data | Role | Rebuildable? |
| --- | --- | --- |
| `content` (raw block markup) | canonical source | No — must be preserved |
| `blocks` (parsed AST, optional) | diagnostic/advanced themes | Yes |
| `rendered_html` | public render cache | Yes |
| `render_hash` | cache invalidation | Yes |
| `toc` | derived from headings | Yes |

Never edit `rendered_html` as the source of truth. If rendering rules change,
bump a render version/hash and rebuild.

<a id="unknown-blocks"></a>
### 2.3 Unknown and unavailable blocks

- Parse the block tree. If a block name is not registered, render its
  `innerHTML`/`innerContent` (sanitized) instead of dropping it.
- If a block is registered but its renderer throws, return a safe fallback
  (inner HTML or an empty string) and log the block name/request ID. Do not take
  down the page.
- Never rewrite the stored content merely because the renderer does not know a
  block.
- Show an "unsupported block" notice in the editor only if the block cannot be
  represented; preserve the original markup on save.

### 2.4 Versioning and migrations

- `content_version` identifies the serialization contract, not the number of
  edits.
- Block definitions have an `apiVersion` and optional deprecations. A block
  deprecation describes how to migrate old saved markup to the current schema.
- MVP: one version, no deprecations. Add the mechanism before changing a block's
  saved shape.
- A content migration is a separate script with a dry run, a backup, a report and
  idempotency. Do not run destructive rewrites automatically on read.

<a id="parser"></a>
## 3. Parser

### 3.1 Official parser first

Use `@wordpress/block-serialization-default-parser` **6.0.0** in the API.

Verified on 2026-10-24 in a throwaway workspace:

```text
group → columns → column → paragraph
```

parsed into the correct nested tree, including `innerHTML` and `innerContent`.
This contradicts the reference CMS's v5-era failure. The reference's custom
`WP_Block_Parser` port is therefore **not** assumed necessary for v6.

**Phase 5 gate:** run the official parser against the real corpus (the reference
CMS content and WordPress-generated fixtures). If a reproducible failure remains:

1. add the failing fixture as a regression test;
2. compare with the bundled WordPress 7.1.3 `WP_Block_Parser` behavior;
3. only then port the parser, with GPL attribution and a focused test suite;
4. keep the parser behind the `packages/block-system` contract so it can be
   replaced.

### 3.2 Do not import `@wordpress/blocks` in the API

`@wordpress/blocks` 17.0.0 is a browser/bundler package. A native Node ESM import
on Node 22.23.1 failed on 2026-10-24:

```text
TypeError [ERR_IMPORT_ATTRIBUTE_MISSING]:
Module ".../api/i18n-block.json" needs an import attribute of "type: json"
```

Vite handles the JSON import; bare Node does not. Therefore:

- API: use the pure parser + server renderer, not `@wordpress/blocks`.
- Admin: use `@wordpress/blocks` through Vite.
- Do not add a bundler to the API just to import an editor package.

### 3.3 Parser output

The parser contract is:

```ts
type ParsedBlock = {
  blockName: string | null; // null for freeform HTML
  attrs: Record<string, unknown>;
  innerBlocks: ParsedBlock[];
  innerHTML: string;
  innerContent: Array<string | null>;
};
```

Validate the shape, cap nesting depth, cap total blocks and content size, and
never `eval` attribute values.

<a id="block-registry"></a>
## 4. Block registry

### 4.1 Package layout

```text
packages/block-system/
  src/contracts.ts     // BlockDefinition, attribute schema, types (isomorphic)
  src/registry.ts      // registration + lookup (isomorphic)
  src/parser.ts        // parser adapter (isomorphic/Node-safe)
  src/render/          // server renderers (Node only)
  src/editor/          // editor components/helpers (browser only)
  src/blocks/          // core block definitions, one folder per block
  src/sanitize.ts      // allowlist sanitizer (server)
  src/index.ts         // contracts entrypoint only
```

`package.json` exports:

```jsonc
{
  "exports": {
    ".": "./dist/contracts.js",
    "./contracts": "./dist/contracts.js",
    "./render": "./dist/render/index.js",
    "./editor": "./dist/editor/index.js"
  }
}
```

No barrel may leak `render` into `editor` or React into `render`.

### 4.2 Definition shape

```ts
type BlockDefinition = {
  name: string;                 // "core/paragraph", "mernpress/notice"
  title: string;
  category: string;            // "text", "media", "design", "widgets"
  apiVersion: number;          // block API contract
  attributes: AttributeSchema; // single source of truth
  supports?: BlockSupports;    // align, className, spacing, color...
  edit: React.ComponentType;   // browser only
  save: (props) => JSX.Element | null; // null for dynamic blocks
  render?: (block, ctx) => string;     // server only; dynamic blocks
  deprecated?: BlockDeprecation[];
};
```

Rules:

- `attributes` lives once. The editor and renderer both import it.
- Defaults: if a value must persist, do not put a `default` in the editor schema
  (WordPress omits default-equal attributes). Materialize defaults on mount and
  in the renderer. Test the round trip with the real serializer.
- Dynamic blocks: `save: () => null`; the API renderer owns output.
- Static core blocks: use the upstream save behavior and renderer; do not
  reimplement their markup by hand if the official package provides it.
- Every block has a stable `name`, a category, an example/fixture and a renderer
  test.

### 4.3 Registration

- Admin: register core blocks and MERNPress blocks once at editor bootstrap;
  guard against duplicate registration in HMR.
- API: a registry populated by core + trusted plugins; look up by `blockName`.
- Registry order: core first, then plugins by deterministic plugin order. A
  duplicate name is an error at startup, not a silent override.
- Unregistered names are unknown blocks, not errors.

## 5. Editor integration

### 5.1 Bootstrap

The editor is a **standalone** Gutenberg editor, not the full WordPress admin:

```tsx
<ShortcutProvider>
  <SlotFillProvider>
    <BlockEditorProvider
      value={blocks}
      onInput={onInput}
      onChange={onChange}
      settings={editorSettings}
    >
      <BlockTools>
        <BlockEditorKeyboardShortcuts />
        <BlockInspector />
        <BlockList />
        <Inserter />
        <ListView />
      </BlockTools>
    </BlockEditorProvider>
  </SlotFillProvider>
</ShortcutProvider>
```

- `registerCoreBlocks()` is convenient but pulls the whole block library. Phase 5
  may import only the supported block modules from
  `@wordpress/block-library/build-module/*` (the subpath is exported, but it is
  not a stable public API; pin and test upgrades).
- Set `window.wp` only if a dependency requires it; prefer ESM imports.
- Use `BlockEditorProvider`'s `settings` for allowed block types, colors, font
  sizes, spacing and media upload.
- CSS: import `@wordpress/components/build-style/style.css`,
  `@wordpress/block-editor/build-style/style.css` and `content.css`,
  `@wordpress/block-library/build-style/{editor,style,theme}.css`, plus a
  MERNPress editor stylesheet. Scope selectors to the editor container to avoid
  leaking into the admin shell.
- Use a single React copy and a single copy of store-owning packages. Vite
  `resolve.dedupe` + pnpm overrides; verify with `pnpm why` and a production
  build.

### 5.2 Undo/redo and autosave

- The standalone editor does not own the WordPress `core/editor` undo stack.
  Either:
  - use the editor's history mechanism if the package exposes it, or
  - keep a bounded local history of committed serialized states (the reference
    used 50 snapshots), and make the behavior explicit in the UI.
- Do not claim per-block undo parity if it is not implemented.
- Autosave is not part of Gutenberg's standalone provider. The admin form owns
  debounced autosave (Phase 8) and conflict detection. Until then, the editor
  warns on navigation with unsaved changes.

### 5.3 Media

- Provide `settings.mediaUpload` that uploads to `/api/admin/media`, returns
  `{ id, url, alt, width, height }`, and inserts a media reference.
- Prefer IDs/relative URLs in attributes; resolve to absolute URLs at render.
- The media modal is shared with the media library page.
- No client-side vips processing in MVP; the server processes images with sharp.
  This also avoids the largest worker artifact if the editor can be configured
  without client-side media processing.

### 5.4 Save/load

- Load: API returns raw `content`, `content_format`, `version`, and parsed
  `blocks` (optional). The editor parses with `@wordpress/blocks`.
- Save: serialize with `@wordpress/blocks`, send raw markup + `baseVersion`; the
  API validates and persists.
- On 409 conflict: show a conflict UI (reload / save as draft / overwrite with
  explicit confirmation). Never silently overwrite.
- Flush pending edits before save/navigation. The reference used a `flushRef`;
  replicate the behavior with a tested hook.

### 5.5 Bundle and performance (measured)

A production build of a minimal editor with the selected packages on 2026-10-24:

| Artifact | Uncompressed | Gzip |
| --- | ---: | ---: |
| main JS | ~5,878 kB | ~1,342 kB |
| CSS | ~474 kB | ~63 kB |
| vips worker | ~13,449 kB | ~3,744 kB |
| video-conversion worker | ~406 kB | ~83 kB |

This is not acceptable to load on every admin page. Phase 5 requirements:

- Lazy-load the editor route (`React.lazy`/dynamic import).
- Split vendor/WordPress chunks (`manualChunks`).
- Prefer a subset of core blocks over `registerCoreBlocks()` if it materially
  reduces the bundle; test the subpath imports.
- Do not initialize client-side media processing (the vips worker) if the server
  handles uploads; verify whether the worker is fetched only when needed.
- Set a performance budget and report it. The reference needed a 4 GB heap for
  its admin build; MERNPress must not inherit that.

## 6. Initial block set

The MVP block set is deliberately small and chosen for text, layout and media.
Each block must have editor + renderer + fixtures + a browser test.

| Block | Nested? | Renderer | Notes |
| --- | --- | --- | --- |
| `core/paragraph` | no | official save + server render | rich text; links; basic marks |
| `core/heading` | no | official save + server render | levels 2–4; anchor/TOC |
| `core/list` / `core/list-item` | yes | official save + server render | ordered/unordered |
| `core/quote` | yes | official save + server render | citation optional |
| `core/image` | no | official save + server render | media ID/URL; alt required in UX |
| `core/buttons` / `core/button` | yes | official save + server render | link URL validation |
| `core/columns` / `core/column` | yes | official save + server render | responsive layout classes |
| `core/group` | yes | official save + server render | layout/align/background |
| `core/cover` | yes | official save + server render | image + overlay; alt text |
| `core/separator` | no | official save + server render | style variants limited |
| `core/spacer` | no | official save + server render | height validation |

Not in MVP: gallery, audio, video, table, code, preformatted, verse, embed, raw
HTML, shortcode, reusable blocks, navigation, query loop, template parts,
widgets, pattern overrides, block bindings, footnotes, math, comments blocks.

Why: each block adds editor UI, renderer code, sanitization rules, CSS and tests.
A smaller set that works reliably is more valuable than a broad set that silently
drops content.

<a id="rendering-contract"></a>
## 7. Server rendering

### 7.1 Pipeline

```text
raw markup
  → parse (official parser v6 or documented port)
  → validate shape/size/depth
  → for each block:
       look up definition
       validate/normalize attributes (Zod or schema)
       static: use saved innerHTML? (sanitized)
       dynamic: call render(block, context)
       unknown: render sanitized innerHTML/innerContent
  → sanitize final HTML (allowlist)
  → return { html, blocks?, toc? }
```

- Rendering is deterministic for the same content + settings + render version.
- No database access inside a block renderer. Dynamic data is prepared by a
  service and passed in context.
- No `Math.random()`/module-level counters in render output. IDs are derived from
  stable inputs or a deterministic seed.
- Nested rendering must not duplicate children (use a single accumulator/sink).
- Catch renderer errors per block; log with block name and request ID; fall back
  safely.

### 7.2 Sanitization

- Use an allowlist sanitizer (e.g. `isomorphic-dompurify` with a JSDOM window, or
  `sanitize-html`). Configure allowed tags/attributes per block or globally.
- Escape text and attributes with `@wordpress/escape-html` (or equivalent) before
  building HTML.
- Validate URLs: allow `http:`, `https:`, `mailto:`, `tel:`; reject
  `javascript:`, `data:` (except explicitly safe image data if ever needed),
  `vbscript:` and protocol-relative tricks unless intended.
- Do not allow inline event handlers (`on*`), `<script>`, `<style>` from content,
  `<iframe>` (unless a later embed block with a provider allowlist), or SVG.
- Inline `style` attributes: only from a vetted block support/allowlist, not
  arbitrary user input. Prefer classes/tokens.
- The final sanitizer is the last line of defense; individual renderers still
  escape.

### 7.3 Dynamic/vs static ownership

- Static core blocks: the editor saves markup; the API may render from the saved
  `innerHTML` or re-render with the official save output. Choose one and test it.
  For MVP, trust the parsed block structure and render server-side rather than
  trusting arbitrary saved HTML.
- Dynamic MERNPress/plugin blocks: editor `save: () => null`; API renderer owns
  output. The editor needs a preview (server-side render or a static placeholder).
- Document the ownership per block in the registry.

## 8. Testing and parity

### 8.1 Unit/golden

- Parser: nested groups/columns, freeform HTML, void blocks, malformed JSON,
  unclosed blocks, unknown blocks, attributes with quotes/unicode, depth/size
  limits.
- Round trip: parse → serialize (admin side) → parse; compare structure and
  stable HTML. Byte equality is desirable but may not hold for all blocks; assert
  semantic equivalence where necessary.
- Renderer: golden HTML for each block, bare and with attributes; normalize
  volatile IDs; snapshot review.
- Sanitizer: XSS payload suite (`<script>`, `onerror`, `javascript:` URLs,
  malformed tags, encoded payloads, SVG/MathML).
- Defaults: a value equal to a schema default must still persist if the user
  chose it; test the WordPress omission behavior explicitly.

### 8.2 Browser

Playwright tests:

1. Load the editor with existing content.
2. Insert each supported block.
3. Edit text/attributes.
4. Save; reload; assert content persisted.
5. Add an unknown block fixture; assert it is preserved and not silently removed.
6. Paste rich text/links; assert sanitization.
7. Keyboard: tab to toolbar, inserter, inspector; save shortcut; undo/redo.
8. No console errors and no duplicate store warnings.

### 8.3 Real corpus

Copy a representative set of reference CMS content into a test fixture directory
(read-only source, no code copying). Run the parser/renderer and compare against
the expected structure/HTML. This is the test that decides whether the official
parser v6 is sufficient.

## 9. Differences from WordPress

Document these in user/developer docs:

- Standalone editor, not the full WordPress admin; no `core/editor` store parity.
- A scoped block set, not ~90 core blocks.
- API-rendered HTML is canonical for themes; themes do not run PHP.
- No raw HTML block in MVP; no shortcodes.
- No patterns/synced patterns/block bindings/global styles editor in MVP.
- No full `theme.json`; a smaller token/settings contract.
- No WordPress plugin compatibility; MERNPress has its own plugin API.
- No comment-delimited markup guarantee beyond what the official parser/serializer
  produces; test migrations before changing block shapes.

<a id="compatibility-spike"></a>
### 9.1 Lessons from the reference parity report and block-authoring doc

The reference CMS ships `docs/gutenberg_parity_research_report.md` and
`docs/BLOCK-AUTHORING.md`. They are useful but partly stale; verify claims against
the code before copying them.

| Claim in the reference docs | Status | Lesson for MERNPress |
| --- | --- | --- |
| "The API uses `@wordpress/block-serialization-default-parser`" | Outdated vs `engine.ts`, which says the npm parser v5 failed and a local `WP_Block_Parser` port is used | Test parser v6 on the corpus; keep the parser behind an adapter |
| "Declare attributes with `default` values in the shared schema" | Outdated; the code now uses `typeOnlySchema` with no defaults and materializes them, because WordPress omits default-equal attributes | Never rely on a schema `default` to persist user-chosen values; test the omission behavior |
| "Use `@wordpress/hooks` for `render_block`/`the_content`" | Implemented and still valid | Keep a small typed hook bus; do not hardcode renderer branches |
| "Browser-only packages (`html-entities`, `dom`, `rich-text`) must not be in the API" | Still valid; `@wordpress/blocks` is also in this category for native Node | Keep editor packages admin-only; use a pure parser/renderer server-side |
| "Adopt `block.json`, Block Bindings, Synced Patterns, style-engine" | Mostly aspirational in the reference; not implemented | Defer to Phase 5/9/10; do not claim parity |
| "Vite singleton/dedupe choreography is required" | Still valid and verified by the build | Pin, dedupe, and test a production build |
| "Scheduled publishing/undo parity work is implemented" | Aligned with the code | Reuse the ideas, not the six-column schema |

## 10. Compatibility spike (reproducible)

```bash
mkdir -p /tmp/opencode/wp-compat-20261024
cd /tmp/opencode/wp-compat-20261024
# package.json pinned to React 19.3.1 + @wordpress/* 19.0.0 set
pnpm install --strict-peer-dependencies --ignore-scripts
pnpm add -D vite@8.3.5 @vitejs/plugin-react@6.1.2 typescript@5.9.3
pnpm exec vite build
node parse-test.mjs   # official parser 6.0.0 nested group fixture
node roundtrip-test.mjs # expected to fail natively due to @wordpress/blocks JSON import
```

Observed: strict peers passed; CSS paths existed; Vite build succeeded; parser
v6 nested correctly; `@wordpress/blocks` native Node import failed with
`ERR_IMPORT_ATTRIBUTE_MISSING`. The spike is not part of the repository.

## 11. Phase 5 implementation notes (2026-10-28)

Actual code, as opposed to the design above:

| Area | Implementation |
| --- | --- |
| Package set | Pinned exact versions from §7 in `apps/admin/package.json`; React 19.3.1 single copy; Vite pre-bundles the five heavyweight entries and dedupes the direct store owners |
| Bootstrap | `apps/admin/src/editor/BlockCanvas.tsx` (lazy chunk) + `blocks.ts`; `registerCoreBlocks()` once; `window.wp` namespace shim only if absent |
| Canvas | `ShortcutProvider` → `SlotFillProvider` → `BlockEditorProvider` → custom toolbar (`Inserter`, undo/redo, list view, inspector) + `BlockTools/WritingFlow/ObserveTyping/BlockList` + `Popover.Slot` + `SnackbarList` |
| Blocks | Allowlist in `SUPPORTED_BLOCKS`; full library registered, inserter/settings filtered. No custom block types yet |
| Serialization | `apps/admin/src/editor/content.ts`: official `parse`/`serialize`; blank document normalises to `''`; external-change guard keyed on the last emitted string |
| Undo | 50-entry serialized snapshot stack in `BlockCanvas`; typing bursts coalesced at 250 ms; pre-change snapshot pushed before structural edits; Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y |
| Save/publish | `ContentEditor.tsx`: one primary action per state (Publish / Update / Save draft), flush-before-save, unchanged-draft publish skips the write, 409 conflict UI preserved |
| Media | `settings.mediaUpload` reports "Phase 6"; image blocks accept Insert from URL. No vips initialisation |
| Validation | `packages/block-system` parser adapter + `validateBlockMarkup` (2 MB / 5,000 blocks / depth 20), called in `validateDraft` before persistence |
| Tests | 15 block-system parser/limit tests, 8 admin serializer tests, 6 API validation tests, 7 editor Playwright tests; 21 E2E total |

Deviations from the design text:

- `BlockEditorKeyboardShortcuts` is not available in this release line; undo/redo
  keys are registered on the canvas root instead (see ADR 0006).
- CSS is imported from the exact `build-style/*` paths, but it is **not**
  iframe-isolated. Popovers portal to `body`; scoping is by class prefix and
  visual review, not a hard boundary.
- `@wordpress/blocks` remains admin-only. The API uses the pure parser; this was
  re-verified on Node 24 (native import still fails on JSON import attributes).
- The editor route is lazy, so the 5.98 MB chunk is not part of the dashboard,
  lists or login bundle.

## 12. Risks and open decisions

| Risk | Impact | Mitigation | Gate |
| --- | --- | --- | --- |
| Editor runtime not browser-tested | Unknown integration bugs | Playwright smoke test | Phase 5 |
| Bundle size (5.9 MB + 13.4 MB worker) | Slow admin, memory | Lazy route, chunking, block subset, no client vips | Phase 5 |
| Official parser v6 corpus failure | Broken layouts | Regression fixture, port `WP_Block_Parser` with attribution | Phase 5 |
| Default omission | Lost content | No schema defaults for persistable values; materialize; test | Phase 5 |
| Unknown block loss | Data loss | Preserve raw + inner HTML; tests | Phase 5 |
| CSS leakage | Broken admin UI | Scope WP styles; visual regression | Phase 5 |
| Package upgrades | Duplicate stores/CSS path changes | Pin, dedupe, build test, upgrade ADR | ongoing |
| Raw HTML/XSS | Security | Sanitizer, URL validation, CSP, payload tests | Phase 5/7 |
| Theme re-renders blocks | Divergence | API HTML canonical in MVP; adapters later | Phase 7/10 |

Open decisions: U-001 (exact block list after browser tests), U-002 (individual
block imports), U-003 (`@wordpress/blocks` out of API permanently). See
[DECISIONS.md](../../DECISIONS.md).

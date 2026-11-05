# Content structure lock — developer guide

The structure lock lets an agency publish a page and then let a client edit the
copy without being able to change the layout. It is enforced on the server; the
editor's guard is only a convenience.

## Data model

| Field | Where | Meaning |
| --- | --- | --- |
| `posts.structure_locked` | database | `true` while the block structure is frozen |
| `AdminPost.structureLocked` | admin API DTO | current lock state |
| `UpdatePostInput.structureLocked` | `PATCH /api/admin/posts/:id` | set/clear the lock (requires `content.edit.any`) |

## What counts as structural

`packages/block-system/src/structure.ts` builds a signature from each parsed
block: `[blockName, sortedAttributes, childSignatures]`, in document order.

- **Allowed while locked:** changing inner HTML/text, adding inline formatting,
  editing attributes? — no: attribute changes are structural. Editing an image's
  `alt` is an attribute change and is therefore blocked; the caption (inner HTML)
  is allowed.
- **Rejected while locked:** adding, removing, reordering, nesting or
  un-nesting blocks; changing any block attribute; replacing a block.
- **Unaffected:** title, slug, excerpt, SEO fields, terms, status, author,
  schedule, featured image, comments/ping settings.

## Canonicalization

Gutenberg rewrites markup when it saves: a heading's default `level: 2` is
dropped and support classes are added. The lock therefore compares the editor's
**canonical** document, not the raw stored text. `ContentEditor` flushes the
canvas when the lock changes, so locking stores the canonical serialization and
the baseline matches every later editor save. A post locked through the API with
hand-written non-canonical markup should be saved once in the editor (unlocked)
before locking, or its first editor save will look structural.

## Server contract

```http
PATCH /api/admin/posts/:id
{ "baseVersion": 4, "content": "<!-- wp:paragraph --><p>New copy</p><!-- /wp:paragraph -->" }
```

- `200` when the structure is unchanged or the post is unlocked.
- `409 STRUCTURE_LOCKED` when the post is locked and the structure changed. The
  row (including `version`) is not modified.
- `403 FORBIDDEN` when `structureLocked` is changed by a user without
  `content.edit.any`.

`POST /api/admin/posts/:id/revert/:revisionId` (revision restore) goes through
`updatePost`, so the same rules apply.

## Editor behaviour

`apps/admin/src/editor/BlockCanvas.tsx` accepts `structureLocked` and
`onStructureBlocked`:

- Hides the inserter, the bottom appender and the document overview.
- Rejects structural changes in `onChange` immediately and in the debounced
  `onInput` path for typing bursts, restoring the last allowed document and
  calling `onStructureBlocked` so the editor can explain.
- Re-freezes the baseline when the lock is switched on, so enabling it never
  marks the current document as a violation.

`ContentEditor` owns the toggle and includes it in the dirty/payload logic. Only
`administrator` and `editor` see it enabled (`canLockStructure` mirrors the
server capability).

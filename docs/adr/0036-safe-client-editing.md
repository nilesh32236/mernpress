# ADR 0036 — Safe client editing (per-post structure lock)

- Status: accepted (owner scope decision, 2026-11-05)
- Implements the "safe client editing" slice from
  `docs/research/plugin-theme-roadmap.md`

## Context

Agency users repeatedly say clients break layouts by editing "one paragraph":
inside a block editor a non-technical writer can remove a column, reorder a
group or change a heading level without noticing. WordPress has no core way to
allow copy edits while freezing structure; it is plugin territory at best.

## Decision

1. **Persistent per-post flag.** `posts.structure_locked` (boolean, default
   false) is part of the content row. It is exposed as `structureLocked` on the
   admin DTO and accepted by `PATCH /api/admin/posts/:id`.
2. **The server is authoritative.** `updatePost` compares the stored document
   with the filtered draft using `structureUnchanged`
   (`packages/block-system/src/structure.ts`): two documents are structurally
   equal when they contain the same ordered block names, the same attributes and
   the same nesting. Inner HTML/text is ignored. While locked, a structural
   change returns `409 STRUCTURE_LOCKED` and the row is not written.
3. **Only `content.edit.any` may change the lock.** Administrators and editors
   can lock/unlock; authors and contributors get `403 FORBIDDEN` if they try.
   They can still rewrite text on a locked post.
4. **Everything else still works.** Title, slug, excerpt, SEO, terms, status,
   schedule and revisions are unaffected by the lock. Restoring a revision goes
   through `updatePost`, so it is subject to the same rule.
5. **Editor convenience, not enforcement.** The block canvas receives
   `structureLocked`, hides the inserter, appender and document overview, and
   rejects structural changes it detects (reverting to the last allowed
   document and explaining why). A structural change that slips past the canvas
   still fails on save; the API never trusts the client.
6. **The lock is visible and reversible.** The editor shows a banner while
   locked and a "Safe client editing" panel with the toggle and a permission
   explanation for roles that cannot change it. Enabling the lock freezes the
   document as it is at that moment.

## Consequences

- One additive migration `20261105103105_add_post_structure_lock`.
- The lock protects structure, not wording: a client can still delete every
  paragraph's text or write misleading copy. It is not a moderation tool.
- Because attributes are compared, changing a block's settings (alignment,
  heading level, image id) counts as a structural edit while locked. That is
  deliberate: those settings change the layout.
- Unknown/freeform HTML is part of the document; changing it counts as a text
  edit only when the block sequence is unchanged. Raw HTML is still sanitized
  at render time (ADR 0007).

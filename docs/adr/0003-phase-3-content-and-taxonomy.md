# ADR 0003 — Phase 3 content model, slug service, taxonomy and internal hooks

- Status: accepted (implemented in the same slice as this ADR, per owner authorization to proceed with Phase 3)
- Date: 2026-10-27
- Deciders: repository owner (delegated to this implementation session); planning support reviewed read-only by a zero-cost model (recorded in the implementation log)
- Depends on: ADR 0002 (authentication), content-model architecture doc
- Supersedes: nothing. Amends `docs/architecture/content-model.md` §5.7 (redirect timing) and §5.6 (slug conflict response) as recorded below.

## Context

The live checkout at `36ca6d0` contains only the Phase 2 first auth slice. There is
no Phase 3 code, no `packages/contracts`, and no editor/author roles (P2-04 is
planned, not approved). The roadmap assigns Phase 3: unified posts/pages,
lifecycle, slug rules, categories/tags + assignment, admin CRUD API, published-only
public read, optimistic concurrency, seed, and tests. Public routing, rendering,
revisions and the plugin runtime are Phase 7/8/9.

Phase 2 roles are **not** implemented. Authorization for content therefore cannot
distinguish editor/author/contributor; the only principal in the database is
`administrator`. Rather than inventing fake roles, Phase 3 authorization is
administrator-only and fails closed.

## Decisions

### D-1. Unified `posts` table, scoped fields

One `posts` table for `post` and `page`, per the content-model doc. Included
columns: identity/type/status, title/slug/excerpt/content (+format/version),
author FK, SEO columns (title/description/canonical/robots/og), lifecycle
timestamps (`published_at`, `trashed_at`, `previous_status`), optimistic `version`,
and `created_at`/`updated_at` (`timestamptz(6)`, matching the existing schema).

**Deferred (documented, not silently dropped):**
- `featured_media_id` / `og_media_id` → Phase 6 (no `media` table exists; a dangling
  FK or unvalidated column would violate referential integrity).
- `rendered_html` / `render_hash` → Phase 5/7 (no server renderer yet; storing a
  cache with no producer is speculative).
- `parent_id` / `menu_order` page hierarchy → Phase 4/8 (Phase 3 scope has no
  hierarchy acceptance criteria; slug uniqueness stays per `(type, slug)`).
- `scheduled_at` + `SCHEDULED` status → Phase 8 (`SCHEDULED` without a worker is
  dead state).
- Revisions, preview, scheduled publish → Phase 8.
- `subtype`, `post_meta` → Phase 9 (plugin namespace).

### D-2. Status lifecycle

Statuses: `DRAFT`, `PUBLISHED`, `TRASHED` only. Transitions follow the content-model
state diagram minus scheduling: publish sets `published_at` only if null; unpublish
keeps `published_at`; trash stores `previous_status` and `trashed_at`; restore
returns to `previous_status` (or `DRAFT`). Repeated idempotent transitions are
no-ops that return the current row; cross-status transitions from trash to publish
are rejected. No permanent delete in Phase 3 (destructive; needs the confirmation
and audit design from the content-model doc §4 — deferred to Phase 8).

### D-3. Slug service: record history, defer redirect resolution

- Normalization: NFKC → trim → lowercase → ASCII transliteration (combining-mark
  strip) → whitespace/underscore to `-` → collapse runs → strip edge `-` → strip
  unsafe chars; cap 200 chars and 200 bytes.
- Reserved words (top-level) from the content-model doc §5.4 are rejected.
- Uniqueness is per `(type, slug)`, enforced by a **DB unique constraint** (the
  authoritative backstop). On a user-supplied duplicate the API returns **409
  `SLUG_TAKEN`**; a missing slug is derived from the title and auto-suffixed
  `-2`, `-3`, … This reconciles the content-model "append -2" rule with the roadmap
  "clear conflict **or** -2" option: explicit input gets a stable conflict;
  derived input gets the documented suffix. The 409 is the stable, testable
  conflict response the user asked for.
- **Redirect resolution is deferred to Phase 7.** The public URL grammar is not
  decided, and committing a `source_path` format now would create a pre-release
  migration risk. Instead, a published slug **change** appends an immutable
  `post_slug_history` row (`old_slug`, `changed_at`) inside the same transaction.
  Phase 7 turns that history into 301 redirects once the canonical path scheme is
  fixed. This amends content-model §5.7 ("creates a 301 redirect") → "records slug
  history; redirect is a Phase 7 dependency", and is the dependency documentation
  the Phase 3 brief explicitly allows.

### D-4. Taxonomy model

One `terms` table + one `post_terms` junction, per the content-model doc §3.6:

- `taxonomy` ∈ {`category`, `tag`}; immutable after creation (DB check constraint +
  service guard). Custom taxonomies are Phase 9 plugin work.
- Unique slug **per taxonomy**: two partial unique indexes, `(taxonomy, slug)`
  where `parent_id IS NULL` and `(taxonomy, parent_id, slug)` where not — matching
  the "unique per taxonomy (and parent for hierarchical terms)" doc while working
  around PostgreSQL NULL-inequality. Application precheck + unique violation → 409.
- Categories hierarchical (parent FK to a category; DB check enforces only
  categories have parents; tags are flat). Cycle + self-parenting prevention is a
  **service** invariant (ancestor walk, bounded) inside the write transaction —
  PostgreSQL cannot express acyclicity in a check constraint.
- Term delete is transactional and explicit: delete `post_terms` rows then the
  term, leaving posts/pages intact. Never cascades to content.
- Counts are **computed** (`groupBy`), never a stored counter that can drift.

### D-5. Authorization: administrator-only, fail closed

Only the `administrator` role exists. Every content/taxonomy route requires an
authenticated **active** administrator session plus session CSRF on mutations;
unknown or absent roles are denied. The service takes an explicit
`{ userId, role }` principal and rejects anything else. The editor/author matrix
from the roadmap acceptance criteria is **blocked on P2-04** and documented as
not-run rather than faked. Object-level auth (edit own vs any) is also P2-04.

### D-6. Internal async hook/filter contract (not a public SDK)

Groundwork for extensibility, per the brief, but **not** published as a plugin SDK
(Phase 9 owns that). Contract (informed by WordPress/Payload/Directus, not copied):

- **Filter** — returns a transformed value; awaited in series; runs in
  priority-ascending, then stable registration order; the result is **revalidated**
  before persistence. A filter may veto by throwing `HookRejectedError` (→ 400).
- **Action** — event notification; runs **only after the DB transaction commits**;
  never transforms the committed result; a rollback emits no success action. A
  failing action is contained and logged, never reported as a failed write.
- Per-instance registry created in `buildApp`; **no global mutable registry** (test
  and multi-instance isolation). `dispose()` clears it.
- Re-entrancy guard (depth cap) prevents infinite loops.
- Callbacks receive typed payloads only — never sessions, secrets, Prisma handles or
  HTTP requests.
- Not durable, not exactly-once. Delivery-critical external work needs an
  outbox/job mechanism before external plugins rely on it (recorded as a residual).

### D-7. Minimal public read is in Phase 3 scope

Roadmap P3-04 includes "public published-only endpoints", so Phase 3 ships a
minimal read-only public API: published-only list and single-by-slug, no rendering,
no caching/SEO templates, no routing. Everything else public stays Phase 7.

### D-8. Idempotent dev-only seed

`db:seed` creates representative demo content (one post, one page, categories,
tags) only when absent and safe, keyed on stable slugs; reruns do not overwrite
user edits or duplicate rows. It **refuses production** (`NODE_ENV=production`)
and never creates an administrator (bootstrap stays CLI-only).

## Alternatives considered

- **Fake editor/author roles to satisfy the role matrix** — rejected: would fabricate
  authorization that P2-04 has not approved and cannot be honestly tested.
- **`redirects` table with a provisional `source_path` format** — rejected: commits a
  public URL grammar before Phase 7 decides it; `post_slug_history` preserves the
  requirement safely.
- **Full `posts` schema including media/hierarchy/render cache** — rejected: YAGNI;
  those columns have no producer/consumer yet.
- **Global hook bus** — rejected: contaminates tests and app instances.
- **SQLite dev path** — rejected (D-002); PostgreSQL only.

## Consequences

Positive: honest authorization, forward-only schema, testable conflicts, safe
extensibility groundwork, and no pre-release public URL commitments.
Cost: roadmap acceptance #5 (editor/author role matrix) is explicitly **not run**
until P2-04; redirect is not yet HTTP-served (Phase 7); no permanent delete.

## References

- WordPress REST categories/tags (fields `slug` unique per type, `parent` on
  categories only, delete is direct/no trash): developer.wordpress.org/rest-api/reference/categories/
  and …/tags/ (accessed 2026-10-27).
- WordPress actions/filters (priority asc, same-priority registration order, filters
  must return, actions return nothing): developer.wordpress.org/plugins/hooks/ (accessed 2026-10-27).
- WordPress `sanitize_title` (accent-strip, alnum/`-`/`_`, empty→fallback): developer.wordpress.org/reference/functions/sanitize_title/ (accessed 2026-10-27).
- Payload hooks (awaited async in series; server-only; offload long work to a queue):
  payloadcms.com/docs/hooks/overview (accessed 2026-10-27).
- Directus hooks (filter before/blocking, action after; don't re-emit the same event):
  directus.com/docs/guides/extensions/api-extensions/hooks (accessed 2026-10-27).

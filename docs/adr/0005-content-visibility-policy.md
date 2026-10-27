# ADR 0005 — Content visibility policy for admin reads (pre-Phase-3-acceptance correction)

- Status: accepted (implemented in this correction before Phase 3 acceptance)
- Date: 2026-10-27
- Depends on: ADR 0003 (content model), ADR 0004 (roles/capabilities)
- Amends: ADR 0004 D-3 (the meaning of `content.read.any`)

## Context

ADR 0004 granted `content.read.any` to authors and contributors and described
object-level checks only for edit/publish/trash. The implementation of
`ContentService.getPost()` and `listAdmin()` treated `content.read.any` as
"read every state of every object", so one author could list and read another
author's private draft. That contradicts the acceptance expectation that an
author cannot read another author's draft.

## Decision

Admin content **read visibility** is governed by a single reusable policy
`canReadPost(principal, authorId, status)` in
`packages/cms-core/src/auth/capabilities.ts`:

1. Administrators and editors see every content state permitted by the lifecycle
   model.
2. The owner sees their own content in every state.
3. Any other principal holding `content.read.any` (authors, contributors) sees
   only PUBLISHED content of other authors.
4. Subscribers are denied the admin content API entirely (403 via
   `content.read.any`).
5. Hidden (non-readable) unpublished/trashed objects surface as **404**, never
   403, so existence is not leaked.
6. `listAdmin()` applies the database projection of the same policy as an AND
   condition on the query (sharing `FULL_VISIBILITY_ROLES` with `canReadPost`),
   so hidden objects are excluded from **both** result rows and the total count,
   and pagination stays consistent.
7. The public content API remains published-only; no change.

`content.read.any` is therefore redefined to mean "read published content of any
author plus one's own content in every state", not "read every state of every
object". The capability matrix in ADR 0004 D-3 is unchanged in its grant set;
only the semantics of this capability are clarified.

## Alternatives considered

- **Remove `content.read.any` from authors/contributors** — rejected: would also
  deny them published content of others, which the acceptance criteria require
  (editorial visibility of published content).
- **Return 403 for hidden objects** — rejected: leaks existence and is
  inconsistent with the public API's published-only 404.
- **Enforce visibility only in the HTTP route** — rejected: bypassable and not
  testable at the domain boundary; the policy lives in the service.
- **Per-method ad-hoc predicates** — rejected: risks subtle inconsistency;
  a single `canReadPost` is reused by `getPost` and `listAdmin`.

## Consequences

Positive: cross-author draft/trashed leakage closed; direct reads and list
counts agree; all five roles covered by regression tests. Cost: a slightly
broader definition of `content.read.any` to document; no schema or migration
change. Existing tests that assumed cross-author draft visibility are replaced,
not weakened.

Residual: object-level read visibility is enforced on read endpoints (`getPost`,
`listAdmin`). Mutating endpoints (`updatePost`, `assignTerms`, transitions) still
return 403 for unauthorized objects rather than 404, so an authenticated
principal can distinguish a hidden object's existence from a nonexistent id on
those paths. This is recorded as a residual risk; closing it (404 on all
hidden-object requests) is deferred because it would change the established
role x operation matrix error codes and is not required by the current
acceptance criteria.

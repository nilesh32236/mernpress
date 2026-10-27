# ADR 0004 — Roles, capabilities and object-level content authorization (P2-04)

- Status: accepted (implemented in the same slice as this ADR, under the owner's
  reconciliation instruction to resolve the P2-04 dependency before Phase 3
  acceptance)
- Date: 2026-10-27
- Depends on: ADR 0002 (authentication), ADR 0003 (Phase 3 content, whose D-5
  documented administrator-only authorization as a P2-04 blocker)
- Supersedes: the "administrator-only" stopgap in ADR 0003 D-5 (that state is now
  resolved, not deferred).

## Context

Phase 3 shipped with administrator-only authorization because the only role in the
database was `administrator`. The roadmap Phase 2 scope and the Phase 3 acceptance
criteria both require a role × capability matrix: an editor can manage content, an
author manages their own, and unauthorized roles are rejected server-side. The
owner's reconciliation instruction requires this dependency to be resolved (not
left as a documented gap) before Phase 3 acceptance.

## Decisions

### D-1. Five roles, stored as an enum

`UserRole` gains `editor`, `author`, `contributor`, `subscriber` alongside
`administrator` (additive migration). The enum is the authoritative role set.
Adding a role later still requires a migration (acceptable; roles change rarely).

### D-2. Capability map lives in code, not a roles table

Capabilities are a **code-level registry** in `packages/cms-core`
(`auth/capabilities.ts`): a typed map from role to a set of capability strings.
This follows KISS/YAGNI and the code-standards rule that a table needs a real
consumer. The content-model §3.2 `roles`/`role_capabilities` **tables** are the
Phase 9 extension point for plugin-registered roles/custom roles; building them
now would be speculative. The capability *semantics* (edit own vs edit any,
publish, manage taxonomy, manage users) are identical to the table design, so the
later migration is data, not behavior.

### D-3. Capability names and role × capability matrix

Capabilities (object-level checks live in the service, not the route):

| Capability | administrator | editor | author | contributor | subscriber |
| --- | :-: | :-: | :-: | :-: | :-: |
| `user.manage` | ✓ | — | — | — | — |
| `taxonomy.manage` | ✓ | ✓ | — | — | — |
| `taxonomy.assign` | ✓ | ✓ | ✓ | ✓ | — |
| `content.create` | ✓ | ✓ | ✓ | ✓ | — |
| `content.read.any` | ✓ | ✓ | ✓ | ✓ | — |
| `content.edit.any` | ✓ | ✓ | — | — | — |
| `content.edit.own` | ✓ | ✓ | ✓ | ✓ (own drafts only) | — |
| `content.publish.own` | ✓ | ✓ | ✓ | — | — |
| `content.publish.any` | ✓ | ✓ | — | — | — |
| `content.trash.any` | ✓ | ✓ | — | — | — |
| `content.trash.own` | ✓ | ✓ | ✓ | — | — |

Rules enforced server-side:

- **subscriber** — no capabilities; every admin content/taxonomy endpoint → 403.
- **contributor** — can create drafts and edit **only their own drafts**. Cannot
  publish, trash, restore, or edit others' content or their own published/trashed
  content. Can assign existing terms to content they may edit.
- **author** — full lifecycle (create/edit/publish/unpublish/trash/restore) on
  **their own** content only. Cannot manage taxonomy; can assign existing terms.
- **editor** — full lifecycle on **any** content + manage taxonomy. Cannot manage
  users.
- **administrator** — everything.

### D-4. Ownership check is in the domain service

`requireCapability(principal, capability)` and an ownership predicate
(`post.authorId === principal.userId`) are evaluated inside the content/taxonomy
service. The route only authenticates and passes the principal; it never decides
permission. This keeps object-level authorization testable and impossible to
bypass by hiding UI controls.

### D-5. Principal carries role + id from the session

The HTTP guard authenticates the session and builds
`{ userId, role }` from the validated session user. Fail closed: an unknown role
or missing session is denied. Disabled users are already rejected by
`validateSession` (Phase 2).

## Alternatives considered

- **Roles + `role_capabilities` tables now** — rejected for MVP as speculative
  (no plugin/custom-role consumer yet); documented as the Phase 9 extension.
- **Route-level permission checks** — rejected: duplicates logic across routes and
  is easy to bypass; checks belong in the service.
- **Only administrator/editor/author (drop contributor/subscriber)** — rejected:
  the acceptance criteria and the WordPress model both include the limited
  contributor and the no-access subscriber; excluding them would not prove the
  fail-closed matrix.

## Consequences

Positive: the Phase 3 role × operation matrix can now be tested honestly;
object-level ownership is server-enforced; the path to plugin-registered roles is
documented. Cost: an additive enum migration; the `roles` table remains a Phase 9
deferred item (tracked).

## References

- Content-model §3.2 target design (roles/role_capabilities) — `docs/architecture/content-model.md`.
- Roadmap Phase 2 acceptance #4 and Phase 3 acceptance #5 — `docs/roadmap/roadmap.md`.
- ADR 0003 D-5 (the superseded stopgap).
- ADR 0005 (content visibility policy; amends the meaning of `content.read.any` in D-3).

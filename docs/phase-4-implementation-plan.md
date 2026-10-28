# Phase 4 implementation plan — Admin content UX

- Status: implementation complete and verified locally (2026-10-27); uncommitted, not CI-verified
- Depends on: accepted Phase 3 baseline (`46bd5c1`), CI-green
- Scope: P4-01 through P4-05 plus real dashboard counts (P4-06)
- Out of scope: Phase 5 Gutenberg, Phase 6 media, Phase 7 public rendering,
  Phase 8 revisions/autosave/preview/scheduling, Phase 9 plugins, Phase 10 themes,
  P2-05 user administration

## Goal

Deliver an accessible, responsive, role-aware MERNPress admin interface through
which an authorized user can discover, create, edit, filter, publish, unpublish,
trash and restore content using the existing Phase 3 API, with real status counts,
reliable feedback, robust error handling and independently reviewed automated
verification.

## Acceptance criteria

1. **P4-01 shell.** Authenticated users get a stable application frame with a
   header, primary navigation for implemented destinations only, an active route
   state, a working skip link, a clear signed-in identity, sign-out, responsive
   desktop/tablet/mobile layout, visible focus and accessible loading/session-error
   states. Login/logout/session/CSRF behavior is preserved.
2. **P4-02 lists.** Posts and pages have separate list routes using the real
   `/api/admin/posts` endpoint, with search, status filters, server pagination,
   status badges, timestamps, empty/loading/error/retry states, and role-aware
   per-row lifecycle actions. Hidden content obeys the Phase 3 visibility policy.
   Bulk multi-item operations are deferred because the API has no bulk endpoint;
   no fake bulk control is shown.
3. **P4-03 forms.** Create and edit forms use only API-supported fields: title,
   slug, excerpt, content, status transitions and existing category/tag assignment.
   Author and publication date are read-only; media is not present. Forms use the
   optimistic `version`, prevent double submission, show server field errors, warn
   on unsaved navigation, and surface stale-version conflicts without overwriting.
4. **P4-04 feedback.** Success/error notices are accessible (`status`/`alert`),
   distinguish validation, permission, missing, network and version-conflict
   failures, disable controls in flight, and never show raw internals or claim
   success for a failed write.
5. **Dashboard (P4-06).** Real counts for posts/pages by status are fetched with
   `perPage=1` from the existing list endpoint and respect server visibility.
   Loading/error states are explicit; inaccessible data is not shown as zero.
6. **P4-05 accessibility.** Keyboard-only workflows, visible focus, landmarks,
   heading hierarchy, labels, `aria-current`, accessible notices, responsive
   layouts, and a documented manual keyboard/viewport walkthrough.
7. **Verification.** Unit/component tests, API client tests, Playwright content
   workflows (create/edit/publish/unpublish/trash/restore, filters, pagination,
   conflict, role visibility, narrow viewport, keyboard, console errors), full
   local gates, and independent read-only reviews with no unresolved
   critical/high/medium findings.

## Dependencies and API contract

- `GET/POST /api/admin/posts`, `GET/PATCH /api/admin/posts/:id`.
- `POST /api/admin/posts/:id/{publish,unpublish,trash,restore}` with `baseVersion`.
- `PUT /api/admin/posts/:id/terms` with `baseVersion` plus category/tag ids (stale version → 409).
- `GET /api/admin/terms?taxonomy=category|tag&perPage=100`.
- `GET /api/auth/session`, `GET /api/auth/csrf`, `POST /api/auth/login`,
  `POST /api/auth/logout`.
- CSRF cookie `mernpress_csrf` is read for mutations; the HttpOnly session token is
  never read or stored by JavaScript.
- Author reassignment, publication-date editing, scheduled publishing, media and
  featured images are not supported by the Phase 3 API and are not exposed.

## Test coverage

- API client: relative URLs, credentials, CSRF header, query serialization,
  validation-detail parsing, error mapping.
- Router/shell: route parsing, active nav, skip link, session loading/error,
  subscriber no-content state.
- Dashboard: six real count requests, loading/error/retry, no false zeros.
- Lists: search/status/page query mapping, rows, pagination bounds, empty/error,
  role-aware actions, per-row lifecycle success/failure.
- Forms: create/edit payloads, version handling, terms, field errors, double-submit
  prevention, stale conflict, unsaved-change guard, lifecycle controls.
- Playwright: login as editor, dashboard counts, create draft, search/filter,
  edit, publish, unpublish, trash, restore, conflict recovery, keyboard-only flow,
  narrow viewport, no unexpected console errors.

## Risk register

| Risk | Mitigation |
| --- | --- |
| UI assumes permissions the server denies | Server remains authoritative; `canEdit` mirrors documented capabilities; tests cover 403/404. |
| Hidden content leaks through counts/lists | Use server-filtered list endpoints and totals; no client-side count of all rows. |
| Stale version overwrites newer content | Send `baseVersion`; on 409 show conflict and require reload, never auto-retry. |
| Unsaved edits lost on navigation | `beforeunload` plus internal navigation guard. |
| Terms assignment partially fails after content save | Report content saved + term failure separately; allow retry without false success. |
| Bulk actions create partial success ambiguity | Bulk UI deferred; per-row actions report individually. |
| Mobile table overflow | Scroll container + responsive card/stack layout. |
| Fake fields (author/date/media) | Explicitly read-only/absent; documented in plan and UI. |

## Completion checklist

- [x] P4-01 shell and navigation
- [x] P4-02 posts/pages lists
- [x] P4-03 create/edit forms
- [x] P4-04 notices/feedback
- [x] P4-05 accessibility pass
- [x] P4-06 dashboard counts
- [x] Unit/component tests
- [x] Playwright content workflows
- [x] Full local gates green
- [x] Independent read-only reviews complete; all medium findings fixed or documented
- [x] Documentation/backlog reconciled
- [x] No Phase 5 work

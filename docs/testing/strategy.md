# Testing strategy

Status: Phase 0 baseline. The tests are implemented phase by phase; this document
defines what "verified" means before a slice can be called done.

## 1. Principles

- Test behaviour and contracts, not implementation details.
- Every bug fix gets a regression test.
- Authorization and content-integrity tests are non-negotiable.
- A green build is not a substitute for a manual acceptance walkthrough.
- No hidden skips. A skipped test is reported with a reason and an owner.
- Tests must be deterministic and runnable locally without paid services.
- Do not chase a coverage percentage; cover critical paths and failure modes.

## 2. Test layers

| Layer | Tool | What it proves | Speed |
| --- | --- | --- | --- |
| Unit | Vitest 5.0.5 | Pure rules: slugs, capabilities, validation, sanitizer, renderers, serialization helpers | Fast |
| Integration (API + DB) | Vitest + PostgreSQL | Repositories, migrations, transactions, route auth, session flow, pagination, conflicts | Medium |
| Component | Vitest + Testing Library 16.3.3 + jsdom 30.1.3 | Form behavior, notices, focus, small UI contracts | Medium |
| Browser/E2E | Playwright 1.64.1 | Real editor load/save, login, publish, media, public render, a11y smoke | Slow |
| Static | TypeScript, ESLint, dependency audit | Types, lint, a11y rules, vulnerable deps | Fast |
| Manual | Checklist | Usability, visual quality, ambiguous UX | Human |

Test pyramid: many unit/integration tests, a focused set of E2E flows, a short
manual checklist. Do not E2E every validation branch.

## 3. Environments and data

### Unit

- No database, no network, no real filesystem.
- Use in-memory fixtures and fake clocks (`vi.useFakeTimers`) for date/schedule
  logic.
- Renderer tests use fixed inputs and normalized volatile IDs.

### Integration

- A dedicated PostgreSQL database (e.g. `mernpress_test`) created by CI/local
  setup. Never point tests at a development or production database.
- Apply migrations with `prisma migrate deploy` before the suite.
- Prefer a transaction-per-test rollback where the code under test does not manage
  its own transactions; otherwise truncate tables in a deterministic order.
- Run DB tests serially per database or use separate schemas/databases per worker.
  Do not let parallel workers race on the same rows.
- Seed only the data a test needs; factories/builders over giant fixtures.

### E2E

- A dedicated test database seeded by a script; a fresh run should be repeatable.
- Start API + admin + web on test ports; use a temporary media directory.
- Use a test admin/editor/author account with known credentials from the test
  environment, not real secrets.
- Clean up uploaded files and database rows after the run.
- No external network calls. Stub optional services.

### Fixtures

- Block fixtures: small, named, checked-in files with expected output.
- WordPress-generated fixtures are allowed; record the WordPress version and how
  they were generated.
- Reference CMS content can be copied as **test data** only after stripping PII
  and site-specific secrets; do not copy source code.
- No real customer data, emails, tokens or passwords in fixtures.

## 4. Unit tests

Required areas:

- Slug normalization/uniqueness/reserved words.
- Capability evaluation (role, ownership, status, object).
- Status transition table (allowed/denied).
- Validation schemas (boundaries, unknown keys, coercion).
- Sanitizer allowlist and URL validation.
- Block attribute defaults/materialization.
- Parser edge cases (see §6).
- Renderer per block (golden).
- Cache tag computation and revalidation allow-list.
- Pagination bounds and sort allow-list.
- Password/session helpers (hashing is integration-level if it uses native argon2).

## 5. Integration/API tests

For every route group:

- Happy path with a valid session and capability.
- Unauthenticated → 401.
- Wrong role → 403.
- Wrong object (author editing another author's content) → 403/404 per policy.
- Invalid body/query → 400 with a stable error code.
- Not found → 404.
- Conflict (stale version/slug) → 409.
- Rate limit (auth/upload) → 429.
- Pagination: default, max, invalid cursor/page, stable ordering.
- Transaction rollback: a failed term update does not leave partial content.
- Error envelope: no stack traces/secrets in production mode.

Auth/session:

- Login success/failure, suspended user, unknown user (same generic message).
- Cookie flags (HttpOnly, Secure in prod, SameSite, path, expiry).
- Session expiry/revocation; logout; logout-all.
- CSRF missing/invalid/valid.
- Rate limit/backoff.
- Password reset token (Phase 2/next): single-use, expiry, no enumeration.

Database:

- Migrations from empty and from the previous schema snapshot.
- Unique constraints (slug, term, email).
- FK behavior (author/media set null; revisions cascade).
- UTC/timezone behavior around scheduled boundaries.
- `FOR UPDATE SKIP LOCKED` worker claim (Phase 8): two workers do not double-publish.

## 6. Serialization and renderer tests

### Parser

- Nested `group → columns → column → paragraph`.
- Void blocks (`<!-- wp:separator /-->`).
- Freeform HTML segments.
- Unknown block with inner blocks.
- Malformed JSON attributes, unclosed block, mismatched closer.
- Quoted/unicode/escaped attributes.
- Depth and size limits (reject/truncate safely).
- WordPress-generated fixtures; record version.

### Round trip

- Admin: `parse(serialize(parse(content)))` semantic equality for every supported
  block.
- API: parser output matches the expected tree; renderer output is stable.
- Defaults: a value equal to a schema default still persists when chosen; a
  missing value materializes correctly.
- Unknown blocks survive save/load and render as safe inner HTML.
- Attribute order/whitespace differences are tolerated; assert semantics, not
  byte equality unless the block guarantees it.

### Golden HTML

- One snapshot per block, bare and with meaningful attributes.
- Normalize volatile IDs (`mouseSpotlight-\d+` → `mouseSpotlight-N`), timestamps
  and generated class suffixes.
- Review snapshot diffs like code; do not blindly update.
- Include a nested composition fixture (columns/group/buttons).

### Security

- `<script>`, `<img onerror>`, `<svg onload>`, `javascript:`/`data:` URLs,
  malformed tags, encoded payloads, attribute injection.
- Raw HTML block is disabled in MVP; test that it is rejected/not registered.
- Sanitizer allowlist does not accidentally allow `style`/`on*`.

## 7. Browser/E2E flows

Minimum MVP suite:

Phase 5 status: login/logout, editor create/reload/publish, unknown-block
preservation, conflict, status tabs, terms and 375 px editor layout are covered
by 19 Playwright tests (`tests/e2e/`). Media, public render, nested columns and
axe-core remain pending with their phases.

1. **Login:** valid login, invalid login, logout, protected route redirect.
2. **Content:** create a page, add each supported block, save, reload, publish,
   view public, unpublish, verify 404.
3. **Nested layout:** columns/group/buttons survive save/reload.
4. **Unknown block:** load a fixture, save, verify it is still present.
5. **Media:** upload a valid image, insert it, set featured, reload, public render.
6. **Validation:** empty title, duplicate slug, oversized content; clear error.
7. **Conflict:** two tabs edit the same content; stale save returns a conflict and
   does not overwrite.
8. **Permissions:** author cannot open another author's edit URL; editor can.
9. **Accessibility smoke:** keyboard tab order, focus visible, dialog focus trap,
   axe scan on login/list/editor/public page.
10. **No console errors** and no duplicate WordPress store warnings.

E2E rules:

- Use role/label selectors, not brittle CSS.
- Wait for network/UI states, not arbitrary sleeps.
- Each test creates its own data or uses a unique prefix.
- Capture a trace/screenshot on failure in CI.
- Keep the suite fast enough to run on every PR; tag slower tests.

## 8. Security testing

| Area | Tests |
| --- | --- |
| AuthN | session fixation, expiry, revocation, cookie flags, generic errors |
| AuthZ | role/object matrix for every mutating route; IDOR attempts |
| CSRF | missing/invalid/valid token; cross-origin request |
| Rate limit | login, upload, public form-like endpoints |
| Upload | spoofed MIME, double extension, path traversal, oversized, zip bomb-ish, SVG rejection |
| XSS | block content, media metadata, SEO fields, settings |
| SQL injection | raw query paths, sort/filter allow-lists |
| SSRF | no arbitrary fetch in MVP; if added, private IP/metadata blocking |
| Secrets | logs, error responses, fixtures, git diff |
| Dependencies | `pnpm audit`/advisory check in CI; no high severity unresolved |

Security tests should be automated where possible; exploratory review is still
required. A passing test suite is not a penetration test.

## 9. Accessibility testing

- Automated: axe-core in Playwright for login, content list, editor, public page.
  Fail on serious/critical violations; review moderate.
- Manual keyboard: login, create/publish, open inserter/inspector, media modal,
  close dialogs, skip link.
- Screen reader smoke (one browser/one reader) for the publish flow; record the
  environment.
- Visual: focus visible, contrast, zoom 200%, reduced motion, responsive at
  tablet/mobile.
- Content: heading order, alt text, link text, form labels/errors.
- Accessibility is an acceptance criterion, not a post-MVP polish item.

## 10. Performance testing

- Editor bundle budget: record main JS/CSS and worker sizes; lazy-load the editor;
  fail the phase if the budget is exceeded without an ADR.
- Public page: Lighthouse (local production build) for performance/SEO/
  accessibility; treat scores as signals, not hard guarantees. Target: no
  egregious regressions; a11y ≥ 90, performance ≥ 80 on a sample page.
- API: measure p95 for list/detail under a seeded dataset; avoid N+1 queries.
- Media: verify image derivatives and no unbounded memory use.
- Database: inspect query plans for list/search; add indexes for measured slow
  queries, not speculative ones.

## 11. Migration testing

- Empty database: `migrate deploy` + seed → app starts, health OK.
- Previous schema: restore a snapshot, `migrate deploy`, verify data and app.
- Plugin migrations (Phase 9): fresh, already-applied, failed, checksum mismatch,
  concurrent activation (advisory lock).
- Destructive migration: backup + restore drill documented; no automatic drop.
- Timezone: scheduled boundary tests around UTC/local midnight.

## 12. CI pipeline

Recommended stages:

1. Install with a frozen lockfile (Node 24, pnpm 12).
2. Lint + format check.
3. Typecheck.
4. Unit tests.
5. Start PostgreSQL service; `migrate deploy`; integration tests.
6. Build API/admin/web.
7. Playwright (install browsers, run against built apps or dev servers).
8. Dependency audit (non-blocking for moderate; blocking for high/critical with a
   documented exception).
9. Upload traces/screenshots on failure.

CI must not require paid services or secrets beyond a test database. Keep the
pipeline under a reasonable time; split E2E into a separate job if needed.

## 13. Manual test protocol

For every feature slice:

1. Follow the README from a clean state (or a documented reset).
2. Execute the slice's manual steps, including at least one failure path.
3. Test with a non-admin role where relevant.
4. Check the browser console/network for errors.
5. Check keyboard/focus for new UI.
6. Record exact commands, environment, results and screenshots/notes.
7. Report known limitations and skipped checks.

The owner then tests independently before approving the next slice.

## 14. Flaky tests and quarantine

- A flaky test is a bug. Fix it or quarantine it with an issue, owner and expiry;
  do not normalize retries.
- Prefer deterministic clocks, explicit waits and isolated data.
- Do not disable a security test to make CI green.

## 15. What not to test

- Framework internals (Fastify routing, Next rendering, Prisma SQL generation)
  unless a project-specific contract depends on them.
- Exact HTML for third-party WordPress components; test our wrapper and the
  serialized content instead.
- Snapshot every page; snapshots are for stable renderer output, not layout churn.
- Implementation details that make refactoring expensive.

## 16. Phase gates

| Phase | Required evidence |
| --- | --- |
| 1 | lint/typecheck/unit/build, health/ready, clean-clone |
| 2 | Auth slice: bootstrap/generic failures/session hashes/expiry/cookie flags/CSRF/Origin/rate-limit/request-ID/log-redaction tests + browser login/keyboard; roles/object authz deferred to P2-04 |
| 3 | content lifecycle, slug/conflict, API auth matrix |
| 4 | admin E2E create/publish, keyboard/axe |
| 5 | block round-trip/golden/XSS, editor E2E, bundle budget |
| 6 | upload MIME/traversal/permission tests, image derivatives |
| 7 | public render/SEO/404/cache, a11y/performance smoke |
| 8 | autosave/conflict, revisions restore, preview expiry, scheduler concurrency |
| 9 | plugin lifecycle/migration/hook/conflict tests, security review |
| 10 | two themes render same content, fallback, a11y |

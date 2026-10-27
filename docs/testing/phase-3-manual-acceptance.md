# Phase 3 manual acceptance — core content model and API

**Status: Phase 3 was explicitly accepted by the owner on 2026-10-27.** The guide
is retained as the evidence record and reproducible acceptance procedure. This
guide covers the entire Phase 3 surface at once (per the owner's instruction, the
phase is tested as a whole, not slice-by-slice). Phase 1 is **approved** (per the
AGENTS.md §1 approval record). The Phase 2 auth slice remains **not**
owner-accepted; Phase 3 acceptance does not accept Phase 2.

Phase 3 was implemented from a clean Phase 2 base. Scoped per
[ADR 0003](../adr/0003-phase-3-content-and-taxonomy.md). Read that ADR first for
the decisions this guide verifies.

---

## 1. What Phase 3 delivers (and what it deliberately does not)

Delivered:

- Unified `posts` table (post/page) with statuses `DRAFT`/`PUBLISHED`/`TRASHED`,
  author, dates, slug, excerpt, SEO fields, optimistic `version`.
- `post_slug_history` table (records published slug changes; redirect
  **resolution** is Phase 7).
- `terms` + `post_terms` tables: categories (hierarchical) and tags (flat).
- Admin API: content CRUD/list/search/pagination/transitions, term CRUD, term
  assignment. Public API: published-only list + single-by-slug.
- Five roles and the code capability map (P2-04, ADR 0004), with object-level
  server-side authorization. Cross-author read visibility: authors/contributors
  cannot read another author's draft or trashed content; list rows and totals use
  the same predicate (ADR 0005).
- Internal async hook/filter contract (not a public plugin SDK), including the
  action-recursion depth fix.
- A distinct `auth.manual_test_account.created` audit event for the
  development-only role-account CLI.
- Idempotent, dev-only demo seed.
- **225 automated tests** (214 API, 10 admin, 1 web) plus 7 Playwright tests and a
  live HTTP smoke pass — all green locally. The correction set is uncommitted and
  is not claimed as CI-verified.

Deliberately NOT in Phase 3 (do not test for these):

- An admin **user-management** UI/API (P2-05) — roles exist in the DB and the
  capability matrix is enforced, but there is no admin screen/endpoint to create
  or edit users yet. Tests create users directly; the owner can create manual-test
  role accounts with the development-only CLI described in §8.
- Media, featured image, page hierarchy, render cache, scheduled publishing,
  revisions, permanent delete, redirects served over HTTP (all Phase 5–8).
- The public website renderer, themes, caching (Phase 7).
- A public plugin runtime/SDK (Phase 9).

---

## 2. Prerequisites

```bash
cd /srv/mernpress
pnpm install --frozen-lockfile
# If .env does not exist yet: cp .env.example .env, then fill DATABASE_URL,
# TEST_DATABASE_URL, CORS_ORIGINS and AUTH_HASH_PEPPER. Do not overwrite an
# existing .env with real local secrets.
pnpm db:generate       # generate the Prisma client
pnpm db:migrate        # apply all 4 migrations (no seed)
```

`pnpm setup` is the one-command alternative, but it also runs the demo seed. If
you use it, the first `pnpm db:seed` in §10 will already be an idempotent no-op
(“Demo content already present”); that is expected. The granular commands above
keep the seed step separate so §10 can observe the first creation.

Verify the migrations are applied:

```bash
pnpm db:migrate        # applies any pending migration; exits after a connectivity check
```

Start the stack:

```bash
pnpm dev               # api:4000 admin:5173 web:3000
```

Create the first administrator (interactive, never logged):

```bash
pnpm auth:bootstrap    # prompts for username + password
```

---

## 3. Sign in and capture credentials for API calls

All admin content/taxonomy calls need a session cookie + the session CSRF token.

```bash
# 1. Pre-auth CSRF token
curl -si http://127.0.0.1:4000/api/auth/csrf
#   -> body {"csrfToken":"<PRE>"} and a Set-Cookie for mernpress_csrf_preauth

# 2. Login (send the pre-auth cookie + token). Replace USER/PASS.
curl -si -X POST http://127.0.0.1:4000/api/auth/login \
  -H 'content-type: application/json' \
  -H 'origin: http://127.0.0.1:5173' \
  -H 'x-csrf-token: <PRE>' \
  -H 'cookie: mernpress_csrf_preauth=<PRE_COOKIE_VALUE>' \
  -d '{"username":"<USER>","password":"<PASS>"}'
#   -> 200 {"user":{...},"csrfToken":"<CSRF>"} and Set-Cookie for
#      mernpress_session + mernpress_csrf
```

For the rest of the guide, set (no secrets are stored in this doc):

```bash
COOKIES='mernpress_session=<SESSION>; mernpress_csrf=<CSRF_COOKIE_VALUE>'
AUTH=(-H "cookie: $COOKIES" -H "x-csrf-token: <CSRF>" -H 'origin: http://127.0.0.1:5173' -H 'content-type: application/json')
READ=(-H "cookie: $COOKIES")
```

---

## 4. Content lifecycle

```bash
# Create a post (201) and a page (201). Note the returned id/version.
curl -s -X POST http://127.0.0.1:4000/api/admin/posts "${AUTH[@]}" \
  -d '{"type":"post","title":"Hello World"}'
curl -s -X POST http://127.0.0.1:4000/api/admin/posts "${AUTH[@]}" \
  -d '{"type":"page","title":"About"}'

# Read it back (200). List (200) with filters + pagination.
curl -s http://127.0.0.1:4000/api/admin/posts/<ID> "${READ[@]}"
curl -s 'http://127.0.0.1:4000/api/admin/posts?type=post&status=DRAFT&search=hello&page=1&perPage=10' "${READ[@]}"

# Publish (200): status PUBLISHED, publishedAt set, version bumps.
curl -s -X POST http://127.0.0.1:4000/api/admin/posts/<ID>/publish "${AUTH[@]}" -d '{"baseVersion":1}'

# Publish again (idempotent): same version, same publishedAt.
curl -s -X POST http://127.0.0.1:4000/api/admin/posts/<ID>/publish "${AUTH[@]}" -d '{"baseVersion":2}'

# Unpublish (200): DRAFT, publishedAt preserved. Re-publish: publishedAt unchanged.
curl -s -X POST http://127.0.0.1:4000/api/admin/posts/<ID>/unpublish "${AUTH[@]}" -d '{"baseVersion":3}'
curl -s -X POST http://127.0.0.1:4000/api/admin/posts/<ID>/publish "${AUTH[@]}" -d '{"baseVersion":4}'

# Trash (200): TRASHED, previousStatus set. Restore (200): returns to previous status.
curl -s -X POST http://127.0.0.1:4000/api/admin/posts/<ID>/trash "${AUTH[@]}" -d '{"baseVersion":5}'
curl -s -X POST http://127.0.0.1:4000/api/admin/posts/<ID>/restore "${AUTH[@]}" -d '{"baseVersion":6}'
```

Expected failure modes:

```bash
# Stale version -> 409 VERSION_CONFLICT
curl -s -X POST http://127.0.0.1:4000/api/admin/posts/<ID>/publish "${AUTH[@]}" -d '{"baseVersion":1}'

# Publish a trashed post -> 409 INVALID_TRANSITION
# (trash first, then attempt publish)

# Mass assignment -> 400 VALIDATION_ERROR (id/authorId/status/publishedAt/version are rejected)
curl -s -X POST http://127.0.0.1:4000/api/admin/posts "${AUTH[@]}" \
  -d '{"type":"post","title":"X","status":"PUBLISHED"}'

# Oversized content (2,000,001 chars) -> 400 VALIDATION_ERROR

# Unknown field -> 400 VALIDATION_ERROR
curl -s -X POST http://127.0.0.1:4000/api/admin/posts "${AUTH[@]}" \
  -d '{"type":"post","title":"X","nope":1}'
```

---

## 5. Slug behavior

```bash
# Unicode/accents derive a clean slug: "Café Über Alles!" -> "cafe-uber-alles"
curl -s -X POST http://127.0.0.1:4000/api/admin/posts "${AUTH[@]}" -d '{"type":"post","title":"Café Über Alles!"}'

# Duplicate explicit slug same type -> 409 SLUG_TAKEN
curl -s -X POST http://127.0.0.1:4000/api/admin/posts "${AUTH[@]}" -d '{"type":"post","title":"A","slug":"dupe"}'
curl -s -X POST http://127.0.0.1:4000/api/admin/posts "${AUTH[@]}" -d '{"type":"post","title":"B","slug":"dupe"}'

# Same slug different type -> 201 (type-scoped uniqueness)
curl -s -X POST http://127.0.0.1:4000/api/admin/posts "${AUTH[@]}" -d '{"type":"page","title":"C","slug":"dupe"}'

# Reserved word -> 409 SLUG_RESERVED
curl -s -X POST http://127.0.0.1:4000/api/admin/posts "${AUTH[@]}" -d '{"type":"post","title":"A","slug":"admin"}'

# Derived slug auto-suffixes: two posts titled "Same Title" -> same-title, same-title-2

# Slug change on a PUBLISHED post records history (redirect is Phase 7).
# Verify in the DB: SELECT * FROM post_slug_history WHERE post_id='<ID>';
```

---

## 6. Taxonomy

```bash
# Create a category and a tag (201 each). Note ids.
curl -s -X POST http://127.0.0.1:4000/api/admin/terms "${AUTH[@]}" -d '{"taxonomy":"category","name":"News"}'
curl -s -X POST http://127.0.0.1:4000/api/admin/terms "${AUTH[@]}" -d '{"taxonomy":"tag","name":"Featured"}'

# List with taxonomy filter + search (200).
curl -s 'http://127.0.0.1:4000/api/admin/terms?taxonomy=category&search=new' "${READ[@]}"

# Child category (201). Tag with parentId -> 400 TERM_PARENT_INVALID.
curl -s -X POST http://127.0.0.1:4000/api/admin/terms "${AUTH[@]}" -d '{"taxonomy":"category","name":"Child","parentId":"<CAT_ID>"}'
curl -s -X POST http://127.0.0.1:4000/api/admin/terms "${AUTH[@]}" -d '{"taxonomy":"tag","name":"X","parentId":"<CAT_ID>"}'

# Duplicate slug within one taxonomy -> 409 TERM_SLUG_TAKEN.
# Same slug as a category AND a tag -> 201 (scoped per taxonomy).

# Assign terms to a post (200): post.terms shows categories + tags.
curl -s -X PUT http://127.0.0.1:4000/api/admin/posts/<ID>/terms "${AUTH[@]}" \
  -d '{"categoryIds":["<CAT_ID>"],"tagIds":["<TAG_ID>"]}'

# Invalid term id -> 400 TERM_NOT_FOUND. Cross-taxonomy -> 400 TERM_TAXONOMY_MISMATCH.
# Duplicate ids -> 400 VALIDATION_ERROR.

# Term read shows a computed postCount.
curl -s http://127.0.0.1:4000/api/admin/terms/<CAT_ID> "${READ[@]}"

# Delete a term (200 {detachedPostCount}): the post survives with empty terms.
curl -s -X DELETE http://127.0.0.1:4000/api/admin/terms/<CAT_ID> \
  -H "cookie: $COOKIES" -H "x-csrf-token: <CSRF>" -H 'origin: http://127.0.0.1:5173'
```

Hierarchy/cycle (categories only):

```bash
# Self-parent -> 409 TERM_PARENT_CYCLE
curl -s -X PATCH http://127.0.0.1:4000/api/admin/terms/<CAT_ID> "${AUTH[@]}" -d '{"parentId":"<CAT_ID>"}'
# Indirect cycle A->B then B.parent=A -> 409 TERM_PARENT_CYCLE
```

---

## 7. Public read-only API

```bash
# Draft -> 404. Publish, then -> 200 (no authorId/version/status leaked).
curl -s 'http://127.0.0.1:4000/api/public/posts/hello-world?type=post'

# Public list (only published).
curl -s 'http://127.0.0.1:4000/api/public/posts?type=post&page=1&perPage=10'

# Type-scoped: a post slug requested as page -> 404.
curl -s 'http://127.0.0.1:4000/api/public/posts/hello-world?type=page'
```

The public API requires **no** authentication and is read-only (GET). Cache and
SEO templates are Phase 7.

---

## 8. Authorization and CSRF

```bash
# Anonymous create -> 401 UNAUTHENTICATED
curl -s -X POST http://127.0.0.1:4000/api/admin/posts \
  -H 'content-type: application/json' -H 'origin: http://127.0.0.1:5173' \
  -d '{"type":"post","title":"X"}'

# Missing CSRF on a mutation -> 403 CSRF_INVALID
curl -s -X POST http://127.0.0.1:4000/api/admin/posts \
  -H "cookie: $COOKIES" -H 'origin: http://127.0.0.1:5173' -H 'content-type: application/json' \
  -d '{"type":"post","title":"X"}'

# Non-allowlisted Origin on a mutation -> 403 ORIGIN_NOT_ALLOWED
```

### Role × capability matrix (now testable — ADR 0004)

Roles now exist (`administrator`, `editor`, `author`, `contributor`, `subscriber`).
Object-level checks are enforced **server-side** (the UI is not the boundary).
The automated suites (`apps/api/test/content/roles.test.ts`,
`visibility.test.ts`, `visibility-policy.test.ts`) prove:

- **subscriber** → create/read/taxonomy all **403**.
- **contributor** → create + edit **own drafts only**; publish/trash/edit-others/
  manage-taxonomy all **403**; cannot edit own post once published; cannot read
  another user's draft or trashed content (404).
- **author** → full lifecycle on **own** content; edit/publish/trash others'
  content **403**; cannot manage taxonomy; can assign existing terms to own content.
  Cannot read another author's draft or trashed content (404); can read others'
  published content.
- **editor** → full lifecycle on **any** content + manage taxonomy; **not**
  `user.manage`.
- **administrator** → everything.

**Known hidden-object mutation behavior (ADR 0005 residual):** individual reads
and lists return **404** for another author's hidden draft/trashed content, so
existence is not leaked on read paths. Mutating endpoints (`PATCH`, transitions,
term assignment) still return **403** for an existing but unauthorized object.
This 403-vs-404 difference is a documented residual, not a test failure; do not
treat it as a visibility regression.

### Provisioning role accounts for manual testing (development-only CLI)

There is **no admin user-management UI/API yet (P2-05, deferred)**. To exercise
the role matrix locally without hand-editing database rows, use the dedicated
**development-only, opt-in CLI**. This is a narrow manual-testing aid, **not**
user administration and **never for production**.

```bash
# First bootstrap the administrator once (interactive password prompt):
pnpm auth:bootstrap

# Create one account per non-admin role. Each prints a ONE-TIME password once.
# The CLI refuses production, requires --i-understand-dev-only, never creates an
# administrator, and never overwrites an existing account.
pnpm dev:create-test-account --i-understand-dev-only --role editor
pnpm dev:create-test-account --i-understand-dev-only --role author
pnpm dev:create-test-account --i-understand-dev-only --role contributor
pnpm dev:create-test-account --i-understand-dev-only --role subscriber
```

Each command prints a unique `dev-<role>-<suffix>` username (or pass
`--username <name>`) and a one-time password shown exactly once. Record the
password in your own notes if you need it again — it is not stored anywhere
recoverable (only its Argon2id hash is persisted). Sign in as each account via
§3, then repeat §4–§6 to confirm: a subscriber's create/read returns 403; a
contributor's publish/trash/edit-of-others returns 403 and another user's
draft/trashed read returns 404; an author's read of another user's draft/trashed
content returns 404 and their edit/publish/trash returns 403, while their own
content works end-to-end; an editor manages any content and taxonomy but not
users.

**Cleanup is optional and manual** — the tool never deletes accounts. To remove
the `dev-*` accounts after testing, use the dedicated account-cleanup pattern in
§13.1; never run a broad user delete. Nothing is automatic.

> ⚠️ Local development only. The `dev:create-test-account` CLI is refused in
> production and must never be exposed as a UI or API. P2-05 (real user
> administration) remains not implemented.

---

## 9. Hooks (internal contract)

The hook/filter registry is internal (`app.contentHooks`). It is exercised by
`apps/api/test/content/hooks.test.ts` and `hook-recursion.test.ts`: priority +
stable registration order, awaited + revalidated filters, veto → 400, actions only
after commit, contained failures, filter and action recursion limits, depth
restoration, disposal and per-application isolation. The action recursion fix is
covered by two tests that fail against the old double-decrement behavior
(restoration and repeated-invocation); the other recursion tests cover adjacent
scenarios. There is no public plugin runtime in Phase 3 (Phase 9). Nothing to run
manually; see the ADR D-6 contract.

---

## 10. Seed (idempotent, dev-only)

```bash
pnpm db:seed    # first run: creates 1 post, 1 page, 2 categories, 2 tags
pnpm db:seed    # second run: "Demo content already present; nothing created."
NODE_ENV=production pnpm db:seed   # refuses: "Refusing to seed demo content in production"
```

The seed never creates an administrator (bootstrap is CLI-only) and never
overwrites existing content (it keys on stable slugs). If you used `pnpm setup`,
which already seeds, both runs may report “Demo content already present”; that is
the idempotent behavior, not a failure. To observe the first creation, use the
granular §2 commands (which do not seed) or a clean development database.

---

## 11. Migration verification (already executed by the agent)

- There are **four** additive migrations:
  `20261024201137_phase2_auth`,
  `20261025085158_auth_hardening`,
  `20261027120000_phase3_content_taxonomy`, and
  `20261027130000_phase2_roles`.
- Fresh disposable DB (recorded during the implementation gate): all four
  migrations applied; `prisma migrate diff` → **No difference detected** (zero
  drift).
- Current dev and test databases: `prisma migrate status` reports four migrations
  and “Database schema is up to date.”
- Existing dev DB: migrations were applied additively; the dev database was never
  reset or dropped. Only read-only status/count checks were performed during the
  current verification.

---

## 12. Automated evidence (agent-executed)

| Check | Command | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | PASS |
| Lint | `pnpm lint` | PASS |
| Format | `pnpm format:check` | PASS |
| Typecheck | `pnpm typecheck` | PASS (7 tasks) |
| Unit+integration | `pnpm test` | PASS — API 214, admin 10, web 1 = **225 tests** |
| Build | `pnpm build` | PASS (5 tasks) |
| E2E | `pnpm test:e2e` | PASS — 7 Playwright tests |
| Audit | `pnpm audit --audit-level=high` | PASS |
| Migration status (dev/test) | `prisma migrate status` | 4 migrations; schema up to date |
| Migration drift | `prisma migrate diff --from-migrations ... --to-schema ... --exit-code` | No difference |
| Seed idempotency | seed twice against the isolated test DB | First creates demo content; second reports “nothing created” |
| Focused regressions | visibility, roles, hooks, audit, CLI tests | PASS — 8 files / 65 tests |
| Live HTTP smoke | content+taxonomy+public flow | PASS (recorded during Phase 3 implementation; the pre-acceptance correction set is covered by the focused automated tests above) |

Independent reviews: `amazon-bedrock/deepseek.v3.2` (Phase 3, PASS WITH ISSUES,
findings fixed); `opencode/deepseek-v4.1-flash-free#high` (correction set, PASS
WITH ISSUES, findings fixed or documented); `opencode/flint-40b-free#high`
(post-fix, PASS, no blocking/high findings). Owner spot-check of this guide
remains pending.

---

## 13. Cleanup (optional)

Cleanup is split deliberately: development test accounts and demo content are
different data sets.

### 13.1 Development-only test accounts

The CLI never deletes accounts. To remove only the `dev-*` accounts created for
this acceptance session (adjust the username pattern if you passed custom
`--username` values):

```bash
# psql or any client; never run a broad DELETE FROM users.
psql "$(grep '^DATABASE_URL=' .env | cut -d= -f2-)" -c "
DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE 'dev-%');
DELETE FROM audit_events WHERE actor_user_id IN (SELECT id FROM users WHERE username LIKE 'dev-%')
  OR target_user_id IN (SELECT id FROM users WHERE username LIKE 'dev-%');
DELETE FROM users WHERE username LIKE 'dev-%';"
```

This removes the test accounts, their sessions and their audit rows. It does not
touch the administrator or any other account.

### 13.2 Demo content (only if you ran `pnpm db:seed`)

The Phase 3 demo content is yours to keep or delete. To remove the seeded demo
rows only (never other content):

```bash
# psql or any client:
DELETE FROM post_terms WHERE post_id IN (SELECT id FROM posts WHERE slug IN ('welcome-to-mernpress','about'));
DELETE FROM posts WHERE slug IN ('welcome-to-mernpress','about');
DELETE FROM terms WHERE (taxonomy='category' AND slug IN ('news','guides')) OR (taxonomy='tag' AND slug IN ('demo','mernpress'));
```

---

## Acceptance

Phase 3 was explicitly accepted by the owner on **2026-10-27**. This guide is
retained as the evidence record and reproducible procedure. The accepted local
baseline is not yet published to GitHub. Phase 4 (admin content UX) starts only
after that baseline is committed, pushed and CI-green for the exact commit, with
explicit owner publication authorization.

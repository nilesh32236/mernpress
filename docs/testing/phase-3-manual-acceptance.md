# Phase 3 manual acceptance — core content model and API

**Status: agent-executed verification is complete and green; awaiting OWNER
manual acceptance. The owner has NOT yet run these steps.** This guide covers the
entire Phase 3 surface at once (per the owner's instruction, the phase is tested
as a whole, not slice-by-slice). Earlier phases remain separately pending:
Phase 1 and the Phase 2 auth slice are **not** owner-accepted.

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
- Internal async hook/filter contract (not a public plugin SDK).
- Idempotent, dev-only demo seed.
- 176 automated tests, E2E, live HTTP smoke — all green.

Deliberately NOT in Phase 3 (do not test for these):

- An admin **user-management** UI/API (P2-05) — roles exist in the DB and the
  capability matrix is enforced, but there is no admin screen/endpoint to create
  or edit users yet. Tests create users directly.
- Media, featured image, page hierarchy, render cache, scheduled publishing,
  revisions, permanent delete, redirects served over HTTP (all Phase 5–8).
- The public website renderer, themes, caching (Phase 7).
- A public plugin runtime/SDK (Phase 9).

---

## 2. Prerequisites

```bash
cd /srv/mernpress
pnpm install --frozen-lockfile
cp .env.example .env   # fill DATABASE_URL, TEST_DATABASE_URL, CORS_ORIGINS, AUTH_HASH_PEPPER
pnpm setup             # generate client, apply migrations (incl. Phase 3), idempotent seed
```

Verify the Phase 3 migration is applied:

```bash
pnpm db:migrate        # applies 20261027120000_phase3_content_taxonomy if pending
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
The automated suite (`apps/api/test/content/roles.test.ts`) proves:

- **subscriber** → create/read/taxonomy all **403**.
- **contributor** → create + edit **own drafts only**; publish/trash/edit-others/
  manage-taxonomy all **403**; cannot edit own post once published.
- **author** → full lifecycle on **own** content; edit/publish/trash others'
  content **403**; cannot manage taxonomy; can assign existing terms to own content.
- **editor** → full lifecycle on **any** content + manage taxonomy; **not**
  `user.manage`.
- **administrator** → everything.

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
contributor's publish/trash/edit-of-others returns 403; an author's
edit/publish/trash of another user's content returns 403 while their own content
works end-to-end; an editor manages any content and taxonomy but not users.

**Cleanup is optional and manual** — the tool never deletes accounts. To remove
the `dev-*` accounts after testing, delete those specific usernames yourself (the
guide's §13 shows the safe pattern); nothing is automatic.

> ⚠️ Local development only. The `dev:create-test-account` CLI is refused in
> production and must never be exposed as a UI or API. P2-05 (real user
> administration) remains not implemented.

---

## 9. Hooks (internal contract)

The hook/filter registry is internal (`app.contentHooks`). It is exercised by the
automated suite (`apps/api/test/content/hooks.test.ts`): priority + stable
registration order, awaited + revalidated filters, veto → 400, actions only after
commit, contained failures, re-entrancy guard, disposal, isolation. There is no
public plugin runtime in Phase 3 (Phase 9). Nothing to run manually; see the ADR
D-6 contract.

---

## 10. Seed (idempotent, dev-only)

```bash
pnpm db:seed    # first run: creates 1 post, 1 page, 2 categories, 2 tags
pnpm db:seed    # second run: "Demo content already present; nothing created."
NODE_ENV=production pnpm db:seed   # refuses: "Refusing to seed demo content in production"
```

The seed never creates an administrator (bootstrap is CLI-only) and never
overwrites existing content (it keys on stable slugs).

---

## 11. Migration verification (already executed by the agent)

- Fresh disposable DB: all 3 migrations applied; `prisma migrate diff` → **No
  difference detected** (zero drift).
- Existing dev DB (auth-only schema): `migrate deploy` applied **only** the Phase
  3 migration; the 2 auth migrations and all rows (0 users/sessions/audit) were
  preserved. The dev DB was never reset or dropped.

---

## 12. Automated evidence (agent-executed)

| Check | Command | Result |
| --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | PASS |
| Lint | `pnpm lint` | PASS |
| Format | `pnpm format:check` | PASS |
| Typecheck | `pnpm typecheck` | PASS (7 tasks) |
| Unit+integration | `pnpm test` | PASS — API 178, admin 10, web 1 = **189 tests** |
| Build | `pnpm build` | PASS (5 tasks) |
| E2E | `pnpm test:e2e` | PASS — 7 Playwright tests |
| Audit | `pnpm audit --audit-level=high` | PASS |
| Migration drift | `prisma migrate diff --exit-code` | No difference |
| Live HTTP smoke | content+taxonomy+public flow | PASS (see §4–§7) |

Independent review: `amazon-bedrock/deepseek.v3.2` (different model family from
the implementer, Kimi K3) — verdict **PASS WITH ISSUES**, no blockers; 5
medium/low findings, all fixed with regression tests; re-review pending owner
spot-check of this guide.

---

## 13. Cleanup (optional)

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

If every flow above behaves as documented, Phase 3 is accepted. Phase 3 becomes
owner-accepted **only when the owner explicitly says so**. Phase 4 (admin content
UX) must not start before that.

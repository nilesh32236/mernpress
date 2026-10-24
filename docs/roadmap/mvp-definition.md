# MVP definition

Status: Phase 0 proposal. The MVP is the first **useful** MERNPress, not a
WordPress replacement and not a demo of every architecture idea.

## 1. MVP promise

A person can install MERNPress locally, create an administrator, write and
publish a page and a post with a familiar block editor, upload and use an image,
assign categories/tags, and view the published result on a public site with
correct title/description/canonical metadata — without editing code or using a
paid service.

That is the whole promise. Everything else is deferred.

## 2. In scope

### Setup and operations

- Clean-clone install with Node 24, pnpm and PostgreSQL 18.
- `.env.example` + startup validation; no secrets committed.
- One command to migrate; idempotent seed; one command to run all apps.
- First-admin bootstrap with a safe password path.
- Health/readiness endpoints and structured logs.
- CI: lint, typecheck, unit/integration tests, build.

### Authentication and authorization

- Login/logout with an opaque session cookie (HttpOnly, Secure in production,
  SameSite).
- CSRF protection and login rate limiting.
- Roles: administrator, editor, author.
- Capability checks on every admin/API mutation, including object-level checks.
- User administration; cannot remove the last administrator.

### Content

- Posts and pages (unified content model).
- Title, slug, excerpt, content, status, author, dates, featured media.
- Draft, publish, unpublish, trash, restore.
- Unique slugs; old published slug creates a redirect.
- Categories and tags (assign/multiple).
- Content list with search, filter, pagination and bulk actions.
- Optimistic concurrency (`baseVersion`) and a clear conflict response.

### Editor

- Real Gutenberg editor using the official packages.
- 11 tested blocks: paragraph, heading, list, quote, image, buttons, columns,
  group, cover, separator, spacer.
- Load/save/reload with WordPress-compatible block markup.
- Unknown block preservation.
- Basic editor toolbar/inspector/inserter/list view; scoped WordPress styles.
- Unsaved-changes warning.
- Sanitized server rendering; XSS tests.

### Media

- Image upload (JPEG/PNG/WebP/AVIF) with size/MIME/extension checks.
- Server-side re-encode and thumbnails; EXIF stripped.
- Alt/title/caption; media library list; featured image; editor media chooser.
- No SVG, video or audio in MVP.

### Public site

- Next.js App Router public site; Node self-hosting.
- Published-only post/page routes; 404 for drafts/trash.
- Starter theme with header/footer, responsive layout and accessible markup.
- Title, description, canonical, OG/Twitter metadata.
- Sitemap and robots for published URLs.
- API-rendered HTML is the content contract.
- Cache tags/revalidation for publish/update; no caching of previews.

### Quality and security

- Unit/integration tests for domain rules and API authorization.
- Playwright tests for login, content create/publish, editor save/reload, public
  render and a media upload.
- Serialization/golden/XSS tests for the supported blocks.
- axe/keyboard checks for admin and public templates; no serious/critical
  automated violations.
- Threat model reviewed for auth, uploads and rendering.
- No known high-severity dependency vulnerability at release time.

### Documentation

- README with exact local setup and test commands.
- AGENTS.md, TASKS.md, DECISIONS.md, ADRs.
- API contract/route docs.
- Manual test script.
- Implementation log with evidence.

## 3. Out of scope (deliberately)

| Item | Why |
| --- | --- |
| Revisions/autosave | Valuable but Phase 8; the MVP can publish safely without them |
| Scheduled publishing | Phase 8; needs a worker/retry design |
| Preview links | Phase 8; drafts are not publicly previewable in MVP |
| Comments | Moderation/anti-spam is a project; not core to the first workflow |
| Menus/navigation UI | Theme config is enough for the starter theme |
| Custom post types/taxonomies | Phase 9 plugin API; core stays small |
| Plugin runtime/marketplace | Architecture documented; runtime later |
| Theme switching/visual editor | One starter theme; theme SDK later |
| Forms/leads/CRM/outreach | Business-specific; plugins later |
| E-commerce/multisite/billing | Out of product scope |
| Multilingual | Large surface; later |
| Advanced SEO/schema UI | Basic metadata only |
| Search page/FTS | Later; lists have basic filters |
| Feeds/RSS | Later |
| Backups/restore UI | Operations phase; `pg_dump` documented |
| Analytics/tag managers | Site-specific; theme/plugin |
| WordPress plugin/theme compatibility | Not a goal |
| Full WordPress block parity | Not a goal; documented subset |

## 4. Measurable definition of done

The MVP is done when all of the following are true on a clean machine (or a
fresh clone with the documented prerequisites):

1. **Setup:** a new user can follow the README, run the setup commands, and reach
   a login screen in under 15 minutes, with no manual SQL and no paid service.
2. **First run:** creating the first administrator is deterministic and safe;
   re-running the bootstrap does not create duplicates.
3. **Auth:** login/logout, wrong password, suspended user, CSRF failure, rate
   limit and wrong-role access are covered by automated tests.
4. **Content:** create a page and a post, save a draft, publish, unpublish, trash,
   restore; each transition is reflected in the admin and public API.
5. **Slugs:** duplicate slug handling and a published-slug redirect are tested.
6. **Editor:** each of the 11 blocks inserts/edits/saves/reloads; a nested
   columns/group example survives; an unknown block fixture survives; XSS payloads
   are neutralized.
7. **Media:** upload a valid image, reject a spoofed/oversized file, insert it in
   a post, set it as featured, and see it render publicly.
8. **Public:** a published post/page is visible at its URL with title,
   description, canonical and OG tags; a draft is 404; sitemap includes only
   published content.
9. **Quality:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and the
   MVP Playwright suite pass in CI; no skipped test is hidden.
10. **Accessibility:** keyboard-only create/publish flow works; axe reports no
    serious/critical issues on the tested admin/public pages.
11. **Security:** the threat-model checklist for auth/uploads/rendering is signed
    off; no known high-severity dependency advisory is unresolved.
12. **Docs:** README, API docs, manual test script and implementation log are
    current; a second person can run the manual script without asking questions.

If any item is false, the MVP is not done. "The build passes" is not enough.

## 5. Manual demo script (acceptance walkthrough)

```text
1. Clone/copy the repo; install Node 24 + pnpm + PostgreSQL 18.
2. cp .env.example .env; set DATABASE_URL and a strong local secret.
3. pnpm install && pnpm db:migrate && pnpm db:seed
4. pnpm dev
5. Open http://localhost:5173, log in as the first admin.
6. Create a page "About" with:
   - a heading, two paragraphs, a list, an image, a two-column group.
   - a featured image.
   - status Published.
7. Open the public site; verify /about renders, title/description/canonical/OG
   are present, and the image loads.
8. Create a post "Hello World" with a quote and a button; assign a category/tag;
   publish; verify /blog/hello-world.
9. Unpublish the post; verify the public URL is 404; restore/publish again.
10. Change the page slug; verify the old URL redirects.
11. Log out; verify an admin route redirects to login.
12. Run pnpm lint && pnpm typecheck && pnpm test && pnpm build; record results.
```

## 6. Why this MVP is appropriately small

- It proves the hardest integration (Gutenberg load/save/render) with a scoped
  block set instead of 90 blocks.
- It proves the content lifecycle and authorization model before adding plugins,
  revisions, scheduling or comments.
- It keeps the public site to one theme and one content contract; theme switching
  and block adapters can come later without changing stored content.
- It avoids business-specific features (forms, CRM, compliance) that would distort
  the core.
- It keeps the operational surface to one API, one web app, one database and local
  disk media. No queue, cache server, search cluster or cloud dependency.

## 7. Success signals (post-MVP)

Not required for MVP, but useful to decide what comes next:

- A non-technical tester can publish without help.
- No lost content in editor round trips.
- No authorization bypass found in review.
- The editor bundle is acceptable on a mid-range laptop.
- The public page passes basic SEO/accessibility checks.
- The setup path is reproducible on a second machine.

## 8. Failure signals (stop and fix)

- Content is silently dropped or reserialized into a different structure.
- A draft/trash item is publicly visible.
- An editor/author can mutate content they do not own.
- Upload validation can be bypassed with a spoofed MIME type.
- The editor requires a 4 GB heap or leaks duplicate store warnings.
- Setup requires undocumented manual steps.
- A "small" feature keeps growing patches instead of a clean design.

## 9. Post-MVP order

Phase 8 (revisions/autosave/preview/scheduling) → Phase 9 (plugins) → Phase 10
(themes) → Phase 11 (menus/comments/search/SEO/backups based on real use).

Do not start Phase 8+ until the MVP manual script passes and the owner approves.

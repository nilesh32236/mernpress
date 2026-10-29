# Reference CMS Feature Matrix

**Reference:** `/tmp/opencode/qrolichealth-ref/qrolichealth-cms-main` ("Qrolic Health CMS", branded in-app as "mernPress admin" / "Qrolic CMS") — Express API + React/Vite admin + shared Prisma/Postgres.
**Routes/menu source:** `apps/admin/src/App.tsx` (route table), `apps/admin/src/components/layout/WpSidebar.tsx` (sidebar `menuItems`), layout shell `apps/admin/src/components/layout/WpAdminLayout.tsx`.
**API mount map:** `apps/api/src/index.ts:122-202`.
**Admin HTTP client:** `apps/admin/src/lib/axios.ts` (baseURL `/api`, bearer access token + httpOnly refresh cookie, 401 → single-flight refresh).

Notation: "Editor routes" = full-screen routes rendered *outside* `WpAdminLayout` (no sidebar/top bar), i.e. the Gutenberg-style editor.

---

## 1. Screen inventory

### 1a. Top-level screens

| Screen | Route | Menu label | Purpose | API endpoints used | WordPress equivalent? |
|---|---|---|---|---|---|
| Login | `/login` (`App.tsx:128`, `pages/login.tsx`) | — (unauthenticated) | Email + password sign-in; mints access token + refresh cookie; redirects to dashboard. | `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout` (`routes/auth.routes.ts:43-45`) | wp-login.php (yes) |
| Dashboard | `/`, `/dashboard` (`pages/dashboard/index.tsx`) | Dashboard → Home | Widget landing page: at-a-glance counts, recent activity, quick draft, site-health summary, "Manage" links. | `GET /api/admin/posts/stats`, `/admin/pages/stats`, `/admin/media`, `/admin/categories`, `/admin/tags`, `/admin/posts`, `/admin/site-health`; `POST /api/admin/posts` (quick draft) | Dashboard (yes) |
| Posts list | `/posts` (`pages/posts/list.tsx`) | Posts → All Posts | Filterable table with status tabs ALL/PUBLISHED/DRAFT/ARCHIVED/TRASH, search, category/date filters, bulk trash, row actions (edit / preview / trash / restore / delete permanently). | `GET /api/admin/posts` (+`?trashed=true`,`?status=`,`?perPage=1`), `GET /admin/posts/stats`, `GET /admin/categories`, `GET /admin/tags`; `DELETE /admin/posts/:id`, `POST /admin/posts/:id/restore`, `DELETE /admin/posts/:id/permanent`; public preview `GET /posts/:slug?preview=1` | Posts (yes) |
| Post editor | `/posts/new`, `/posts/:id` (`pages/posts/edit.tsx`) — editor route | Posts → Add New | Full-screen block (Gutenberg) editor: title, slug/permalink, featured image, categories/tags, author, excerpt, SEO tab, revisions panel, schedule dialog, publish checklist/guard, preview-token control, title-card generation. | `GET/POST/PUT /api/admin/posts(/…:id)`, `GET /admin/categories`, `/admin/tags`, `/admin/users/directory`, `/admin/options` (default author), `GET /authors/:id`; `GET/POST /admin/posts/:id/revisions(/:revId/restore)`; `GET/POST/DELETE /admin/posts/:id/schedule(/retry|/publish-now)`; `POST/DELETE /admin/posts/:id/preview-token`; `POST/DELETE /admin/posts/:id/title-card(/preview)` | Post editor (yes) |
| Categories | `/posts/categories` (`pages/posts/categories.tsx`) | Posts → Categories | Table + inline/modal create-edit-delete of categories (name, slug, description). Mutations ADMIN-only. | `GET/POST /api/admin/categories`, `GET/PUT/DELETE /admin/categories/:id` | Categories (yes) |
| Tags | `/posts/tags` (`pages/posts/tags.tsx`) | Posts → Tags | Same CRUD pattern for tags. | `GET/POST /api/admin/tags`, `GET/PUT/DELETE /admin/tags/:id` | Tags (yes) |
| Media library | `/media` (`pages/media/index.tsx`), `/media?upload=1` for "Add New" | Media → Library / Add New | WP-style media library: grid⇄list toggle, bulk mode, search + type/date/uploader/attached filters, upload, details drawer (alt/title/copy URL/variants), replace file, delete (force flag when attached), bulk delete, alt-text warning badges. | `GET /api/admin/media`, `GET /admin/media/dates`, `POST /admin/media`, `PATCH /admin/media/:id`, `DELETE /admin/media/:id?force=true`, `POST /admin/media/bulk-delete`, `GET /admin/media/:id/usage`, `POST /admin/media/:id/replace` (`routes/media.routes.ts:74-84`) | Media Library (yes) |
| Pages list | `/pages` (`pages/pages/list.tsx` with `kind="PAGE"`) | Pages → All Pages | Same table UX as posts (status tabs incl. trash, bulk actions, scheduling column) scoped to ordinary pages. | `GET /api/admin/pages`, `POST/DELETE /admin/pages/:id/restore|/permanent`, `DELETE /admin/pages/:id`, preview `GET /pages/:slug?preview=1` | Pages (yes) |
| Page editor | `/pages/new`, `/pages/:id` (`pages/pages/edit.tsx`) — editor route | Pages → Add New | Same block editor as posts for pages (SEO tab, scheduling, preview tokens). **No revisions panel and no title-card controls** on the page editor (`admin.page.routes.ts` exposes no `/revisions`), so pages are not at full post parity. | `GET/POST/PUT /api/admin/pages(/…:id)`, schedule/preview-token endpoints (`routes/admin.page.routes.ts:11-25`) | Page editor (yes) |
| Landing pages list | `/landing-pages` (`pages/landing-pages/list.tsx`) | Landing Pages → All Landing Pages | Thin wrapper: `PagesListPage kind="LP" basePath="/landing-pages"` — Page rows discriminated by `kind`. | `GET /api/admin/pages?kind=LP` (+ trash/schedule endpoints) | No (custom post type) |
| Landing page editor | `/landing-pages/new`, `/landing-pages/:id` (`pages/landing-pages/edit.tsx`) — editor route | Landing Pages → Add New | Thin wrapper over the Pages editor with `kind="LP"`. | `POST/PUT /api/admin/pages` (+ schedule/preview endpoints) | No (CPT) |
| Compliance pages list | `/compliance` (`pages/compliance/list.tsx`) | Compliance → All Compliance Pages | Page rows with `kind="COMPLIANCE"` (policy/legal content). | `GET /api/admin/pages?kind=COMPLIANCE` | No (CPT) |
| Compliance editor | `/compliance/new`, `/compliance/:id` (`pages/compliance/edit.tsx`) — editor route | Compliance → Add New | Pages editor with `kind="COMPLIANCE"`. | `POST/PUT /api/admin/pages` | No (CPT) |
| Case studies list | `/case-studies` (`pages/case-studies/list.tsx`) | Case Studies → All Case Studies | Page rows with `kind="CASE_STUDY"`. | `GET /api/admin/pages?kind=CASE_STUDY` | No (CPT) |
| Case study editor | `/case-studies/new`, `/case-studies/:id` (`pages/case-studies/edit.tsx`) — editor route | Case Studies → Add New | Pages editor with `kind="CASE_STUDY"`. | `POST/PUT /api/admin/pages` | No (CPT) |
| Services list | `/services` (`pages/services/list.tsx`) | Services → All Services | Page rows with `kind="SERVICE"` (service detail pages). | `GET /api/admin/pages?kind=SERVICE` | No (CPT) |
| Service editor | `/services/new`, `/services/:id` (`pages/services/edit.tsx`) — editor route | Services → Add New | Pages editor with `kind="SERVICE"`. | `POST/PUT /api/admin/pages` | No (CPT) |
| Sectors list | `/sectors` (`pages/sectors/list.tsx`) | Sectors → All Sectors | Page rows with `kind="SECTOR"` (industry verticals). | `GET /api/admin/pages?kind=SECTOR` | No (CPT) |
| Sector editor | `/sectors/new`, `/sectors/:id` (`pages/sectors/edit.tsx`) — editor route | Sectors → Add New | Pages editor with `kind="SECTOR"`. | `POST/PUT /api/admin/pages` | No (CPT) |
| Scheduled dashboard | `/scheduled` (`pages/scheduled/index.tsx` → `features/content/scheduling/ScheduledDashboard.tsx`) | Scheduled → All Scheduled | Cross-type table of posts+pages with due/parked/failed schedules; retry, publish-now, cancel per row. | `GET /api/admin/schedules` (also mounted at `/api/admin/scheduled`, `index.ts:140-142`); `POST/DELETE /admin/{posts,pages}/:id/schedule(/retry|/publish-now)` (`features/content/scheduling/use-scheduling.ts:55-133`) | No direct equivalent (WP "Posts → Scheduled" views + WP-Cron management) |
| Leads inbox | `/leads` (`pages/leads.tsx`) | Leads → Inbox | Two tabs (contact leads / newsletter subscriptions) with search, status filter, pagination, CSV export (ADMIN). | `GET /api/admin/leads`, `GET /admin/leads/subscriptions`, `GET /admin/leads/export` | No (site-specific; closest = WP comments/entries) |
| Outreach dashboard | `/outreach` (`pages/outreach/index.tsx`) | Outreach → Dashboard | Campaign KPI cards (totals, sent, opened, clicked, failed) + recent campaigns list. | `GET /api/admin/outreach/stats`, `GET /admin/outreach/campaigns` | No (site-specific) |
| Outreach groups list | `/outreach/groups` (`pages/outreach/groups/index.tsx`) | Outreach → Audience Groups | Table of audience groups; create/delete group. | `GET/POST /api/admin/outreach/groups`, `DELETE /admin/outreach/groups/:id` | No |
| Outreach group detail | `/outreach/groups/:id` (`pages/outreach/groups/detail.tsx`) | Outreach → Audience Groups | Group contact table, CSV upload preview then import, per-contact status/consent edit. | `GET /admin/outreach/groups/:id`, `POST /admin/outreach/groups/preview-csv`, `POST /admin/outreach/groups/:id/import-csv`, `PATCH /admin/outreach/contacts/:id` | No |
| Outreach templates list | `/outreach/templates` (`pages/outreach/templates/index.tsx`) | Outreach → Templates | Template table with Brevo sync status, sync action, delete, test-send. | `GET /admin/outreach/templates`, `GET /admin/outreach/brevo/status`, `POST /admin/outreach/brevo/sync`, `POST /admin/outreach/templates/test-send`, `DELETE /admin/outreach/templates/:id` | No |
| Outreach template editor | `/outreach/templates/new`, `/outreach/templates/:id` (`pages/outreach/templates/editor.tsx`) | Outreach → Templates | Subject/preheader/HTML/text editor + test-send. | `GET/POST/PUT /admin/outreach/templates(/:id)`, `POST /admin/outreach/templates/test-send` | No |
| Outreach campaigns list | `/outreach/campaigns` (`pages/outreach/campaigns/index.tsx`) | Outreach → Campaigns | Campaign table with lifecycle buttons (start/pause/resume/delete). | `GET /admin/outreach/campaigns`, `POST /admin/outreach/campaigns/:id/{start,pause,resume}`, `DELETE /admin/outreach/campaigns/:id` | No |
| Outreach campaign new | `/outreach/campaigns/new` (`pages/outreach/campaigns/new.tsx`) | "New Campaign" submenu | Create form: group + template + daily limit/batch size/interval/schedule. | `GET /admin/outreach/groups`, `GET /admin/outreach/templates`, `POST /admin/outreach/campaigns` | No |
| Outreach campaign detail | `/outreach/campaigns/:id` (`pages/outreach/campaigns/detail.tsx`) | Outreach → Campaigns | Campaign metrics + editable limits + recipient table (per-recipient retry, retry-all-failed, cancel). | `GET/PUT /admin/outreach/campaigns/:id`, `POST /:id/{start,pause,resume,cancel,retry-failed}`, `POST /:id/recipients/:recipientId/retry` | No |
| Forms list | `/forms` (`pages/forms/list.tsx`) | Forms → All Forms | Form table (status, submission counts), create-draft inline card, publish/archive, search+status filter. | `GET /api/admin/forms`, `POST /admin/forms`, `POST /admin/forms/:id/{publish,archive}` | No (site-specific, WP = no core forms) |
| Form editor | `/forms/:id` (`pages/forms/edit.tsx` + `form-tabs.tsx`) | Forms → All Forms | "Form" tab: field builder (add/reorder/delete), settings (recipients, Brevo list, PDF/report), publish; header + tab bar shared with submissions. | `GET /admin/forms/:id`, `GET /admin/forms/brevo/lists`, `PUT /admin/forms/:id`, `POST /admin/forms/:id/publish`, `GET /admin/forms/:id/submissions/stats` | No |
| All submissions inbox | `/forms/submissions` (`pages/forms/submissions-index.tsx`) | Forms → All Submissions | Cross-form submissions table with status/form/page-slug/date filters. | `GET /api/admin/forms`, `GET /admin/forms/submissions` | No |
| Per-form submissions | `/forms/:id/submissions` (`pages/forms/submissions.tsx`) | Forms → All Forms (row link) | Per-form submission table (status/version/page/date filters), stats, deliveries tab with retry, CSV export (ADMIN). | `GET /admin/forms/:id`, `/submissions`, `/submissions/stats`, `/deliveries`, `POST /deliveries/:actionId/retry`, `GET /submissions/export` | No |
| Users | `/users` (`pages/users/index.tsx`) — **ADMIN only** route (`App.tsx:202-207`) | Users → All Users | User table; modals for add user, edit profile, reset password, change role, delete with content reassignment. | `GET/POST /api/admin/users`, `PUT/DELETE /admin/users/:id`, `GET /admin/users/directory`, `GET /admin/options` (default author) | Users (yes) |
| Profile | `/profile` (`pages/profile/index.tsx`) | Users → Profile | Own account card (email, role, display name, display role, bio, avatar URL) + change-password card; a password change bumps `tokenVersion` server-side (signs out other devices) and returns a fresh access token so the current tab keeps working. | `PUT /api/auth/profile` (one endpoint handles both; returns new `accessToken` on password change, `pages/profile/index.tsx:22-70`) | Profile (yes) |
| Settings | `/settings` (+ `#general,#reading,#writing,#title-cards,#revalidation,#backups,#seo`) (`pages/settings/index.tsx`) | Settings → General / Title Cards / Revalidation / Backups / SEO | Seven-tab options shell driven by the URL hash; non-admin sees read-only values; each tab has a leave guard. | `GET/PUT /api/admin/options`, `GET/POST/DELETE /api/admin/backups*`, `POST /admin/backups/:id/download-token`, `POST /api/admin/settings/revalidation-test`, `GET /admin/pages`, `GET /admin/categories`, `GET /admin/users/directory` | Settings → General/Reading/Writing/Media + options (partly yes) |
| Settings · General tab | `/settings` (`pages/settings/tabs/general.tsx`) | Settings → General | site_title, site_description, admin_email, site_url. | `GET/PUT /api/admin/options` | General Settings (yes) |
| Settings · Reading tab | `/settings#reading` (`tabs/reading.tsx`) | hash tab | Homepage display mode, static homepage / posts page / authors page pickers, search-engine visibility, posts-per-page. | `GET/PUT /admin/options`, `GET /admin/pages` | Reading Settings (yes) |
| Settings · Writing tab | `/settings#writing` (`tabs/writing.tsx`) | hash tab | Default post category, default author, title-card image behaviour. | `GET/PUT /admin/options`, `GET /admin/categories`, `GET /admin/users/directory` | Writing Settings (yes) |
| Settings · Title Cards tab | `/settings#title-cards` (`pages/settings/title-cards.tsx`) | hash tab | Bulk/single generation of social title-card images for posts, with preview. | `GET /admin/posts`, `POST /admin/posts/:id/title-card(/preview)`, `DELETE /admin/posts/:id/title-card` | No (site-specific) |
| Settings · Revalidation tab | `/settings#revalidation` (`tabs/revalidation.tsx`) | hash tab | Shows/copies the frontend revalidation secret and fires a test revalidation to the Next.js site. | `GET/PUT /admin/options`, `POST /admin/settings/revalidation-test` (+ `POST ${siteUrl}/api/revalidate`) | No (headless-specific; WP ≈ cache purge plugins) |
| Settings · Backups tab | `/settings#backups` (`tabs/backups.tsx`, `pages/settings/backups/*`) | hash tab | Backup table (size/kind/status/scope), run-now (optionally with uploads), bulk delete, download via short-lived token, schedule card; restore is documented but has **no admin UI**. | `GET /api/admin/backups`, `POST /admin/backups/run`, `DELETE /admin/backups/:id`, `POST /admin/backups/bulk-delete`, `POST /admin/backups/:id/download-token`, `GET /admin/backups/:id/download` | Tools → Export/Backup plugins (partly) |
| Settings · SEO tab | `/settings#seo` (`tabs/seo.tsx`) | hash tab | Site-wide SEO: title separator/template, default description/OG image, Twitter handle, verification keys, Organization & WebSite JSON-LD fields. | `GET/PUT /admin/options` (allowlist `ALLOWED_KEYS` in `routes/admin.options.routes.ts:15-60`) | No (Yoast/RankMath-class plugin) |
| Redirects | `/seo/redirects` (`pages/seo/redirects.tsx`) — **ADMIN only** | SEO → Redirects | Redirect table with add/edit form (source, destination, 301/302/307/308/410/451, regex+prefix), conflict check, rule tester, CSV import, CSV export. | `GET/POST /admin/redirects`, `PUT/DELETE /admin/redirects/row`, `GET /admin/redirects/check`, `POST /admin/redirects/test`, `POST /admin/redirects/import`, `GET /admin/redirects/export.csv` | No core (Redirection plugin) |
| 404 logs | `/seo/404-logs` (`pages/seo/not-found.tsx`) — **ADMIN only** | SEO → 404 Logs | Aggregated 404 table (path, hits, first/last seen, referrer), search, purge older than N days, clear all. | `GET /api/admin/logs/404`, `DELETE /admin/logs/404` | No core (404 logging plugins) |
| Site Health | `/site-health` (`pages/site-health/index.tsx`) — **ADMIN only** | Site Health | Grouped health checks (pass / recommended / critical) with filter pills, affected-content drill-downs, copy-report block. | `GET /api/admin/site-health` | Site Health (yes) |
| About | `/about` (`pages/about/index.tsx`) — lazy | (under Documentation group) | Version, environment flags, "where to go next" links; no external links. | none | About WordPress (yes) |
| Support | `/support` (`pages/support/index.tsx`) — lazy | Documentation → Support | Troubleshooting entry points + copyable environment report. | none | No direct core screen |
| Docs browser | `/docs`, `/docs/:slug` (`src/docs/DocsLayout.tsx`, `DocPage.tsx`, `docs/manifest.ts`) — lazy | Documentation → All Documents / Getting Started / Troubleshooting | MDX documentation rendered in-app from an explicit manifest. | none | No (WP links to external docs) |

### 1b. Page directories present (completeness check)

`about`, `case-studies`, `compliance`, `dashboard`, `forms`, `landing-pages`, `leads.tsx`, `login.tsx`, `media`, `outreach` (`campaigns/`, `groups/`, `templates/`), `pages`, `posts` (`categories.tsx`, `tags.tsx`), `profile`, `scheduled`, `sectors`, `seo` (`redirects.tsx`, `not-found.tsx`), `services`, `settings` (`backups/`, `tabs/`), `site-health`, `support`, `users` — all 20 directories covered above. Non-page screen sources: `src/docs/` (Docs browser, About/Support lazy chunks).

**Layout / menu mechanics worth noting:** sidebar groups have parent + submenus (`WpSidebar.tsx:38-211`); items flagged `adminOnly` are filtered for non-admins (`WpSidebar.tsx:257`) and separately enforced by `AdminOnlyRoute` + server `hasRole("ADMIN")`; editor routes deliberately bypass the shell (full-screen); `80%+` of list screens are WP-admin visual clones (`#1d2327` sidebar, `#2271b1` accents).

---

## 2. Data model summary (`packages/db/prisma/schema.prisma`, 33 models)

| Model (table) | Key fields / purpose |
|---|---|
| `User` (`users`) | email, passwordHash, name, role (ADMIN/EDITOR), displayRole, bio, avatarUrl, tokenVersion (session-bust counter) |
| `Session` (`sessions`) | userId, tokenHash unique, expiresAt, prevTokenHash + rotatedAt (refresh-rotation grace window) |
| `Category` (`categories`) | slug unique, name, description; `extraPosts` = secondary memberships |
| `Tag` (`tags`) | slug/name unique; ordering kept on `Post.tagOrder` |
| `Post` (`posts`) | slug, title, metaTitle/metaDescription, description, excerpt, content, html, toc, blocks(JSON), status, featured, image, readTime, date, denormalized author fields, faq, finalCta, categoryId + categories[], authorId, tags[], tagOrder, coverMediaId, publishedAt, deletedAt (trash), previewToken, revisionCount, scheduledAt/scheduledPayload/scheduledKind/scheduledAttempts/LastError/NextRetry |
| `Media` (`media`) | filename, originalName, title, alt, url, mimeType, size, width/height, thumbnails(JSON), uploaderId; `coverForPosts` |
| `Page` (`pages`) | slug, title, metaTitle, description, excerpt, content, status, **kind** (PAGE/LP/COMPLIANCE/CASE_STUDY/SERVICE/SECTOR discriminator), authorId, publishedAt, deletedAt, previewToken, same scheduling column set as Post |
| `PostMeta` (`post_meta`) | postId+key unique, value — generic (`seo_*` keys) |
| `PageMeta` (`page_meta`) | pageId+key unique — mirrors PostMeta for per-page SEO |
| `UserMeta` (`user_meta`) | userId+key unique |
| `TermMeta` (`term_meta`) | termId+termType+key unique |
| `Option` (`options`) | key unique, value(Text), group, autoload — WP-style options store |
| `PostRevision` (`post_revisions`) | postId, title, content, excerpt, authorId (SetNull), createdAt; capped at 50 |
| `Backup` (`backups`) | filename, sizeBytes(BigInt), kind(manual/scheduled), status, mediaIncluded, checksum, formatVersion, scope(DB/DB_MEDIA), manifest |
| `RestoreJob` (`restore_jobs`) | status enum (QUEUED→COMPLETED/FAILED/ROLLED_BACK), actorId, sourceChecksum/Bytes, safetyBackupId unique, migrationBaseline, journal |
| `RestoreEvent` (`restore_events`) | append-only audit: phase, step, level, intendedAction, beforeHash, afterState, completed |
| `Redirect` (`redirects`) | sourcePath **PK**, destination, isRegex, prefix, httpCode, enabled, hits(BigInt), position |
| `NotFoundLog` (`not_found_logs`) | path unique, firstSeen, lastSeen, hits(BigInt), referrer, uaHash |
| `Lead` (`leads`) | fullName, workEmail, orgName, website, phone, country, helpWith, tellMore, attribution(JSON), status(NEW/SENT/FAILED), providerMsgId, consentAt |
| `Subscription` (`subscriptions`) | email unique, source, attribution, status, providerMsgId, consentAt |
| `EmailLog` (`email_logs`) | kind, to, subject, status, leadId? / subscriptionId? / submissionId? |
| `OutreachGroup` (`outreach_groups`) | name, description |
| `OutreachContact` (`outreach_contacts`) | email unique, name, hospital, city, state, url, status(APPROVED/NEEDS_REVIEW/EXCLUDED/SUPPRESSED), **consentAt/consentSource** (fail-closed for bulk send), metadata(JSON) |
| `OutreachGroupContact` (`outreach_group_contacts`) | composite PK groupId+contactId |
| `OutreachTemplate` (`outreach_templates`) | brevoTemplateId unique, name, subject, preheader, htmlContent, textContent, brevoActive/brevoUnsubVerified/brevoSyncedAt |
| `OutreachCampaign` (`outreach_campaigns`) | groupId, templateId, status(DRAFT/SCHEDULED/RUNNING/PAUSED/COMPLETED/CANCELLED), dailyLimit, batchSize, batchIntervalMin, nextBatchDueAt, scheduledAt, durable event-sync cursor (`eventSyncSince/EndDate/Offset/Exhausted`) |
| `OutreachCampaignRecipient` (`outreach_campaign_recipients`) | campaignId+email unique, status(PENDING…UNSUBSCRIBED), attempts, providerMsgId, deliveredAt/openedAt/clickedAt/bouncedAt/unsubscribedAt, counts |
| `BrevoDeliveryEvent` (`brevo_delivery_events`) | unique (providerMsgId, eventType, eventAt) — idempotent webhook/poll log |
| `OutreachSuppression` (`outreach_suppressions`) | email unique, reason(UNSUBSCRIBE/BOUNCE/MANUAL) |
| `FormDefinition` (`form_definitions`) | slug unique, title, status(DRAFT/PUBLISHED/ARCHIVED), currentVersionId unique (fail-closed pointer) |
| `FormVersion` (`form_versions`) | formId+version unique, fields(JSON), settings(JSON), publishedAt — immutable once published |
| `FormSubmission` (`form_submissions`) | formId, formVersionId (pinned), answers(JSON), attribution, ip, ua, status, requestKey (idempotency, unique per form), marketingConsent + consent evidence (fieldKey/Label/Version/PrivacyUrl) |
| `FormActionOutbox` (`form_action_outbox`) | submissionId+action unique, status(PENDING/PROCESSING/DONE/FAILED), attempts, idempotencyKey unique, claimedAt, nextRetryAt, snapshot |

Enums: `Role`, `PostStatus(DRAFT/PUBLISHED/ARCHIVED)`, `RestoreStatus`, `LeadStatus`, `OutreachContactStatus`, `OutreachCampaignStatus`, `OutreachRecipientStatus`, `FormStatus`, `FormActionType`, `FormActionStatus`.

---

## 3. API surface summary (mount map: `apps/api/src/index.ts:122-202`)

| Prefix | Module | Endpoint groups |
|---|---|---|
| `/api/auth` | `auth.routes.ts` | login, refresh, logout, me, admin-only probe, `PUT /profile` (profile + password change) |
| `/api/admin/posts` | `admin.post.routes.ts` | list/stats, get-one, create/update, soft-delete/restore/permanent-delete, revisions (list+restore), schedule (get/post/retry/publish-now/delete), preview-token (rotate/revoke), title-card (generate/preview/delete) |
| `/api/admin/pages` | `admin.page.routes.ts` | same shape as posts (list/stats/get/create/update/trash/restore/purge/schedule/preview-token), `?kind=` filter |
| `/api/admin/categories` | `admin.category.routes.ts` | list/get/create/update/delete (mutations ADMIN) |
| `/api/admin/tags` | `admin.tag.routes.ts` | list/get/create/update/delete |
| `/api/admin/media` | `media.routes.ts` | list, dates (facet), per-item usage, upload, replace, patch/put metadata, delete(force), bulk-delete |
| `/api/admin/options` | `admin.options.routes.ts` | GET allowlisted options, PUT whitelisted keys (site, reading, writing, SEO, backup, maintenance) |
| `/api/admin/users` | `admin.user.routes.ts` | list, directory (EDITOR-readable), get, create, update (role/profile/password), delete with reassignment |
| `/api/admin/scheduled` (+ `/api/admin/schedules`) | `admin.scheduled.routes.ts` | GET unified post+page schedule dashboard |
| `/api/admin/site-health` | `admin.site-health.routes.ts` | GET grouped health report |
| `/api/admin/settings` | `admin.settings.routes.ts` | POST revalidation-test |
| `/api/admin/backups` | `admin.backup.routes.ts` | list, run, bulk-delete, download-token, download (token-auth), delete |
| `/api/admin/restore` | `admin.restore.routes.ts` | list, upload, inspect, preflight, apply, rollback, get — **no admin UI consumes this** |
| `/api/admin/redirects` | `admin.redirects.routes.ts` | list, export.csv, check, row get/post/put/delete, test, import |
| `/api/admin/logs` | `admin.logs.routes.ts` | GET 404 logs, DELETE purge |
| `/api/admin/leads` | `admin.leads.routes.ts` | GET leads, GET subscriptions, GET export (CSV, ADMIN) |
| `/api/admin/outreach` | `admin.outreach.routes.ts` | stats, groups CRUD + contacts + preview-csv + import-csv, contacts patch, brevo status/templates/sync, templates CRUD + test-send, campaigns CRUD + start/pause/resume/cancel/retry-failed/recipient-retry |
| `/api/admin/forms` | `admin.forms.routes.ts` | forms list/create/get/update/publish/archive, brevo lists, submissions (+stats/export), deliveries (+retry), cross-form submissions inbox |
| `/api/posts`, `/api/pages` | `post.routes.ts`, `page.routes.ts` | public list, public get-one, authenticated preview |
| `/api/authors` | `authors.public.routes.ts` | public author list + get |
| `/api/forms` | `forms.public.routes.ts` | public form fetch, submit (upload), gated report download |
| `/api/leads` | `leads.public.routes.ts` | contact + newsletter submit |
| `/api/logs`, `/api/redirects`, `/api/seo`, `/api/events` | public | 404 logging, redirect export, SEO urls/options, analytics events |
| `/api/outreach` | `outreach.public.routes.ts` | unsubscribe link, Brevo webhook |

---

## 4. WordPress-parity vs site-specific

### WordPress-parity (wp-admin analogues)
- Posts (list + editor incl. Gutenberg blocks, categories/tags, revisions, scheduling, trash, featured image, preview links)
- Pages (list + editor, hierarchical-ish content with same block editor)
- Media Library (grid/list, upload, alt/title, replace, usage/attached guard, bulk delete)
- Users (list, add, role change, password reset, edit profile, delete with reassignment) + Profile screen (WP "Profile" = display name/bio/avatar + change password)
- Settings: General, Reading, Writing, plus WP-style Options store (`Option` model with `autoload`/`group`)
- SEO settings (Yoast/RankMath-equivalent site-wide options + per-item SEO fields on Post/Page editors)
- Site Health (grouped pass/recommended/critical checks, copy report)
- Scheduled publishing management (WP "Scheduled" implicit views; here a dedicated dashboard)
- About + in-app Documentation (WP "About WordPress" / external docs analogue)

### Site-specific / custom (not wp-admin core)
- Leads inbox (contact enquiries + newsletter subscriptions, CSV export)
- Outreach automator: audience groups, contacts/consent, CSV import, templates, Brevo campaign lifecycle + delivery-event sync, suppressions
- Forms: dynamic form builder, immutable published versions, submissions inbox (cross-form + per-form), delivery outbox with retries, CSV export
- Custom "CPT" families implemented as `Page.kind`: Landing Pages, Compliance, Case Studies, Services, Sectors
- Redirects manager + 404 log aggregation (Redirection-plugin class feature, core WP lacks it)
- Backups/restore tooling, revalidation (headless cache purge)
- Title-card image generation, frontend preview/revalidation integration
- **Absent from WP parity:** Comments, Menus/Nav, Widgets, Plugins/Themes install UI, Users' custom roles (only ADMIN/EDITOR), Tools (import/export of content), Multisite.

---

## 5. Gap analysis for MERNPress

MERNPress today: Dashboard, Posts (list/new/edit + Gutenberg), Pages (list/new/edit), Categories & Tags, login/session, capabilities (admin/editor/author), trash/status. Data model: 8 models (`User`, `Session`, `AuditEvent`, `LoginAttempt`, `Post` with `type`, `PostSlugHistory`, `Term`, `PostTerm`) — no `Media`, `Option`, `PostRevision`, `Page.kind`/CPT discriminator. Routes: `auth.ts`, `content.ts`, `taxonomy.ts`, `public-content.ts`.

| Feature | In reference? | In WordPress? | In MERNPress? | Backend needed? | Priority |
|---|---|---|---|---|---|
| Media library (upload/list/alt/replace/usage) | Yes `pages/media/index.tsx` | Yes (core) | No | **Yes** — new `Media` model, upload/storage plumbing, `/api/admin/media` CRUD + usage join, editor media modal wiring | **P1** |
| Users management (list/add/role/password reset/delete+reassign) | Yes `pages/users/index.tsx` | Yes (core) | No (auth + caps exist, no UI) | Partly — `User`/`Session` exist; needs `/api/admin/users` admin CRUD + reassignment + password reset endpoints (audit already exists) | **P1** |
| Profile screen (display name/bio/avatar + change password) | Yes `pages/profile/index.tsx` | Yes (core) | No | Small — user update + password-change endpoint returning refreshed token | **P1** |
| Settings: General (title, tagline, admin email, site URL) | Yes `tabs/general.tsx` | Yes (core) | No | **Yes** — no options table; add `Option` model (key/value/group/autoload) + allowlisted GET/PUT `/api/admin/options` | **P1** |
| Settings: Reading (front page, posts page, per-page, visibility) | Yes `tabs/reading.tsx` | Yes (core) | No | Yes (same `Option` work; needs page-picker reads) | **P1** |
| Settings: Writing (default category/author, editor defaults) | Yes `tabs/writing.tsx` | Yes (core) | No | Yes (same `Option` work; authors come from users + caps) | **P1** |
| Settings: SEO basics (title separator, default description, sitemap/verification) | Yes `tabs/seo.tsx` | Plugin-class, not core | No | Yes — Option keys + per-item SEO storage (MERNPress Post has no meta table) | **P1** (basic) / P2 (org schema) |
| Media picker inside editor (featured image + image blocks) | Yes `features/content/components/media/media-modal.tsx`, `posts/edit.tsx` | Yes | No | Yes — depends on Media API; UI-only afterwards | **P1** |
| Comments | No | Yes (core) | No | n/a | **P3** (deliberately out of MVP) |
| Menus / navigation builder | No | Yes (core) | No | n/a | **P3** for MVP; P2 if a static-site nav editor is wanted |
| Widgets / block-based areas | No | Yes (core) | No | n/a | **P3** |
| Plugins/Themes install UI | No | Yes (core) | No (plugin SDK is phase 9) | n/a | **P3** |
| Scheduled publishing **management UI** | Yes `pages/scheduled`, `features/content/scheduling/*` | Partial (list views + cron) | No (no scheduling at all beyond status/trash) | **Yes** — schedule columns/payload + a sweeper; UI after that | **P2** |
| Scheduled publishing **engine** (due sweep, retry/backoff) | Yes `apps/api/src/services/publish.scheduler.ts` | Cron (`wp_cron`) | No | Yes — cron + atomic claim | **P2** (P1 if timed publishing is a stated requirement) |
| Revision history / restore | Yes `features/content/components/revisions-panel.tsx`, `PostRevision` | Yes (core) | No (only `PostSlugHistory`) | **Yes** — `PostRevision` model + 2 endpoints (cheap, high value) | **P2** (strong candidate to promote to P1) |
| Site Health | Yes `pages/site-health/index.tsx` | Yes (core, 5.2+) | No | New read-only `/api/admin/site-health` aggregating DB/scheduler/media/env checks — mostly server-side reads | **P2** |
| Redirects manager + 404 logs | Yes `pages/seo/redirects.tsx`, `not-found.tsx` | Plugin-class | No | Yes — `Redirect`/`NotFoundLog` models + admin routes + public 404 logging; mostly "outside MVP" | **P2** (P3 if SEO scope is deferred) |
| Backup / restore tooling | Yes `settings#backups`, `/api/admin/restore` | Plugin-class | No | Yes (out of MVP scope) | **P3** |
| Custom post types (services/sectors/case-studies/landing pages/compliance) | Yes via `Page.kind` | Yes (CPT/`wp_post_types`) | No (only post/page via `Post.type`) | Yes — taxonomy/CPT registry + `kind`/`type` discriminator + admin screens (MERNPress already stores `Post.type`, so the shape exists) | **P3** for the Qrolic set; **P2** for a generic CPT mechanism if the roadmap wants parity |
| Leads / outreach / forms | Yes (`pages/leads.tsx`, `pages/outreach/*`, `pages/forms/*`) | No (plugin ecosystem) | No | Yes — large new domains | **P3** (site-specific) |
| Preview tokens for drafts | Yes `services/preview-token.service.ts`, `preview-token-control.tsx` | Yes (`?preview=true` for logged-in) | No | Yes — token column + rotate/revoke endpoints; enables real client preview | **P2** |
| About / in-app docs / support | Yes `pages/about`, `pages/support`, `src/docs` | Yes (About) | No | UI-only | **P2** (cheap polish) |
| Audit log UI | Partial (audit only inside restore events) | No core | No (has `AuditEvent` table, no screen) | UI-only (table exists) | **P2** |
| Bulk actions / status tabs / trash parity check | Yes `posts/list.tsx` | Yes | Yes | None | Already done |

---

## 6. Clever things worth adopting

**Scheduled publishing without a `SCHEDULED` status.** Scheduling is six nullable columns on `Post`/`Page` (`scheduledAt`, `scheduledPayload`, `scheduledKind`, plus attempts/lastError/nextRetryAt) rather than a new table or enum value — so draft-gates, sitemaps and public queries stay untouched, and "scheduled" is simply "published with a future due instant". `publish_update` keeps the live post visible and stages a patch envelope `{ patch, baseUpdatedAt }`, so an edit made after scheduling aborts the staged update as a conflict instead of silently overwriting it (`packages/db/prisma/schema.prisma:148-166`, `apps/api/src/services/publish.scheduler.ts:1-40`). The sweeper ticks every 30s plus a 10s boot catch-up, and claims rows with `SELECT … FOR UPDATE SKIP LOCKED LIMIT 20` while nulling `scheduledAt` **inside the same transaction**, so PM2's two instances can never double-publish; failures retry 5× (1m/5m/15m/1h/6h) then park as failed with a preserved error for the dashboard (`publish.scheduler.ts:85-123`). Mutating `scheduledAt` to `Timestamptz` was a deliberate fix for naive-timestamp comparisons under a non-UTC session timezone.

**Trash that survives slug collisions.** Soft delete is just `deletedAt` + indexes (`schema.prisma:144,175`), and "Delete Permanently" refuses unless the row is already trashed (`apps/api/src/services/post.service.ts:1331-1335`). Restore re-derives a free slug via `untrashedSlug()` and `ensureUniqueSlug()` rather than blindly reinstating the old one, because a new post may have taken it (`post.service.ts:1359-1368`). Purge/soft-delete paths also emit frontend revalidation for both old and new paths so a removed URL doesn't keep serving cached HTML (`post.service.ts:1263-1320`). List screens mirror WP exactly: status tabs plus a separate `?trashed=true` query and bulk trash/restore/permanent-delete actions (`apps/admin/src/pages/posts/list.tsx:102-200`).

**Revisions capped, count cumulative.** `PostRevision` snapshots content/title/excerpt with `authorId onDelete: SetNull` so deleting a user never wipes history; retention keeps the newest `MAX_REVISIONS_PER_POST = 50` rows in-transaction while `Post.revisionCount` stays cumulative (incremented on snapshot) so the UI can say "revision 87 of N" without storing 87 rows (`schema.prisma:322-337`, `post.service.ts:1215,1388-1410`). Restore is one `POST /admin/posts/:id/revisions/:revId/restore` (`admin.post.routes.ts:37-38`).

**One table, many "post types".** `Page.kind` (`PAGE`/`LP`/`COMPLIANCE`/`CASE_STUDY`/`SERVICE`/`SECTOR`) is a discriminator with a DB-level default, so five custom post types inherit the block editor, SEO, revisions, scheduling, preview tokens and media for free; each admin screen is a 10-line wrapper passing `kind` + `basePath` to the shared list/editor (`apps/admin/src/pages/case-studies/list.tsx:1-17`, sidebar comments at `WpSidebar.tsx:74-124`). This is the cheapest CPT pattern for MERNPress (which already has `Post.type`) — but note it means "page" and "CPT entry" share one table, so per-type field needs end up in meta tables.

**Options allowlist instead of open key/value writes.** `GET /admin/options` server-side filters which keys a role may read and `PUT` validates against a `Set` of allowed keys/groups (`apps/api/src/routes/admin.options.routes.ts:15-60`), so settings screens can't inject arbitrary config (`maintenance_mode` included) and the SEO tab reuses the same store rather than a parallel settings table. Reading/General/Writing tabs share one `useOptions`/`useSaveOptions` hook with per-tab defaults and a leave guard (`apps/admin/src/pages/settings/use-options.ts`, `tabs/general.tsx`).

**Preview tokens + media usage guard.** Draft sharing uses 256-bit persistent tokens in a unique column, compared constant-time and rotated/revoked per item (`apps/api/src/services/preview-token.service.ts:1-40`, `preview-token-control.tsx`). Media deletion is guarded by `GET /admin/media/:id/usage` which reports cover/card/embedded references and forces `?force=true` for an explicit override (`apps/api/src/controllers/media.controller.ts:130-154`) — a good model for any future MERNPress media library, since deleting an in-use attachment is the classic WP foot-gun.

**Immutable form versions + delivery outbox.** Forms never mutate a published version: publishing mints `version + 1` and repoints `currentVersionId` fail-closed, submissions pin `formVersionId`, and a consent snapshot (field key/label/version/privacy URL) is stored at submit time (`schema.prisma:770-870`). Side effects (internal notification, submitter PDF, Brevo sync) each get their own outbox row with a `<submissionId>:<action>` idempotency key and `FOR UPDATE SKIP LOCKED` claim, so one integration outage never masks another (`apps/api/src/services/form.delivery.service.ts:239-251`). Worth copying if MERNPress ever adds form/webhook side effects; not needed for parity.

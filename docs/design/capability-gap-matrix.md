# Capability gap matrix — MERNPress vs qrolichealth-cms reference

Date: 2026-10-29. Baseline: master `9f74f5f` (deployed release
`20261029T103000Z-7dd1a1d`), audit branch `feat/cms-completion`.

Statuses: **done** (verified), **partial** (exists but incomplete/unverified),
**missing**, **n/a** (not appropriate for generic MERNPress), **blocked**
(dependency/architecture gate).

Evidence columns point at MERNPress paths and the reference implementation
(/tmp/opencode/refs/qrolichealth-cms-main, extracted from the owner's archive;
`/tmp` is volatile — re-extract from ~/reference-archives/ when absent).

## 1. Content rendering and security

| Capability | Before audit | After this branch | Evidence |
| --- | --- | --- | --- |
| Block markup storage (WP-compatible) | done | done | `posts.content`, `content_format='wp_block_html'`; ADR 0001 |
| Structural validation (size/count/depth) | done | done | `packages/block-system/src/validate.ts`; 15 tests |
| Server renderer | **missing** | **done** | `packages/block-system/src/render/render.ts`; ADR 0007; 19 golden tests |
| Allowlist sanitizer | **missing** | **done** | `packages/block-system/src/sanitize.ts` (DOMPurify+jsdom; tighter than reference `services/block-renderer/sanitizer.ts`); 31 XSS tests |
| Public API returns rendered HTML | **missing** (raw markup only) | **done** | `toPublic` in `packages/cms-core/src/content/service.ts`; `public.test.ts` render suite |
| TOC/heading anchors | **missing** | **done** | renderer heading pass; deterministic `-2/-3` dedupe |
| Render cache (`rendered_html` column) | missing | **missing (deferred)** | ADR 0007 §4: render-on-read until measurement justifies cache; `RENDER_VERSION` marks contract |
| Reference's per-block attr re-render + hooks | n/a (their custom blocks) | n/a | MERNPress MVP set is static; sanitize path uniform (ADR 0007 §2) |

## 2. Media library (Phase 6)

| Capability | Before audit | After this branch | Evidence |
| --- | --- | --- | --- |
| Upload pipeline (size/MIME/magic) | **missing** | done (this branch) | reference `media.service.ts` pattern adapted; `packages/cms-core/src/media/` |
| Image derivatives | **missing** | done | sharp WebP q85 ≤2560px + 300/600/1200 q80 |
| Media metadata + list/search/pagination | **missing** | done | `media_items` table; GET list/search |
| Metadata editing (alt/caption/description) | **missing** | done | PATCH endpoint |
| Controlled serving + traversal defense | **missing** | done | `/api/media/:id/:name` confinement |
| Admin media page | **missing** | done | `apps/admin/src/MediaPage.tsx`; grid/upload/drawer/search/pagination; 11 tests |
| Editor media picker (`settings.mediaUpload`) | **missing** ("Phase 6" stub) | done | `apps/admin/src/editor/blocks.ts` real uploader; featured-image picker in editor; library modal = follow-up |
| SVG/video/documents | **missing** | **n/a** | raster-only by design (T-12); ADR 0008 §1 |
| Featured image on posts | **missing** | done | `posts.featured_media_id`; editor picker; public og:image + rendering; 7 tests |
| Usage tracking (where-used) | **missing** | **missing** | reference has `GET /:id/usage`; deferred |

## 3. Content workflows

| Capability | Before audit | After this branch | Evidence |
| --- | --- | --- | --- |
| Revisions | **missing** | done (backend) | `post_revisions`; snapshot-in-transaction; retention 50; restore via update path (reference `post.service.ts` pattern) |
| Autosave | **missing** | **partial** | recovery via revisions? No — autosave UI pending; editor keeps 50-entry undo stack only |
| Preview (token-gated) | **missing** | done (backend) | `posts.preview_token`; `/api/public/preview/:token`; noindex/no-store; same sanitizer |
| Bulk actions (publish/trash/restore/delete) | **partial: dead UI** | **partial (backend pending)** | dead control at `ContentList.tsx:368-375` found by audit |
| Scheduled publishing (first-publish) | **missing** | done (backend) | `posts.scheduled_at` + sweeper; ADR 0008 §4; reference's payload envelopes n/a |
| Schedule update payloads | n/a | n/a | reference-only concept; MERNPress editor saves directly |
| Conflict/recovery UX | done (409 UI) | done | ContentEditor conflict panel |
| Trash/restore | done | done | service transitions + tests |

## 4. Admin capabilities

| Capability | Before audit | After this branch | Evidence |
| --- | --- | --- | --- |
| Users list/create/edit/deactivate | done | done | P2-05 (`users.ts`, guards: last-admin, self-role, reassignment) |
| Roles/capabilities | done | done | 5 roles × 12 capabilities (`capabilities.ts`) |
| Password reset/recovery | **missing** | **missing (blocked)** | needs token+delivery (email) architecture; documented residual risk in threat model §8 |
| Settings (General/Reading/Writing) | done | done | `options` table + allowlisted API + SettingsPage |
| SEO fields on posts | **partial: columns only** | done | editor SEO tab fields; API already validated them |
| SEO meta rendering (public) | **missing** | done | Next.js generateMetadata fallback chains |
| Sitemap/robots | **missing** | done | `app/sitemap.ts`, `app/robots.ts` |
| Author attribution | done (authorId) | done | shown in lists; no reassignment UI (P2-05 deferred) |
| Audit logging | done (auth events) | done | content events via hooks; audit-log **UI** still **missing** |
| Dashboard counts/activity | done | done | At a Glance chips + Activity card |

## 5. Public site (apps/web)

| Capability | Before audit | After this branch | Evidence |
| --- | --- | --- | --- |
| Home/post/page rendering | **missing (placeholder)** | done | `app/page.tsx`, `app/posts/*`, `app/[slug]/*` |
| Safe HTML injection | n/a | done | sanitized `renderedContent` only; raw `content` never injected |
| SEO metadata | **missing** | done | generateMetadata chains |
| Theme system | **missing** | **missing (Phase 10)** | out of this branch's scope |
| Cache/revalidation webhook | **missing** | **missing** | revalidate=60 fetch cache; webhook deferred (U-007) |

## 6. Reference features explicitly NOT adopted (n/a for generic MERNPress)

| Reference capability | Reason |
| --- | --- |
| Healthcare CPTs (Service/Job/Portfolio/Team) | site-specific (AGENTS.md §12) |
| Forms/leads/outreach/Brevo | business-specific plugins, not core |
| Title-card generator | site-specific |
| Lottie/JSON uploads | animation assets out of MVP media scope |
| `html`/`toc`/`blocks` cache columns | render-on-read is sufficient at MVP scale |
| JWT auth (reference) vs session cookies (ours) | ours is the accepted ADR 0002 design — kept |
| bcryptjs | ours uses Argon2id per ADR 0002 — kept |

## Remaining gaps after this branch (ranked)

1. Gutenberg media library modal (P6-04 follow-up): standalone build stubs
   `editor.MediaUpload` — needs a custom modal over `listMedia` or
   `@wordpress/media-utils`. Upload-from-device + URL + featured-image picker
   work today.
2. Media usage tracking (reference `GET /:id/usage`) + replace flow.
3. Audit-log viewer UI (events exist via hooks; no screen).
4. Render cache columns (`rendered_html`/`render_hash`): render-on-read is
   the current contract; add cache only after measurement (ADR 0007 §4).
5. Password reset (blocked: needs mail delivery/token architecture).
6. Revalidation webhook with secret (U-007); archive/taxonomy/search routes
   on the public site; theme system (Phase 10); comments/menus (Phase 11+).
7. Scheduled publish **updates** (payload envelopes) — reference design
   documented in ADR 0008 §4 as the future path.
8. SVG support (blocked by design: needs sanitizer review, T-12).
9. Password policy/2FA (documented residual risks in threat-model §8).

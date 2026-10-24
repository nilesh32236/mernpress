# Feature matrix

Date: 2026-10-24. This matrix separates **generic CMS** capability from
**site/business-specific** functionality and assigns an implementation stance.

Legend:

- **WP** = WordPress 7.1.3. Paths/URLs are cited where practical. "Yes" means
  core has the capability, not that MERNPress should copy its implementation.
- **Q** = `qrolic-cms-main`. **H** = `qrolichealth-cms-main`.
- **Class**: G = generic CMS; B = business/site-specific; G* = generic mechanism
  with site-specific configuration.
- **Approach**: `reuse` (design lesson), `redesign` (same need, new design),
  `defer` (later phase), `avoid` (do not build in core).
- **Phase**: MVP, next, later, out.
- **Risk / dependency / priority**: P0 = MVP-critical, P1 = next, P2 = later;
  dependencies and the main risk are named.

## Content lifecycle

| Capability | WP core | Q | H | Class | Approach | Phase | Risk / dependency / priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Posts and pages | Yes; `wp-includes/post.php` | Yes (`Post`, `Page`) | Yes | G | redesign | MVP | One `posts` table with type; avoid duplicated models; P0 |
| Draft/published states | Yes; `register_post_status` | Yes | Yes | G | reuse | MVP | Explicit transition table; P0 |
| Trash/restore | Yes; `wp_trash_post` stores previous status | Yes (`deletedAt`) | Yes | G | reuse | MVP | `previous_status` + `trashed_at`; P0 |
| Scheduled publish | Yes; cron + `future` status | Yes (6 columns + sweeper) | Yes | G | defer | next (P8) | Clean job table, not column patchwork; P1 |
| Revisions | Yes; `revision.php` | Yes | Partial | G | defer | next (P8) | Immutable snapshots + retention; P1 |
| Autosave | Yes; revision/autosave | Form debounce | Similar | G | defer | next (P8) | Conflict detection is the hard part; P1 |
| Unique slugs | Yes; `wp_unique_post_slug` | Yes | Yes | G | reuse | MVP | Normalize/reserve/redirect; P0 |
| Author/date/excerpt | Yes | Yes | Yes | G | reuse | MVP | Author relation; P0 |
| Featured media | Yes; post thumbnail | Yes (`coverMediaId`) | Yes | G | reuse | MVP | Media FK; P0 |
| Custom post types | Yes; `register_post_type` | Hard-coded Prisma models | Mostly removed | G mechanism, B instances | defer | next (P9) | Plugin API; do not hard-code site CPTs; P1 |
| Custom fields | Yes; EAV post meta | Yes (`PostMeta` etc.) | Yes | G | redesign | next | Typed core + namespaced JSONB; no core EAV; P1 |
| Preview | Yes; preview links | Yes (token) | Yes | G | defer | next (P8) | Signed/short-lived/noindex; P1 |
| Content conflict | Partial (autosave) | Partial | Partial | G | redesign | MVP | `version`/409; P0 |
| Bulk actions | Yes | Yes | Yes | G | reuse | next | Publish/trash/restore; P1 |
| Search/filter/pagination | Yes | Yes | Yes | G | reuse | MVP (basic) | DB filters; FTS later; P0 |

## Taxonomy and metadata

| Capability | WP core | Q | H | Class | Approach | Phase | Risk / dependency / priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Categories | Yes; `category` | Yes | Yes | G | redesign | MVP | One `terms` table + join; P0 |
| Tags | Yes; `post_tag` | Yes | Simplified | G | redesign | MVP | Same terms table; flat; P0 |
| Hierarchical terms | Yes; taxonomy hierarchy | Yes (`Tag.parentId`) | Removed | G | defer | next | Avoid until needed; P1 |
| Custom taxonomies | Yes; `register_taxonomy` | Yes (industries/locations/service-types) | Some | G mechanism, B instances | defer | next (P9) | Plugin registration; P1 |
| Term meta | Yes | Yes | Partial | G | redesign | next | Namespaced JSONB/typed columns; P1 |
| SEO title/description | Not core (plugins) | Yes (`metaTitle` etc.) | Yes | G | reuse | MVP (subset) | Title/description/canonical/OG only; P0 |
| Canonical URL | Core `rel_canonical` | Yes | Yes | G | reuse | MVP | Compute + override later; P0 |
| Robots directives | Core `wp_robots` | Partial | Advanced | G | defer | next | index/noindex first; P1 |
| Redirects | Plugin | Yes (`Redirect`) | Yes | G | reuse | next | Slug-change redirects; admin UI later; P1 |
| 404 logging | Not core | Yes (`NotFoundLog`) | Yes | G | defer | later | Retention/redaction; P2 |

## Media

| Capability | WP core | Q | H | Class | Approach | Phase | Risk / dependency / priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Media library | Yes | Yes (`Media`) | Yes | G | reuse | MVP | List/search/alt/caption; P0 |
| Upload pipeline | Yes; `wp_handle_upload` | Yes (multer, 50 MB) | Yes (quarantine) | G | redesign | MVP | Magic bytes/MIME/extension/size; P0 |
| Image derivatives | Yes; attachment metadata | Yes (sharp) | Yes | G | reuse | MVP (basic) | Thumbnails; server-side; P0 |
| Alt/caption/description | Yes | Yes | Yes | G | reuse | MVP | Accessibility requirement; P0 |
| Media replacement | Plugins | Yes | Yes | G | defer | next | Preserve references; P1 |
| SVG uploads | Restricted | Yes (risk) | Yes (risk) | G but risky | avoid | out | Static SVG can execute; no MVP; P2 |
| Video/audio | Yes | Yes | Yes | G | defer | later | Storage/processing cost; P2 |

## Auth, users, authorization

| Capability | WP core | Q | H | Class | Approach | Phase | Risk / dependency / priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Login/logout | Yes | Yes | Yes | G | redesign | MVP | Opaque session, hashed token; P0 |
| Session revocation | Cookies | Yes (`Session`) | Yes | G | reuse | MVP | Logout-all/expiry; P0 |
| Password hashing | `wp_hash_password` | bcrypt 10 | bcrypt | G | redesign | MVP | Argon2id preferred; P0 |
| Password reset | Yes | Partial | Partial | G | defer | next | Single-use hashed token; P1 |
| Roles | Yes; `WP_Roles` | ADMIN/EDITOR | ADMIN/EDITOR | G | redesign | MVP | Role rows + caps; P0 |
| Capabilities/object auth | Yes; `map_meta_cap` | `hasRole` only | Similar | G | redesign | MVP | Meta-cap + object checks; P0 |
| User administration | Yes | Yes | Yes | G | reuse | MVP | Protect last admin; P0 |
| Author profiles | Yes | Yes | Yes | G | defer | next | Public author pages later; P1 |
| 2FA | Plugins | No | No | G | defer | later | Before public deploy; P2 |
| Audit log | Plugins | Partial | Partial | G | redesign | next | Login/content/user events; P1 |
| SSO/OAuth | Plugins | No | No | G | avoid | out | Provider complexity; P2 |

## Admin experience

| Capability | WP core | Q | H | Class | Approach | Phase | Risk / dependency / priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Admin shell/nav | Yes | Yes (`WpAdminLayout`) | Yes | G | redesign | MVP | Familiar, not pixel clone; P0 |
| Content list tables | Yes | Yes | Yes | G | reuse | MVP | Filters/bulk/empty/error; P0 |
| Create/edit forms | Yes | Yes | Yes | G | reuse | MVP | Validation/notices/guard; P0 |
| Media modal | Yes | Yes | Yes | G | reuse | MVP | Shared with library; P0 |
| Settings pages | Yes | Yes | Yes | G | defer | next | Typed options + caps; P1 |
| Dashboard | Yes | Yes | Yes | G | defer | next | Real counts only; P1 |
| Users screen | Yes | Yes | Yes | G | reuse | MVP | Admin-only; P0 |
| Help/docs | Yes | MDX docs | MDX docs | G | defer | later | Useful, not MVP; P2 |
| First-run onboarding | Installer | Seed/admin | Seed/admin | G | redesign | MVP | One safe command/flow; P0 |
| Responsive admin | Yes | Partial | Partial | G | redesign | MVP | Tablet-first; mobile later; P0 |
| Accessibility | Core aims | Partial | Partial | G | redesign | MVP | Keyboard/focus/labels/axe; P0 |

## Editor and blocks

| Capability | WP core | Q | H | Class | Approach | Phase | Risk / dependency / priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Real Gutenberg editor | Yes | Yes (standalone) | Yes | G | reuse | MVP | Official packages; P0 |
| Core block subset | ~90 blocks | ~20 core | Similar | G | redesign | MVP | 11 blocks; expand with tests; P0 |
| Custom block API | Yes; `register_block_type` | Yes (`qrolic/*`) | Yes (many) | G | defer | next (P5/P9) | One example block; plugin blocks later; P1 |
| Block markup persistence | Yes | Yes | Yes | G | reuse | MVP | WP-compatible, versioned; P0 |
| Unknown block preservation | Yes | Yes (`renderUnknown`) | Yes | G | reuse | MVP | Never drop content; P0 |
| Shared attributes/defaults | `block.json` + PHP | Shared TS + materialize | Same | G | redesign | MVP | One registry; test default omission; P0 |
| InnerBlocks/nesting | Yes | Yes | Yes | G | reuse | MVP | Nested fixtures; P0 |
| Patterns | Yes | Static | Static | G | defer | later | Synced patterns later; P2 |
| Block bindings | Yes (6.7+) | No | No | G | avoid | out (MVP) | Later design; P2 |
| Global styles/theme.json | Yes | Tokens | Tokens | G | defer | next (P10) | Smaller token contract; P1 |
| Block deprecations | Yes | Not evident | Not evident | G | defer | later | Needed before schema changes; P2 |
| Raw HTML block | Yes | Yes | Yes | G but risky | avoid | out (MVP) | Admin-only + sanitizer if ever; P2 |
| Editor E2E | Core tests | No browser E2E | `.e2e` scripts | G | redesign | MVP | Playwright load/edit/save; P0 |
| Bundle control | N/A | 4 GB build | Similar | G | redesign | MVP gate | Lazy route/chunk/subset; P0 |

## Public rendering, themes, SEO

| Capability | WP core | Q | H | Class | Approach | Phase | Risk / dependency / priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SSR public site | Yes (PHP) | Next | Next | G | redesign | MVP | Next 16 Node self-host; P0 |
| Post/page routes | Yes | Yes | Yes | G | redesign | MVP | Explicit routes; P0 |
| Template hierarchy/fallbacks | Yes; `template-loader.php` | Frontend routes | Frontend routes | G | redesign | MVP (simplified) | front/home/single/page/archive/search/404; P0 |
| Theme switching | Yes | No | No | G | defer | next (P10) | Config + rebuild; P1 |
| Header/footer/parts | Yes | Hardcoded | Hardcoded | G | defer | next | Theme SDK; P1 |
| Design tokens/global styles | Yes (`theme.json`) | Tailwind tokens | Tailwind tokens | G | defer | next | CSS variables; P1 |
| SEO metadata | Plugins | Yes | Yes | G | reuse | MVP | title/description/canonical/OG; P0 |
| Sitemap/robots | Core | Yes | Yes | G | defer | next | Published URLs only; P1 |
| JSON-LD | Plugins | Yes | Yes | G | defer | next | Article/WebSite; P1 |
| Preview/draft | Yes | Yes (token) | Yes | G | defer | next (P8) | Signed/noindex/no-store; P1 |
| Menus/navigation | Yes | Yes | Removed | G | defer | later | Theme config/menu entity; P2 |
| Comments | Yes | Yes | Removed | G | defer | later | Moderation/anti-spam; P2 |
| Search | Yes | Basic | Basic | G | defer | later | Postgres FTS; P2 |
| Feeds | Yes | Yes | Yes | G | defer | later | RSS/Atom; P2 |
| Multilingual | Plugins | No | No | G | avoid | out (MVP) | Large surface; P2 |
| Analytics/tags | Plugins | Events/CAPI | Events/CAPI | G/B | avoid | out (MVP) | Theme/plugin; P2 |

## Extensibility and operations

| Capability | WP core | Q | H | Class | Approach | Phase | Risk / dependency / priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Actions/filters | Yes; `plugin.php` | `@wordpress/hooks` in renderer | Same | G | redesign | next (P9) | Typed hook bus; P1 |
| Plugin lifecycle | Yes | No general system | No general system | G | redesign | next (P9) | Manifest/activate/deactivate; P1 |
| Plugin migrations | Plugin-defined | N/A | N/A | G | redesign | next | Versioned/advisory lock; P1 |
| Plugin admin pages/routes | Yes | Hard-coded | Hard-coded | G | defer | next | Registration API; P1 |
| Custom capabilities | Yes | No | No | G | defer | next | Register/assign; P1 |
| Plugin sandbox | No (same process) | N/A | N/A | G | avoid | out (MVP) | Never claim sandbox; P1 |
| Plugin marketplace | Yes (wp.org) | No | No | B/G | avoid | out | Not the product; P2 |
| Theme SDK | Yes | Frontend code | Frontend code | G | redesign | next (P10) | Manifest/templates/parts; P1 |
| Backups/restore | Plugins | Yes | Yes + restore | G | defer | later | Before deployment; P2 |
| Health/readiness | N/A | Yes | Yes | G | reuse | MVP | `/api/health`, `/api/ready`; P0 |
| Structured logs | N/A | pino | pino | G | reuse | MVP | Request ID + redaction; P0 |
| Rate limiting | Plugins | Login/public | Broader | G | redesign | MVP (auth) | Global/auth/upload; P0 |
| Migrations/seed | N/A | Prisma | Prisma | G | reuse | MVP | Forward-only/idempotent; P0 |
| CI | N/A | Yes | Partial | G | reuse | MVP | Lint/typecheck/test/build; P0 |
| Docker/self-hosting | N/A | PM2/nginx | PM2/nginx | G | defer | next | Compose optional; native first; P1 |

## Business/site-specific (must not enter core)

| Capability | WP core | Q | H | Class | Approach | Phase | Risk / dependency / priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Services CPT | Plugins | Yes (`Service`) | Removed | B | avoid | out | Qrolic catalog; plugin/site type; P2 |
| Jobs/careers | Plugins | Yes (`Job`) | Removed | B | avoid | out | Qrolic careers; plugin; P2 |
| Portfolios/case studies | Plugins | Yes (`Portfolio`) | Case studies | B | avoid | out | Marketing content; plugin; P2 |
| Team members | Plugins | Yes (`TeamMember`) | Removed | B | avoid | out | Marketing content; plugin; P2 |
| Leads/contact/newsletter | Plugins | Yes (`Lead`, `Subscription`) | Yes + PHI gates | B | avoid | out | CRM/marketing; plugin; P2 |
| Dynamic forms | Plugins | No general builder | Yes (`Form*`) | B | avoid | out | Health lead-gen/compliance; plugin; P2 |
| Outreach/Brevo | Plugins | No | Yes | B | avoid | out | Vendor-specific; plugin; P2 |
| HIPAA/consent evidence | Plugins | No | Yes | B | avoid | out | Do not claim compliance; plugin; P2 |
| Landing pages | Plugins | Yes (`Page.kind=LP`) | Yes | G* | redesign | next | Generic subtype mechanism; P1 |
| Title cards/OG generation | Plugins | Yes | Yes | B/G | defer | later | Marketing; plugin; P2 |
| Meta/GA4 CAPI relay | Plugins | Partial | Yes | B | avoid | out | Site analytics; P2 |
| Multi-site/multi-tenant | Yes (multisite) | No | No | G but large | avoid | out (MVP) | Not hobby scope; P2 |

## Approach summary

- **Reuse as design lessons:** monorepo app/package split; Prisma + PostgreSQL;
  WordPress-compatible block markup; server-side rendering; trash/restore;
  media pipeline; taxonomy model; health/logging; migration discipline.
- **Redesign:** unified content model; roles/capabilities; opaque sessions + CSRF;
  block registry/defaults; admin shell; public theme/template contract; plugin
  discovery and migrations; tests.
- **Defer:** revisions/autosave/preview/scheduling; custom post types/taxonomies;
  plugin runtime; theme switching; menus/comments/search/backups.
- **Avoid:** Qrolic Service/Job/Portfolio/Team CPTs and `qrolic/*` blocks in core;
  forms/outreach/CRM/compliance in core; EAV for core fields; raw HTML/SVG uploads;
  same-process plugin sandbox claims; full WordPress parity.

## Cross-cutting dependencies and risks

| Dependency / risk | Affects | Mitigation |
| --- | --- | --- |
| Official Gutenberg package compatibility | Editor, admin build | Pin one set; strict peer install; build + browser smoke; dedupe stores |
| Parser fidelity / default omission | Content integrity | Corpus + round-trip + golden + unknown-block tests |
| PostgreSQL schema/migrations | Every feature | Forward-only migrations; backup; empty/previous-schema tests |
| Prisma version trap (8 RC on `latest`) | Install/build | Pin 7.10.1 for all Prisma packages |
| Next caching/RSC | Public correctness | Explicit tags; preview no-store; measure |
| Plugin code trust | Server security | Trusted local only; no sandbox claim; least privilege |
| Upload attack surface | Server/browser | Magic bytes, re-encode, no SVG, path confinement |
| Bundle size/vips worker | Admin performance | Lazy route, chunking, subset blocks, no client vips |
| Node 24 not installed locally | Verification | Phase 1 install/pin and rerun checks |
| No Docker locally | Setup | Native PostgreSQL path; Compose optional |

## MVP inclusion summary

**In:** first-run admin bootstrap; secure login/session/logout; roles and
capabilities; posts/pages; draft/publish/trash/restore; slugs; author/date/excerpt;
categories/tags; featured media; media library; 11 tested Gutenberg blocks;
API-rendered HTML; public post/page routes; title/description/canonical/OG; empty/
loading/error states; logs; health; tests.

**Out of MVP:** revisions/autosave, scheduled publish, preview links, comments,
menus, custom post types/taxonomies, plugin/theme runtime, forms/leads/CRM/
outreach/compliance, e-commerce, multisite, multilingual, marketplace, visual theme
editor, advanced SEO, analytics.

See [mvp-definition.md](../roadmap/mvp-definition.md) for the measurable done
criteria.

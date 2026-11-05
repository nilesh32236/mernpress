# WordPress design-parity audit — 2026-11-05

This record covers the admin screens re-checked side by side against the live
WordPress 7.1.4 reference at `http://127.0.0.1:8080` (admin account) and the
MERNPress development admin at `http://127.0.0.1:5173/admin/`.

## Method

- Chromium via Playwright, viewport **1440 × 1000**, both apps at 100 % zoom.
- For each screen the `<h1>`, sidebar width, admin-toolbar height, status tabs,
  primary page action and table count were read from the DOM. This is a
  structural check, not a claim of pixel identity; visual screenshots were also
  captured for the screens listed.
- Content counts differ between the two installations (the reference has more
  posts/users), so a count difference alone is not a defect. The tab *set* and
  labels are compared, not the numbers.

## Chrome measurements

| Element | WordPress 7.1.4 | MERNPress | Result |
| --- | --- | --- | --- |
| Sidebar width | 160 px (`#adminmenu`) | 160 px (`.admin-sidebar`) | match |
| Admin bar height | 32 px (`#wpadminbar`) | 32 px (`.admin-bar`, `--wp-admin-bar-h`) | match |
| Content origin | x = 160 | x = 160, width 1280 | match |
| Page heading style | `h1.wp-heading-inline` | `h1` in `.page-header` | match visually |
| Status tabs | `.subsubsub` links | `.subsubsub-tab` | match |

## Screen-by-screen

| Screen | WordPress `<h1>` | MERNPress `<h1>` | Tabs / primary action | Notes |
| --- | --- | --- | --- | --- |
| Dashboard | Dashboard | Dashboard | Quick Draft “Save Draft” widget | Cards use MERNPress-specific classes; layout (At a Glance, Activity, Quick Draft, Site Health) matches the prior design pass |
| Posts | Posts | Posts | All / Mine / Published; **Add Post** | Same toolbar: bulk actions + filters + search in one row; row actions verified in earlier browser checks (Quick Edit, Bulk Edit) |
| Pages | Pages | Pages | All / Published / Draft in WP when a draft exists; MERNPress shows All / Mine / Published | Same tab mechanism; MERNPress computes the counts live from the API |
| Media Library | Media Library | Media Library | **Add Media File** | Filters and Grid/List toggle verified in earlier passes |
| Comments | Comments | Comments | All / Pending / Approved / Spam / Trash | Labels match; MERNPress has no “Mine” tab (single-role moderation) — documented deviation |
| Appearance → Themes | Themes 3 | Themes (count in list header) | **Add Theme**, Activate/Active, Customize | Two installed packages by design (MERNPress, Journal); WordPress reference has three |
| Plugins | Plugins | Plugins | All / Active / Inactive; **Add Plugin** | WordPress also shows Auto-updates Enabled/Disabled tabs; MERNPress auto-update is one global preference, so per-plugin tabs would be misleading — documented deviation |
| Users | Users | Users | All / Administrator (+ role tabs); **Add User** | Same columns and row actions, including Send password reset and Reset 2FA |
| Tools | Tools | Tools | Cards | MERNPress adds Redirects and Backups, which WordPress needs plugins for |
| Settings → General | General Settings | General Settings | **Save Changes** | Same field groups and labels |
| Profile | Profile | Profile | **Update Profile** | MERNPress uses sections instead of WordPress's five tables; it adds Two-Factor Authentication and Application Passwords |
| Single post (public) | n/a | — | — | Reading time, related posts and the author box verified in the browser and in production |

Screenshots from this pass (development, git-ignored):
`.playwright-mcp/audit-mn-posts.png`, plus the feature screenshots referenced in
`docs/implementation-log.md`.

## Remaining deviations (deliberate)

| Deviation | Reason |
| --- | --- |
| Allow Pings | Pingbacks/trackbacks need XML-RPC or inbound verification; security-sensitive legacy surface. Stated as unavailable, not stored as an inert checkbox. |
| Plugin auto-update tabs | MERNPress has one global plugin auto-update preference; per-plugin tabs would imply a per-plugin toggle that does not exist. |
| Comment “Mine” tab | Single-role moderation model; the tab would always equal “All”. |
| Eight admin colour schemes | One default scheme; no unreviewed schemes ship. |
| Some Screen Options panels | Columns and paging are persisted per screen; panels for WordPress features MERNPress does not have are absent. |
| Theme/Plugin File Editors | Excluded by owner decision (RCE surface). |

## Follow-up pass — previously unverified screens

These were re-checked against the live reference on the same day. Where the
reference screen is a JavaScript application (Fonts, Site Editor, Customizer),
the comparison is on the screen name, primary navigation and the visible
controls MERNPress implements.

| Screen | WordPress 7.1.4 | MERNPress | Result |
| --- | --- | --- | --- |
| Media attachment details | “Attachment details” modal: Edit Image, uploaded date/author, file name/type/size/dimensions, alt/caption/description, File URL + copy, view/download/delete | Same dialog title, same fields and actions; previous/next navigation between items | match (the reference library has no uploads, so the field set was compared against the WordPress attachment-details contract) |
| Appearance → Customize | “Customizing: …”, Site Identity, Colors, Menus, Homepage Settings, Additional CSS, “Use Site Editor” notice | “Customizing: MERNPress”, Site Identity (title, tagline) and Save & Publish | narrower: colours/menus live in the Site Editor and theme tokens; documented deviation |
| Appearance → Site Editor | `<h1>Design</h1>` | `<h1>Design</h1>`, Identity / Styles / Pages | match |
| Appearance → Fonts | “Fonts” (Font Library) | “Fonts”, Library / Upload / Install Fonts, installed font list | match in name and purpose |
| Tools → Import | “Import” + importer list | “Import” + importer list with Open / Run Importer | match; third-party importers remain unavailable by design |
| Tools → Export | “Export”, *Choose what to export*: All content, Posts, Pages, Media, author/date/status/category filters, Download Export File | “Export”, same four scopes and author/date/status/category filters, Download Export File | match (one filter set applies to the included types; WordPress has separate Posts/Pages fieldsets) |
| Tools → Export / Erase Personal Data | Request form, request list, status filters, bulk actions | Request form, request list with complete/download actions | match in structure; WordPress adds Screen Options and bulk filters |
| Settings → Writing | “Writing Settings”: Post via email, Update Services | Same headings and fields | match |
| Settings → Reading | “Reading Settings”: front page, posts per page, feed items, full text/excerpt, visibility | Same | match |
| Settings → Discussion | “Discussion Settings”: article settings, other comment settings, email me, moderation, disallowed keys, avatars | Same sections plus a Mail delivery log panel | match + MERNPress addition |
| Settings → Media | “Media Settings”: Image sizes, Uploading Files | Same | match |
| Settings → Permalinks | “Permalink Settings”: structure presets, category base, tag base | “Permalink Settings”: one Post URL base | narrower (the router supports one base); documented |
| Settings → Privacy | `<h1>Privacy</h1>`, “Privacy Settings”, policy page picker, Create/Use This Page helpers | `<h1>Privacy</h1>`, “Privacy Settings”, policy page picker, **Create a new Privacy Policy page**, Edit/View links and **Use This Page** | match (follow-up slice; see ADR 0039) |
| Settings → Connectors | “Connectors”: Akismet, Anthropic, Google, OpenAI cards | “Connectors”: OpenAI / Google / Anthropic key cards | narrower: AI providers only (no spam service) |
| Dashboard → Updates | “WordPress Updates”: core, Plugins, Themes, re-install | “MERNPress Updates”: MERNPress, Plugins, Themes, Check again | match adapted to the product name |

The only code change from this pass was the Privacy page title/heading split
(`Privacy` as the page title, `Privacy Settings` as the section heading), which
now matches WordPress.

## Deliberate deviations confirmed in this pass

| Deviation | Reason |
| --- | --- |

| Permalink presets and category/tag bases | The public router supports one configurable base segment; other structures would require route changes. |
| Customizer scope | Themes are token packages; colours/menus are edited in the Site Editor, not a second Customizer panel set. |
| Connectors providers | No spam service is bundled; only the three AI providers with server-side key storage exist. |

## Still not re-checked

- Editor canvas chrome at 375 px (covered by the E2E responsive test, not re-measured here).
- Media → Edit Image in this pass (implemented in an earlier slice; its E2E coverage remains).
- Settings → Privacy policy page creation flow (not implemented).

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
| Profile | Profile | Profile | **Update Profile** | MERNPress uses sections instead of WordPress's five tables; it adds Two-Factor Authentication and Application Passwords. The nine colour schemes now match WordPress's names and persist per user |
| Editor → Preferences | Block-editor Preferences: General/Appearance/Blocks | Preferences: Welcome guide, word count, density, preview target and **Document panels** (Author, Template, Discussion, Format, Slug, Categories and tags, Sticky) | match in purpose; the panel visibility list mirrors classic-editor Screen Options and persists per user (ADR 0046) |
| Single post (public) | n/a | — | — | Reading time, related posts and the author box verified in the browser and in production |

Screenshots from this pass (development, git-ignored):
`.playwright-mcp/audit-mn-posts.png`, plus the feature screenshots referenced in
`docs/implementation-log.md`.

## Remaining deviations (deliberate)

| Deviation | Reason |
| --- | --- |
| Allow Pings | Pingbacks/trackbacks need XML-RPC or inbound verification; the runtime stays disabled and the option registry no longer stores a ping state. The control appears disabled and explained in the editor Discussion panel, Quick Edit, Bulk Edit and Settings → Discussion (ADR 0043). |
| Plugin auto-update tabs | MERNPress has one global plugin auto-update preference; per-plugin tabs would imply a per-plugin toggle that does not exist. |
| Comment “Mine” tab | Single-role moderation model; the tab would always equal “All”. |
| Theme/Plugin File Editors | Excluded by owner decision (RCE surface). |

The admin colour schemes (nine), per-user Screen Options, editor notes, and
Customizer panels are implemented and are no longer deviations (ADR 0044,
0046, 0045, 0041).

## Follow-up pass — previously unverified screens

These were re-checked against the live reference on the same day. Where the
reference screen is a JavaScript application (Fonts, Site Editor, Customizer),
the comparison is on the screen name, primary navigation and the visible
controls MERNPress implements.

| Screen | WordPress 7.1.4 | MERNPress | Result |
| --- | --- | --- | --- |
| Media attachment details | “Attachment details” modal: Edit Image, uploaded date/author, file name/type/size/dimensions, alt/caption/description, File URL + copy, view/download/delete | Same dialog title, same fields and actions; previous/next navigation between items | match (re-checked with the reference Hero image; the editor itself is covered in the row below) |
| Media → Edit Image | Inline editor under the fields: Crop, Scale, Image Rotation (90° left/right, 180°, flip vertical/horizontal), Undo, Redo, Cancel Editing, Save Edits; Scale box (width/height) and Crop box (aspect ratio, selection, start position, Apply/Clear) | Modal editor: rotate left/right/180, flip vertical/horizontal, undo/redo, crop with aspect ratios and Apply/Clear, scale mode with width/height and Apply Scale, Save/Cancel, Restore original image | match; **Rotate 180° added in this pass** to complete the rotation set. The overlay replaces WordPress's inline panel because the MERNPress drawer is narrower; every operation is present |
| Appearance → Customize | “Customizing: …”, Site Identity, Colors, Menus, Homepage Settings, Additional CSS, “Use Site Editor” notice | “Customizing: MERNPress” with Site Identity, Colors (five theme tokens), Menus, Homepage Settings (static front page + posts page) and Additional CSS, live preview and per-panel saves | match in panel set (single menu location; no postMessage preview; see ADR 0041) |
| Appearance → Site Editor | `<h1>Design</h1>` | `<h1>Design</h1>`, Identity / Styles / Pages | match |
| Appearance → Fonts | “Fonts” (Font Library) | “Fonts”, Library / Upload / Install Fonts, installed font list | match in name and purpose |
| Tools → Import | “Import” + importer list | “Import” + importer list with Open / Run Importer | match; third-party importers remain unavailable by design |
| Tools → Export | “Export”, *Choose what to export*: All content, Posts, Pages, Media, author/date/status/category filters, Download Export File | “Export”, same four scopes and author/date/status/category filters, Download Export File | match (one filter set applies to the included types; WordPress has separate Posts/Pages fieldsets) |
| Tools → Export / Erase Personal Data | Request form, request list, status filters, bulk actions | Request form, request list with complete/download actions | match in structure; WordPress adds Screen Options and bulk filters |
| Settings → Writing | “Writing Settings”: Post via email, Update Services | Same headings and fields | match |
| Settings → Reading | “Reading Settings”: front page, posts per page, feed items, full text/excerpt, visibility | Same | match |
| Settings → Discussion | “Discussion Settings”: article settings, other comment settings, email me, moderation, disallowed keys, avatars | Same sections plus a Mail delivery log panel | match + MERNPress addition |
| Settings → Media | “Media Settings”: Image sizes, Uploading Files | Same | match |
| Settings → Permalinks | “Permalink Settings”: structure presets, category base, tag base | “Permalink Settings”: the same six presets, a validated custom pattern, category/tag bases and a live preview | match (numeric ids are UUIDs; see ADR 0040) |
| Settings → Privacy | `<h1>Privacy</h1>`, “Privacy Settings”, policy page picker, Create/Use This Page helpers | `<h1>Privacy</h1>`, “Privacy Settings”, policy page picker, **Create a new Privacy Policy page**, Edit/View links and **Use This Page** | match (follow-up slice; see ADR 0039) |
| Settings → Connectors | “Connectors”: Akismet, Anthropic, Google, OpenAI cards | “Connectors”: Spam protection card (bundled heuristic guard with thresholds, stats) + OpenAI / Google / Anthropic key cards; Akismet row marked unavailable with its external-service reason | match in purpose (local guard instead of Akismet; ADR 0042) |
| Dashboard → Updates | “WordPress Updates”: core, Plugins, Themes, re-install | “MERNPress Updates”: MERNPress, Plugins, Themes, Check again | match adapted to the product name |
| Editor at 375 px | Admin bar 46 px, editor header 64 px, sidebar 0 px, canvas 375 px; Add block, Document overview, Save draft, Preview, Settings, Publish, Options | Admin bar 46 px, editor header 64 px, sidebar 0 px, canvas 375 px; Add block, Document overview, Save draft, Preview, Settings, Publish, overflow menu | match after **Save draft and Preview were restored to the mobile header** (they were hidden below 782 px); no horizontal overflow at 320/375/768/1024 px |

The only code change from this pass was the Privacy page title/heading split
(`Privacy` as the page title, `Privacy Settings` as the section heading), which
now matches WordPress.

## Deliberate deviations confirmed in this pass

| Deviation | Reason |
| --- | --- |
| Single Customizer menu location | Themes are token packages with one header menu; multiple menu locations/widget areas are not implemented (ADR 0041). |
| Akismet replaced by a local guard | External account, API key and per-comment data transfer were not accepted; the heuristic guard is local (ADR 0042). |
| Allow Pings | No XML-RPC endpoint or inbound link verification; shown disabled and explained (ADR 0043). |

## Verification status

All screens listed in this document have now been re-checked against the live
WordPress 7.1.4 reference at least once. The only remaining items are the
deliberate deviations above and the owner-blocked external services (SMTP,
Akismet, file editors, third-party importers) recorded in the parity matrix.


## Control and chrome metrics pass (2026-11-05, second measurement)

A second measured pass compared computed styles, not just the DOM structure, on
Posts and Settings → General at 1440×1000. Every item below was a real
difference that is now fixed; the `content.spec.ts` E2E test asserts the control
contract so it cannot silently regress.

| Metric | WordPress 7.1.4 | MERNPress before | MERNPress after |
| --- | --- | --- | --- |
| Text-input border | `1px solid #949494` | `#8c8f94` | `#949494` |
| Input/select radius | 2 px | 3 px | 2 px |
| Settings input box | 40 px high, padding 0 12, line-height normal | 40 px, line-height 28 | 40 px, line-height normal |
| Single-select chevron | inline SVG, `appearance:none`, right padding 24 | native arrow | same inline SVG, `appearance:none`, right padding 24 |
| List-table select | height 32, line-height 30 | height 32, line-height 28 | line-height 30 |
| Standard button | height 32, padding 0 10, line-height 30, radius 2 | height 34, padding 3 12, line-height 26, radius 3 | height 32, padding 0 10, line-height 30, radius 2 |
| First sidebar item | y = 44 (bar 32 + 12 padding) | y = 48 (extra 4 px nav padding) | y = 44 |
| Row actions | off-screen (`left: -129987px`), focusable, reveal on hover/focus | `visibility:hidden` (not keyboard reachable) | off-screen and focusable; `left: 0` on hover/focus; no horizontal overflow |
| Search field line-height | normal | 28 px | normal |

Screenshots from this pass (development, git-ignored):
`.playwright-mcp/audit-wp-posts.png`, `.playwright-mcp/audit-mn-posts-final.png`,
`.playwright-mcp/audit-mn-posts-refined.png`, `.playwright-mcp/dev-analytics2.png`.

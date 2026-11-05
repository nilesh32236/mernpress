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

## Not yet re-checked in this pass

These screens are implemented and were exercised functionally in earlier
slices, but were not part of this 11-screen structural comparison:

- Editor canvas chrome at 375 px (covered by the E2E responsive test).
- Media detail modal and Edit Image.
- Appearance → Customize, Site Editor, Fonts.
- Tools → Import, Export, Export/Erase Personal Data, Backups, Redirects.
- Settings → Writing, Reading, Discussion (mail log), Media, Permalinks, Privacy, Connectors.
- Updates screen.

They should be added to this table as they are re-verified; no claim of pixel
parity is made for them here.

# ADR 0039 — Privacy policy page helpers

- Status: accepted (owner scope decision, 2026-11-05)
- Completes the privacy helpers listed in the design audit

## Context

WordPress's Settings → Privacy screen can create a draft privacy-policy page
from its suggested template and select an existing page with “Use This Page”.
MERNPress only had a page dropdown plus Save Changes, so a new site had no
policy page and no guided way to start one.

## Decision

1. **Create from a suggested template.** `POST /api/admin/privacy/policy-page`
   creates a **draft** page titled “Privacy Policy” and selects it. Creation
   goes through `ContentService.createPost`, so slug allocation
   (`privacy-policy`, then suffixes), validation, hooks and revision baselines
   match pages created in the editor.
2. **Original template prose.** The template is written for the data model this
   build actually has (comments, media re-encoding, session cookies, no
   third-party analytics, personal-data export/erasure, mail log retention). It
   is not copied from WordPress and it carries a visible note that it is a
   starting point, not legal advice. The site title is read from options and
   HTML-escaped into the template.
3. **Select an existing page.** `PUT /api/admin/privacy/policy-page` accepts
   `{ pageId: uuid | null }` (“Use This Page” / clear). The target must exist,
   be `type = page` and not be trashed; otherwise `404`/`400`. The selection is
   stored in the existing `wp_page_for_privacy_policy` option, so the generic
   settings form and this action stay consistent.
4. **Administrators only.** Both routes require `manage_options` via the shared
   admin guard; the service re-checks the capability so direct callers cannot
   bypass it.
5. **UI matches WordPress.** When nothing is selected, Settings → Privacy shows
   **Create a new Privacy Policy page**. Once a page is chosen (created or
   picked from the dropdown), it shows Edit page / View page links and **Use
   This Page**, which applies the selection without a full settings save. The
   dropdown lists drafts (a newly created policy is a draft) and hides trashed
   pages.
6. **No automatic publication.** The created page stays a draft until the
   administrator reviews and publishes it; the public `/privacy-policy` URL is
   therefore 404 until then. The option may point at an unpublished page, as in
   WordPress.

## Consequences

- No migration: the option already exists and the page is a normal post row.
- Creating the page and setting the option are two writes; if the second fails
  the draft page remains (logged as an error by the request). Re-running the
  action selects the page that was created.
- The template is a starting point; the site owner remains responsible for its
  accuracy. The screen states this.

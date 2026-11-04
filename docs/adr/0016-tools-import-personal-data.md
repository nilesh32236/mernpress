# ADR 0016 — Tools: Import and personal data requests (expanded scope)

- Status: accepted (owner scope decision, 2026-11-04)
- Completes the Tools menu started in earlier slices

## Context

WordPress's Tools menu has Import, Export, Site Health, Export Personal Data and
Erase Personal Data, plus in-browser Theme/Plugin File Editors. MERNPress had
Available Tools, Export and Site Health only. The owner approved matching every
WordPress screen; the file editors are a code-execution surface that conflicts
with the repository's security boundary (AGENTS §7), so they stay excluded and
documented.

## Decision

1. **The WordPress importer is real.** Tools → Import lists the WordPress
   importer next to the third-party importers WordPress shows. Selecting the
   WordPress importer opens a file picker, reads the WXR export in the browser
   and posts the XML to `POST /api/admin/import/wordpress`. The service parses
   `item` blocks, imports posts and pages, their categories/tags and publish
   dates, keeps drafts as drafts, re-slugs collisions and reports
   imported/skipped/failed counts plus per-item errors. Attachments, comments,
   users and custom fields are not imported, and the screen says so.
2. **Personal data requests are a real workflow.** A new additive
   `data_requests` table stores `EXPORT`/`ERASE` requests with the requester
   email, matched user, status and timestamps. Tools → Export Personal Data and
   Erase Personal Data mirror WordPress: the "Add Data Export/Erasure Request"
   form, the All (n) filter line and the Requester | Status | Requested | Next
   steps table with the WordPress empty state.
3. **Exports produce real data.** "Download personal data" streams a JSON file
   containing the account profile, its posts and its comments. It is a
   point-in-time export, not a ZIP with media.
4. **Erasure anonymises, it does not delete accounts.** Confirming an erasure
   request clears the profile fields (email, display/first/last name, nickname,
   bio, website) and replaces comment authorship with `Anonymous`
   (`removed@example.invalid`, no URL, no user link) in one transaction, then
   records completion and the action taken. Keeping the account matches
   WordPress and avoids silently deleting content.
5. **Requests are capability-checked.** Every route requires `user.manage`
   (administrators) on top of an authenticated session; duplicate pending
   requests and unknown accounts are rejected with 409/404.
6. **File editors remain out of scope.** Tools → Theme File Editor and Plugin
   File Editor are not implemented; editing server code in the browser is a
   remote-code-execution surface the project does not accept.

## Consequences

- One additive migration (`20261104112457_add_data_requests`).
- Third-party importers (Blogger, LiveJournal, Movable Type, RSS, Tumblr) are
  listed but marked "Not available in this build"; the Categories and Tags
  Converter links to the existing tool.
- The Tools menu now matches WordPress 7.1 except the two file editors.

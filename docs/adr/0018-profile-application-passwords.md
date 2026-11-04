# ADR 0018 — Profile personal options and application passwords

- Status: accepted (owner scope decision, 2026-11-04)
- Extends: `packages/cms-core/src/auth`, admin Profile screen, API guard

## Context

WordPress's Profile screen has Personal Options (Syntax Highlighting,
Administration Color Scheme, Keyboard Shortcuts, Toolbar, Infinite Scrolling,
Language) and an Application Passwords section. MERNPress had the local-only
options (colour scheme, shortcuts, toolbar, scrolling) but no stored syntax
preference, no language row, and no application passwords. Its API could only be
used from a browser session, so non-interactive clients had no supported way to
authenticate.

## Decision

1. **Preferences live on the user row.** `users.syntax_highlighting` (default
   true; the checkbox reads "Disable syntax highlighting when editing code") and
   `users.locale` (default `en_US`) are returned by `GET /api/profile`,
   validated on `PUT /api/profile`, and rendered in Personal Options in
   WordPress's order. `GET /api/profile/locales` lists the installed languages;
   only `en_US` ships, and any other value is rejected with
   `INVALID_LOCALE` rather than silently stored.
2. **Application passwords are real credentials.** A new
   `application_passwords` table stores the owning user, a name, an Argon2id
   hash, `last_used_at` and `last_used_ip`. Creating one returns a 24-character
   password grouped as `xxxx xxxx xxxx xxxx xxxx xxxx` exactly once; the API
   never returns it again. Whitespace is ignored when verifying, like
   WordPress. Each credential is revoked individually; the table cascades on
   user deletion.
3. **Basic auth for the API, not the browser session.** The admin guard accepts
   `Authorization: Basic base64(username:application password)` when no session
   cookie is present. The principal and capability checks are unchanged.
   CSRF does not apply to Basic credentials (no ambient cookie), and the global
   Origin check is skipped for cookie-less Basic requests so standard API
   clients work. Session-authenticated mutations still require exact Origin +
   CSRF.
4. **HTTPS is required in production.** A Basic request that is not HTTPS is
   rejected with `APP_PASSWORD_HTTPS_REQUIRED`; credentials must never travel in
   clear text. Development/test over loopback is allowed so the flow is
   testable.
5. **Last-used is throttled.** `last_used_at`/`last_used_ip` are written at most
   once every five minutes per credential, so verification does not turn every
   API read into a write. Verification checks at most the ten newest
   credentials per user to bound Argon2 work.
6. **Self-service only.** Any authenticated user can list, create and revoke
   their own credentials; queries are scoped by `userId`, and another user's id
   returns 404. No capability beyond the session is required, matching
   WordPress's per-user section.

## Consequences

- One additive migration: `20261104130529_add_profile_prefs_app_passwords`
  (two user columns and the `application_passwords` table).
- The Profile screen now matches WordPress's Personal Options and Application
  Passwords sections; the existing session list remains a MERNPress addition
  (WordPress shows it under Account Management as well).
- The mail transport (comment notifications, Add User "Send User Notification")
  is still not implemented; it is the next slice and remains explicitly
  disabled rather than faked.

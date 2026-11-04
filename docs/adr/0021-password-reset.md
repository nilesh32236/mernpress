# ADR 0021 — Lost-password request and reset tokens

- Status: accepted (owner scope decision, 2026-11-04)
- Completes the profile/auth surface; supersedes the "no reset flow" note in ADR 0019

## Context

WordPress's login screen links to a lost-password form: the user enters a
username or email, receives a single-use reset link valid for 24 hours, sets a
new password, and all sessions are invalidated. MERNPress had only a placeholder
telling users to ask an administrator, and the new-user welcome e-mail could not
include WordPress's reset link.

## Decision

1. **Tokens are hashed, single-use and expire.** A new `password_resets` table
   stores the user, the SHA-256 hash of a 256-bit token, an optional HMAC of the
   requesting IP, creation/expiry (24 hours) and `used_at`. The plaintext token
   exists only in the e-mail link. A new request replaces any unused token for
   that user, matching WordPress's single reset key.
2. **Lost-password requests are generic and rate-limited.** `POST
   /api/auth/lost-password` accepts a username or email, requires the pre-auth
   CSRF token, and always answers `{ "sent": true }` for a syntactically valid
   identifier, whether or not the account exists (no enumeration). It is limited
   to 3 requests per identifier and 10 per IP per 15 minutes through the existing
   database-backed limiter under separate hash namespaces. Unknown/inactive
   accounts send nothing. When no mail transport is configured the endpoint
   returns `503 MAIL_NOT_CONFIGURED` rather than pretending to send.
3. **Reset is a real password change.** `POST /api/auth/reset-password` takes
   `key`, `login` and the new password, requires pre-auth CSRF, validates the
   password policy, and atomically updates the hash, deletes every session for
   the user, marks the token used, deletes other unused tokens and writes an
   audit event. Replaying or expiring a token returns
   `400 INVALID_RESET_KEY`. Failed submissions are rate-limited per IP.
4. **The UI matches WordPress.** The login card's "Lost your password?" opens
   the Lost Password form ("Get New Password"); success shows a generic
   "check your email" message. The e-mail link
   (`/admin/?action=rp&key=…&login=…`) renders a Reset Password screen that
   works while signed in or out, with New password/Confirm fields and a
   "Save Password" action.
5. **Welcome e-mails now carry the reset link.** Add User → Send User
   Notification issues a token and includes "To set your password, visit the
   following address", matching WordPress. `ADMIN_URL` optionally overrides the
   admin base for split-origin development; production uses the site origin.
6. **Mail is still required.** With no SMTP configured the lost-password form
   reports that delivery is not configured; nothing is silently dropped.

## Consequences

- One additive migration (`20261104135232_add_password_resets`).
- Reset tokens are protected by database compromise only through SHA-256
  preimage resistance (256-bit random tokens), and raw IPs are never stored.
- The temporary-admin workflow remains unaffected; the admin can reset a
  password from Users or through this flow.

# ADR 0023 — Users → Send password reset

- Status: accepted (owner scope decision, 2026-11-05)
- Uses the reset-token service from ADR 0021

## Context

WordPress's Users list gives administrators a "Send password reset" row action
and the same option in Bulk actions. MERNPress had an administrator-set password
dialog but no way to send the user a reset link.

## Decision

1. **Real reset links, not a placeholder.** `POST
   /api/users/:id/send-password-reset` (administrator, CSRF-protected) issues a
   single-use 24-hour token through `PasswordResetService.createToken` and
   e-mails the existing "Password Reset" message. The user chooses their own
   password; the administrator never sees it.
2. **Same rules as the public flow.** The target must exist, be active and have
   an email address; mail must be configured. Otherwise the API returns
   `404 USER_NOT_FOUND`, `400 INVALID_EMAIL`, `400 INVALID_STATUS` or
   `400 MAIL_NOT_CONFIGURED`, and a delivery failure returns
   `502 MAIL_SEND_FAILED`. Nothing is reported as sent when it was not.
3. **Audited with actor and target.** The action writes
   `user.password_reset.sent` with the administrator as actor, the target user,
   and `{ source: 'admin' }`. (The public request/complete events from ADR 0021
   remain user-actored.)
4. **The UI matches WordPress.** Non-self rows show "Send password reset" after
   Edit, Delete and View; self rows do not. Bulk actions include "Send password
   reset" in both the top and bottom toolbars, and the result reports how many
   links were sent and how many failed.
5. **No rate limit for administrators.** The public lost-password limiter exists
   to stop unauthenticated abuse; an authenticated administrator may resend when
   a user asks. Each send replaces the user's previous unused token.

## Consequences

- No migration: the `password_resets` table already exists.
- A send to a user without email / a disabled user fails with an explicit
  message rather than silently doing nothing.
- Combined with ADR 0021 this closes the WordPress Users reset workflow; the
  remaining difference is WordPress's nonce URL vs. this API call.

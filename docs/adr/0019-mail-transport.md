# ADR 0019 — Outbound mail and notifications

- Status: accepted (owner scope decision, 2026-11-04)
- Extends: comments service, user administration, admin Add User screen

## Context

WordPress e-mails the site administrator about new comments and held comments
and can e-mail a newly created user. MERNPress stored `comments_notify` and
`moderation_notify` but had no transport, so those options and the Add User
"Send User Notification" checkbox were inert.

## Decision

1. **One mail service, explicit configuration.** `packages/cms-core/src/mail`
   owns message composition and delivery. Transport is chosen at startup from
   the environment:
   - `SMTP_HOST` + `SMTP_PORT` (+ optional `SMTP_USER`/`SMTP_PASS`,
     `SMTP_SECURE`) → Nodemailer SMTP, with 10 s connection/greeting and 20 s
     socket timeouts so a dead relay cannot hang a request for minutes.
   - `MAIL_TRANSPORT=memory` → an in-memory sink for tests and local
     verification. The environment schema rejects this in production.
   - Neither → no transport; the UI and API report mail as not configured and
     no notification is attempted.
   `MAIL_FROM` is required when SMTP is configured so the sender is explicit.
2. **Notifications are real and preference-driven.** After a public comment is
   stored:
   - `PENDING` + `moderation_notify` → e-mail to the General administration
     email (falling back to the oldest active administrator with an address),
     with the post, author, comment and a moderation link.
   - `APPROVED` + `comments_notify` → e-mail to the post author's address when
     the author is a user with one, otherwise the administration address.
   A disabled preference sends nothing. Delivery failures are logged and never
   fail the comment or the request, matching WordPress.
3. **Send User Notification is enabled when mail is configured.** The Add User
   screen reads `GET /api/admin/mail/status`; the checkbox is checked by default
   and disabled with an explanation when no transport exists. When checked, the
   API requires an email address and a configured transport (400
   `MAIL_NOT_CONFIGURED` otherwise) and sends the username, display name and
   login URL. The password is never included.
4. **Honest difference from WordPress.** WordPress's new-user e-mail contains a
   password-reset link. MERNPress has no password-reset flow yet, so the message
   tells the user an administrator set the password and to ask for a reset. This
   is documented rather than simulated.
5. **No HTML, no user-controlled headers.** Messages are plain text; subjects
   are single-lined; recipients must be valid stored addresses; SMTP credentials
   live only in environment variables. Message bodies include user content,
   which is expected for a notification and is never rendered as HTML.

## Consequences

- `nodemailer` 10.3.1 (MIT-0, no transitive dependencies) is the first mail
  dependency; pinned exactly in `packages/cms-core`.
- No migration: preferences already existed; mail state comes from env.
- Production sends no mail until `SMTP_HOST`/`MAIL_FROM` are configured and the
  API restarted. Until then Site Settings and Add User state this explicitly.

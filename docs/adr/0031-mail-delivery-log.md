# ADR 0031 — Transactional mail delivery log

- Status: accepted (owner scope decision, 2026-11-05)
- Implements the second-ranked slice from `docs/research/plugin-theme-roadmap.md`

## Context

"I never got the email" is one of the most common CMS support questions.
WordPress core keeps no delivery history; users install another plugin (or get
none). MERNPress had SMTP transport and notifications but no way to see whether a
message was attempted, delivered or rejected.

## Decision

1. **Metadata-only log.** `mail_log_entries` stores recipient, subject,
   `sent`/`failed`, a short reason (`no-recipient`, `transport-failed`) and the
   timestamp. Message bodies, reset tokens, passwords and SMTP credentials are
   never stored or logged.
2. **Written by the single delivery path.** `MailService.deliver` records one row
   for every attempted delivery: success, missing/invalid recipient, or transport
   failure. A disabled transport or a disabled notification preference records
   nothing because no attempt was made.
3. **Bounded retention.** After each write the service deletes rows beyond the
   200 newest, so the table cannot grow without limit. A failed log write is
   logged and never fails the notification.
4. **Admin-only API and screen.** `GET/DELETE /api/admin/mail/log` require
   `manage_options`. The Settings → Discussion screen shows the transport status,
   sender, the latest 100 deliveries and a Clear log action. Clearing asks for
   confirmation.
5. **Honest empty state.** When SMTP is not configured the panel says so and
   explains that no notification is attempted; it does not fabricate "sent"
   rows. In-memory transport is labelled as development/test only.
6. **No PII beyond the recipient.** The log does not store IPs, user agents,
   referrers, message contents or attachment names.

## Consequences

- One additive migration `20261105091716_add_mail_log`.
- The log is per-installation and not replicated; multi-instance deployments
  share the database but the table remains authoritative.
- Production still needs SMTP credentials from the owner; the log will show
  `no-recipient`/`transport-failed` reasons once attempts happen, and remains
  empty until then.
- A future slice can add per-entry retry or export; neither is included now.

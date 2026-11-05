# ADR 0035 — Two-factor authentication (TOTP + recovery codes)

- Status: accepted (owner scope decision, 2026-11-05)
- Implements the 2FA slice from `docs/research/plugin-theme-roadmap.md`

## Context

Users repeatedly ask for two-factor authentication to be core rather than a
plugin. MERNPress had Argon2id passwords, sessions, CSRF and rate limiting but no
second factor.

## Decision

1. **RFC 6238 TOTP, implemented locally.** `auth/totp.ts` implements base32,
   HMAC-SHA1, six digits and a 30-second period with ±1 period of drift. Secrets
   are 160-bit random values. No dependency and no external service.
2. **Secrets are encrypted at rest.** `users.two_factor_secret` stores the TOTP
   secret sealed with AES-256-GCM using a key derived from
   `AUTH_HASH_PEPPER`. Recovery codes are stored only as HMAC-SHA256 hashes in
   `two_factor_recovery_codes` (eight codes, each single use).
3. **Enrollment is two-step.** `POST /api/profile/two-factor/setup` generates a
   secret and recovery codes (shown once) but does not enable 2FA. The account is
   enabled only after `confirm` verifies a code. `status` reports enabled,
   confirmed-at and remaining recovery codes.
4. **Login becomes a challenge.** When the account has 2FA, a correct password
   returns `{ twoFactorRequired: true, challengeToken, username, expiresAt }`
   and **no session cookies**. `POST /api/auth/two-factor` verifies a TOTP or
   recovery code and only then creates the session and CSRF cookies. Challenges
   are hashed, single-use, expire after 10 minutes and allow five attempts.
5. **Replay and brute force are bounded.** The highest accepted TOTP counter is
   stored (`two_factor_last_counter`); a code cannot be reused. Recovery codes
   are consumed in a conditional update. The per-challenge attempt cap and the
   existing login limiter bound guessing; no enumeration is introduced.
6. **Disabling is protected.** `POST /api/profile/two-factor/disable` requires
   the account password **and** a valid TOTP/recovery code; it clears the secret,
   codes and outstanding challenges. Recovery codes can be regenerated with the
   password. Every enable/disable/reset/recovery-use writes an audit event.
7. **Administrators can reset another account.** `DELETE /api/users/:id/two-factor`
   (user.manage) clears 2FA for support cases, is audited, and is exposed as
   **Reset 2FA** on Users rows where 2FA is enabled.
8. **UI.** Profile → Two-Factor Authentication shows the secret and `otpauth://`
   URI (no QR dependency), recovery codes once, a confirming code field, and
   disable/regenerate forms. Login shows a code form (accepts recovery codes)
   after the password step.

## Consequences

- Two additive migrations: `20261105100529_add_two_factor_auth` (tables) and
  `20261105100707_add_two_factor_user_fields` (user columns).
- Users who lose both the authenticator and recovery codes need an administrator
  reset; this is documented rather than bypassed.
- TOTP verification uses the server clock; hosts must keep NTP synchronized.
- No SMS/WebAuthn in this slice; they can be added behind the same `TwoFactorService`.

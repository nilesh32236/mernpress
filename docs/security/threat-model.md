# Threat model

Status: Phase 0 baseline, reviewed during Phase 1. The Phase 1 foundation is
implemented (env validation, minimal health endpoints, no auth/session yet).
Review at every phase that changes authentication, authorization, uploads,
rendering, plugins or deployment.

This document is a working model, not a certification. MERNPress is a hobby/
self-hosted CMS in its first version. It must not claim production-grade security,
HIPAA compliance, PCI compliance or multi-tenant isolation.

## 1. Scope and assumptions

In scope:

- The admin SPA, API, public Next.js site, PostgreSQL, local media storage.
- Trusted local plugins/themes.
- Self-hosting behind a reverse proxy with TLS.
- A single site/tenant.

Assumptions:

- The server OS, Node runtime, PostgreSQL and reverse proxy are patched by the
  operator.
- The database is not exposed to the public internet.
- Admin access is restricted to trusted editors/administrators.
- Plugins/themes are reviewed before installation; they are not untrusted code
  from a marketplace.
- Backups are stored securely and tested.
- No paid WAF/CDN is assumed.

Out of scope for MVP:

- Multi-tenancy, untrusted plugin sandboxing, PCI/payment data, HIPAA/PHI
  compliance, full GDPR automation, DDoS mitigation at scale, supply-chain
  attestation for every dependency.

## 2. Assets

| Asset | Why it matters | Where it lives |
| --- | --- | --- |
| Content (drafts/published) | Primary user data; integrity/reputation | PostgreSQL |
| User credentials/sessions | Account takeover | PostgreSQL + HttpOnly cookie |
| Capabilities/roles | Authorization boundary | PostgreSQL |
| Media files | User data, possible PII; upload attack surface | Disk/object storage |
| Secrets (DB URL, session key, SMTP) | Full compromise if leaked | Environment/config |
| Plugin/theme code | Runs with server privileges | Repository/node_modules |
| Backups | Full data + secrets if unencrypted | Operator storage |
| Audit logs | Investigation/recovery | PostgreSQL/logs |
| Public SEO/metadata | XSS/SEO poisoning | PostgreSQL + rendered HTML |

## 3. Actors

| Actor | Trust | Capabilities |
| --- | --- | --- |
| Anonymous visitor | Untrusted | Read published content, login page |
| Author | Low trust | Create/edit own drafts; no publish unless granted |
| Editor | Medium trust | Edit/publish content, manage terms/media |
| Administrator | High trust | Users, settings, plugins/themes, destructive actions |
| Plugin/theme code | Trusted code, not sandboxed | Same OS/DB/env privileges as the server |
| Operator | Trusted | Server, database, backups, secrets |
| External attacker | Untrusted | Network/API/browser/content inputs |
| Supply-chain attacker | Untrusted | Dependency/package compromise |

## 4. Trust boundaries

```mermaid
flowchart LR
  B[Browser<br/>untrusted input] -->|HTTPS| P[Reverse proxy / TLS]
  P --> A[API process]
  A --> DB[(PostgreSQL)]
  A --> FS[(Media storage)]
  A --> ENV[(Secrets/env)]
  A --> PL[Plugins<br/>trusted code, same privileges]
  W[Next web process] --> A
  W --> TH[Theme packages<br/>trusted code]
  OP[Operator] --> P
  OP --> DB
  OP --> BK[Backups]
```

Boundaries:

1. Browser → API/web: all input untrusted; authenticate and validate.
2. API → DB: parameterized queries; least-privilege DB user.
3. API → filesystem: path confinement; no user-controlled paths.
4. API → plugin code: **not a security boundary**; trusted code.
5. Web → theme code: **not a security boundary**; trusted code.
6. Operator → server: trusted, but least privilege and audited changes.

## 5. Threat table

| ID | Threat | Impact | Likelihood | Mitigations | Residual |
| --- | --- | --- | --- | --- | --- |
| T-01 | Credential stuffing/brute force on login | Account takeover | High | Argon2id, rate limit/backoff, generic errors, optional 2FA later, strong password policy | Determined attacker with valid credentials |
| T-02 | Session theft via XSS or network | Account takeover | Medium | HttpOnly/Secure/SameSite cookies, CSP, short expiry, rotation, revocation, no tokens in localStorage | Malware/browser compromise |
| T-03 | CSRF on state-changing requests | Unauthorized actions | Medium | SameSite + Origin check + CSRF token; no GET mutations; CORS allowlist | Same-site attacker with a token |
| T-04 | Session fixation | Account takeover | Low | New token on login, rotation, no token in URL | — |
| T-05 | IDOR / missing object authorization | Data leak/modification | High | Capability service + object checks on every operation; tests for wrong-object | Logic bug in a new route |
| T-06 | Privilege escalation via mass assignment | Admin takeover | Medium | Allowlist DTO fields; never bind `role`, `authorId`, `status` from arbitrary input | A new field added carelessly |
| T-07 | Stored XSS in block content | Admin/site compromise | High | Allowlist sanitizer, escape text/attrs, URL protocol allowlist, CSP, tests | Sanitizer bypass/0-day |
| T-08 | XSS in media metadata/SEO/settings | Same | Medium | Escape on output, validate/sanitize, no raw HTML in settings | Same |
| T-09 | Upload MIME spoofing/executable upload | RCE/host compromise | High | Magic-byte check, extension allowlist, re-encode images, random names, no executable formats, serve with safe headers | Image codec 0-day |
| T-10 | Path traversal in media serving | File disclosure | Medium | Canonicalize + confine to storage root; reject `..`/absolute; tests | OS/path edge case |
| T-11 | Image decompression bomb/DoS | Resource exhaustion | Medium | Size/dimension/pixel limits, timeouts, memory caps, queue | Large legitimate files |
| T-12 | SVG/HTML upload XSS | Admin/site compromise | High | No SVG/HTML in MVP; if added, sanitize and serve as attachment with CSP | Future feature risk |
| T-13 | SQL injection via raw SQL | Data breach | Medium | Prisma parameterization; `Prisma.sql` tags; no string interpolation; sort/filter allow-lists | A new raw query bug |
| T-14 | Unsafe filtering/sorting | Data leak/DoS | Medium | Allow-list columns/operators; bound page size; validate | — |
| T-15 | SSRF via external fetch | Internal network access | Medium | No arbitrary fetch in MVP; if added, allowlist hosts, block private IPs/metadata, timeouts | Future feature |
| T-16 | Secret leakage in logs/errors/git | Full compromise | Medium | Env validation, redaction, no stack traces in prod, `.gitignore`, secret scan in CI | Operator mistake |
| T-17 | Debug mode in production | Info leak | Medium | `NODE_ENV=production`, disable stack traces, health endpoints minimal | Misconfiguration |
| T-18 | Malicious plugin code | Full server compromise | High (if untrusted) | Trusted local plugins only; allowlist; review; least-privilege DB; no remote install; docs state no sandbox | A trusted plugin is compromised |
| T-19 | Plugin migration damages data | Data loss | Medium | Reviewed, forward-only, advisory lock, backup, dry run, no core table alteration | Bug in a reviewed migration |
| T-20 | Supply-chain dependency compromise | Full compromise | Medium | Lockfile, pinned versions, `pnpm audit`, provenance where possible, no postinstall by default, review | Upstream compromise |
| T-21 | Weak cookie/headers/CORS | Session/data leak | Medium | Secure flags, Helmet/Fastify headers, explicit CORS allowlist, HSTS in prod | Misconfiguration |
| T-22 | Backup theft/unencrypted backup | Full data breach | Medium | Encrypt backups, restrict access, test restore, separate credentials | Operator storage compromise |
| T-23 | Log injection/PII in logs | Privacy/incident | Medium | Structured logs, redact, truncate, no raw bodies/secrets | Unknown field logged |
| T-24 | Dependency/runtime EOL | Unpatched RCE | Medium | Node 24 LTS, PostgreSQL 18, update policy, advisory monitoring | Zero-day |
| T-25 | DoS via large content/expensive render | Outage | Medium | Body/content size caps, parser depth/block caps, rate limit, timeouts | Resource exhaustion |
| T-26 | Preview token leakage | Draft disclosure | Medium | Signed, short-lived, draft-only, noindex/no-store, revocable | Link sharing |
| T-27 | Cache poisoning/stale draft | Data leak | Medium | Cache only published content; preview no-store; tag invalidation; secret webhook | Cache bug |
| T-28 | Open redirect | Phishing | Low | Validate redirect destinations; allow only relative/internal or allowlisted hosts | — |
| T-29 | Email header injection (if email added) | Spam/abuse | Medium | Sanitize headers, no user-controlled `From`/`Subject` newlines, provider API | Future feature |
| T-30 | Insider/operator misuse | Data breach | Low/Medium | Least privilege, audit log, backups, separation of duties (future) | Trusted operator |

## 6. Security requirements by area

### Authentication

- Argon2id with a reviewed memory/time cost; bcrypt fallback only with a documented
  cost (≥12) and a migration path.
- Opaque random session tokens (≥256 bits), stored as SHA-256 hashes; no JWT in
  the admin cookie.
- Cookie: `HttpOnly`, `Secure` in production, `SameSite=Lax` or stricter, `Path=/`,
  bounded expiry. No session token in localStorage/sessionStorage/URLs.
- Login rate limit per IP + per account, with backoff; generic error messages.
- Session rotation on login/privilege change; logout-all; idle/absolute expiry.
- Password reset (later): hashed, single-use, short-lived token; no user
  enumeration; invalidate sessions after reset.

### Authorization

- Deny by default. Every route has an explicit auth requirement.
- Object-level checks in the service layer (`can(user, 'post.edit', post)`).
- Never trust `authorId`, `role`, `status`, `capabilities` from the client without
  an explicit allowed transition.
- Admin UI hiding is UX, not security.
- Tests for every mutating route: unauthenticated, wrong role, wrong object.

### CSRF/CORS/headers

- SameSite cookies + Origin/Referer check + a per-session CSRF token for
  state-changing requests.
- No state-changing GET.
- CORS: explicit allowlist, credentials only for the admin origin.
- Helmet/Fastify: CSP, HSTS (prod), `X-Content-Type-Options`, `Referrer-Policy`,
  `X-Frame-Options`/frame-ancestors.
- CSP must allow the editor's styles/workers; document exceptions. Avoid
  `unsafe-eval` unless a package requires it; test the editor.

### Content/XSS

- Treat all content/media metadata/SEO fields as untrusted.
- Server-side allowlist sanitizer; escape text/attributes; URL protocol allowlist.
- No raw HTML block in MVP; no SVG; no inline event handlers.
- CSP as defense-in-depth; no `dangerouslySetInnerHTML` without the sanitized
  contract.
- Preview and public rendering use the same sanitizer; no "trusted preview" path.

### Uploads

- Size limit, extension allowlist, magic-byte MIME check, image re-encode, random
  filename, storage outside webroot or controlled serving, path confinement.
- No executable/script formats; no SVG until sanitized; no HTML.
- Strip EXIF/metadata by default; cap dimensions/pixels; timeouts.
- Serve with `Content-Type` from the server, `Content-Disposition` where
  appropriate, `X-Content-Type-Options: nosniff`.
- Delete/replace requires authorization and reference checks.

### Database

- Least-privilege DB user (no superuser/createdb; only the app database).
- Prisma parameterization; raw SQL only via tagged templates and reviewed.
- Allow-list sort/filter fields; bound pagination.
- Migrations reviewed; destructive changes backed up.
- Backups encrypted and access-controlled; restore tested.

### Plugins/themes

- Trusted local code only; explicit allowlist; no remote install/auto-update.
- No sandbox claim. Run the API with least privilege; consider OS/container
  isolation for third-party code later.
- Plugin migrations reviewed, forward-only, advisory-locked, backed up.
- Plugin settings cannot store secrets in `options`; use env/config references.
- Supply-chain: lockfile, advisory scan, no postinstall by default.

### Logging/errors

- Structured logs with request ID; redact cookies, authorization headers,
  passwords, tokens, emails where not needed.
- Production errors return a stable code/message; no stack traces/SQL.
- Health endpoints expose minimal status, not configuration.
- Audit log for auth/user/content/settings/plugin actions (no secrets).

## 7. Safe defaults for local development

- `.env.example` contains placeholders, not real secrets.
- `NODE_ENV=development` locally; production requires explicit secrets and
  `Secure` cookies.
- The database listens on localhost by default; do not expose 5432 publicly.
- Media stored in a local directory excluded from git.
- Seed/demo credentials are local-only and clearly marked; never reused in
  production.
- CORS defaults to the local admin origin; production requires explicit origins.
- Debug/stack traces are development-only.

## 8. Residual risks (accepted for MVP)

- No WAF/DDoS protection; the operator/reverse proxy must provide it.
- No 2FA; strong passwords + rate limiting only.
- No malware scanning of uploads; image re-encode reduces but does not eliminate
  risk.
- No sandbox for plugins/themes; trust is organizational.
- No formal penetration test; automated tests + review only.
- No HIPAA/GDPR/PCI compliance claim; do not store regulated data without a
  separate review.
- No multi-tenant isolation; one site per deployment.
- No automated backup/restore UI; operator runbook required.
- No real-time intrusion detection; logs/audit are post-hoc.

## 9. Security gates by phase

| Phase | Gate |
| --- | --- |
| 1 | Env validation, no secrets in git, health endpoints minimal, dependency audit |
| 2 | Auth/session/CSRF/rate-limit tests, cookie flags, authz matrix |
| 3 | Object-level authz, mass-assignment review, validation, conflict handling |
| 4 | XSS in admin forms/lists, CSRF, admin route guards |
| 5 | Sanitizer/XSS suite, unknown-block safety, CSP compatibility, no eval |
| 6 | Upload MIME/traversal/bomb tests, storage confinement, image processing limits |
| 7 | Public XSS, canonical/redirect validation, cache poisoning, headers |
| 8 | Preview token security, scheduler concurrency, autosave authorization |
| 9 | Plugin trust model, migrations, supply chain, least privilege, no remote install |
| 10 | Theme trust model, settings sanitization, no DB access, CSP |
| Pre-deploy | Backup/restore drill, TLS/HSTS, secrets rotation, dependency audit, log review |

## 10. Incident and repair notes

- If a session token may be compromised: rotate the session secret, revoke all
  sessions, force password reset for affected accounts, review audit logs.
- If upload validation is bypassed: disable uploads, quarantine the storage,
  identify files, rebuild derivatives, review server logs.
- If a plugin is compromised: disable it (safe mode), revoke DB/API credentials,
  audit its migrations/data, restore from a known-good backup if needed.
- If XSS is found: add a regression test, sanitize the output path, review stored
  content, consider a CSP tightening and a content scan.
- If a migration fails: stop, restore the backup, fix forward with a new
  migration; never edit the applied migration.
- Record the incident, timeline, root cause, fix and follow-up in the
  implementation log (without secrets).

## 11. What this model does not claim

- It does not make MERNPress "production-secure".
- It does not certify HIPAA, GDPR, PCI or SOC 2.
- It does not sandbox plugins/themes.
- It does not replace a professional security review before handling sensitive
  data or accepting untrusted third-party code.

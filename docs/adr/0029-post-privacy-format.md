# ADR 0029 — Post privacy, passwords and formats

- Status: accepted (owner scope decision, 2026-11-05)
- Extends: content model (ADR 0003), WordPress parity work

## Context

WordPress posts can be private, password-protected and assigned a post format.
MERNPress had none of these, so Quick Edit/Bulk Edit and the editor could not
match WordPress and readers had no way to protect a post.

## Decision

1. **Private is a stored flag with a hard public boundary.** `posts.is_private`
   excludes the row from `listPublic`, `getPublicBySlug`, the password unlock
   route, the sitemap and the RSS feed. Administrators/editors still see it in the
   admin list and editor. There is no public login, so a private post is never
   rendered on the public site.
2. **Passwords are Argon2id hashes.** `posts.password_hash` stores only the
   hash; the admin DTO exposes `passwordProtected: boolean` and never the hash.
   `PATCH /api/admin/posts/:id` accepts `password` (a new password, `null`/empty
   removes it) and hashes with the same service as user passwords.
3. **The body is withheld until unlock.** `toPublic` returns
   `renderedContent: ''` for protected posts, so list cards, feeds and the HTML
   source never contain the protected body. `POST
   /api/public/posts/:slug/unlock` verifies the password and returns the
   server-rendered, sanitized HTML for that page. No cookie or browser-stored
   secret is involved; each unlock is a fresh verification.
4. **Unlock is throttled per client and post.** Ten attempts per ten minutes in a
   bounded in-memory limiter. Production runs one API instance; a multi-instance
   deployment must replace this with a shared limiter (documented residual risk).
   Argon2 verification is also intrinsically expensive, which bounds brute force.
5. **Formats are a stored enum.** The ten WordPress formats
   (`standard`, `aside`, `gallery`, `link`, `image`, `quote`, `status`, `video`,
   `audio`, `chat`) are validated in the service and API, stored on the row, shown
   in the editor and Bulk Edit, and emitted as a `format-<name>` class on the
   public article. Content is unchanged; themes may style formats.
6. **Quick Edit and Bulk Edit expose the real controls.** Quick Edit has
   Password (with an explicit "Remove password" checkbox), Private and the
   existing fields; Bulk Edit has Format. `Allow Pings` is **not** modelled:
   pingbacks/trackbacks require XML-RPC or inbound verification and are a
   security-sensitive legacy surface. They are documented as a gap rather than
   stored as an inert checkbox.

## Consequences

- One additive migration `20261105082816_add_post_password_private_format`.
- Password resets for posts are not email-based; the editor can set or remove
  the password. A wrong password returns 403 and never leaks whether the post
  exists beyond the public 404 rules.
- Private/password posts are still visible to the admin preview and revisions.

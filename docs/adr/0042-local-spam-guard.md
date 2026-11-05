# ADR 0042 — Bundled local spam guard (Connectors)

- Status: accepted (owner scope decision, 2026-11-05)
- Closes the "Connectors/Akismet" deviation in the design audit

## Context

WordPress sites usually add comment spam protection through Akismet or a
similar plugin. Akismet sends every comment (author name, email, URL, IP, user
agent and text) to an external service, needs an account and API key, and has
privacy implications that must be disclosed. MERNPress has a Connectors screen
for API keys but no spam service; the design audit recorded the missing Akismet
row as a parity gap.

## Decision

1. **Ship a local heuristic guard, not Akismet.** Comment spam is scored
   in-process by `assessComment` (`packages/cms-core/src/comments/spam.ts`). No
   comment data leaves the server, which also makes the feature usable without
   owner-supplied credentials. Akismet stays listed on the Connectors screen but
   marked unavailable, with the external-service reason.
2. **Explainable signals.** The score adds points for: links (2 each, capped),
   three or more links, a short comment with a link, a website field with a very
   short comment, known spam phrases (viagra, casino, payday loan, …), mostly
   uppercase text, repeated punctuation, money terms with a link, BBCode markup,
   a URL in the author name, disposable email domains, very long unbroken tokens
   and duplicates of a recent comment from the same email (24 h window, +5).
   The function returns the reasons so tests and future moderation UI can explain
   a verdict.
3. **Two thresholds.** `spam_guard_moderation_threshold` (default 3) holds a
   comment as Pending; `spam_guard_spam_threshold` (default 6) stores it as Spam.
   Both are 1–20, and the spam threshold must be at least the moderation
   threshold. `spamVerdict` also clamps an inverted pair (for example if the
   generic options route is used) so moderation never outranks spam. The
   thresholds and an on/off switch live in the `discussion` option group.
4. **The guard can only make a comment stricter.** It never approves a comment
   the Discussion settings would have held. Existing rules still apply:
   `disallowed_keys` and the guard's spam verdict produce Spam; the Discussion
   link limit and the guard's moderation verdict produce Pending; otherwise the
   existing moderation/approved-author logic decides.
5. **Moderation stays human.** Flagged comments appear in Comments → Spam or
   Pending, where an editor can approve, edit or delete them. There is no
   automatic deletion.
6. **Connectors screen shows the state.** A "Spam protection" card displays the
   active/off badge, the two thresholds, counts (in Spam, awaiting moderation,
   caught in the last 7 days) and the Akismet limitation. Saving requires
   `manage_options`; the API is `GET/PUT /api/admin/connectors/spam`.

## Consequences

- No migration and no external network calls. The scorer runs on every public
  comment submission; it is pure and cheap, and the only database cost is one
  duplicate-count query when the guard is enabled.
- Heuristics have false positives and false negatives. Moderators can undo a
  false positive; a false negative still passes through the existing Discussion
  rules. This is a filter, not a guarantee.
- Akismet remains unavailable by design: an external account, API key and
  per-comment data transfer are prerequisites the owner has not accepted.
- A future moderation UI can persist and show the score without changing the
  scoring contract; the reasons list is already part of the API of
  `assessComment`.

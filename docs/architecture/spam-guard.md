# Comment spam guard — developer guide

## Where the code lives

| File | Purpose |
| --- | --- |
| `packages/cms-core/src/comments/spam.ts` | Pure scorer `assessComment(signals)` and `spamVerdict(score, thresholds)`. |
| `packages/cms-core/src/comments/service.ts` | Reads the settings, counts duplicates, decides the stored status. |
| `packages/cms-core/src/comments/spam-service.ts` | Settings/stats for the Connectors screen. |
| `apps/api/src/routes/spam-guard.ts` | `GET/PUT /api/admin/connectors/spam`. |
| `apps/admin/src/ConnectorsPage.tsx` | Spam protection card, thresholds and stats. |

## Settings

| Option key | Default | Meaning |
| --- | --- | --- |
| `spam_guard_enabled` | `true` | Run the scorer on public comment submissions. |
| `spam_guard_moderation_threshold` | `3` | At or above this score: hold as Pending. |
| `spam_guard_spam_threshold` | `6` | At or above this score: store as Spam. |

They are in the `discussion` option group, so they can also be read through
`GET /api/options?group=discussion`. The dedicated API enforces the ordering
moderation ≤ spam; `spamVerdict` clamps an inverted pair defensively.

## Decision order in `createPublic`

1. Existing validation (post open, registration, name/email/content/URL).
2. Flood check (one comment per email per 30 s).
3. Duplicate count (same email + exact text in 24 h).
4. `assessComment` → score → `spamVerdict`.
5. Status:
   - `disallowed_keys` hit or `spam` verdict → `SPAM`
   - Discussion link limit exceeded → `PENDING`
   - `moderate` verdict, `comment_moderation`, or `moderation_keys` hit → `PENDING`
   - otherwise the approved-author rule (`comment_previously_approved`).
6. Insert the comment and send the existing mail notifications.

The guard never approves: a `ham` verdict falls through to the unchanged
Discussion logic.

## Adding a signal

1. Add the check to `assessComment` with a small point value and a reason string.
2. Extend `apps/api/test/content/spam-scoring.test.ts` for the score and reason.
3. If the signal changes a status, cover it in `apps/api/test/spam-guard.test.ts`.
4. Keep the points below the spam threshold unless the signal alone should be
   decisive; the default moderation threshold is 3 and spam is 6.

## Security and privacy

- Nothing is sent to a third party; there is no API key for this feature.
- The scorer treats all inputs as plain text; it never evaluates HTML or URLs.
- Duplicate detection compares the exact text from the same email in a bounded
  window; it does not build a cross-site fingerprint.
- False positives are recoverable in Comments → Spam; nothing is auto-deleted.

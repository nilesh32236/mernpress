import type { ThemeStrings } from '@mernpress/contracts';

/**
 * Map the API's stable comment-error reason codes to per-language theme strings.
 *
 * The API still returns an English message for logs and non-browser clients; the
 * public site never shows that text directly, so a translated page stays in its
 * own language even when a comment is rejected.
 */
const REASON_STRINGS: Record<string, keyof ThemeStrings> = {
  comments_closed: 'commentsClosed',
  login_required: 'commentLoginRequired',
  name_required: 'commentNameRequired',
  email_invalid: 'commentEmailRequired',
  content_required: 'commentContentRequired',
  content_too_long: 'commentContentTooLong',
  url_invalid: 'commentUrlInvalid',
  reply_missing: 'commentReplyMissing',
  too_fast: 'commentTooFast',
};

export function commentErrorMessage(strings: ThemeStrings, reason: unknown): string {
  if (typeof reason === 'string' && Object.prototype.hasOwnProperty.call(REASON_STRINGS, reason)) {
    return strings[REASON_STRINGS[reason]!];
  }
  // Older API responses (or an unexpected new reason) fall back to the generic
  // localized failure instead of leaking an English server message.
  return strings.commentFailed;
}

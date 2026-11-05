import { usernamePolicyError } from '../auth/username.js';

/**
 * Extract @username mentions from a note.
 *
 * Usernames follow the account policy (lowercase letters, digits, dots,
 * underscores and hyphens, 3–32 characters, starting/ending alphanumeric). The
 * leading boundary avoids matching email addresses such as `user@example.com`.
 * Duplicates are collapsed and the list is capped at ten per message.
 */
export const MAX_NOTE_MENTIONS = 10;

const MENTION_PATTERN = /(^|[^a-z0-9._@-])@([a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])?)/gi;

export function extractMentions(content: string): string[] {
  const found = new Set<string>();
  for (const match of content.matchAll(MENTION_PATTERN)) {
    const username = (match[2] ?? '').toLowerCase();
    if (username.length === 0) continue;
    if (usernamePolicyError(username) !== null) continue;
    found.add(username);
    if (found.size >= MAX_NOTE_MENTIONS) break;
  }
  return [...found];
}

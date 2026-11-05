/**
 * Local comment spam guard.
 *
 * A deliberately small, deterministic heuristic scorer. It runs in-process and
 * never sends comment data to a third party, which is the bundled alternative to
 * Akismet. It is a filter, not a guarantee: moderators can always approve a
 * comment it flagged, and the reason list is only used for tests and logging.
 */

export interface SpamSignals {
  content: string;
  authorName: string;
  authorUrl: string | null;
  authorEmail: string;
  /** Prior comments from the same email with identical text in the last 24 h. */
  duplicateCount: number;
  /** Link count computed by the comment service. */
  linkCount: number;
}

export interface SpamAssessment {
  score: number;
  reasons: string[];
}

export interface SpamThresholds {
  /** At or above this score the comment is stored as spam. */
  spam: number;
  /** At or above this score (but below spam) the comment is held. */
  moderation: number;
}

export type SpamVerdict = 'ham' | 'moderate' | 'spam';

/** Phrases that overwhelmingly appear in bulk comment spam. */
const SPAM_PHRASES = [
  'viagra',
  'cialis',
  'casino',
  'payday loan',
  'crypto giveaway',
  'bitcoin giveaway',
  'buy backlinks',
  'seo services',
  'guest post',
  'work from home',
  'free money',
  'escort',
  'telegram me',
  'whatsapp me',
] as const;

const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set([
  'mailinator.com',
  'guerrillamail.com',
  '10minutemail.com',
  'tempmail.com',
  'yopmail.com',
  'trashmail.com',
]);

function clean(value: string): string {
  return value.trim();
}

function lettersRatioCaps(value: string): number {
  const letters = value.replace(/[^a-z]/gi, '');
  if (letters.length === 0) return 0;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  return upper / letters.length;
}

function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at === -1 ? '' : email.slice(at + 1).toLowerCase();
}

/**
 * Score a comment. Each signal adds a small, explainable amount; the service
 * compares the total with the configured thresholds.
 */
export function assessComment(signals: SpamSignals): SpamAssessment {
  const content = clean(signals.content);
  const name = clean(signals.authorName);
  const normalized = content.toLowerCase();
  const reasons: string[] = [];
  let score = 0;

  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(`${reason} (+${points})`);
  };

  const links = Math.max(0, signals.linkCount);
  if (links > 0) add(Math.min(6, links * 2), `${links} link${links === 1 ? '' : 's'}`);
  if (links >= 3) add(2, 'three or more links');
  if (links >= 1 && content.length < 60) add(2, 'short comment with a link');
  if (signals.authorUrl && content.length < 40) add(1, 'website field with a very short comment');

  const phrases = SPAM_PHRASES.filter((phrase) => normalized.includes(phrase));
  if (phrases.length > 0) {
    add(Math.min(6, phrases.length * 3), `spam phrases: ${phrases.join(', ')}`);
  }

  const letters = content.replace(/[^a-z]/gi, '');
  if (letters.length >= 12 && lettersRatioCaps(content) >= 0.6) {
    add(2, 'mostly uppercase');
  }
  if (/!{3,}|\?{3,}/.test(content)) add(1, 'repeated punctuation');
  if (/\${2,}|\b(?:usd|btc|eth)\b/i.test(content) && links > 0) {
    add(1, 'money terms with a link');
  }
  if (/\[(?:url|link)=/i.test(content)) add(2, 'BBCode markup');
  if (/\bhttps?:\/\//i.test(name) || /\bwww\./i.test(name)) {
    add(2, 'URL in the author name');
  }
  if (DISPOSABLE_DOMAINS.has(emailDomain(signals.authorEmail))) {
    add(3, 'disposable email domain');
  }
  const longestToken = content.split(/\s+/).reduce((longest, token) => {
    return token.length > longest.length ? token : longest;
  }, '');
  if (longestToken.length >= 80) add(1, 'very long unbroken token');
  if (signals.duplicateCount > 0) {
    add(5, `duplicate of ${signals.duplicateCount} recent comment(s)`);
  }

  return { score, reasons };
}

/** Map a score onto the configured thresholds. Moderation never exceeds spam. */
export function spamVerdict(score: number, thresholds: SpamThresholds): SpamVerdict {
  const spam = Math.max(1, Math.trunc(thresholds.spam));
  const moderation = Math.min(spam, Math.max(1, Math.trunc(thresholds.moderation)));
  if (score >= spam) return 'spam';
  if (score >= moderation) return 'moderate';
  return 'ham';
}

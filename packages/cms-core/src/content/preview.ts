import { randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Post preview tokens (P8-03).
 *
 * A preview token is an opaque 256-bit bearer value (64 lowercase hex chars)
 * stored in `posts.preview_token` (unique). Rotating overwrites it, revoking
 * sets it to null. Possession grants read access to one post's rendered draft
 * only; the token is never included in a response body and never logged.
 */
export const PREVIEW_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

/** Generate a fresh 256-bit preview token (64 hex chars). */
export function generatePreviewToken(): string {
  return randomBytes(32).toString('hex');
}

/** Whether a candidate is a well-formed preview token. */
export function isPreviewTokenFormat(value: unknown): value is string {
  return typeof value === 'string' && PREVIEW_TOKEN_PATTERN.test(value);
}

/**
 * Constant-time comparison of two preview tokens. Missing or malformed input
 * is "no match" (404-shaped), never an error.
 */
export function safeEqualPreviewToken(
  candidate: string | null | undefined,
  stored: string | null | undefined,
): boolean {
  if (typeof candidate !== 'string' || typeof stored !== 'string') {
    return false;
  }
  if (candidate.length !== stored.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(candidate, 'utf8'), Buffer.from(stored, 'utf8'));
  } catch {
    return false;
  }
}

/** Relative public path for a preview token. */
export function previewPathFor(token: string): string {
  return `/api/public/preview/${token}`;
}

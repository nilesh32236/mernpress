import { randomUUID } from 'node:crypto';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Only a canonical UUID is accepted from the client. Anything else-including
 * oversized values and newlines-is replaced with a generated UUID so it cannot
 * be reflected into logs or response headers.
 */
export function resolveRequestId(header: string | string[] | undefined): string {
  const candidate = Array.isArray(header) ? header[0] : header;

  if (typeof candidate === 'string' && UUID_PATTERN.test(candidate)) {
    return candidate.toLowerCase();
  }

  return randomUUID();
}

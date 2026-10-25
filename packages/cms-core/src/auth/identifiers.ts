import { createHmac } from 'node:crypto';

/**
 * Domain-separated pseudonymous identifiers for audit and rate-limit storage.
 *
 * Raw IP addresses and usernames must never be persisted in `audit_events` or
 * `login_attempts`. Callers hash once through this boundary and pass only the
 * result onward. The pepper is server-side configuration (`AUTH_HASH_PEPPER`);
 * changing it makes existing HMAC values non-comparable.
 */
export interface IdentifierHasher {
  /** HMAC of the client IP, falling back to `unknown` when absent. */
  ip(value: string): string;
  /** HMAC of the already-normalized username. */
  username(value: string): string;
}

const UNKNOWN_IP = 'unknown';

export function createIdentifierHasher(pepper: string): IdentifierHasher {
  function hash(domain: 'ip' | 'user', value: string): string {
    return createHmac('sha256', pepper).update(`${domain}:${value}`).digest('hex');
  }

  return {
    ip: (value) => hash('ip', value || UNKNOWN_IP),
    username: (value) => hash('user', value),
  };
}

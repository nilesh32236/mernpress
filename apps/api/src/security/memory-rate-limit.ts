/**
 * Bounded in-memory rate limiter for public, unauthenticated actions where a
 * database-backed limiter would be overkill (post-password attempts).
 *
 * It is per-process: production runs one API instance. Multi-instance
 * deployments must replace it with a shared limiter (documented residual risk).
 */
export interface MemoryRateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function createMemoryRateLimit(options: {
  max: number;
  windowMs: number;
  maxKeys?: number;
}): (key: string) => MemoryRateLimitDecision {
  const { max, windowMs, maxKeys = 2000 } = options;
  const entries = new Map<string, { count: number; resetAt: number }>();

  return function check(key: string): MemoryRateLimitDecision {
    const now = Date.now();
    // Bound memory: drop expired entries, then the oldest if still too many.
    if (entries.size >= maxKeys) {
      for (const [entryKey, entry] of entries) {
        if (entry.resetAt <= now) entries.delete(entryKey);
      }
      while (entries.size >= maxKeys) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    }
    const entry = entries.get(key);
    if (!entry || entry.resetAt <= now) {
      entries.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    entry.count += 1;
    if (entry.count > max) {
      return { allowed: false, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  };
}

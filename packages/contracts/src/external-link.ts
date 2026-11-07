/**
 * SSRF guard for outbound link checking (ADR 0061).
 *
 * This module is pure and isomorphic: it decides whether a URL is safe to
 * consider for an outbound HEAD request. It does NOT fetch anything. Keeping
 * the policy separate from the transport lets validation, tests and any
 * future fetcher share one definition.
 *
 * Policy:
 * - Only http:// and https:// URLs.
 * - No embedded credentials (user:pass@host).
 * - Only default ports (80 for http, 443 for https); explicit ports must match.
 * - Host must be a DNS name or a public IP literal; localhost and private /
 *   loopback / link-local / reserved literals are rejected.
 * - Redirects, timeouts and DNS rebinding are the caller's job; this module
 *   only classifies the initial URL and every redirect target it is given.
 */

export type ExternalUrlVerdict =
  | { allowed: true; reason: 'ok' }
  | { allowed: false; reason: 'scheme' | 'credentials' | 'port' | 'host' };

function isPrivateIp(ip: string): boolean {
  const value = ip.trim().toLowerCase();
  // IPv6 literals (possibly with zone id).
  const v6 = value.replace(/%.*$/, '');
  if (v6.includes(':')) {
    if (v6 === '::1' || v6 === '::') return true;
    if (/^fe[89ab][0-9a-f]:/i.test(v6)) return true; // fe80::/10 link-local
    if (/^fc[0-9a-f]{2}:/i.test(v6) || /^fd[0-9a-f]{2}:/i.test(v6)) return true; // unique local
    if (/^ff[0-9a-f]{2}:/i.test(v6)) return true; // multicast
    // IPv4-mapped IPv6: ::ffff:10.0.0.1
    const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]!);
    return false;
  }
  const parts = value.split('.');
  if (parts.length !== 4) return true;
  const nums = parts.map((part) => Number(part));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = nums as [number, number, number, number];
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a >= 224) return true; // multicast/reserved
  return false;
}

/** Classify one URL for outbound checking. */
export function checkExternalUrl(raw: string): ExternalUrlVerdict {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { allowed: false, reason: 'host' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { allowed: false, reason: 'scheme' };
  }
  if (url.username || url.password) {
    return { allowed: false, reason: 'credentials' };
  }
  const defaultPort = url.protocol === 'https:' ? '443' : '80';
  if (url.port && url.port !== defaultPort) {
    return { allowed: false, reason: 'port' };
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return { allowed: false, reason: 'host' };
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return { allowed: false, reason: 'host' };
  }
  // IP literal: only public addresses may be fetched.
  if (/^[0-9.]+$/.test(host) || host.includes(':')) {
    if (isPrivateIp(host)) return { allowed: false, reason: 'host' };
  }
  return { allowed: true, reason: 'ok' };
}

/**
 * Verify a DNS resolution result before connecting. Every resolved address
 * must be public; a single private address (rebinding/DNS trick) rejects the
 * whole host.
 */
export function isPublicResolution(addresses: readonly string[]): boolean {
  if (addresses.length === 0) return false;
  return addresses.every((address) => !isPrivateIp(address));
}

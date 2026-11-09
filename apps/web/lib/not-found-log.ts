/**
 * Records a genuine 404 path in the admin's aggregated log (Tools → Redirects).
 *
 * Called from a client effect, not from the server render. Next.js embeds the
 * `not-found` boundary in the RSC payload of successful pages too, so logging
 * during the server render recorded every visited URL as a 404 — inflating the
 * admin log with pages that returned 200. An effect only runs when the 404 UI
 * is actually mounted for a visitor.
 *
 * Only the path is sent; the API stores no IP address, user agent or referrer.
 */

/** The site root always renders; never log it, and ignore empty paths. */
export function shouldLogNotFound(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname.startsWith('/') && pathname !== '/';
}

/** Paths already reported in this page session (React may replay effects). */
const logged = new Set<string>();

export interface LogNotFoundOptions {
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch | undefined;
  /** Injectable for tests; defaults to `window.location.pathname`. */
  pathname?: string | undefined;
}

/**
 * POST the path to the public not-found endpoint. Failures are swallowed: a
 * logging problem must never break the 404 page.
 */
export async function logNotFound(options: LogNotFoundOptions = {}): Promise<void> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const pathname =
    options.pathname ?? (typeof window === 'undefined' ? undefined : window.location.pathname);
  if (!fetchImpl || !shouldLogNotFound(pathname)) return;
  const path = pathname as string;
  if (logged.has(path)) return;
  logged.add(path);
  try {
    await fetchImpl('/api/public/not-found', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path }),
      cache: 'no-store',
      keepalive: true,
    });
  } catch {
    logged.delete(path);
  }
}

/** Test helper: forget previously logged paths. */
export function resetNotFoundLog(): void {
  logged.clear();
}

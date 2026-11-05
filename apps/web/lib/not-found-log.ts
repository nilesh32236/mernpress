import { headers } from 'next/headers';

const API = process.env.MERNPRESS_API_URL || 'http://127.0.0.1:4000';
const SITE = process.env.MERNPRESS_SITE_URL || 'http://localhost:3000';

/**
 * Records the current 404 path in the admin's aggregated log.
 *
 * The middleware forwards `x-mn-path` because the not-found component cannot
 * read the URL directly. Only the path is sent; the API stores no IP or agent.
 * A failure must never break the 404 page.
 */
export async function logCurrentNotFound(): Promise<void> {
  try {
    const requestHeaders = await headers();
    const path = requestHeaders.get('x-mn-path');
    if (!path || path === '/') return;
    await fetch(`${API}/api/public/not-found`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: SITE },
      body: JSON.stringify({ path }),
      cache: 'no-store',
    });
  } catch {
    // The 404 page still renders.
  }
}

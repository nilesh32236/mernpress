import { notFound } from 'next/navigation';

const API = process.env.MERNPRESS_API_URL || 'http://127.0.0.1:4000';
const SITE = process.env.MERNPRESS_SITE_URL || 'http://localhost:3000';

/**
 * Catch-all for paths that no route matched. It records the 404 in the admin
 * log (path and count only) and then renders the standard 404 page. Redirects
 * are handled earlier by `middleware.ts`.
 */
export default async function CatchAllNotFound({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path } = await params;
  const pathname = `/${(path ?? []).join('/')}`;
  await fetch(`${API}/api/public/not-found`, {
    method: 'POST',
    // Server-to-server: the API's Origin allow-list still applies, so present
    // the public site origin exactly as a browser request would.
    headers: { 'content-type': 'application/json', origin: SITE },
    body: JSON.stringify({ path: pathname }),
    cache: 'no-store',
  }).catch(() => undefined);
  notFound();
}

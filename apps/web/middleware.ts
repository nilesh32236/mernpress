import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';

interface RedirectItem {
  fromPath: string;
  toPath: string;
  statusCode: 301 | 302;
}

const API = process.env.MERNPRESS_API_URL || 'http://127.0.0.1:4000';
const CACHE_TTL_MS = 10_000;

let cache: { items: RedirectItem[]; at: number } | null = null;

function normalize(pathname: string): string {
  let path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  path = path.replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path;
}

async function redirectMap(): Promise<RedirectItem[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.items;
  try {
    const response = await fetch(`${API}/api/public/redirects`, { cache: 'no-store' });
    if (!response.ok) return cache?.items ?? [];
    const body = (await response.json()) as { items: RedirectItem[] };
    cache = { items: body.items, at: Date.now() };
    return body.items;
  } catch {
    return cache?.items ?? [];
  }
}

/**
 * Applies admin-managed redirects before the app renders. The map is cached for
 * 30 seconds; a hit is reported asynchronously so redirects stay fast.
 */
export async function middleware(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith('/api/') || pathname.startsWith('/_next/')) {
    return NextResponse.next();
  }
  const path = normalize(pathname);
  const match = (await redirectMap()).find((entry) => entry.fromPath === path);
  if (!match) {
    // The not-found component cannot read the URL; forward it for 404 logging.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-mn-path', path);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const destination = match.toPath.startsWith('/')
    ? new URL(match.toPath, request.url)
    : match.toPath;

  event.waitUntil(
    fetch(`${API}/api/public/redirects/hit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: request.nextUrl.origin },
      body: JSON.stringify({ path }),
    }).catch(() => undefined),
  );

  return NextResponse.redirect(destination, match.statusCode === 302 ? 302 : 301);
}

export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};

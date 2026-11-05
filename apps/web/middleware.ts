import { matchPostPath } from '@mernpress/contracts';
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';

interface RedirectItem {
  fromPath: string;
  toPath: string;
  statusCode: 301 | 302;
}

interface PermalinkSettings {
  structure: 'plain' | 'day' | 'month' | 'numeric' | 'postname' | 'custom';
  pattern: string;
  categoryBase: string;
  tagBase: string;
}

interface ResolvedPost {
  slug: string;
  canonicalPath: string;
}

const API = process.env.MERNPRESS_API_URL || 'http://127.0.0.1:4000';
const CACHE_TTL_MS = 10_000;
const RESOLVE_TTL_MS = 30_000;

let cache: { items: RedirectItem[]; at: number } | null = null;
let settingsCache: { value: PermalinkSettings; at: number } | null = null;
const resolutionCache = new Map<string, { value: ResolvedPost | null; at: number }>();

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

async function permalinkSettings(): Promise<PermalinkSettings> {
  if (settingsCache && Date.now() - settingsCache.at < CACHE_TTL_MS) {
    return settingsCache.value;
  }
  try {
    const response = await fetch(`${API}/api/public/site`, { cache: 'no-store' });
    if (!response.ok) throw new Error('settings');
    const body = (await response.json()) as Partial<{
      permalinkStructure: PermalinkSettings['structure'];
      permalinkPattern: string;
      categoryBase: string;
      tagBase: string;
    }>;
    const value: PermalinkSettings = {
      structure: body.permalinkStructure ?? 'custom',
      pattern: body.permalinkPattern ?? '/posts/%postname%/',
      categoryBase: body.categoryBase ?? 'category',
      tagBase: body.tagBase ?? 'tag',
    };
    settingsCache = { value, at: Date.now() };
    return value;
  } catch {
    return (
      settingsCache?.value ?? {
        structure: 'custom',
        pattern: '/posts/%postname%/',
        categoryBase: 'category',
        tagBase: 'tag',
      }
    );
  }
}

async function resolvePost(query: string): Promise<ResolvedPost | null> {
  const cached = resolutionCache.get(query);
  if (cached && Date.now() - cached.at < RESOLVE_TTL_MS) return cached.value;
  try {
    const response = await fetch(`${API}/api/public/resolve?${query}`, { cache: 'no-store' });
    const value = response.ok ? ((await response.json()) as ResolvedPost) : null;
    resolutionCache.set(query, { value, at: Date.now() });
    if (resolutionCache.size > 500) {
      const oldest = resolutionCache.keys().next().value;
      if (oldest) resolutionCache.delete(oldest);
    }
    return value;
  } catch {
    return cached?.value ?? null;
  }
}

/**
 * Rewrites stay internal: cloning `nextUrl` avoids asking Next to proxy to the
 * incoming host (which, behind Caddy, carries https while Next listens on
 * plain HTTP and would fail with a TLS handshake error).
 */
function rewriteTo(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = '';
  return NextResponse.rewrite(url);
}

function redirectTo(request: NextRequest, pathname: string) {
  const site = process.env.MERNPRESS_SITE_URL;
  return NextResponse.redirect(
    new URL(pathname, site && /^https?:\/\//.test(site) ? site : request.url),
    301,
  );
}

function withPathHeader(request: NextRequest, path: string) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-mn-path', path);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

/**
 * Applies admin redirects, then resolves the configured permalink structure.
 * Structured post URLs are rewritten to the internal /posts/<slug> renderer
 * (the browser URL stays canonical); non-canonical date/category variants
 * redirect to the canonical path with a 301.
 */
export async function middleware(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith('/api/') || pathname.startsWith('/_next/')) {
    return NextResponse.next();
  }
  const path = normalize(pathname);
  const match = (await redirectMap()).find((entry) => entry.fromPath === path);
  if (match) {
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

  const settings = await permalinkSettings();

  // Plain permalinks: /?p=<id> renders through the internal post route.
  if (settings.structure === 'plain') {
    const id = request.nextUrl.searchParams.get('p');
    if (id) {
      const resolved = await resolvePost(`p=${encodeURIComponent(id)}`);
      if (resolved) {
        return rewriteTo(request, `/posts/${encodeURIComponent(resolved.slug)}`);
      }
    }
    return withPathHeader(request, path);
  }

  // Custom category/tag bases are rewritten onto the existing archive routes.
  if (settings.categoryBase !== 'category') {
    const prefix = `/${settings.categoryBase}/`;
    if (path.startsWith(prefix) && path.slice(prefix.length).split('/').length === 1) {
      const slug = path.slice(prefix.length);
      if (slug) return rewriteTo(request, `/category/${encodeURIComponent(slug)}`);
    }
  }
  if (settings.tagBase !== 'tag') {
    const prefix = `/${settings.tagBase}/`;
    if (path.startsWith(prefix) && path.slice(prefix.length).split('/').length === 1) {
      const slug = path.slice(prefix.length);
      if (slug) return rewriteTo(request, `/tag/${encodeURIComponent(slug)}`);
    }
  }

  // Internal renderer and known routes never need post resolution.
  const reserved =
    path === '/posts' ||
    path.startsWith('/posts/') ||
    path.startsWith('/category/') ||
    path.startsWith('/tag/') ||
    path.startsWith('/author/') ||
    path.startsWith('/preview/') ||
    path === '/search' ||
    path.startsWith('/search/') ||
    path === '/feed' ||
    path === '/llms.txt';
  if (reserved) return withPathHeader(request, path);

  const matched = matchPostPath(settings.pattern, path);
  if (!matched) return withPathHeader(request, path);

  const resolved = await resolvePost(`path=${encodeURIComponent(path)}`);
  if (!resolved) return withPathHeader(request, path);

  const canonical = resolved.canonicalPath === '/' ? '/' : normalize(resolved.canonicalPath);
  if (canonical !== path) {
    return redirectTo(request, canonical);
  }
  return rewriteTo(request, `/posts/${encodeURIComponent(resolved.slug)}`);
}

export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};

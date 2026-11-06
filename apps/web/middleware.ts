import {
  DEFAULT_LANGUAGES,
  matchPostPath,
  stripLanguagePrefix,
  type LanguageConfig,
} from '@mernpress/contracts';
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
  languages: LanguageConfig;
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
      languages: LanguageConfig;
    }>;
    const value: PermalinkSettings = {
      structure: body.permalinkStructure ?? 'custom',
      pattern: body.permalinkPattern ?? '/posts/%postname%/',
      categoryBase: body.categoryBase ?? 'category',
      tagBase: body.tagBase ?? 'tag',
      languages: body.languages ?? DEFAULT_LANGUAGES,
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
        languages: DEFAULT_LANGUAGES,
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
 * Rewrites target the Next process directly. Behind Caddy the incoming URL
 * carries https while Next listens on plain HTTP; an absolute URL with the
 * incoming origin makes Next try an implicit HTTPS proxy to itself (EPROTO).
 * The internal HTTP origin always works and the rewritten path is reserved, so
 * middleware passes it through on the second hop.
 */
const INTERNAL_ORIGIN = `http://127.0.0.1:${process.env.PORT ?? '3000'}`;

function headersWithLanguage(
  request: NextRequest,
  language: string,
  enabled: readonly string[],
  markInternal: boolean,
) {
  const headers = new Headers(request.headers);
  // The rewritten internal path passes through the middleware a second time.
  // `x-mn-language` is only trusted on that internal hop: on the outer request
  // a client could forge it, so the URL-resolved value always wins there.
  const internalHop = request.headers.get('x-mn-internal') === '1';
  if (markInternal || internalHop) headers.set('x-mn-internal', '1');
  const existing = headers.get('x-mn-language');
  headers.set(
    'x-mn-language',
    internalHop && existing && enabled.includes(existing) ? existing : language,
  );
  return headers;
}

function rewriteTo(
  request: NextRequest,
  pathname: string,
  language: string | undefined,
  enabled: readonly string[],
) {
  const target = new URL(pathname, INTERNAL_ORIGIN);
  if (language) target.searchParams.set('lang', language);
  // The root layout reads this header to pick per-language menus/strings.
  return NextResponse.rewrite(target, {
    request: { headers: headersWithLanguage(request, language ?? 'en', enabled, true) },
  });
}

function redirectTo(request: NextRequest, pathname: string, search = '') {
  const site = process.env.MERNPRESS_SITE_URL;
  const url = new URL(pathname, site && /^https?:\/\//.test(site) ? site : request.url);
  url.search = search;
  return NextResponse.redirect(url, 301);
}

function withPathHeader(
  request: NextRequest,
  path: string,
  language: string,
  enabled: readonly string[],
) {
  const requestHeaders = headersWithLanguage(request, language, enabled, false);
  requestHeaders.set('x-mn-path', path);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

/** Default-language-only surfaces; a language prefix redirects to the plain URL. */
function isArchivePath(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname === '/posts' ||
    pathname === '/search' ||
    pathname.startsWith('/search/') ||
    pathname === '/feed' ||
    pathname === '/llms.txt' ||
    pathname.startsWith('/category/') ||
    pathname.startsWith('/tag/') ||
    pathname.startsWith('/author/') ||
    pathname.startsWith('/preview/')
  );
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
  const {
    language,
    path: localizedPath,
    prefixed: languagePrefixed,
  } = stripLanguagePrefix(settings.languages, path);
  const langQuery = languagePrefixed ? language : undefined;

  // A `?lang=` on a public URL is a duplicate of the language-prefixed canonical.
  // Redirect it (but not on the internal rewrite hop) so crawlers see one URL.
  const queryLanguage = request.nextUrl.searchParams.get('lang');
  const internalRequest = request.headers.get('x-mn-internal') === '1';
  if (
    !languagePrefixed &&
    !internalRequest &&
    queryLanguage &&
    queryLanguage !== settings.languages.default &&
    settings.languages.enabled.includes(queryLanguage)
  ) {
    if (pathname.startsWith('/posts/')) {
      const slug = decodeURIComponent(pathname.slice('/posts/'.length));
      if (slug && !slug.includes('/')) {
        const resolved = await resolvePost(
          `slug=${encodeURIComponent(slug)}&lang=${encodeURIComponent(queryLanguage)}`,
        );
        if (resolved) {
          return redirectTo(request, `/${queryLanguage}${normalize(resolved.canonicalPath)}`);
        }
      }
    } else if (isArchivePath(path)) {
      const search = new URLSearchParams(request.nextUrl.search);
      search.delete('lang');
      return redirectTo(request, path, search.toString());
    } else if (path !== '/' && path.split('/').filter(Boolean).length === 1) {
      return redirectTo(request, `/${queryLanguage}${path}`);
    }
  }

  // Plain permalinks: /?p=<id> renders through the internal post route.
  if (settings.structure === 'plain') {
    const id = request.nextUrl.searchParams.get('p');
    if (id) {
      const resolved = await resolvePost(`p=${encodeURIComponent(id)}`);
      if (resolved) {
        return rewriteTo(
          request,
          `/posts/${encodeURIComponent(resolved.slug)}`,
          langQuery,
          settings.languages.enabled,
        );
      }
    }
    return withPathHeader(request, path, language, settings.languages.enabled);
  }

  // Custom category/tag bases are rewritten onto the existing archive routes.
  if (!languagePrefixed && settings.categoryBase !== 'category') {
    const prefix = `/${settings.categoryBase}/`;
    if (path.startsWith(prefix) && path.slice(prefix.length).split('/').length === 1) {
      const slug = path.slice(prefix.length);
      if (slug) {
        return rewriteTo(
          request,
          `/category/${encodeURIComponent(slug)}`,
          language,
          settings.languages.enabled,
        );
      }
    }
  }
  if (!languagePrefixed && settings.tagBase !== 'tag') {
    const prefix = `/${settings.tagBase}/`;
    if (path.startsWith(prefix) && path.slice(prefix.length).split('/').length === 1) {
      const slug = path.slice(prefix.length);
      if (slug) {
        return rewriteTo(
          request,
          `/tag/${encodeURIComponent(slug)}`,
          language,
          settings.languages.enabled,
        );
      }
    }
  }

  // Internal renderer and known routes never need post resolution.
  const matched = matchPostPath(settings.pattern, localizedPath);
  // Archives, search and feeds are default-language surfaces. A prefixed URL
  // redirects to the plain one instead of rendering default content in foreign
  // chrome (or 404ing, depending on the path).
  if (languagePrefixed && !matched && isArchivePath(localizedPath)) {
    return redirectTo(request, localizedPath, request.nextUrl.search);
  }
  // `/posts/...` is reserved for the internal renderer only in the default
  // language; a prefixed structured URL must still be resolved and rewritten.
  const reserved =
    localizedPath === '/posts' ||
    localizedPath.startsWith('/posts/') ||
    localizedPath.startsWith('/category/') ||
    localizedPath.startsWith('/tag/') ||
    localizedPath.startsWith('/author/') ||
    localizedPath.startsWith('/preview/') ||
    localizedPath === '/search' ||
    localizedPath.startsWith('/search/') ||
    localizedPath === '/feed' ||
    localizedPath === '/llms.txt';
  if (reserved && !(languagePrefixed && matched))
    return withPathHeader(request, path, language, settings.languages.enabled);

  if (!matched) {
    // Language-prefixed pages: /<lang>/<slug> renders the page route with a
    // language hint. Archives and the home page stay default-language only.
    const segments = localizedPath.split('/').filter(Boolean);
    if (languagePrefixed && segments.length === 1) {
      return rewriteTo(request, localizedPath, language, settings.languages.enabled);
    }
    return withPathHeader(request, path, language, settings.languages.enabled);
  }

  const query = languagePrefixed
    ? `path=${encodeURIComponent(localizedPath)}&lang=${encodeURIComponent(language)}`
    : `path=${encodeURIComponent(localizedPath)}`;
  const resolved = await resolvePost(query);
  if (!resolved) return withPathHeader(request, path, language, settings.languages.enabled);

  const canonical = resolved.canonicalPath === '/' ? '/' : normalize(resolved.canonicalPath);
  if (canonical !== localizedPath) {
    return redirectTo(request, languagePrefixed ? `/${language}${canonical}` : canonical);
  }
  return rewriteTo(
    request,
    `/posts/${encodeURIComponent(resolved.slug)}`,
    langQuery,
    settings.languages.enabled,
  );
}

export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};

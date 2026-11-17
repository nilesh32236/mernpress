export type ContentType = 'post' | 'page';

export interface PublicTerm {
  id: string;
  name: string;
  slug: string;
}

export interface FeaturedImage {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  altText: string;
  derivatives: Record<string, string>;
}

export interface PublicPost {
  id: string;
  type: ContentType;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  contentFormat: string;
  renderedContent: string;
  toc: Array<{ level: number; id: string; text: string }>;
  featuredImage: FeaturedImage | null;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  robots: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  publishedAt: string | null;
  updatedAt: string;
  terms: { categories: PublicTerm[]; tags: PublicTerm[] };
}

export interface PostsPage {
  items: PublicPost[];
  pagination: { page: number; perPage: number; total: number; totalPages: number };
}

function apiUrl(): string {
  return process.env.MERNPRESS_API_URL || 'http://127.0.0.1:4000';
}

/**
 * Public site origin used for absolute URLs (sitemap, robots, canonical and
 * og:image fallbacks). Set MERNPRESS_SITE_URL in production; the localhost
 * default is development-only.
 */
/**
 * Absolute URL for a media path. Media is served by the API, which shares the
 * public origin with the site in production (Caddy routes /api); in
 * development the API origin can be set explicitly via
 * MERNPRESS_PUBLIC_API_URL.
 */
export function mediaUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const base = (
    process.env.MERNPRESS_PUBLIC_API_URL ||
    process.env.MERNPRESS_SITE_URL ||
    process.env.MERNPRESS_API_URL ||
    'http://127.0.0.1:4000'
  ).replace(/\/+$/, '');
  return `${base}${path}`;
}

export function siteUrl(): string {
  return (
    process.env.MERNPRESS_SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'http://localhost:3000'
  ).replace(/\/+$/, '');
}

async function apiFetch(path: string): Promise<Response> {
  const url = `${apiUrl()}${path}`;
  return fetch(url, { next: { revalidate: 60 } } as RequestInit);
}

export interface PublicListFilters {
  /** WordPress `s`: search term. */
  search?: string;
  /** WordPress `category_name`: category slug. */
  category?: string;
  /** WordPress `tag`: tag slug. */
  tag?: string;
}

export async function listPublished(
  type: ContentType = 'post',
  page = 1,
  perPage = 10,
  filters: PublicListFilters = {},
): Promise<PostsPage | null> {
  const params = new URLSearchParams({
    type,
    page: String(page),
    perPage: String(perPage),
  });
  if (filters.search) params.set('search', filters.search);
  if (filters.category) params.set('category', filters.category);
  if (filters.tag) params.set('tag', filters.tag);
  const res = await apiFetch(`/api/public/posts?${params.toString()}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to list ${type}s: ${res.status}`);
  return (await res.json()) as PostsPage;
}

export async function listPublishedPosts(page = 1, perPage = 10): Promise<PostsPage | null> {
  return listPublished('post', page, perPage);
}

/** WordPress search results (`/?s=…`). */
export function searchPosts(term: string, page = 1, perPage = 10): Promise<PostsPage | null> {
  return listPublished('post', page, perPage, { search: term });
}

/** WordPress category archive (`/category/{slug}/`). */
export function listByCategory(slug: string, page = 1, perPage = 10): Promise<PostsPage | null> {
  return listPublished('post', page, perPage, { category: slug });
}

/** WordPress tag archive (`/tag/{slug}/`). */
export function listByTag(slug: string, page = 1, perPage = 10): Promise<PostsPage | null> {
  return listPublished('post', page, perPage, { tag: slug });
}

export async function getPublishedBySlug(
  type: ContentType,
  slug: string,
): Promise<PublicPost | null> {
  const path = `/api/public/posts/${encodeURIComponent(slug)}?type=${type}`;
  const res = await apiFetch(path);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load ${type} "${slug}": ${res.status}`);
  return (await res.json()) as PublicPost;
}

/**
 * Token-gated draft preview (P8-03). Never cached: preview content is a
 * bearer secret and must reflect the current stored state on every view.
 */
export async function getPreviewByToken(token: string): Promise<PublicPost | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const url = `${apiUrl()}/api/public/preview/${encodeURIComponent(token)}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load preview: ${res.status}`);
  return (await res.json()) as PublicPost;
}

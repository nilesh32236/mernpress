export type ContentType = 'post' | 'page';

export interface PublicTerm {
  id: string;
  name: string;
  slug: string;
}

/** Taxonomy archive metadata (category/tag title and description). */
export interface PublicTermInfo {
  name: string;
  slug: string;
  description: string | null;
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
  author: { id: string; username: string } | null;
  terms: { categories: PublicTerm[]; tags: PublicTerm[] };
}

export interface SiteSettings {
  siteTitle: string;
  tagline: string;
  blogPublic: boolean;
  postsPerRss: number;
  rssUseExcerpt: boolean;
  permalinkBase: string;
  showAvatars: boolean;
}

export function postPath(slug: string, base = 'posts'): string {
  return `/${base}/${encodeURIComponent(slug)}`;
}

export async function getPermalinkBase(): Promise<string> {
  const settings = await getSiteSettings().catch(() => null);
  return settings?.permalinkBase ?? 'posts';
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

export interface PublicPostQuery {
  type?: ContentType;
  search?: string;
  category?: string;
  tag?: string;
  author?: string;
  page?: number;
  perPage?: number;
}

export async function listPublicPosts(query: PublicPostQuery = {}): Promise<PostsPage | null> {
  const params = new URLSearchParams();
  if (query.type) params.set('type', query.type);
  params.set('page', String(query.page ?? 1));
  params.set('perPage', String(query.perPage ?? 10));
  if (query.search) params.set('search', query.search);
  if (query.category) params.set('category', query.category);
  if (query.tag) params.set('tag', query.tag);
  if (query.author) params.set('author', query.author);
  const res = await apiFetch(`/api/public/posts?${params.toString()}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to list posts: ${res.status}`);
  return (await res.json()) as PostsPage;
}

export async function listPublishedPosts(page = 1, perPage = 10): Promise<PostsPage | null> {
  return listPublicPosts({ type: 'post', page, perPage });
}

/** Backwards-compatible alias used by sitemap generation. */
export async function getSiteSettings(): Promise<SiteSettings> {
  const res = await apiFetch('/api/public/site');
  if (!res.ok) throw new Error(`Failed to load site settings: ${res.status}`);
  return (await res.json()) as SiteSettings;
}

export async function listPublished(
  type: ContentType = 'post',
  page = 1,
  perPage = 10,
): Promise<PostsPage | null> {
  return listPublicPosts({ type, page, perPage });
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

export async function getPublicTerm(
  taxonomy: 'category' | 'tag',
  slug: string,
): Promise<PublicTermInfo | null> {
  const res = await apiFetch(`/api/public/terms/${taxonomy}/${encodeURIComponent(slug)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load ${taxonomy} "${slug}": ${res.status}`);
  return (await res.json()) as PublicTermInfo;
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

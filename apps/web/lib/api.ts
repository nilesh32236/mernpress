import type { ConsentConfig } from '@mernpress/contracts';

export type ContentType = 'post' | 'page';

export interface PublicTerm {
  id: string;
  name: string;
  slug: string;
  /** Canonical archive path from the active permalink settings. */
  path: string;
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

/** Public author profile shown in the single-post author box. */
export interface PublicAuthorSummary {
  id: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  website: string | null;
}

export interface PublicPost {
  id: string;
  type: ContentType;
  title: string;
  slug: string;
  /** Canonical public path from the active permalink structure. */
  path: string;
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
  /** Per-post comment status (WordPress Discussion). */
  commentStatus: 'open' | 'closed';
  /** WordPress "Make this post sticky". */
  sticky: boolean;
  /** True when the body requires a password (content withheld by the API). */
  passwordProtected: boolean;
  /** WordPress post format. */
  format:
    | 'standard'
    | 'aside'
    | 'gallery'
    | 'link'
    | 'image'
    | 'quote'
    | 'status'
    | 'video'
    | 'audio'
    | 'chat';
  /** Language code for this variant. */
  language: string;
  /** Opaque group id shared by every language variant. */
  translationGroup: string;
  /** Published translations (single-post responses). */
  translations?: Array<{
    language: string;
    title: string;
    slug: string;
    type: ContentType;
    path: string;
  }>;
  updatedAt: string;
  author: PublicAuthorSummary | null;
  terms: { categories: PublicTerm[]; tags: PublicTerm[] };
}

export interface ThemeTokens {
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  headingFont: string;
  bodyFont: string;
  contentWidth: string;
  radius: string;
  headerAlign: 'left' | 'center';
}

/** Public theme data: identity, layout variant and design tokens only. */
export interface PublicTheme {
  id: string;
  name: string;
  layout: 'classic' | 'journal';
  tokens: ThemeTokens;
}

/**
 * Canonical link target for a post/page. The API supplies `path`; the fallback
 * keeps stale revalidated payloads from crashing a render during a rollout.
 */
export function postHref(post: Pick<PublicPost, 'type' | 'slug' | 'path'>): string {
  if (post.path && post.path.length > 0) return post.path;
  return post.type === 'page'
    ? `/${encodeURIComponent(post.slug)}`
    : `/posts/${encodeURIComponent(post.slug)}`;
}

/** Canonical archive link for a term, with the same rollout fallback. */
export function termHref(
  term: Pick<PublicTerm, 'slug' | 'path'>,
  taxonomy: 'category' | 'tag',
): string {
  if (term.path && term.path.length > 0) return term.path;
  return `/${taxonomy}/${encodeURIComponent(term.slug)}`;
}

export interface CustomColors {
  background?: string;
  surface?: string;
  text?: string;
  muted?: string;
  accent?: string;
}

export interface CustomMenuItem {
  label: string;
  url: string;
}

export interface SiteSettings {
  siteTitle: string;
  tagline: string;
  blogPublic: boolean;
  postsPerRss: number;
  rssUseExcerpt: boolean;
  permalinkBase: string;
  permalinkStructure: 'plain' | 'day' | 'month' | 'numeric' | 'postname' | 'custom';
  permalinkPattern: string;
  categoryBase: string;
  tagBase: string;
  showAvatars: boolean;
  customColors: CustomColors | null;
  customMenu: CustomMenuItem[] | null;
  customCss: string | null;
  showOnFront: 'posts' | 'page';
  pageOnFrontSlug: string | null;
  pageForPostsSlug: string | null;
  languages?: { default: string; enabled: string[] };
  /** Per-language menu overrides (non-default languages). */
  languageMenus?: Record<string, Array<{ label: string; url: string }>> | null;
  /** Per-language theme-string overrides. */
  themeStrings?: Record<string, Record<string, string>>;
  consent?: ConsentConfig;
  theme?: PublicTheme | null;
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
  /** Language filter; omitted = default language. */
  lang?: string;
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
  if (query.lang) params.set('lang', query.lang);
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
  // Site settings include the active theme and reading visibility; a stale
  // cache would keep serving the previous theme for up to a minute.
  const res = await fetch(`${apiUrl()}/api/public/site`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load site settings: ${res.status}`);
  return (await res.json()) as SiteSettings;
}

export async function listPublished(
  type: ContentType = 'post',
  page = 1,
  perPage = 10,
  language?: string,
): Promise<PostsPage | null> {
  return listPublicPosts({ type, page, perPage, ...(language ? { lang: language } : {}) });
}

export async function getPublishedBySlug(
  type: ContentType,
  slug: string,
  language?: string,
): Promise<PublicPost | null> {
  const path = `/api/public/posts/${encodeURIComponent(slug)}?type=${type}${
    language ? `&lang=${encodeURIComponent(language)}` : ''
  }`;
  // Privacy/password/status changes must take effect immediately; a cached
  // detail response could keep serving a post that is now private.
  const res = await fetch(`${apiUrl()}${path}`, { cache: 'no-store' });
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

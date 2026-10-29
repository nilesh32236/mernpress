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

async function apiFetch(path: string): Promise<Response> {
  const url = `${apiUrl()}${path}`;
  return fetch(url, { next: { revalidate: 60 } } as RequestInit);
}

export async function listPublished(
  type: ContentType = 'post',
  page = 1,
  perPage = 10,
): Promise<PostsPage | null> {
  const path = `/api/public/posts?type=${type}&page=${page}&perPage=${perPage}`;
  const res = await apiFetch(path);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to list ${type}s: ${res.status}`);
  return (await res.json()) as PostsPage;
}

export async function listPublishedPosts(page = 1, perPage = 10): Promise<PostsPage | null> {
  return listPublished('post', page, perPage);
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

import type { PostStatus } from '@mernpress/database';

export type { PostStatus };

export type ContentType = 'post' | 'page';

/** The acting principal `{ userId, role }`, derived from the validated session. Role is one of the five ADR 0004 roles; capabilities are checked in the service. */
export interface Principal {
  userId: string;
  role: string;
}

/** Filter draft passed through `content.post.create`/`content.post.update`. */
export interface PostFilterDraft {
  type: ContentType;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  robots: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
}

/** Action payload: no content body, no secrets, identifiers + lifecycle only. */
export interface PostActionPayload {
  postId: string;
  type: ContentType;
  status: PostStatus;
  authorId: string | null;
  slug: string;
  /** Set on transitions; null for create/update. */
  fromStatus?: PostStatus | null;
}

export interface PostTermsActionPayload {
  postId: string;
  type: ContentType;
  categoryIds: string[];
  tagIds: string[];
}

/** Admin-facing post DTO. */
export interface AdminPost {
  id: string;
  type: ContentType;
  status: PostStatus;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  contentFormat: string;
  contentVersion: number;
  authorId: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  robots: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  publishedAt: string | null;
  trashedAt: string | null;
  previousStatus: PostStatus | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  terms: { categories: AdminTermSummary[]; tags: AdminTermSummary[] };
}

export interface AdminTermSummary {
  id: string;
  name: string;
  slug: string;
}

/** Public published-only DTO. No author, no version/status internals. */
export interface PublicPost {
  id: string;
  type: ContentType;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  contentFormat: string;
  /** Sanitized, render-ready HTML (ADR 0007). Safe to inject without re-sanitizing. */
  renderedContent: string;
  /** Heading anchor entries derived during rendering, for tables of contents. */
  toc: Array<{ level: number; id: string; text: string }>;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  robots: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  publishedAt: string | null;
  updatedAt: string;
  terms: { categories: AdminTermSummary[]; tags: AdminTermSummary[] };
}

export interface CreatePostInput {
  type: ContentType;
  title: string;
  slug?: string | undefined;
  excerpt?: string | null | undefined;
  content?: string | undefined;
  seoTitle?: string | null | undefined;
  seoDescription?: string | null | undefined;
  canonicalUrl?: string | null | undefined;
  robots?: string | null | undefined;
  ogTitle?: string | null | undefined;
  ogDescription?: string | null | undefined;
}

export interface UpdatePostInput {
  baseVersion: number;
  title?: string | undefined;
  slug?: string | undefined;
  excerpt?: string | null | undefined;
  content?: string | undefined;
  seoTitle?: string | null | undefined;
  seoDescription?: string | null | undefined;
  canonicalUrl?: string | null | undefined;
  robots?: string | null | undefined;
  ogTitle?: string | null | undefined;
  ogDescription?: string | null | undefined;
}

export type AdminPostSort = 'updatedAt' | 'createdAt' | 'publishedAt' | 'title';
export type SortOrder = 'asc' | 'desc';

export interface AdminListQuery {
  type?: ContentType | undefined;
  status?: PostStatus | undefined;
  search?: string | undefined;
  page: number;
  perPage: number;
  sort: AdminPostSort;
  order: SortOrder;
}

export interface PublicListQuery {
  type?: ContentType | undefined;
  page: number;
  perPage: number;
}

export interface Paged<T> {
  items: T[];
  pagination: { page: number; perPage: number; total: number; totalPages: number };
}

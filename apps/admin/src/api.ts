import {
  normalizeLanguageConfig,
  type AdminColorScheme,
  type ConsentConfig,
  type LanguageConfig,
  type ScreenOptionsState,
} from '@mernpress/contracts';
export type UserRole = 'administrator' | 'editor' | 'author' | 'contributor' | 'subscriber';
export type ContentType = 'post' | 'page';
export type PostFormat =
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

export type PostStatus = 'DRAFT' | 'PUBLISHED' | 'TRASHED';
export type TransitionAction = 'publish' | 'unpublish' | 'trash' | 'restore';
export type TaxonomyType = 'category' | 'tag';

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  status: 'active' | 'disabled';
  /** Per-user WordPress administration colour scheme (session response). */
  adminColor?: AdminColorScheme;
}

export interface AdminTermSummary {
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
  commentStatus: 'open' | 'closed';
  sticky: boolean;
  /** Per-post editor-note mail override; null inherits the Discussion option. */
  notesNotify: boolean | null;
  /** Safe client editing: structural block edits are rejected while locked. */
  structureLocked: boolean;
  passwordProtected: boolean;
  isPrivate: boolean;
  format: PostFormat;
  /** Language code of this variant. */
  language: string;
  /** Translation group shared by every language variant. */
  translationGroup: string;
  trashedAt: string | null;
  previousStatus: PostStatus | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  terms: { categories: AdminTermSummary[]; tags: AdminTermSummary[] };
  featuredMedia: FeaturedImage | null;
  author: { id: string; username: string } | null;
  /** Present only on the single-post admin view; never in list responses. */
  previewToken?: string | null;
}

export interface AdminRevision {
  id: string;
  postId: string;
  title: string;
  excerpt: string | null;
  authorId: string | null;
  createdAt: string;
  revisionNumber: number;
}

export interface AdminRevisionDetail extends AdminRevision {
  content: string;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  robots: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
}

export interface PreviewLinkResult {
  previewToken: string | null;
  previewPath: string | null;
  previewUrl: string | null;
}

export interface AutosaveState {
  id: string;
  postId: string;
  title: string;
  excerpt: string | null;
  content: string;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  robots: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  authorId: string | null;
  createdAt: string;
}

export interface AutosaveSnapshot {
  title: string;
  excerpt: string | null;
  content: string;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  robots: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
}

export async function saveAutosave(
  postId: string,
  snapshot: AutosaveSnapshot,
): Promise<AutosaveState> {
  const response = await fetch(`/api/admin/posts/${encodeURIComponent(postId)}/autosave`, {
    method: 'PUT',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json', 'content-type': 'application/json', ...csrfHeader() },
    body: JSON.stringify(snapshot),
  });
  return readJson<AutosaveState>(response);
}

export async function fetchAutosave(
  postId: string,
): Promise<{ autosave: AutosaveState | null; postUpdatedAt: string }> {
  const response = await fetch(`/api/admin/posts/${encodeURIComponent(postId)}/autosave`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  return readJson<{ autosave: AutosaveState | null; postUpdatedAt: string }>(response);
}

export async function discardAutosave(postId: string): Promise<void> {
  const response = await fetch(`/api/admin/posts/${encodeURIComponent(postId)}/autosave`, {
    method: 'DELETE',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json', ...csrfHeader() },
  });
  if (!response.ok) {
    await readJson(response);
  }
}

export async function fetchRevisions(postId: string): Promise<AdminRevision[]> {
  const response = await fetch(`/api/admin/posts/${encodeURIComponent(postId)}/revisions`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  return readJson<AdminRevision[]>(response);
}

export async function fetchRevision(
  postId: string,
  revisionId: string,
): Promise<AdminRevisionDetail> {
  const response = await fetch(
    `/api/admin/posts/${encodeURIComponent(postId)}/revisions/${encodeURIComponent(revisionId)}`,
    { credentials: 'include', cache: 'no-store', headers: { accept: 'application/json' } },
  );
  return readJson<AdminRevisionDetail>(response);
}

export async function restoreRevision(
  postId: string,
  revisionId: string,
  baseVersion: number,
): Promise<AdminPost> {
  const response = await fetch(
    `/api/admin/posts/${encodeURIComponent(postId)}/revisions/${encodeURIComponent(revisionId)}/restore`,
    {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { accept: 'application/json', 'content-type': 'application/json', ...csrfHeader() },
      body: JSON.stringify({ baseVersion }),
    },
  );
  return readJson<AdminPost>(response);
}

export async function rotatePreviewToken(postId: string): Promise<PreviewLinkResult> {
  const response = await fetch(`/api/admin/posts/${encodeURIComponent(postId)}/preview-token`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json', ...csrfHeader() },
  });
  return readJson<PreviewLinkResult>(response);
}

export async function revokePreviewToken(postId: string): Promise<PreviewLinkResult> {
  const response = await fetch(`/api/admin/posts/${encodeURIComponent(postId)}/preview-token`, {
    method: 'DELETE',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json', ...csrfHeader() },
  });
  return readJson<PreviewLinkResult>(response);
}

export interface AdminTerm {
  id: string;
  taxonomy: TaxonomyType;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  postCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTermPayload {
  taxonomy: TaxonomyType;
  name: string;
  slug?: string;
  description?: string | null;
  parentId?: string | null;
}

export interface UpdateTermPayload {
  name?: string;
  slug?: string;
  description?: string | null;
  parentId?: string | null;
}

export interface Pagination {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface Paged<T> {
  items: T[];
  pagination: Pagination;
}

export interface PostListParams {
  type?: ContentType;
  status?: PostStatus;
  search?: string;
  category?: string;
  tag?: string;
  month?: string;
  author?: string;
  page?: number;
  perPage?: number;
  sort?: 'updatedAt' | 'createdAt' | 'publishedAt' | 'title';
  order?: 'asc' | 'desc';
}

export interface CreatePostPayload {
  type: ContentType;
  title: string;
  slug?: string;
  excerpt?: string | null;
  content?: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
  canonicalUrl?: string | null;
  robots?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  format?: PostFormat;
  notesNotify?: boolean | null;
  language?: string;
}

export interface UpdatePostPayload {
  baseVersion: number;
  title?: string;
  slug?: string;
  excerpt?: string | null;
  content?: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
  canonicalUrl?: string | null;
  robots?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  featuredMediaId?: string | null;
  publishedAt?: string | null;
  authorId?: string | null;
  commentStatus?: 'open' | 'closed';
  sticky?: boolean;
  notesNotify?: boolean | null;
  language?: string;
  password?: string | null;
  isPrivate?: boolean;
  format?: PostFormat;
  structureLocked?: boolean;
}

interface ErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: Array<{ path?: string; message?: string }>;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Array<{ path: string; message: string }>;

  constructor(
    status: number,
    code: string,
    message: string,
    details: Array<{ path: string; message: string }> = [],
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function getCookie(name: string): string | undefined {
  const prefix = `${encodeURIComponent(name)}=`;
  const entry = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  if (!entry) {
    return undefined;
  }

  try {
    return decodeURIComponent(entry.slice(prefix.length));
  } catch {
    return undefined;
  }
}

/** Single place where the API error envelope becomes an `ApiError`. */
function apiErrorFromBody(status: number, body: ErrorBody): ApiError {
  const details = (body.error?.details ?? [])
    .filter((detail) => typeof detail.message === 'string')
    .map((detail) => ({
      path: typeof detail.path === 'string' ? detail.path : '',
      message: detail.message ?? 'Invalid value',
    }));

  return new ApiError(
    status,
    body.error?.code ?? 'REQUEST_FAILED',
    body.error?.message ?? 'The request failed.',
    details,
  );
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: ErrorBody = {};
  try {
    body = (await response.json()) as ErrorBody;
  } catch {
    // A non-JSON error is still surfaced as a generic API failure.
  }

  return apiErrorFromBody(response.status, body);
}

/**
 * XHR uploads cannot use `Response.json()`, so the same envelope is parsed from
 * the response text. A non-JSON body degrades to the generic request failure.
 */
function apiErrorFromText(status: number, text: string): ApiError {
  let body: ErrorBody = {};
  try {
    body = JSON.parse(text) as ErrorBody;
  } catch {
    // Keep the generic message below.
  }

  return apiErrorFromBody(status, body);
}

function csrfHeader(): Record<string, string> {
  const token = getCookie('mernpress_csrf');
  if (!token) {
    throw new ApiError(
      0,
      'CSRF_MISSING',
      'Your security token is missing. Reload the page and sign in again.',
    );
  }
  return { 'x-csrf-token': token };
}

let unauthorizedHandler: (() => void) | undefined;

export function setUnauthorizedHandler(handler: (() => void) | undefined): void {
  unauthorizedHandler = handler;
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 401) {
      unauthorizedHandler?.();
    }
    throw await toApiError(response);
  }
  return (await response.json()) as T;
}

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export async function fetchSession(): Promise<AuthUser | null> {
  const response = await fetch('/api/auth/session', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });

  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw await toApiError(response);
  }

  const body = (await response.json()) as { user: AuthUser };
  return body.user;
}

export async function fetchCsrfToken(): Promise<string> {
  const response = await fetch('/api/auth/csrf', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  const body = (await response.json()) as { csrfToken: string };
  return body.csrfToken;
}

export interface LoginResult {
  user: AuthUser;
  csrfToken: string;
  expiresAt: string;
}

export interface LoginTwoFactorChallenge {
  twoFactorRequired: true;
  challengeToken: string;
  username: string;
  expiresAt: string;
}

export async function login(
  username: string,
  password: string,
  remember = false,
): Promise<LoginResult | LoginTwoFactorChallenge> {
  const csrfToken = await fetchCsrfToken();
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-csrf-token': csrfToken,
    },
    body: JSON.stringify({ username, password, remember }),
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  return (await response.json()) as LoginResult | LoginTwoFactorChallenge;
}

export async function completeTwoFactorLogin(
  challengeToken: string,
  code: string,
): Promise<LoginResult> {
  const csrfToken = await fetchCsrfToken();
  const response = await fetch('/api/auth/two-factor', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-csrf-token': csrfToken,
    },
    body: JSON.stringify({ challengeToken, code }),
  });
  if (!response.ok) {
    throw await toApiError(response);
  }
  return (await response.json()) as LoginResult;
}

export async function requestPasswordReset(identifier: string): Promise<void> {
  const csrfToken = await fetchCsrfToken();
  const response = await fetch('/api/auth/lost-password', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-csrf-token': csrfToken,
    },
    body: JSON.stringify({ identifier }),
  });
  if (!response.ok) {
    throw await toApiError(response);
  }
}

export async function resetPassword(input: {
  key: string;
  login: string;
  password: string;
}): Promise<void> {
  const csrfToken = await fetchCsrfToken();
  const response = await fetch('/api/auth/reset-password', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-csrf-token': csrfToken,
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw await toApiError(response);
  }
}

export async function logout(): Promise<void> {
  const csrfToken = getCookie('mernpress_csrf');
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
    },
  });

  if (response.status === 401) {
    return;
  }
  if (!response.ok) {
    throw await toApiError(response);
  }
}

export async function fetchPosts(params: PostListParams = {}): Promise<Paged<AdminPost>> {
  const response = await fetch(
    `/api/admin/posts${queryString({
      type: params.type,
      status: params.status,
      search: params.search,
      category: params.category,
      tag: params.tag,
      month: params.month,
      author: params.author,
      page: params.page,
      perPage: params.perPage,
      sort: params.sort,
      order: params.order,
    })}`,
    {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { accept: 'application/json' },
    },
  );

  return readJson<Paged<AdminPost>>(response);
}

export async function fetchPost(id: string): Promise<AdminPost> {
  const response = await fetch(`/api/admin/posts/${encodeURIComponent(id)}`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });

  return readJson<AdminPost>(response);
}

export async function createPost(payload: CreatePostPayload): Promise<AdminPost> {
  const response = await fetch('/api/admin/posts', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify(payload),
  });

  return readJson<AdminPost>(response);
}

export async function updatePost(id: string, payload: UpdatePostPayload): Promise<AdminPost> {
  const response = await fetch(`/api/admin/posts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify(payload),
  });

  return readJson<AdminPost>(response);
}

export async function transitionPost(
  id: string,
  action: TransitionAction,
  baseVersion: number,
): Promise<AdminPost> {
  const response = await fetch(
    `/api/admin/posts/${encodeURIComponent(id)}/${encodeURIComponent(action)}`,
    {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...csrfHeader(),
      },
      body: JSON.stringify({ baseVersion }),
    },
  );

  return readJson<AdminPost>(response);
}

export interface SiteHealth {
  database: 'ok' | 'error';
  mediaWritable: boolean;
  schedulerEnabled: boolean;
}

export async function fetchSiteHealth(): Promise<SiteHealth> {
  const response = await fetch('/api/admin/health', {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  return readJson<SiteHealth>(response);
}

export interface ScheduleState {
  scheduledAt: string | null;
}

export async function fetchSchedule(id: string): Promise<ScheduleState> {
  const response = await fetch(`/api/admin/posts/${encodeURIComponent(id)}/schedule`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  return readJson<ScheduleState>(response);
}

export async function schedulePost(
  id: string,
  scheduledAt: string,
  baseVersion: number,
): Promise<ScheduleState> {
  const response = await fetch(`/api/admin/posts/${encodeURIComponent(id)}/schedule`, {
    method: 'PUT',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify({ scheduledAt, baseVersion }),
  });
  return readJson<ScheduleState>(response);
}

export async function unschedulePost(id: string, baseVersion: number): Promise<ScheduleState> {
  const response = await fetch(`/api/admin/posts/${encodeURIComponent(id)}/schedule`, {
    method: 'DELETE',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify({ baseVersion }),
  });
  return readJson<ScheduleState>(response);
}

export type BulkAction = TransitionAction | 'delete';

export interface BulkItemResult {
  id: string;
  ok: boolean;
  error?: { code: string; message: string };
}

export interface BulkResult {
  action: BulkAction;
  succeeded: string[];
  failed: BulkItemResult[];
}

export async function bulkPosts(
  action: BulkAction,
  items: Array<{ id: string; baseVersion: number }>,
): Promise<BulkResult> {
  const response = await fetch('/api/admin/posts/bulk', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify({ action, items }),
  });

  return readJson<BulkResult>(response);
}

export async function assignTerms(
  id: string,
  categoryIds: string[],
  tagIds: string[],
  baseVersion: number,
): Promise<AdminPost> {
  const response = await fetch(`/api/admin/posts/${encodeURIComponent(id)}/terms`, {
    method: 'PUT',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify({ baseVersion, categoryIds, tagIds }),
  });

  return readJson<AdminPost>(response);
}

export async function convertTerms(
  from: TaxonomyType,
): Promise<{ converted: number; created: number; movedPosts: number }> {
  const response = await fetch('/api/admin/terms/convert', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify({ from }),
  });
  return readJson<{ converted: number; created: number; movedPosts: number }>(response);
}

export async function fetchTerms(
  params: {
    taxonomy?: TaxonomyType;
    search?: string;
    page?: number;
    perPage?: number;
    sort?: 'name' | 'description' | 'slug' | 'count' | 'createdAt' | 'updatedAt';
    order?: 'asc' | 'desc';
  } = {},
): Promise<Paged<AdminTerm>> {
  const response = await fetch(
    `/api/admin/terms${queryString({
      taxonomy: params.taxonomy,
      search: params.search,
      sort: params.sort,
      order: params.order,
      page: params.page,
      perPage: params.perPage,
    })}`,
    {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { accept: 'application/json' },
    },
  );

  return readJson<Paged<AdminTerm>>(response);
}

export async function createTerm(payload: CreateTermPayload): Promise<AdminTerm> {
  const response = await fetch('/api/admin/terms', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify(payload),
  });

  return readJson<AdminTerm>(response);
}

export async function updateTerm(id: string, payload: UpdateTermPayload): Promise<AdminTerm> {
  const response = await fetch(`/api/admin/terms/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify(payload),
  });

  return readJson<AdminTerm>(response);
}

export async function deleteTerm(id: string): Promise<{ detachedPostCount: number }> {
  const response = await fetch(`/api/admin/terms/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      ...csrfHeader(),
    },
  });

  return readJson<{ detachedPostCount: number }>(response);
}

export function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'INVALID_CREDENTIALS':
        return 'Invalid username or password.';
      case 'RATE_LIMITED':
        return 'Too many attempts. Try again later.';
      case 'CSRF_INVALID':
        return 'Your security token expired. Reload the page and try again.';
      case 'ORIGIN_NOT_ALLOWED':
        return 'This origin is not allowed to sign in.';
      case 'VALIDATION_ERROR':
        return 'Enter a username and password.';
      default:
        return error.message;
    }
  }

  return 'Cannot reach the API. Check that it is running.';
}

export type UserStatus = 'active' | 'disabled';
export type OptionGroup =
  'general' | 'reading' | 'writing' | 'discussion' | 'media' | 'permalinks' | 'privacy';

export interface AdminUser {
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  postCount: number;
  twoFactorEnabled: boolean;
}

export interface AdminUserList {
  items: AdminUser[];
  pagination: Pagination;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  nickname: string | null;
  bio: string | null;
  website: string | null;
  syntaxHighlighting: boolean;
  locale: string;
  adminColor: AdminColorScheme;
  role: UserRole;
  createdAt: string;
}

export interface LocaleOption {
  value: string;
  label: string;
}

export interface ApplicationPassword {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
}

export type OptionValues = Record<string, unknown>;

// ---- Settings → Languages and translations ----
export interface AdminTranslation {
  id: string;
  language: string;
  title: string;
  slug: string;
  type: ContentType;
  status: PostStatus;
  updatedAt: string;
}

export async function fetchLanguages(): Promise<LanguageConfig> {
  const response = await fetch('/api/admin/languages', {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  return normalizeLanguageConfig(await readJson<unknown>(response));
}

export async function updateLanguages(config: LanguageConfig): Promise<LanguageConfig> {
  const response = await fetch('/api/admin/languages', {
    method: 'PUT',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify(config),
  });
  return normalizeLanguageConfig(await readJson<unknown>(response));
}

export async function fetchPostTranslations(postId: string): Promise<AdminTranslation[]> {
  const response = await fetch(`/api/admin/posts/${encodeURIComponent(postId)}/translations`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  const body = await readJson<{ items?: AdminTranslation[] }>(response);
  return Array.isArray(body.items) ? body.items : [];
}

export async function createPostTranslation(postId: string, language: string): Promise<AdminPost> {
  const response = await fetch(`/api/admin/posts/${encodeURIComponent(postId)}/translations`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify({ language }),
  });
  return readJson<AdminPost>(response);
}

// ---- Settings → Consent ----
export async function fetchConsent(): Promise<ConsentConfig> {
  const response = await fetch('/api/admin/consent', {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  return readJson<ConsentConfig>(response);
}

export async function updateConsent(config: ConsentConfig): Promise<ConsentConfig> {
  const response = await fetch('/api/admin/consent', {
    method: 'PUT',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify(config),
  });
  return readJson<ConsentConfig>(response);
}

// ---- Privacy-first analytics ----
export interface AnalyticsVitalEntry {
  metric: 'lcp' | 'inp' | 'cls' | 'fcp' | 'ttfb';
  label: string;
  /** p75 in stored units (ms, or CLS ×1000); null with no samples. */
  p75: number | null;
  rating: 'good' | 'needs-improvement' | 'poor' | null;
  samples: number;
}

export interface AnalyticsSummary {
  days: number;
  totalViews: number;
  uniquePaths: number;
  daily: Array<{ day: string; views: number }>;
  topPaths: Array<{ path: string; views: number }>;
  topReferrers: Array<{ host: string; views: number }>;
  vitals: AnalyticsVitalEntry[];
}

export async function fetchAnalytics(days = 7): Promise<AnalyticsSummary> {
  const response = await fetch(`/api/admin/analytics?days=${days}`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  return readJson<AnalyticsSummary>(response);
}

// ---- Settings → Connectors → Spam protection ----
export interface SpamGuardSettings {
  enabled: boolean;
  spamThreshold: number;
  moderationThreshold: number;
}

export interface SpamGuardState {
  settings: SpamGuardSettings;
  stats: { spam: number; pending: number; spamLast7Days: number };
  engine: { id: 'local-heuristic'; name: string; description: string };
  akismet: { available: false; reason: string };
}

export async function fetchSpamGuard(): Promise<SpamGuardState> {
  const response = await fetch('/api/admin/connectors/spam', {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  return readJson<SpamGuardState>(response);
}

export async function updateSpamGuard(settings: SpamGuardSettings): Promise<SpamGuardState> {
  const response = await fetch('/api/admin/connectors/spam', {
    method: 'PUT',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify(settings),
  });
  return readJson<SpamGuardState>(response);
}

// ---- Per-user Screen Options ----
export async function fetchScreenOptions(): Promise<ScreenOptionsState> {
  const response = await fetch('/api/profile/screen-options', {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  const body = await readJson<{ options?: ScreenOptionsState }>(response);
  if (!body.options) throw new Error('Screen options are unavailable.');
  return body.options;
}

export async function saveScreenOptions(options: ScreenOptionsState): Promise<ScreenOptionsState> {
  const response = await fetch('/api/profile/screen-options', {
    method: 'PUT',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify({ options }),
  });
  const body = await readJson<{ options: ScreenOptionsState }>(response);
  return body.options;
}

// ---- Editor-note mention candidates ----
export interface NoteMentionCandidate {
  id: string;
  username: string;
  displayName: string | null;
}

export async function fetchNoteMentionCandidates(
  postId: string,
  search = '',
): Promise<NoteMentionCandidate[]> {
  const params = new URLSearchParams();
  if (search.trim().length > 0) params.set('search', search.trim());
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(
    `/api/admin/posts/${encodeURIComponent(postId)}/note-mentions${suffix}`,
    {
      credentials: 'include',
      cache: 'no-store',
      headers: { accept: 'application/json' },
    },
  );
  const body = await readJson<{ items?: NoteMentionCandidate[] }>(response);
  return Array.isArray(body.items) ? body.items : [];
}

// ---- Editor notes ----
export interface PostNoteAuthor {
  id: string;
  username: string;
  displayName: string | null;
}

export interface NoteBlockAnchor {
  /** Registered block name, for example `core/paragraph`. */
  name: string;
  /** Dot-separated 0-based path, for example `1` or `0.2`. */
  path: string;
  /** Stable hash of the block name, attributes and own HTML. */
  hash: string;
  /** Short plain-text fingerprint, used to tell changed from removed. */
  text: string;
  /** Stable id persisted in the block's metadata.anchorId (legacy notes: null). */
  anchorId?: string | null;
}

export interface PostNote {
  id: string;
  postId: string;
  parentId: string | null;
  content: string;
  author: PostNoteAuthor | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: PostNoteAuthor | null;
  /** Null for an unanchored note or a reply. */
  block: NoteBlockAnchor | null;
  /** Set while the note is in Trash; cleared on restore. */
  deletedAt: string | null;
  deletedBy: PostNoteAuthor | null;
}

export interface PostNoteLists {
  notes: PostNote[];
  trash: PostNote[];
}

export async function fetchPostNotes(postId: string): Promise<PostNoteLists> {
  const response = await fetch(`/api/admin/posts/${encodeURIComponent(postId)}/notes`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  const body = await readJson<{ notes?: PostNote[]; trash?: PostNote[] }>(response);
  return {
    notes: Array.isArray(body.notes) ? body.notes : [],
    trash: Array.isArray(body.trash) ? body.trash : [],
  };
}

export async function createPostNote(
  postId: string,
  input: { content: string; parentId?: string | null; block?: NoteBlockAnchor | null },
): Promise<PostNote> {
  const response = await fetch(`/api/admin/posts/${encodeURIComponent(postId)}/notes`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify(input),
  });
  return readJson<PostNote>(response);
}

export async function restorePostNote(postId: string, noteId: string): Promise<PostNote> {
  const response = await fetch(
    `/api/admin/posts/${encodeURIComponent(postId)}/notes/${encodeURIComponent(noteId)}/restore`,
    {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...csrfHeader(),
      },
      body: '{}',
    },
  );
  return readJson<PostNote>(response);
}

export async function purgePostNote(postId: string, noteId: string): Promise<void> {
  const response = await fetch(
    `/api/admin/posts/${encodeURIComponent(postId)}/notes/${encodeURIComponent(noteId)}/permanent`,
    {
      method: 'DELETE',
      credentials: 'include',
      cache: 'no-store',
      headers: { accept: 'application/json', ...csrfHeader() },
    },
  );
  if (!response.ok) await readJson(response);
}

/** Move a note to Trash (soft delete); the note survives until purged. */
export async function deletePostNote(postId: string, noteId: string): Promise<void> {
  const response = await fetch(
    `/api/admin/posts/${encodeURIComponent(postId)}/notes/${encodeURIComponent(noteId)}`,
    {
      method: 'DELETE',
      credentials: 'include',
      cache: 'no-store',
      headers: { accept: 'application/json', ...csrfHeader() },
    },
  );
  if (!response.ok) await readJson(response);
}

export async function setPostNoteResolved(
  postId: string,
  noteId: string,
  resolved: boolean,
): Promise<PostNote> {
  const response = await fetch(
    `/api/admin/posts/${encodeURIComponent(postId)}/notes/${encodeURIComponent(noteId)}`,
    {
      method: 'PATCH',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...csrfHeader(),
      },
      body: JSON.stringify({ resolved }),
    },
  );
  return readJson<PostNote>(response);
}

// ---- Appearance → Customize ----
export interface CustomizerColors {
  background?: string;
  surface?: string;
  text?: string;
  muted?: string;
  accent?: string;
}

export interface CustomizerMenuItem {
  label: string;
  url: string;
}

export interface ThemeStringKey {
  key: string;
  label: string;
  fallback: string;
  max: number;
}

export interface ThemeStringsPayload {
  strings: Record<string, Record<string, string>>;
  defaults: Record<string, string>;
  keys: ThemeStringKey[];
}

export interface LanguageMenusPayload {
  menus: Record<string, CustomizerMenuItem[]> | null;
  default: string;
  enabled: string[];
}

export async function fetchThemeStrings(): Promise<ThemeStringsPayload> {
  const response = await fetch('/api/admin/theme-strings', {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  return readJson<ThemeStringsPayload>(response);
}

export async function updateThemeStrings(
  language: string,
  strings: Record<string, string>,
): Promise<{ strings: Record<string, Record<string, string>> }> {
  const response = await fetch('/api/admin/theme-strings', {
    method: 'PUT',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify({ language, strings }),
  });
  return readJson<{ strings: Record<string, Record<string, string>> }>(response);
}

export async function fetchLanguageMenus(): Promise<LanguageMenusPayload> {
  const response = await fetch('/api/admin/language-menus', {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  return readJson<LanguageMenusPayload>(response);
}

export async function updateLanguageMenus(
  language: string,
  menu: CustomizerMenuItem[],
): Promise<{ menus: Record<string, CustomizerMenuItem[]> | null }> {
  const response = await fetch('/api/admin/language-menus', {
    method: 'PUT',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify({ language, menu }),
  });
  return readJson<{ menus: Record<string, CustomizerMenuItem[]> | null }>(response);
}

export interface CustomizerSettings {
  colors: CustomizerColors | null;
  menu: CustomizerMenuItem[] | null;
  css: string | null;
  showOnFront: 'posts' | 'page';
  pageOnFront: string | null;
  pageForPosts: string | null;
}

export async function fetchCustomizer(): Promise<CustomizerSettings> {
  const response = await fetch('/api/admin/customizer', {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  return readJson<CustomizerSettings>(response);
}

export async function updateCustomizer(settings: CustomizerSettings): Promise<CustomizerSettings> {
  const response = await fetch('/api/admin/customizer', {
    method: 'PUT',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify(settings),
  });
  return readJson<CustomizerSettings>(response);
}

// ---- Settings → Privacy: policy page helpers ----
export interface PrivacyPolicyPageResult {
  pageId: string | null;
}

export async function createPrivacyPolicyPage(): Promise<{
  pageId: string;
  page: AdminPost;
}> {
  const response = await fetch('/api/admin/privacy/policy-page', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json', ...csrfHeader() },
  });
  return readJson<{ pageId: string; page: AdminPost }>(response);
}

export async function setPrivacyPolicyPage(
  pageId: string | null,
): Promise<PrivacyPolicyPageResult> {
  const response = await fetch('/api/admin/privacy/policy-page', {
    method: 'PUT',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify({ pageId }),
  });
  return readJson<PrivacyPolicyPageResult>(response);
}

// ---- Tools: backup packages ----
export interface BackupFile {
  fileName: string;
  sizeBytes: number;
  createdAt: string;
}

export interface BackupListResult {
  backups: BackupFile[];
  retention: number;
}

export interface BackupCreateResult extends BackupListResult {
  job: ScheduledJob;
}

export async function fetchBackups(): Promise<BackupListResult> {
  const response = await fetch('/api/admin/backups', {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  return readJson<BackupListResult>(response);
}

export async function createBackup(): Promise<BackupCreateResult> {
  const response = await fetch('/api/admin/backups', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json', ...csrfHeader() },
  });
  return readJson<BackupCreateResult>(response);
}

export async function deleteBackup(fileName: string): Promise<BackupListResult> {
  const response = await fetch(`/api/admin/backups/${encodeURIComponent(fileName)}`, {
    method: 'DELETE',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json', ...csrfHeader() },
  });
  return readJson<BackupListResult>(response);
}

export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface ScheduledJob {
  id: string;
  type: string;
  payload: unknown;
  status: JobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  scheduledAt: string;
  lockedAt: string | null;
  lockedBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobListResult {
  items: ScheduledJob[];
  pagination: { page: number; perPage: number; total: number; totalPages: number };
}

export async function fetchJobs(
  params: {
    status?: JobStatus | '';
    search?: string;
    page?: number;
    perPage?: number;
  } = {},
): Promise<JobListResult> {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.search) query.set('search', params.search);
  if (params.page) query.set('page', String(params.page));
  if (params.perPage) query.set('perPage', String(params.perPage));
  const response = await fetch(`/api/admin/jobs?${query.toString()}`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  return readJson<JobListResult>(response);
}

export async function fetchJob(id: string): Promise<ScheduledJob> {
  const response = await fetch(`/api/admin/jobs/${encodeURIComponent(id)}`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  return readJson<ScheduledJob>(response);
}

export async function runJob(id: string): Promise<ScheduledJob> {
  const response = await fetch(`/api/admin/jobs/${encodeURIComponent(id)}/run`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json', ...csrfHeader() },
  });
  return readJson<ScheduledJob>(response);
}

export async function cancelJob(id: string): Promise<ScheduledJob> {
  const response = await fetch(`/api/admin/jobs/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json', ...csrfHeader() },
  });
  return readJson<ScheduledJob>(response);
}

// ---- Tools: redirects and 404 log ----
export interface RedirectItem {
  id: string;
  fromPath: string;
  toPath: string;
  statusCode: 301 | 302;
  hits: number;
  createdAt: string;
  updatedAt: string;
}

export interface NotFoundEntry {
  id: string;
  path: string;
  hits: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface RedirectListResult {
  redirects: RedirectItem[];
  notFound: NotFoundEntry[];
}

export async function fetchRedirects(): Promise<RedirectListResult> {
  const response = await fetch('/api/admin/redirects', {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  return readJson<RedirectListResult>(response);
}

export async function createRedirect(payload: {
  fromPath: string;
  toPath: string;
  statusCode?: 301 | 302;
}): Promise<RedirectListResult> {
  const response = await fetch('/api/admin/redirects', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify(payload),
  });
  return readJson<RedirectListResult>(response);
}

export async function updateRedirect(
  id: string,
  payload: { fromPath: string; toPath: string; statusCode?: 301 | 302 },
): Promise<RedirectListResult> {
  const response = await fetch(`/api/admin/redirects/${encodeURIComponent(id)}`, {
    method: 'PUT',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify(payload),
  });
  return readJson<RedirectListResult>(response);
}

export async function deleteRedirect(id: string): Promise<RedirectListResult> {
  const response = await fetch(`/api/admin/redirects/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json', ...csrfHeader() },
  });
  return readJson<RedirectListResult>(response);
}

export async function dismissNotFound(id: string): Promise<RedirectListResult> {
  const response = await fetch(`/api/admin/redirects/not-found/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json', ...csrfHeader() },
  });
  return readJson<RedirectListResult>(response);
}

// ---- Tools: WordPress WXR export ----
export type ExportScope = 'all' | 'posts' | 'pages' | 'media';
export type ExportStatus = 'publish' | 'draft' | 'private' | 'future';

/** WordPress-style export filters (published/draft/private/scheduled). */
export interface ExportFilters {
  author?: string;
  startDate?: string;
  endDate?: string;
  status?: ExportStatus;
  category?: string;
}

export async function downloadExport(
  scope: ExportScope,
  filters: ExportFilters = {},
): Promise<void> {
  const params = new URLSearchParams({ content: scope });
  for (const [key, value] of Object.entries(filters)) {
    if (typeof value === 'string' && value.length > 0) params.set(key, value);
  }
  const response = await fetch(`/api/admin/export?${params.toString()}`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/rss+xml' },
  });
  if (!response.ok) {
    await readJson(response);
    return;
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `mernpress-export-${new Date().toISOString().slice(0, 10)}.xml`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ---- Outbound mail status (Add User notification) ----
export interface MailStatus {
  configured: boolean;
  transport: 'smtp' | 'memory' | null;
  from: string | null;
}

export interface MailLogEntry {
  id: string;
  recipient: string;
  subject: string;
  status: 'sent' | 'failed';
  reason: string | null;
  createdAt: string;
}

export async function fetchMailLog(): Promise<MailLogEntry[]> {
  const response = await fetch('/api/admin/mail/log', {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  return (await readJson<{ items: MailLogEntry[] }>(response)).items;
}

export async function clearMailLog(): Promise<void> {
  const response = await fetch('/api/admin/mail/log', {
    method: 'DELETE',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json', ...csrfHeader() },
  });
  if (!response.ok) {
    await readJson(response);
  }
}

export async function fetchMailStatus(): Promise<MailStatus> {
  const response = await fetch('/api/admin/mail/status', {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  return readJson<MailStatus>(response);
}

export async function fetchUsers(
  params: {
    search?: string;
    role?: UserRole;
    sort?: 'username' | 'email';
    order?: 'asc' | 'desc';
    page?: number;
    perPage?: number;
  } = {},
): Promise<AdminUserList> {
  const response = await fetch(
    `/api/users${queryString({
      search: params.search,
      role: params.role,
      sort: params.sort,
      order: params.order,
      page: params.page,
      perPage: params.perPage,
    })}`,
    {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { accept: 'application/json' },
    },
  );
  return readJson<AdminUserList>(response);
}

export async function createUser(payload: {
  username: string;
  password: string;
  role: UserRole;
  email?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  nickname?: string;
  website?: string;
  sendNotification?: boolean;
}): Promise<AdminUser> {
  const response = await fetch('/api/users', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify(payload),
  });
  return readJson<AdminUser>(response);
}

export async function updateUserRole(id: string, role: UserRole): Promise<AdminUser> {
  const response = await fetch(`/api/users/${encodeURIComponent(id)}/role`, {
    method: 'PUT',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify({ role }),
  });
  return readJson<AdminUser>(response);
}

export async function updateUserStatus(id: string, status: UserStatus): Promise<AdminUser> {
  const response = await fetch(`/api/users/${encodeURIComponent(id)}/status`, {
    method: 'PUT',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify({ status }),
  });
  return readJson<AdminUser>(response);
}

export async function resetUserPassword(id: string, password: string): Promise<void> {
  const response = await fetch(`/api/users/${encodeURIComponent(id)}/password`, {
    method: 'PUT',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'content-type': 'application/json', ...csrfHeader() },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) {
    throw await toApiError(response);
  }
}

export async function sendUserPasswordReset(id: string): Promise<void> {
  const response = await fetch(`/api/users/${encodeURIComponent(id)}/send-password-reset`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json', ...csrfHeader() },
  });
  if (!response.ok) {
    throw await toApiError(response);
  }
}

export async function deleteUser(id: string, reassignTo?: string): Promise<void> {
  const response = await fetch(
    `/api/users/${encodeURIComponent(id)}${queryString({ reassignTo })}`,
    {
      method: 'DELETE',
      credentials: 'include',
      cache: 'no-store',
      headers: { ...csrfHeader() },
    },
  );
  if (!response.ok) {
    throw await toApiError(response);
  }
}

export async function fetchProfile(): Promise<UserProfile> {
  const response = await fetch('/api/profile', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  return readJson<UserProfile>(response);
}

export async function updateProfile(payload: {
  username?: string;
  email?: string | null;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  nickname?: string | null;
  bio?: string | null;
  website?: string | null;
  syntaxHighlighting?: boolean;
  locale?: string;
  adminColor?: AdminColorScheme;
}): Promise<UserProfile> {
  const response = await fetch('/api/profile', {
    method: 'PUT',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify(payload),
  });
  return readJson<UserProfile>(response);
}

export async function fetchLocales(): Promise<LocaleOption[]> {
  const response = await fetch('/api/profile/locales', {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  return (await readJson<{ items: LocaleOption[] }>(response)).items;
}

export async function fetchApplicationPasswords(): Promise<ApplicationPassword[]> {
  const response = await fetch('/api/profile/app-passwords', {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  return (await readJson<{ items: ApplicationPassword[] }>(response)).items;
}

export async function createApplicationPassword(name: string): Promise<{
  password: string;
  item: ApplicationPassword;
}> {
  const response = await fetch('/api/profile/app-passwords', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify({ name }),
  });
  return readJson<{ password: string; item: ApplicationPassword }>(response);
}

export async function revokeApplicationPassword(id: string): Promise<void> {
  const response = await fetch(`/api/profile/app-passwords/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json', ...csrfHeader() },
  });
  if (!response.ok) {
    await readJson(response);
  }
}

export interface TwoFactorStatus {
  enabled: boolean;
  confirmedAt: string | null;
  recoveryCodesRemaining: number;
}

export interface TwoFactorSetup {
  secret: string;
  otpauthUrl: string;
  recoveryCodes: string[];
}

export async function fetchTwoFactorStatus(): Promise<TwoFactorStatus> {
  const response = await fetch('/api/profile/two-factor', {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  return readJson<TwoFactorStatus>(response);
}

export async function setupTwoFactor(): Promise<TwoFactorSetup> {
  const response = await fetch('/api/profile/two-factor/setup', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json', ...csrfHeader() },
  });
  return readJson<TwoFactorSetup>(response);
}

export async function confirmTwoFactor(code: string): Promise<TwoFactorStatus> {
  const response = await fetch('/api/profile/two-factor/confirm', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify({ code }),
  });
  return readJson<TwoFactorStatus>(response);
}

export async function disableTwoFactor(password: string, code: string): Promise<TwoFactorStatus> {
  const response = await fetch('/api/profile/two-factor/disable', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify({ password, code }),
  });
  return readJson<TwoFactorStatus>(response);
}

export async function regenerateRecoveryCodes(
  password: string,
): Promise<{ recoveryCodes: string[] }> {
  const response = await fetch('/api/profile/two-factor/recovery-codes', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify({ password }),
  });
  return readJson<{ recoveryCodes: string[] }>(response);
}

export async function resetUserTwoFactor(id: string): Promise<void> {
  const response = await fetch(`/api/users/${encodeURIComponent(id)}/two-factor`, {
    method: 'DELETE',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json', ...csrfHeader() },
  });
  if (!response.ok) {
    await readJson(response);
  }
}

export async function changeOwnPassword(payload: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const response = await fetch('/api/profile/password', {
    method: 'PUT',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'content-type': 'application/json', ...csrfHeader() },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw await toApiError(response);
  }
}

export async function fetchOptions(group: OptionGroup): Promise<OptionValues> {
  const response = await fetch(`/api/options${queryString({ group })}`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  return readJson<OptionValues>(response);
}

export async function updateOptions(
  group: OptionGroup,
  values: OptionValues,
): Promise<OptionValues> {
  const response = await fetch('/api/options', {
    method: 'PUT',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify({ group, values }),
  });
  return readJson<OptionValues>(response);
}

/* --------------------------------------------------------------------------
   Media library (Phase 6)
   -------------------------------------------------------------------------- */

export type MediaDerivativeWidth = '300' | '600' | '1200';

/** Width-keyed public URLs; the server omits a width it could not generate. */
export type MediaDerivatives = Partial<Record<MediaDerivativeWidth, string>>;

export interface MediaItem {
  id: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  altText: string;
  caption: string;
  description: string;
  /** Canonical public URL (`/api/media/<id>/<name>`); served through the same proxy. */
  url: string;
  derivatives: MediaDerivatives;
  uploadedById: string | null;
  /** Virtual folder id; null means Uncategorized. */
  folderId: string | null;
  editedAt: string | null;
  hasOriginal: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MediaListParams {
  page?: number;
  perPage?: number;
  search?: string;
  type?: 'image';
  order?: 'newest' | 'oldest';
  month?: string;
  folder?: string;
}

export interface MediaFolder {
  id: string;
  name: string;
  parentId: string | null;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateMediaPayload {
  altText?: string;
  caption?: string;
  description?: string;
  folderId?: string | null;
}

export interface UploadMediaOptions {
  /** Optional alt text sent with the multipart body (editable later). */
  alt?: string;
  caption?: string;
  /** Upload progress as an integer percentage (0–100). */
  onProgress?: (percent: number) => void;
  /** Abort an in-flight upload (used by the editor's mediaUpload cleanup). */
  signal?: AbortSignal;
  /** Upload straight into a folder (Media Library folder filter). */
  folderId?: string;
}

export async function listMedia(params: MediaListParams = {}): Promise<Paged<MediaItem>> {
  const response = await fetch(
    `/api/admin/media${queryString({
      page: params.page,
      perPage: params.perPage,
      search: params.search,
      type: params.type,
      order: params.order,
      month: params.month,
      folder: params.folder,
    })}`,
    {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { accept: 'application/json' },
    },
  );

  return readJson<Paged<MediaItem>>(response);
}

export async function listMediaFolders(): Promise<MediaFolder[]> {
  const response = await fetch('/api/admin/media/folders', {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  const body = await readJson<{ items: MediaFolder[] }>(response);
  return body.items;
}

export async function createMediaFolder(
  name: string,
  parentId: string | null = null,
): Promise<MediaFolder> {
  const response = await fetch('/api/admin/media/folders', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify({ name, parentId }),
  });
  return readJson<MediaFolder>(response);
}

export async function moveMediaFolder(id: string, parentId: string | null): Promise<MediaFolder> {
  const response = await fetch(`/api/admin/media/folders/${encodeURIComponent(id)}/move`, {
    method: 'PUT',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify({ parentId }),
  });
  return readJson<MediaFolder>(response);
}

export async function renameMediaFolder(id: string, name: string): Promise<MediaFolder> {
  const response = await fetch(`/api/admin/media/folders/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify({ name }),
  });
  return readJson<MediaFolder>(response);
}

export async function deleteMediaFolder(id: string): Promise<void> {
  const response = await fetch(`/api/admin/media/folders/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json', ...csrfHeader() },
  });
  if (!response.ok) await readJson(response);
}

export interface MediaRegenerateQueued {
  job: ScheduledJob;
}

export async function queueMediaRegeneration(
  input: { folderId?: string | null } = {},
): Promise<MediaRegenerateQueued> {
  const response = await fetch('/api/admin/media/regenerate', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify(input),
  });
  return readJson<MediaRegenerateQueued>(response);
}

export async function getMedia(id: string): Promise<MediaItem> {
  const response = await fetch(`/api/admin/media/${encodeURIComponent(id)}`, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });

  return readJson<MediaItem>(response);
}

/**
 * Upload one image as `multipart/form-data`.
 *
 * `XMLHttpRequest` is used instead of `fetch` because only XHR reports upload
 * progress events. Cookie + CSRF handling matches the fetch wrapper, and the
 * `content-type` header is deliberately left unset so the browser adds the
 * multipart boundary.
 */
export function uploadMedia(file: File, options: UploadMediaOptions = {}): Promise<MediaItem> {
  return new Promise<MediaItem>((resolve, reject) => {
    let csrf: Record<string, string>;
    try {
      csrf = csrfHeader();
    } catch (error) {
      reject(error);
      return;
    }

    if (options.signal?.aborted) {
      reject(new ApiError(0, 'UPLOAD_ABORTED', 'Upload cancelled.'));
      return;
    }

    const form = new FormData();
    form.append('file', file, file.name);
    if (options.alt !== undefined) {
      form.append('altText', options.alt);
    }
    if (options.caption !== undefined) {
      form.append('caption', options.caption);
    }
    if (options.folderId) {
      form.append('folderId', options.folderId);
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/admin/media');
    xhr.withCredentials = true;
    xhr.responseType = 'text';
    xhr.setRequestHeader('accept', 'application/json');
    for (const [header, value] of Object.entries(csrf)) {
      xhr.setRequestHeader(header, value);
    }

    if (options.onProgress) {
      const report = options.onProgress;
      xhr.upload.onprogress = (event: ProgressEvent) => {
        if (event.lengthComputable && event.total > 0) {
          report(Math.min(100, Math.round((event.loaded / event.total) * 100)));
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as MediaItem);
        } catch {
          reject(
            new ApiError(xhr.status, 'INVALID_RESPONSE', 'The upload response was not valid JSON.'),
          );
        }
        return;
      }
      if (xhr.status === 401) {
        unauthorizedHandler?.();
      }
      reject(apiErrorFromText(xhr.status, xhr.responseText));
    };
    xhr.onerror = () => {
      reject(
        new ApiError(
          0,
          'NETWORK_ERROR',
          'Cannot reach the API. Check your connection and try again.',
        ),
      );
    };
    xhr.onabort = () => {
      reject(new ApiError(0, 'UPLOAD_ABORTED', 'Upload cancelled.'));
    };

    options.signal?.addEventListener('abort', () => xhr.abort());

    xhr.send(form);
  });
}

export async function editMediaImage(id: string, blob: Blob): Promise<MediaItem> {
  const csrf = getCookie('mernpress_csrf');
  const form = new FormData();
  form.append('file', blob, 'edited.webp');
  const response = await fetch(`/api/admin/media/${encodeURIComponent(id)}/edit`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      ...(csrf ? { 'x-csrf-token': csrf } : {}),
    },
    body: form,
  });
  return readJson<MediaItem>(response);
}

export async function restoreMediaOriginal(id: string): Promise<MediaItem> {
  const response = await fetch(`/api/admin/media/${encodeURIComponent(id)}/restore`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json', ...csrfHeader() },
  });
  return readJson<MediaItem>(response);
}

export async function updateMedia(id: string, payload: UpdateMediaPayload): Promise<MediaItem> {
  const response = await fetch(`/api/admin/media/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify(payload),
  });

  return readJson<MediaItem>(response);
}

export async function deleteMedia(id: string): Promise<void> {
  const response = await fetch(`/api/admin/media/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
    cache: 'no-store',
    headers: { ...csrfHeader() },
  });

  if (!response.ok) {
    throw await toApiError(response);
  }
}

export function actionErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return error.message;
      case 401:
        return 'Your session expired. Sign in again.';
      case 403:
        return 'You do not have permission to do that.';
      case 404:
        return 'That content no longer exists. It may have been deleted or moved out of your visibility.';
      case 409:
        return error.code === 'VERSION_CONFLICT'
          ? 'This content changed since you loaded it. Reload the latest version before saving.'
          : error.message;
      default:
        return error.message;
    }
  }

  return 'Cannot reach the API. Check your connection and try again.';
}

// ---- Comments (ADR 0009, expanded scope) ----
export type CommentStatus = 'PENDING' | 'APPROVED' | 'SPAM' | 'TRASHED';

export interface AdminComment {
  id: string;
  postId: string;
  postTitle: string;
  postSlug: string;
  userId: string | null;
  parentId: string | null;
  authorName: string;
  authorEmail: string;
  authorUrl: string | null;
  content: string;
  status: CommentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CommentCounts {
  all: number;
  pending: number;
  approved: number;
  spam: number;
  trashed: number;
  mine: number;
}

export interface CommentListResult {
  items: AdminComment[];
  total: number;
  totalPages: number;
  counts: CommentCounts;
}

export async function fetchComments(params: {
  status?: CommentStatus;
  postId?: string;
  search?: string;
  page?: number;
  perPage?: number;
}): Promise<CommentListResult> {
  const response = await fetch(`/api/admin/comments${queryString(params)}`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  return readJson<CommentListResult>(response);
}

export async function fetchCommentCounts(): Promise<CommentCounts> {
  const response = await fetch('/api/admin/comments/counts', {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  return readJson<CommentCounts>(response);
}

export async function fetchRecentComments(limit = 5): Promise<AdminComment[]> {
  const response = await fetch(`/api/admin/comments/recent?limit=${limit}`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  return (await readJson<{ items: AdminComment[] }>(response)).items;
}

export async function fetchCommentCountsByPost(postIds: string[]): Promise<Record<string, number>> {
  if (postIds.length === 0) return {};
  const response = await fetch(
    `/api/admin/comments/counts-by-post?ids=${encodeURIComponent(postIds.join(','))}`,
    { credentials: 'include', cache: 'no-store', headers: { accept: 'application/json' } },
  );
  return readJson<Record<string, number>>(response);
}

export async function setCommentStatus(id: string, status: CommentStatus): Promise<AdminComment> {
  const response = await fetch(`/api/admin/comments/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json', 'content-type': 'application/json', ...csrfHeader() },
    body: JSON.stringify({ status }),
  });
  return readJson<AdminComment>(response);
}

export async function updateComment(
  id: string,
  input: {
    authorName?: string;
    authorEmail?: string;
    authorUrl?: string | null;
    content?: string;
  },
): Promise<AdminComment> {
  const response = await fetch(`/api/admin/comments/${encodeURIComponent(id)}`, {
    method: 'PUT',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json', 'content-type': 'application/json', ...csrfHeader() },
    body: JSON.stringify(input),
  });
  return readJson<AdminComment>(response);
}

export async function deleteComment(id: string): Promise<void> {
  const response = await fetch(`/api/admin/comments/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json', ...csrfHeader() },
  });
  if (!response.ok) await readJson(response);
}

export async function bulkSetCommentStatus(ids: string[], status: CommentStatus): Promise<void> {
  const response = await fetch('/api/admin/comments/bulk', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json', 'content-type': 'application/json', ...csrfHeader() },
    body: JSON.stringify({ ids, status }),
  });
  if (!response.ok) await readJson(response);
}

// ---- Appearance: themes (ADR 0011) ----
export interface ThemeFont {
  family: string;
  weights: number[];
  source: 'theme' | 'system';
}

export interface AdminTheme {
  id: string;
  name: string;
  version: string;
  /** Present on the list response; used by the Customizer colour hints. */
  tokens?: {
    background: string;
    surface: string;
    text: string;
    muted: string;
    accent: string;
  };
  author: { name: string; url: string | null };
  description: string;
  tags: string[];
  features: string[];
  fonts: ThemeFont[];
  screenshot: string;
  active: boolean;
  autoUpdates: boolean;
}

export interface ThemeListResult {
  themes: AdminTheme[];
  active: string;
}

export async function fetchThemes(): Promise<ThemeListResult> {
  const response = await fetch('/api/admin/themes', {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  return readJson<ThemeListResult>(response);
}

export async function activateTheme(id: string): Promise<ThemeListResult> {
  const response = await fetch(`/api/admin/themes/${encodeURIComponent(id)}/activate`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json', ...csrfHeader() },
  });
  return readJson<ThemeListResult>(response);
}

export async function setThemeAutoUpdates(enabled: boolean): Promise<ThemeListResult> {
  const response = await fetch('/api/admin/themes/auto-updates', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json', 'content-type': 'application/json', ...csrfHeader() },
    body: JSON.stringify({ enabled }),
  });
  return readJson<ThemeListResult>(response);
}

// ---- Plugins (ADR 0012) ----
export interface AdminPlugin {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  details: string;
  active: boolean;
  autoUpdates: boolean;
}

export interface PluginListResult {
  plugins: AdminPlugin[];
  counts: { all: number; active: number; inactive: number };
}

export async function fetchPlugins(): Promise<PluginListResult> {
  const response = await fetch('/api/admin/plugins', {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  return readJson<PluginListResult>(response);
}

export async function activatePlugin(id: string): Promise<PluginListResult> {
  const response = await fetch(`/api/admin/plugins/${encodeURIComponent(id)}/activate`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json', ...csrfHeader() },
  });
  return readJson<PluginListResult>(response);
}

export async function deactivatePlugin(id: string): Promise<PluginListResult> {
  const response = await fetch(`/api/admin/plugins/${encodeURIComponent(id)}/deactivate`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json', ...csrfHeader() },
  });
  return readJson<PluginListResult>(response);
}

export async function deletePlugin(id: string): Promise<PluginListResult> {
  const response = await fetch(`/api/admin/plugins/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json', ...csrfHeader() },
  });
  return readJson<PluginListResult>(response);
}

export async function setPluginAutoUpdates(enabled: boolean): Promise<PluginListResult> {
  const response = await fetch('/api/admin/plugins/auto-updates', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json', 'content-type': 'application/json', ...csrfHeader() },
    body: JSON.stringify({ enabled }),
  });
  return readJson<PluginListResult>(response);
}

export async function fetchPluginToolbar(): Promise<{ message: string | null }> {
  const response = await fetch('/api/admin/plugins/toolbar', {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  return readJson<{ message: string | null }>(response);
}

// ---- Updates (ADR 0013) ----
export interface UpdateItem {
  id: string;
  name: string;
  type: 'core' | 'theme' | 'plugin';
  installedVersion: string;
  availableVersion: string | null;
  autoUpdates: boolean;
  status: 'current' | 'update' | 'unknown';
}

export interface UpdateStatus {
  coreVersion: string;
  source: 'manifest' | 'local';
  manifestConfigured: boolean;
  lastCheckedAt: string | null;
  items: UpdateItem[];
  updatesAvailable: number;
}

export async function fetchUpdates(): Promise<UpdateStatus> {
  const response = await fetch('/api/admin/updates', {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  return readJson<UpdateStatus>(response);
}

export async function checkUpdates(): Promise<UpdateStatus> {
  const response = await fetch('/api/admin/updates/check', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json', ...csrfHeader() },
  });
  return readJson<UpdateStatus>(response);
}

// ---- Dashboard events and news (ADR 0014) ----
export interface DashboardEvent {
  title: string;
  url: string;
  location: string;
  date: string;
}

export interface DashboardNews {
  title: string;
  url: string;
  publishedAt: string | null;
}

export interface DashboardFeeds {
  events: DashboardEvent[];
  news: DashboardNews[];
  eventsConfigured: boolean;
  newsConfigured: boolean;
  eventsError: string | null;
  newsError: string | null;
  location: string;
}

export async function fetchDashboardFeeds(location = ''): Promise<DashboardFeeds> {
  const response = await fetch(
    `/api/admin/dashboard/feeds${location ? `?location=${encodeURIComponent(location)}` : ''}`,
    { credentials: 'include', cache: 'no-store', headers: { accept: 'application/json' } },
  );
  return readJson<DashboardFeeds>(response);
}

// ---- Tools: WordPress import and personal data requests (ADR 0016) ----
export interface ImportResult {
  imported: number;
  posts: number;
  pages: number;
  skipped: number;
  failed: number;
  terms: number;
  errors: Array<{ title: string; message: string }>;
}

export async function importWordPress(content: string): Promise<ImportResult> {
  const response = await fetch('/api/admin/import/wordpress', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify({ content }),
  });
  return readJson<ImportResult>(response);
}

export type DataRequestType = 'EXPORT' | 'ERASE';
export type DataRequestStatus = 'PENDING' | 'COMPLETED';

export interface DataRequest {
  id: string;
  type: DataRequestType;
  email: string;
  userId: string | null;
  status: DataRequestStatus;
  requestedBy: string;
  note: string | null;
  createdAt: string;
  completedAt: string | null;
}

export async function fetchDataRequests(type: DataRequestType): Promise<DataRequest[]> {
  const response = await fetch(`/api/admin/data-requests?type=${type}`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  return (await readJson<{ items: DataRequest[] }>(response)).items;
}

export async function createDataRequest(
  type: DataRequestType,
  email: string,
): Promise<DataRequest> {
  const response = await fetch('/api/admin/data-requests', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify({ type, email }),
  });
  return readJson<DataRequest>(response);
}

export async function completeDataRequest(id: string): Promise<DataRequest> {
  const response = await fetch(`/api/admin/data-requests/${encodeURIComponent(id)}/complete`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json', 'content-type': 'application/json', ...csrfHeader() },
    body: JSON.stringify({}),
  });
  return readJson<DataRequest>(response);
}

export async function downloadPersonalData(id: string): Promise<void> {
  const response = await fetch(`/api/admin/data-requests/${encodeURIComponent(id)}/export`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    await readJson(response);
    return;
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `personal-data-${id}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ---- Settings connectors (ADR 0017) ----
export interface ConnectorState {
  id: string;
  name: string;
  description: string;
  configured: boolean;
  maskedKey: string | null;
  updatedAt: string | null;
}

export async function fetchConnectors(): Promise<ConnectorState[]> {
  const response = await fetch('/api/admin/connectors', {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  return (await readJson<{ items: ConnectorState[] }>(response)).items;
}

export async function setConnectorKey(id: string, apiKey: string): Promise<ConnectorState[]> {
  const response = await fetch(`/api/admin/connectors/${encodeURIComponent(id)}`, {
    method: 'PUT',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...csrfHeader(),
    },
    body: JSON.stringify({ apiKey }),
  });
  return (await readJson<{ items: ConnectorState[] }>(response)).items;
}

export async function disconnectConnector(id: string): Promise<ConnectorState[]> {
  const response = await fetch(`/api/admin/connectors/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'application/json', ...csrfHeader() },
  });
  return (await readJson<{ items: ConnectorState[] }>(response)).items;
}

export type UserRole = 'administrator' | 'editor' | 'author' | 'contributor' | 'subscriber';
export type ContentType = 'post' | 'page';
export type PostStatus = 'DRAFT' | 'PUBLISHED' | 'TRASHED';
export type TransitionAction = 'publish' | 'unpublish' | 'trash' | 'restore';
export type TaxonomyType = 'category' | 'tag';

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  status: 'active' | 'disabled';
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
  month?: string;
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

export async function login(
  username: string,
  password: string,
): Promise<{ user: AuthUser; csrfToken: string; expiresAt: string }> {
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
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  return (await response.json()) as {
    user: AuthUser;
    csrfToken: string;
    expiresAt: string;
  };
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

export async function fetchTerms(
  params: { taxonomy?: TaxonomyType; search?: string; page?: number; perPage?: number } = {},
): Promise<Paged<AdminTerm>> {
  const response = await fetch(
    `/api/admin/terms${queryString({
      taxonomy: params.taxonomy,
      search: params.search,
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
export type OptionGroup = 'general' | 'reading' | 'writing';

export interface AdminUser {
  id: string;
  username: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  postCount: number;
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
  role: UserRole;
  createdAt: string;
}

export type OptionValues = Record<string, unknown>;

export async function fetchUsers(
  params: { search?: string; page?: number; perPage?: number } = {},
): Promise<AdminUserList> {
  const response = await fetch(
    `/api/users${queryString({ search: params.search, page: params.page, perPage: params.perPage })}`,
    {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { accept: 'application/json' },
    },
  );
  return readJson<AdminUserList>(response);
}

/** A redacted audit row. Sensitive hashes/identifiers are never part of the DTO. */
export interface AdminAuditEvent {
  id: string;
  eventType: string;
  actorUserId: string | null;
  targetUserId: string | null;
  createdAt: string;
  metadata: Record<string, string | number>;
}

export interface AuditListParams {
  eventType?: string;
  from?: string;
  to?: string;
  page?: number;
  perPage?: number;
}

export async function fetchAuditEvents(
  params: AuditListParams = {},
): Promise<Paged<AdminAuditEvent>> {
  const response = await fetch(
    `/api/admin/audit${queryString({
      eventType: params.eventType,
      from: params.from,
      to: params.to,
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

  return readJson<Paged<AdminAuditEvent>>(response);
}

export async function createUser(payload: {
  username: string;
  password: string;
  role: UserRole;
  email?: string;
  displayName?: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface MediaListParams {
  page?: number;
  perPage?: number;
  search?: string;
  type?: 'image';
  order?: 'newest' | 'oldest';
}

export interface UpdateMediaPayload {
  altText?: string;
  caption?: string;
  description?: string;
}

export interface UploadMediaOptions {
  /** Optional alt text sent with the multipart body (editable later). */
  alt?: string;
  caption?: string;
  /** Upload progress as an integer percentage (0–100). */
  onProgress?: (percent: number) => void;
  /** Abort an in-flight upload (used by the editor's mediaUpload cleanup). */
  signal?: AbortSignal;
}

export async function listMedia(params: MediaListParams = {}): Promise<Paged<MediaItem>> {
  const response = await fetch(
    `/api/admin/media${queryString({
      page: params.page,
      perPage: params.perPage,
      search: params.search,
      type: params.type,
      order: params.order,
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

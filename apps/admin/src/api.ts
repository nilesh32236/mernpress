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

async function toApiError(response: Response): Promise<ApiError> {
  let body: ErrorBody = {};
  try {
    body = (await response.json()) as ErrorBody;
  } catch {
    // A non-JSON error is still surfaced as a generic API failure.
  }

  const details = (body.error?.details ?? [])
    .filter((detail) => typeof detail.message === 'string')
    .map((detail) => ({
      path: typeof detail.path === 'string' ? detail.path : '',
      message: detail.message ?? 'Invalid value',
    }));

  return new ApiError(
    response.status,
    body.error?.code ?? 'REQUEST_FAILED',
    body.error?.message ?? 'The request failed.',
    details,
  );
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

export async function createUser(payload: {
  username: string;
  password: string;
  role: UserRole;
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

export async function updateProfile(payload: { username?: string }): Promise<UserProfile> {
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

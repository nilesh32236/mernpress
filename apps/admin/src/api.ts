export interface AuthUser {
  id: string;
  username: string;
  role: 'administrator';
  status: 'active' | 'disabled';
}

interface ErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
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

  return new ApiError(
    response.status,
    body.error?.code ?? 'REQUEST_FAILED',
    body.error?.message ?? 'The request failed.',
  );
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

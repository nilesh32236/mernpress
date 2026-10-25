import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCsrfToken, fetchSession, login, logout, type AuthUser } from './api.js';

const user: AuthUser = {
  id: 'user-1',
  username: 'admin',
  role: 'administrator',
  status: 'active',
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

type FetchCall = Parameters<typeof fetch>;

/**
 * The MVP deployment is same-origin: the admin calls relative `/api/...` paths
 * (Vite proxies them in development) and always opts into cookies while
 * bypassing caches. Absolute URLs or default credentials would silently work in
 * local development yet break the deployed topology.
 */
function expectSameOriginApiCalls(calls: readonly FetchCall[]): void {
  expect(calls.length).toBeGreaterThan(0);

  for (const [input, init] of calls) {
    expect(typeof input).toBe('string');

    const url = input as string;
    expect(url.startsWith('/api/')).toBe(true);
    expect(url).not.toMatch(/^[a-z][a-z\d+.-]*:\/\//i);
    expect(init?.credentials).toBe('include');
    expect(init?.cache).toBe('no-store');
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'mernpress_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
});

describe('admin auth API client', () => {
  it('returns the user from a relative session request with credentials', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(200, { user }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchSession()).resolves.toEqual(user);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/auth/session');
    expect(init?.method).toBe('GET');
    expectSameOriginApiCalls(fetchMock.mock.calls);
  });

  it('returns null from a relative session request when unauthenticated', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse(401, {
        error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchSession()).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/auth/session');
    expectSameOriginApiCalls(fetchMock.mock.calls);
  });

  it('returns the pre-auth token from GET /api/auth/csrf', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 'pre-auth-token' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchCsrfToken()).resolves.toBe('pre-auth-token');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/auth/csrf');
    expect(init?.method).toBe('GET');
    expectSameOriginApiCalls(fetchMock.mock.calls);
  });

  it('requests a pre-auth token before posting credentials to /api/auth/login', async () => {
    const session = {
      user,
      csrfToken: 'session-token',
      expiresAt: '2026-10-25T00:00:00.000Z',
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 'pre-auth-token' }))
      .mockResolvedValueOnce(jsonResponse(200, session));
    vi.stubGlobal('fetch', fetchMock);

    await expect(login('admin', 'correct horse battery staple')).resolves.toEqual(session);

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [csrfUrl, csrfInit] = fetchMock.mock.calls[0] ?? [];
    const [loginUrl, loginInit] = fetchMock.mock.calls[1] ?? [];

    expect(csrfUrl).toBe('/api/auth/csrf');
    expect(csrfInit?.method).toBe('GET');
    expect(loginUrl).toBe('/api/auth/login');
    expect(loginInit?.method).toBe('POST');
    expect(loginInit?.headers).toMatchObject({
      accept: 'application/json',
      'content-type': 'application/json',
      'x-csrf-token': 'pre-auth-token',
    });
    expect(JSON.parse(String(loginInit?.body))).toEqual({
      username: 'admin',
      password: 'correct horse battery staple',
    });
    expectSameOriginApiCalls(fetchMock.mock.calls);
  });

  it('reads the session CSRF cookie and sends it when logging out', async () => {
    document.cookie = 'mernpress_csrf=session-token; path=/';
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(204, null));
    vi.stubGlobal('fetch', fetchMock);

    expect(document.cookie).toContain('mernpress_csrf=session-token');
    await expect(logout()).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/auth/logout');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ 'x-csrf-token': 'session-token' });
    expectSameOriginApiCalls(fetchMock.mock.calls);
  });
});

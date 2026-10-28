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

describe('admin content API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.cookie = 'mernpress_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  });

  it('serializes list filters and pagination on the relative posts endpoint', async () => {
    const paged = {
      items: [],
      pagination: { page: 2, perPage: 10, total: 21, totalPages: 3 },
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(200, paged));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      (await import('./api.js')).fetchPosts({
        type: 'post',
        status: 'DRAFT',
        search: 'hello world',
        page: 2,
        perPage: 10,
        sort: 'updatedAt',
        order: 'desc',
      }),
    ).resolves.toEqual(paged);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(
      '/api/admin/posts?type=post&status=DRAFT&search=hello+world&page=2&perPage=10&sort=updatedAt&order=desc',
    );
    expect(init?.method).toBe('GET');
    expectSameOriginApiCalls(fetchMock.mock.calls);
  });

  it('sends the CSRF cookie on create, update, transition and term assignment', async () => {
    document.cookie = 'mernpress_csrf=session-token; path=/';
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(201, { id: 'post-1' }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'post-1' }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'post-1' }))
      .mockResolvedValueOnce(jsonResponse(200, { id: 'post-1' }));
    vi.stubGlobal('fetch', fetchMock);

    const api = await import('./api.js');
    await api.createPost({ type: 'post', title: 'Hello' });
    await api.updatePost('post-1', { baseVersion: 2, title: 'Hello again' });
    await api.transitionPost('post-1', 'publish', 3);
    await api.assignTerms('post-1', ['cat-1'], ['tag-1'], 4);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const calls = fetchMock.mock.calls;
    expect(calls[0]?.[0]).toBe('/api/admin/posts');
    expect(calls[1]?.[0]).toBe('/api/admin/posts/post-1');
    expect(calls[2]?.[0]).toBe('/api/admin/posts/post-1/publish');
    expect(calls[3]?.[0]).toBe('/api/admin/posts/post-1/terms');
    for (const [, init] of calls) {
      expect(init?.headers).toMatchObject({ 'x-csrf-token': 'session-token' });
      expect(init?.credentials).toBe('include');
      expect(init?.cache).toBe('no-store');
    }
    expect(JSON.parse(String(calls[0]?.[1]?.body))).toEqual({ type: 'post', title: 'Hello' });
    expect(JSON.parse(String(calls[1]?.[1]?.body))).toEqual({
      baseVersion: 2,
      title: 'Hello again',
    });
    expect(JSON.parse(String(calls[2]?.[1]?.body))).toEqual({ baseVersion: 3 });
    expect(JSON.parse(String(calls[3]?.[1]?.body))).toEqual({
      baseVersion: 4,
      categoryIds: ['cat-1'],
      tagIds: ['tag-1'],
    });
  });

  it('parses server field validation details', async () => {
    document.cookie = 'mernpress_csrf=session-token; path=/';
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request',
          details: [{ path: 'title', message: 'Title is required' }],
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const api = await import('./api.js');
    await expect(api.createPost({ type: 'post', title: '' })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ path: 'title', message: 'Title is required' }],
    });
  });

  it('requests terms with the taxonomy and pagination filters', async () => {
    const page = { items: [], pagination: { page: 1, perPage: 100, total: 0, totalPages: 0 } };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(200, page));
    vi.stubGlobal('fetch', fetchMock);

    const api = await import('./api.js');
    await expect(api.fetchTerms({ taxonomy: 'category', perPage: 100 })).resolves.toEqual(page);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/admin/terms?taxonomy=category&perPage=100');
    expectSameOriginApiCalls(fetchMock.mock.calls);
  });

  it('creates, updates and deletes terms on the relative terms endpoint', async () => {
    document.cookie = 'mernpress_csrf=session-token; path=/';
    const term = {
      id: 'term-1',
      taxonomy: 'category',
      name: 'News',
      slug: 'news',
      description: null,
      parentId: null,
      postCount: 0,
      createdAt: '2026-10-28T00:00:00.000Z',
      updatedAt: '2026-10-28T00:00:00.000Z',
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(201, term))
      .mockResolvedValueOnce(
        jsonResponse(200, { ...term, name: 'News updated', slug: 'news-updated' }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { detachedPostCount: 2 }));
    vi.stubGlobal('fetch', fetchMock);

    const api = await import('./api.js');
    await expect(api.createTerm({ taxonomy: 'category', name: 'News' })).resolves.toEqual(term);
    await expect(api.updateTerm('term-1', { name: 'News updated' })).resolves.toMatchObject({
      name: 'News updated',
    });
    await expect(api.deleteTerm('term-1')).resolves.toEqual({ detachedPostCount: 2 });

    const calls = fetchMock.mock.calls;
    expect(calls[0]?.[0]).toBe('/api/admin/terms');
    expect(calls[0]?.[1]?.method).toBe('POST');
    expect(calls[1]?.[0]).toBe('/api/admin/terms/term-1');
    expect(calls[1]?.[1]?.method).toBe('PATCH');
    expect(calls[2]?.[0]).toBe('/api/admin/terms/term-1');
    expect(calls[2]?.[1]?.method).toBe('DELETE');
    for (const [, init] of calls) {
      expect(init?.headers).toMatchObject({ 'x-csrf-token': 'session-token' });
      expect(init?.credentials).toBe('include');
      expect(init?.cache).toBe('no-store');
    }
    expect(JSON.parse(String(calls[0]?.[1]?.body))).toEqual({ taxonomy: 'category', name: 'News' });
    expect(JSON.parse(String(calls[1]?.[1]?.body))).toEqual({ name: 'News updated' });
    expectSameOriginApiCalls(calls);
  });

  it('maps API failures to actionable messages', async () => {
    const api = await import('./api.js');
    expect(api.actionErrorMessage(new api.ApiError(403, 'FORBIDDEN', 'Forbidden'))).toContain(
      'permission',
    );
    expect(
      api.actionErrorMessage(new api.ApiError(409, 'VERSION_CONFLICT', 'Version conflict')),
    ).toContain('changed since you loaded');
    expect(api.actionErrorMessage(new api.ApiError(404, 'NOT_FOUND', 'Not found'))).toContain(
      'no longer exists',
    );
  });
});

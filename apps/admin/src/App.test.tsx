import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function countPage(total = 0): Response {
  return response({
    items: [],
    pagination: { page: 1, perPage: 1, total, totalPages: total > 0 ? total : 0 },
  });
}

function authenticatedFetch(role = 'administrator'): ReturnType<typeof vi.fn<typeof fetch>> {
  // URL-aware so adding a dashboard request cannot shift the mock queue.
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = String(input);
    if (url === '/api/auth/session') {
      return response({
        user: { id: 'u1', username: 'admin', role, status: 'active' },
      }) as Response;
    }
    if (url === '/api/auth/logout') {
      return response(null, 204) as Response;
    }
    if (url === '/api/admin/health') {
      return response({ database: 'ok', mediaWritable: true, schedulerEnabled: true }) as Response;
    }
    return response(countPage(0)) as Response;
  });
  return fetchMock;
}

describe('admin application shell', () => {
  it('shows the login form when there is no session', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValueOnce(response({}, 401)));

    render(<App />);

    expect(await screen.findByLabelText('Username or Email Address')).toBeDefined();
    expect(screen.getByLabelText('Password')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Log In' })).toBeDefined();

    const skipLink = screen.getByRole('link', { name: 'Skip to content' });
    expect(skipLink.getAttribute('href')).toBe('#main-content');
    expect(document.querySelector('#main-content')).not.toBeNull();
  });

  it('shows the signed-in shell, navigation, active route and sign-out', async () => {
    vi.stubGlobal('fetch', authenticatedFetch());

    render(<App />);

    expect(await screen.findByRole('link', { name: 'Dashboard' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Posts' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Pages' })).toBeDefined();
    expect(screen.getByText('Howdy, admin')).toBeDefined();

    expect(screen.getByRole('button', { name: 'Sign out' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.getByText('Dashboard', { selector: '.top-bar-title' })).toBeDefined();
  });

  it('hides content navigation from subscribers and explains the permission boundary', async () => {
    vi.stubGlobal('fetch', authenticatedFetch('subscriber'));

    render(<App />);

    expect(await screen.findByText('No content access')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Posts' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Pages' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Categories' })).toBeNull();
  });

  it('shows the taxonomy links only for editors and administrators', async () => {
    vi.stubGlobal('fetch', authenticatedFetch('editor'));

    render(<App />);

    expect(await screen.findByRole('link', { name: 'Posts' })).toBeDefined();
    expect(await screen.findByRole('link', { name: 'Categories' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Tags' })).toBeDefined();
  });

  it('hides taxonomy links from contributors', async () => {
    vi.stubGlobal('fetch', authenticatedFetch('contributor'));

    render(<App />);

    expect(screen.queryByRole('link', { name: 'Categories' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Tags' })).toBeNull();
  });

  it('shows a retryable session error and the login form', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('offline')));

    render(<App />);

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Could not check your session',
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined();
    expect(screen.getByLabelText('Username or Email Address')).toBeDefined();
  });

  it('signs out through the header action', async () => {
    const fetchMock = authenticatedFetch();
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(await screen.findByLabelText('Username or Email Address')).toBeDefined();
    const logoutCall = fetchMock.mock.calls.find(([url]) => url === '/api/auth/logout');
    expect(logoutCall?.[1]?.method).toBe('POST');
  });

  it('marks the posts route active', async () => {
    window.history.replaceState(null, '', '/posts');
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValueOnce(
      response({ user: { id: 'u1', username: 'admin', role: 'administrator', status: 'active' } }),
    );
    fetchMock.mockResolvedValueOnce(
      response({
        items: [],
        pagination: { page: 1, perPage: 10, total: 0, totalPages: 0 },
      }),
    );
    for (let i = 0; i < 4; i += 1) {
      fetchMock.mockResolvedValueOnce(countPage(0));
    }
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    const posts = await screen.findByRole('link', { name: 'Posts' });
    expect(posts.getAttribute('aria-current')).toBe('page');
    expect(await screen.findByText('No posts yet')).toBeDefined();
  });
});

describe('session expiry', () => {
  it('returns to the login form when a content request returns 401', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValueOnce(
      response({ user: { id: 'u1', username: 'admin', role: 'administrator', status: 'active' } }),
    );
    fetchMock.mockResolvedValueOnce(
      response({ error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' } }, 401),
    );
    for (let i = 0; i < 4; i += 1) {
      fetchMock.mockResolvedValueOnce(countPage(0));
    }
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findByLabelText('Username or Email Address')).toBeDefined();
    expect(screen.getByRole('alert').textContent).toContain('Your session expired');
  });
});

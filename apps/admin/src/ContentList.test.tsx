import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminPost, AuthUser, Paged } from './api.js';
import { ContentList } from './ContentList.js';

beforeEach(() => {
  window.history.replaceState(null, '', '/posts');
  document.cookie = 'mernpress_csrf=test-csrf; path=/';
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.cookie = 'mernpress_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
});

const admin: AuthUser = { id: 'u1', username: 'admin', role: 'administrator', status: 'active' };
const authorA: AuthUser = { id: 'a1', username: 'author-a', role: 'author', status: 'active' };
const authorB: AuthUser = { id: 'a2', username: 'author-b', role: 'author', status: 'active' };

function makePost(overrides: Partial<AdminPost> = {}): AdminPost {
  return {
    id: 'post-1',
    type: 'post',
    status: 'DRAFT',
    title: 'First post',
    slug: 'first-post',
    excerpt: 'An excerpt',
    content: '',
    contentFormat: 'wp_block_html',
    contentVersion: 1,
    authorId: 'a1',
    seoTitle: null,
    seoDescription: null,
    canonicalUrl: null,
    robots: null,
    ogTitle: null,
    ogDescription: null,
    publishedAt: null,
    trashedAt: null,
    previousStatus: null,
    version: 1,
    createdAt: '2026-10-27T10:00:00.000Z',
    updatedAt: '2026-10-27T11:00:00.000Z',
    terms: { categories: [], tags: [] },
    ...overrides,
  };
}

function paged(items: AdminPost[], total = items.length): Paged<AdminPost> {
  return {
    items,
    pagination: { page: 1, perPage: 10, total, totalPages: total > 0 ? Math.ceil(total / 10) : 0 },
  };
}

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('content lists', () => {
  it('renders rows, status badges, timestamps and pagination from the API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input);
        if (/perPage=1(&|$)/.test(url)) return response(paged([], 0));
        return response(paged([makePost()], 11));
      }),
    );

    render(<ContentList user={admin} type="post" />);

    expect(await screen.findByRole('link', { name: 'First post' })).toBeDefined();
    expect(screen.getByText('Draft')).toBeDefined();
    expect(screen.getByText('first-post')).toBeDefined();
    expect(screen.getByText('Page 1 of 2 · 11 total')).toBeDefined();
    expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('shows role-aware view/edit and lifecycle controls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input);
        if (/perPage=1(&|$)/.test(url)) return response(paged([], 0));
        return response(
          paged([
            makePost({ id: 'draft-a', title: 'A draft', authorId: 'a1', status: 'DRAFT' }),
            makePost({
              id: 'published-a',
              title: 'A published',
              authorId: 'a1',
              status: 'PUBLISHED',
              publishedAt: '2026-10-27T11:00:00.000Z',
            }),
          ]),
        );
      }),
    );

    render(<ContentList user={authorB} type="post" />);

    expect(await screen.findByRole('link', { name: 'A draft' })).toBeDefined();
    expect(screen.getAllByText('View')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Trash' })).toBeNull();
  });

  it('publishes a draft and refreshes the list', async () => {
    let listCalls = 0;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, _init) => {
      const url = String(input);
      if (url.includes('/publish')) {
        return response(makePost({ authorId: 'a1', status: 'PUBLISHED', version: 2 }));
      }
      if (/perPage=1(&|$)/.test(url)) return response(paged([], 0));
      listCalls += 1;
      if (listCalls <= 1) return response(paged([makePost({ authorId: 'a1' })]));
      return response(paged([makePost({ authorId: 'a1', status: 'PUBLISHED', version: 2 })]));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ContentList user={authorA} type="post" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Publish' }));

    expect(await screen.findByText('Content published.')).toBeDefined();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(11));
    const publishCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/publish'));
    expect(publishCall?.[0]).toBe('/api/admin/posts/post-1/publish');
    expect(JSON.parse(String(publishCall?.[1]?.body))).toEqual({ baseVersion: 1 });
  });

  it('shows an empty state and a create action', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async () => response(paged([], 0))),
    );

    render(<ContentList user={admin} type="page" />);

    expect(await screen.findByText('No pages yet')).toBeDefined();
    expect(screen.getAllByRole('link', { name: 'New page' }).length).toBeGreaterThan(0);
  });

  it('shows an error with retry', async () => {
    let listCalls = 0;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (/perPage=1(&|$)/.test(url)) return response(paged([], 0));
      listCalls += 1;
      if (listCalls === 1) {
        return response({ error: { code: 'INTERNAL_ERROR', message: 'Boom' } }, 500);
      }
      return response(paged([makePost()]));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ContentList user={admin} type="post" />);

    expect(await screen.findByText('Could not load posts')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'First post' })).toBeDefined();
  });

  it('applies a search query and status filter', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response(paged([], 0)));
    vi.stubGlobal('fetch', fetchMock);

    render(<ContentList user={admin} type="post" />);
    await screen.findByText('No posts yet');

    fireEvent.change(screen.getByLabelText('Search posts'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(10));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('search=hello'))).toBe(true);

    fireEvent.click(screen.getByRole('tab', { name: /Trashed/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(11));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('status=TRASHED'))).toBe(true);
  });

  it('shows real tab counts from server totals', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('status=DRAFT')) return response(paged([], 3));
        if (url.includes('status=PUBLISHED')) return response(paged([], 5));
        if (url.includes('status=TRASHED')) return response(paged([], 1));
        if (/perPage=1(&|$)/.test(url)) return response(paged([], 9));
        return response(paged([], 0));
      }),
    );

    render(<ContentList user={admin} type="post" />);

    expect(await screen.findByRole('tab', { name: /All \(9\)/ })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Drafts \(3\)/ })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Published \(5\)/ })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Trashed \(1\)/ })).toBeDefined();
  });

  it('sanitizes invalid URL parameters on load', async () => {
    window.history.replaceState(null, '', '/posts?status=NOPE&search=   &page=abc');
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async () => response(paged([], 0))),
    );

    render(<ContentList user={admin} type="post" />);

    await screen.findByText('No posts yet');
    expect(screen.getByRole('tab', { name: /All/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('reproduces the view on Back and Forward', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async () => response(paged([], 0))),
    );

    render(<ContentList user={admin} type="post" />);
    await screen.findByText('No posts yet');

    // navigate to a filtered URL
    window.history.pushState(null, '', '/posts?status=TRASHED&page=2');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /Trashed/ }).getAttribute('aria-selected')).toBe(
        'true',
      ),
    );

    window.history.back();
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('tab click resets to page 1 and updates the URL', async () => {
    window.history.replaceState(null, '', '/posts?page=3');
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async () => response(paged([], 0))),
    );

    render(<ContentList user={admin} type="post" />);
    await screen.findByText('No posts yet');

    fireEvent.click(screen.getByRole('tab', { name: /Drafts/ }));
    await waitFor(() => expect(window.location.search).toContain('status=DRAFT'));
    expect(window.location.search).not.toContain('page=');
  });
});

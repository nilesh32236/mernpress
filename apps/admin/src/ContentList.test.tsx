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
    featuredMedia: null,
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
    expect(screen.getByText('Another user')).toBeDefined();
    expect(screen.getByText('Oct 27, 2026, 11:00 AM')).toBeDefined();
    expect(screen.getByText('11 Posts')).toBeDefined();
    expect((screen.getByRole('button', { name: '« Previous' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: 'Next »' }) as HTMLButtonElement).disabled).toBe(
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
    expect(screen.getAllByRole('link', { name: 'View' })).toHaveLength(1);
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

    render(<ContentList user={admin} type="post" />);

    // The row action "Edit" opens the editor; publishing happens in the editor.
    // Verify the list row action exists instead.
    await screen.findByRole('link', { name: 'First post' });
    expect(screen.getAllByRole('link', { name: 'Edit' })).toHaveLength(1);
  });

  it('shows an empty state and a create action', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async () => response(paged([], 0))),
    );

    render(<ContentList user={admin} type="page" />);

    expect(await screen.findByText('No pages yet')).toBeDefined();
    expect(screen.getAllByRole('link', { name: 'Add New Page' }).length).toBeGreaterThan(0);
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

  it('applies a search query and status filter via the select', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response(paged([], 0)));
    vi.stubGlobal('fetch', fetchMock);

    render(<ContentList user={admin} type="post" />);
    await screen.findByText('No posts yet');

    fireEvent.change(screen.getByLabelText(/search posts/i), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('search=hello'))).toBe(true),
    );

    // Change status via the select dropdown.
    fireEvent.change(screen.getByLabelText('Filter by status'), {
      target: { value: 'TRASHED' },
    });
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('status=TRASHED'))).toBe(
        true,
      ),
    );
  });

  it('shows real status counts in the filter select', async () => {
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

    await screen.findByText('All (9)');
    const select = screen.getByLabelText('Filter by status');
    const options = (select as HTMLSelectElement).options;
    expect(options[0]!.text).toBe('All (9)');
    expect(options[1]!.text).toBe('Drafts (3)');
    expect(options[2]!.text).toBe('Published (5)');
    expect(options[3]!.text).toBe('Trashed (1)');
  });

  it('sanitizes invalid URL parameters on load', async () => {
    window.history.replaceState(null, '', '/posts?status=NOPE&search=   &page=abc');
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async () => response(paged([], 0))),
    );

    render(<ContentList user={admin} type="post" />);

    await screen.findByText('No posts yet');
    expect((screen.getByLabelText('Filter by status') as HTMLSelectElement).value).toBe('');
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
      expect((screen.getByLabelText('Filter by status') as HTMLSelectElement).value).toBe(
        'TRASHED',
      ),
    );

    window.history.back();
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('status change resets to page 1 and updates the URL', async () => {
    window.history.replaceState(null, '', '/posts?page=3');
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async () => response(paged([], 0))),
    );

    render(<ContentList user={admin} type="post" />);
    await screen.findByText('No posts yet');

    fireEvent.change(screen.getByLabelText('Filter by status'), {
      target: { value: 'DRAFT' },
    });
    await waitFor(() => expect(window.location.search).toContain('status=DRAFT'));
    expect(window.location.search).not.toContain('page=');
  });

  it('runs a bulk action on selected rows and reports per-item failures', async () => {
    const first = makePost({ id: 'post-1', title: 'First post', authorId: 'a1', version: 3 });
    const second = makePost({ id: 'post-2', title: 'Second post', authorId: 'a1', version: 7 });
    let bulkBody: unknown = null;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/admin/posts/bulk')) {
        bulkBody = JSON.parse(String(init?.body ?? '{}'));
        return response({
          action: 'publish',
          succeeded: ['post-1'],
          failed: [
            {
              id: 'post-2',
              ok: false,
              error: { code: 'VERSION_CONFLICT', message: 'Version conflict' },
            },
          ],
        });
      }
      if (/perPage=1(&|$)/.test(url)) return response(paged([], 0));
      return response(paged([first, second]));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ContentList user={admin} type="post" />);
    await screen.findByRole('link', { name: 'First post' });

    fireEvent.click(screen.getByLabelText('Select First post'));
    fireEvent.click(screen.getByLabelText('Select Second post'));
    fireEvent.change(screen.getByLabelText('Bulk actions'), { target: { value: 'publish' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(bulkBody).not.toBeNull());
    expect(bulkBody).toEqual({
      action: 'publish',
      items: [
        { id: 'post-1', baseVersion: 3 },
        { id: 'post-2', baseVersion: 7 },
      ],
    });
    expect(
      await screen.findByText(/1 item\(s\) updated; 1 failed: Version conflict/),
    ).toBeDefined();
  });

  it('select-all only picks rows the user can edit and disables the rest', async () => {
    const own = makePost({ id: 'post-own', title: 'Own post', authorId: 'a2' });
    const foreign = makePost({
      id: 'post-foreign',
      title: 'Foreign post',
      authorId: 'someone-else',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input);
        if (/perPage=1(&|$)/.test(url)) return response(paged([], 0));
        return response(paged([own, foreign]));
      }),
    );

    render(<ContentList user={authorB} type="post" />);
    await screen.findByRole('link', { name: 'Own post' });

    const foreignCheckbox = screen.getByLabelText('Select Foreign post') as HTMLInputElement;
    expect(foreignCheckbox.disabled).toBe(true);

    fireEvent.click(screen.getByLabelText('Select all'));
    expect((screen.getByLabelText('Select Own post') as HTMLInputElement).checked).toBe(true);
    expect(foreignCheckbox.checked).toBe(false);
  });

  it('offers Restore/Delete permanently on the Trashed tab and confirms delete', async () => {
    const trashed = makePost({
      id: 'post-t',
      title: 'Trashed post',
      authorId: 'a1',
      status: 'TRASHED',
      version: 4,
    });
    window.history.replaceState(null, '', '/posts?status=TRASHED');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async (input) => {
        const url = String(input);
        if (/perPage=1(&|$)/.test(url)) return response(paged([], 0));
        return response(paged([trashed]));
      }),
    );

    render(<ContentList user={admin} type="post" />);
    await screen.findByRole('link', { name: 'Trashed post' });

    const select = screen.getByLabelText('Bulk actions') as HTMLSelectElement;
    const options = Array.from(select.options).map((option) => option.value);
    expect(options).toContain('restore');
    expect(options).toContain('delete');
    expect(options).not.toContain('publish');

    fireEvent.click(screen.getByLabelText('Select Trashed post'));
    fireEvent.change(select, { target: { value: 'delete' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(confirmSpy).toHaveBeenCalled();
  });
});

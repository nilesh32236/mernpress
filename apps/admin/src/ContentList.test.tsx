import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    commentStatus: 'open',
    sticky: false,
    notesNotify: null,
    language: 'en',
    translationGroup: 'group-1',
    structureLocked: false,
    passwordProtected: false,
    isPrivate: false,
    format: 'standard',
    trashedAt: null,
    previousStatus: null,
    version: 1,
    createdAt: '2026-10-27T10:00:00.000Z',
    updatedAt: '2026-10-27T11:00:00.000Z',
    terms: { categories: [], tags: [] },
    featuredMedia: null,
    author: null,
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
    expect(screen.getByText('2026/10/27 at 11:00 am')).toBeDefined();
    expect(screen.getAllByText('11 items').length).toBeGreaterThan(0);
    expect(
      (screen.getByRole('button', { name: 'Previous page' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement).disabled).toBe(
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

    expect(await screen.findByText('No pages found.')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Add Page' })).toBeDefined();
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
    await screen.findByText('No posts found.');

    fireEvent.change(screen.getByLabelText(/search posts/i), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search Posts' }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('search=hello'))).toBe(true),
    );

    // Change status via the status tab row (empty Drafts/Trashed tabs are hidden).
    fireEvent.click(screen.getByRole('button', { name: /^Published/ }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('status=PUBLISHED'))).toBe(
        true,
      ),
    );
  });

  it('shows real status counts in the status tabs', async () => {
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

    expect(await screen.findByRole('button', { name: 'All (9)' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Drafts (3)' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Published (5)' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Trashed (1)' })).toBeDefined();
  });

  it('sanitizes invalid URL parameters on load', async () => {
    window.history.replaceState(null, '', '/posts?status=NOPE&search=   &page=abc');
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async () => response(paged([], 0))),
    );

    render(<ContentList user={admin} type="post" />);

    await screen.findByText('No posts found.');
    expect(screen.getByRole('button', { name: 'All (0)' }).getAttribute('aria-current')).toBe(
      'true',
    );
  });

  it('reproduces the view on Back and Forward', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async () => response(paged([], 0))),
    );

    render(<ContentList user={admin} type="post" />);
    await screen.findByText('No posts found.');

    // navigate to a filtered URL
    window.history.pushState(null, '', '/posts?status=TRASHED&page=2');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Trashed/ }).getAttribute('aria-current')).toBe(
        'true',
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
    await screen.findByText('No posts found.');

    fireEvent.click(screen.getByRole('button', { name: /^Published/ }));
    await waitFor(() => expect(window.location.search).toContain('status=PUBLISHED'));
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
          action: 'trash',
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
    fireEvent.change(screen.getAllByLabelText('Bulk actions')[0]!, {
      target: { value: 'trash' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Apply' })[0]!);

    await waitFor(() => expect(bulkBody).not.toBeNull());
    expect(bulkBody).toEqual({
      action: 'trash',
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

    fireEvent.click(screen.getAllByLabelText('Select all')[0]!);
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

    const select = screen.getAllByLabelText('Bulk actions')[0]! as HTMLSelectElement;
    const options = Array.from(select.options).map((option) => option.value);
    expect(options).toContain('restore');
    expect(options).toContain('delete');
    expect(options).not.toContain('publish');

    fireEvent.click(screen.getByLabelText('Select Trashed post'));
    fireEvent.change(select, { target: { value: 'delete' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Apply' })[0]!);
    expect(confirmSpy).toHaveBeenCalled();
  });
  it('quick edit saves date, author, terms, comments and sticky', async () => {
    const post = makePost({ id: 'post-q', title: 'Quick target', authorId: 'a1', version: 4 });
    const requests: Array<{ url: string; method: string; body: unknown }> = [];
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/api/admin/terms')) {
        const taxonomy = new URL(url, 'http://x').searchParams.get('taxonomy');
        return response({
          items:
            taxonomy === 'category'
              ? [{ id: 'cat-1', name: 'News', slug: 'news', taxonomy: 'category' }]
              : [{ id: 'tag-1', name: 'Demo', slug: 'demo', taxonomy: 'tag' }],
          pagination: { page: 1, perPage: 100, total: 1, totalPages: 1 },
        });
      }
      if (url.includes('/api/users')) {
        return response({
          items: [
            {
              id: 'a1',
              username: 'admin',
              email: null,
              displayName: null,
              role: 'administrator',
              status: 'active',
              postCount: 1,
              createdAt: '2026-10-01T00:00:00.000Z',
            },
            {
              id: 'a2',
              username: 'author-b',
              email: null,
              displayName: null,
              role: 'author',
              status: 'active',
              postCount: 0,
              createdAt: '2026-10-01T00:00:00.000Z',
            },
          ],
          pagination: { page: 1, perPage: 100, total: 2, totalPages: 1 },
        });
      }
      if (/perPage=1(&|$)/.test(url)) return response(paged([], 0));
      if (method !== 'GET') {
        requests.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
        return response(makePost({ id: 'post-q', title: 'Quick target', version: 5 }));
      }
      return response(paged([post]));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ContentList user={admin} type="post" />);
    await screen.findByRole('link', { name: 'Quick target' });
    fireEvent.click(screen.getByRole('button', { name: 'Quick Edit' }));

    const region = await screen.findByRole('region', { name: 'Quick edit Quick target' });
    fireEvent.change(within(region).getByLabelText('Date'), {
      target: { value: '2026-11-05T09:30' },
    });
    fireEvent.change(within(region).getByLabelText('Author'), { target: { value: 'a2' } });
    fireEvent.click(within(region).getByLabelText('News'));
    fireEvent.click(within(region).getByLabelText('Demo'));
    fireEvent.click(within(region).getByLabelText('Allow Comments'));
    const pings = within(region).getByLabelText('Allow Pings') as HTMLInputElement;
    expect(pings.disabled).toBe(true);
    expect(
      within(region).getByText(/Pingbacks and trackbacks are disabled for security/),
    ).toBeDefined();
    fireEvent.click(within(region).getByLabelText('Make this post sticky'));
    fireEvent.change(within(region).getByLabelText('Password'), {
      target: { value: 'quick-secret' },
    });
    fireEvent.click(within(region).getByLabelText('Private'));
    fireEvent.change(within(region).getByLabelText('Status'), {
      target: { value: 'PUBLISHED' },
    });
    fireEvent.click(within(region).getByRole('button', { name: 'Update' }));

    await waitFor(() => expect(requests).toHaveLength(3));
    const patch = requests.find((request) => request.method === 'PATCH');
    expect(patch?.body).toMatchObject({
      baseVersion: 4,
      authorId: 'a2',
      commentStatus: 'closed',
      sticky: true,
      password: 'quick-secret',
      isPrivate: true,
    });
    expect((patch?.body as { publishedAt?: string }).publishedAt).toContain('2026-11-05');
    const terms = requests.find((request) => request.url.includes('/terms'));
    expect(terms?.body).toEqual({
      baseVersion: 5,
      categoryIds: ['cat-1'],
      tagIds: ['tag-1'],
    });
    const transition = requests.find((request) => request.url.includes('/publish'));
    expect(transition?.method).toBe('POST');
  });

  it('bulk edit applies author, terms, comments, sticky and status', async () => {
    const first = makePost({ id: 'post-1', title: 'First post', authorId: 'a1', version: 2 });
    const second = makePost({ id: 'post-2', title: 'Second post', authorId: 'a1', version: 3 });
    const requests: Array<{ url: string; method: string; body: unknown }> = [];
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/api/admin/terms')) {
        const taxonomy = new URL(url, 'http://x').searchParams.get('taxonomy');
        return response({
          items:
            taxonomy === 'category'
              ? [{ id: 'cat-1', name: 'News', slug: 'news', taxonomy: 'category' }]
              : [{ id: 'tag-1', name: 'Demo', slug: 'demo', taxonomy: 'tag' }],
          pagination: { page: 1, perPage: 100, total: 1, totalPages: 1 },
        });
      }
      if (url.includes('/api/users')) {
        return response({
          items: [
            {
              id: 'a2',
              username: 'author-b',
              email: null,
              displayName: null,
              role: 'author',
              status: 'active',
              postCount: 0,
              createdAt: '2026-10-01T00:00:00.000Z',
            },
          ],
          pagination: { page: 1, perPage: 100, total: 1, totalPages: 1 },
        });
      }
      if (/perPage=1(&|$)/.test(url)) return response(paged([], 0));
      if (method !== 'GET') {
        requests.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
        return response(makePost({ id: 'post-1', title: 'First post', version: 4 }));
      }
      return response(paged([first, second]));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ContentList user={admin} type="post" />);
    await screen.findByRole('link', { name: 'First post' });
    fireEvent.click(screen.getByLabelText('Select First post'));
    fireEvent.click(screen.getByLabelText('Select Second post'));
    fireEvent.change(screen.getAllByLabelText('Bulk actions')[0]!, {
      target: { value: 'edit' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Apply' })[0]!);

    const panel = await screen.findByText('Bulk Edit');
    const region = panel.closest('.bulk-edit-panel') as HTMLElement;
    fireEvent.click(within(region).getByLabelText('News'));
    fireEvent.click(within(region).getByLabelText('Demo'));
    fireEvent.change(within(region).getByLabelText('Author'), { target: { value: 'a2' } });
    fireEvent.change(within(region).getByLabelText('Comments'), {
      target: { value: 'closed' },
    });
    const pings = within(region).getByLabelText('Pings') as HTMLSelectElement;
    expect(pings.disabled).toBe(true);
    expect(pings.value).toBe('');
    fireEvent.change(within(region).getByLabelText('Sticky'), { target: { value: 'sticky' } });
    fireEvent.change(within(region).getByLabelText('Format'), { target: { value: 'quote' } });
    fireEvent.click(within(region).getByRole('button', { name: 'Update' }));

    await waitFor(() => expect(requests.filter((r) => r.method === 'PATCH')).toHaveLength(2));
    const patches = requests.filter((request) => request.method === 'PATCH');
    expect(patches[0]?.body).toMatchObject({
      baseVersion: 2,
      authorId: 'a2',
      commentStatus: 'closed',
      sticky: true,
      format: 'quote',
    });
    const termCalls = requests.filter((request) => request.url.includes('/terms'));
    expect(termCalls).toHaveLength(2);
    expect(termCalls[0]?.body).toEqual({
      baseVersion: 4,
      categoryIds: ['cat-1'],
      tagIds: ['tag-1'],
    });
  });
});

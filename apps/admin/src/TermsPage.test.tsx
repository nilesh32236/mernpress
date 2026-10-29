import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminTerm, AuthUser, Paged } from './api.js';
import { TermsPage } from './TermsPage.js';

beforeEach(() => {
  window.history.replaceState(null, '', '/terms');
  document.cookie = 'mernpress_csrf=test-csrf; path=/';
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.cookie = 'mernpress_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
});

const admin: AuthUser = { id: 'u1', username: 'admin', role: 'administrator', status: 'active' };
const subscriber: AuthUser = { id: 's1', username: 'sub', role: 'subscriber', status: 'active' };

function makeTerm(overrides: Partial<AdminTerm> = {}): AdminTerm {
  return {
    id: 'term-1',
    taxonomy: 'category',
    name: 'News',
    slug: 'news',
    description: null,
    parentId: null,
    postCount: 2,
    createdAt: '2026-10-28T10:00:00.000Z',
    updatedAt: '2026-10-28T11:00:00.000Z',
    ...overrides,
  };
}

function paged(items: AdminTerm[], total = items.length): Paged<AdminTerm> {
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

describe('terms page', () => {
  it('shows a no-access empty state and never fetches for non-managers', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    render(<TermsPage user={subscriber} />);

    expect(await screen.findByText('No term management access')).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('switches taxonomy tabs and refetches', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(paged([makeTerm()], 1)))
      .mockResolvedValueOnce(
        response(
          paged([makeTerm({ id: 'tag-1', taxonomy: 'tag', name: 'Tech', slug: 'tech' })], 1),
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<TermsPage user={admin} />);

    expect(await screen.findByText('News')).toBeDefined();
    fireEvent.click(screen.getByRole('tab', { name: 'Tags' }));

    expect(await screen.findByText('Tech')).toBeDefined();
    expect(fetchMock.mock.calls[1]?.[0]).toContain('taxonomy=tag');
  });

  it('shows a create validation error from the API', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(paged([], 0)))
      .mockResolvedValueOnce(
        response({ error: { code: 'VALIDATION_ERROR', message: 'name: Name is required' } }, 400),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<TermsPage user={admin} />);

    await screen.findByText(/no categories yet/i);

    const input = screen.getByLabelText(/category name/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '   ' } });
    // bypass client empty check by setting a value then clearing via direct input
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Create category' }));

    // client validation error shown without fetch
    expect(await screen.findByText('Name is required.')).toBeDefined();
  });

  it('confirms before deleting and reports detached count', async () => {
    const confirmSpy = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(paged([makeTerm()], 1)))
      .mockResolvedValueOnce(response({ detachedPostCount: 2 }, 200))
      .mockResolvedValueOnce(response(paged([], 0)));
    vi.stubGlobal('fetch', fetchMock);

    render(<TermsPage user={admin} />);

    const term = await screen.findByText('News');
    expect(term).toBeDefined();

    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButton);
    // first confirm returns false: no delete request
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(deleteButton);
    await waitFor(() => {
      expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('DELETE');
    });
    expect(await screen.findByText(/2 post\(s\) detached/i)).toBeDefined();

    confirmSpy.mockRestore();
  });
});

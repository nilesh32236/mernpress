import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminPost, AuthUser, Paged } from './api.js';
import { Dashboard } from './Dashboard.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const admin: AuthUser = { id: 'u1', username: 'admin', role: 'administrator', status: 'active' };
const subscriber: AuthUser = {
  id: 'u2',
  username: 'sub',
  role: 'subscriber',
  status: 'active',
};

function page(total: number): Paged<AdminPost> {
  return {
    items: [],
    pagination: { page: 1, perPage: 1, total, totalPages: total > 0 ? total : 0 },
  };
}

describe('dashboard', () => {
  it('renders real counts from six status/type queries', async () => {
    const totals = [3, 5, 1, 2, 0, 4];
    const fetchMock = vi.fn<typeof fetch>();
    for (const total of totals) {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => page(total),
      } as Response);
    }
    vi.stubGlobal('fetch', fetchMock);

    render(<Dashboard user={admin} />);

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeDefined();
    // At a Glance shows published totals, like WordPress ("N Published posts").
    expect(await screen.findByRole('link', { name: /3\s*Published posts/ })).toBeDefined();
    expect(await screen.findByRole('link', { name: /2\s*Published pages/ })).toBeDefined();
    // Six count queries + one site-health check (dashboard card).
    expect(fetchMock).toHaveBeenCalledTimes(7);
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes('type=post') && url.includes('status=DRAFT'))).toBe(
      true,
    );
    expect(urls.some((url) => url.includes('type=page') && url.includes('status=TRASHED'))).toBe(
      true,
    );
    // Five count queries plus one 5-item published query that feeds the
    // Activity card (newest published posts).
    expect(urls.filter((url) => url.includes('perPage=1'))).toHaveLength(5);
    expect(
      urls.some(
        (url) =>
          url.includes('type=post') &&
          url.includes('status=PUBLISHED') &&
          url.includes('perPage=5') &&
          url.includes('sort=publishedAt'),
      ),
    ).toBe(true);
  });

  it('shows a retryable error instead of false zeros', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);

    render(<Dashboard user={admin} />);

    expect(await screen.findByText('Counts unavailable')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('does not query content for a subscriber and shows no-content access', () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    render(<Dashboard user={subscriber} />);

    expect(screen.getByText('No content access')).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

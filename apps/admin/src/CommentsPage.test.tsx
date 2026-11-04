import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommentsPage } from './CommentsPage.js';
import type { AuthUser } from './api.js';

const admin: AuthUser = { id: 'u1', username: 'admin', role: 'administrator', status: 'active' };

function response(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data } as Response;
}

const comment = {
  id: 'c1',
  postId: 'p1',
  postTitle: 'Hello',
  postSlug: 'hello',
  userId: null,
  parentId: null,
  authorName: 'Reader',
  authorEmail: 'reader@example.com',
  authorUrl: null,
  content: 'A pending comment.',
  status: 'PENDING',
  createdAt: '2026-11-04T09:00:00.000Z',
  updatedAt: '2026-11-04T09:00:00.000Z',
};

beforeEach(() => {
  document.cookie = 'mernpress_csrf=test-token';
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('comments screen', () => {
  it('renders the comment list and approves a pending comment', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/status') && init?.method === 'PATCH') {
        return response({ ...comment, status: 'APPROVED' });
      }
      return response({
        items: [comment],
        total: 1,
        totalPages: 1,
        counts: { all: 1, pending: 1, approved: 0, spam: 0, trashed: 0, mine: 0 },
      });
    });

    render(<CommentsPage user={admin} />);

    expect(await screen.findByText('Reader')).toBeDefined();
    expect(screen.getByText('A pending comment.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/comments/c1/status'),
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
    expect(await screen.findByText('Comment approved.')).toBeDefined();
  });
});

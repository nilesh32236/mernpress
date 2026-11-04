import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PersonalDataPage } from './PersonalDataPage.js';

function response(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data } as Response;
}

const request = {
  id: 'r1',
  type: 'EXPORT',
  email: 'reader@example.com',
  userId: 'u2',
  status: 'PENDING',
  requestedBy: 'u1',
  note: null,
  createdAt: '2026-11-04T09:00:00.000Z',
  completedAt: null,
};

beforeEach(() => {
  document.cookie = 'mernpress_csrf=test-token';
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  document.cookie = 'mernpress_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('personal data screens', () => {
  it('lists existing requests with status and next steps', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ items: [request] }));
    render(<PersonalDataPage type="EXPORT" />);
    expect(await screen.findByText('reader@example.com')).toBeDefined();
    expect(screen.getByText('Pending')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Download personal data' })).toBeDefined();
    expect(screen.getByText(/Export personal data list — All \(1\) · 1 pending/)).toBeDefined();
  });

  it('creates a new erasure request for an account', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (_input, init) => {
      if (init?.method === 'POST') return response({ ...request, type: 'ERASE' }, 201);
      return response({ items: [] });
    });

    render(<PersonalDataPage type="ERASE" />);
    await screen.findByText('No items found.');
    fireEvent.change(screen.getByLabelText('Username or email address'), {
      target: { value: 'reader@example.com' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Add erase request' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/data-requests',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(await screen.findByText('Data erasure request created.')).toBeDefined();
  });
});

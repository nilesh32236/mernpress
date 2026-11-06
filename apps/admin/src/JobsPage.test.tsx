import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JobsPage } from './JobsPage.js';

function response(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data } as Response;
}

const job = {
  id: 'j1',
  type: 'analytics.retention',
  payload: {},
  status: 'PENDING' as const,
  priority: 0,
  attempts: 1,
  maxAttempts: 3,
  scheduledAt: '2026-11-06T15:00:00.000Z',
  lockedAt: null,
  lockedBy: null,
  startedAt: null,
  completedAt: null,
  lastError: 'temporary failure',
  createdAt: '2026-11-06T14:00:00.000Z',
  updatedAt: '2026-11-06T14:30:00.000Z',
};

const list = {
  items: [job],
  pagination: { page: 1, perPage: 20, total: 1, totalPages: 1 },
};

beforeEach(() => {
  document.cookie = 'mernpress_csrf=test-csrf; path=/';
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  cleanup();
});

describe('scheduled actions page', () => {
  it('lists jobs and runs one now', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(list)).mockResolvedValueOnce(response(job));
    render(<JobsPage />);

    expect(await screen.findByText('analytics.retention')).toBeDefined();
    expect(screen.getByText('pending')).toBeDefined();
    expect(screen.getByText('1/3')).toBeDefined();
    expect(screen.getByText('temporary failure')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Run now: analytics.retention' }));
    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/api/admin/jobs/j1/run',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(await screen.findByText(/Job rescheduled/)).toBeDefined();
  });

  it('cancels a pending job and filters by status', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(list))
      .mockResolvedValueOnce(response({ ...job, status: 'CANCELLED' }));
    render(<JobsPage />);
    await screen.findByText('analytics.retention');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel: analytics.retention' }));
    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/api/admin/jobs/j1/cancel',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(await screen.findByText('Job cancelled.')).toBeDefined();

    fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'FAILED' } });
    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenLastCalledWith(
        expect.stringContaining('status=FAILED'),
        expect.anything(),
      ),
    );
  });

  it('shows an empty state', async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({ items: [], pagination: { page: 1, perPage: 20, total: 0, totalPages: 0 } }),
    );
    render(<JobsPage />);
    expect(await screen.findByText('No scheduled actions match this filter.')).toBeDefined();
  });
});

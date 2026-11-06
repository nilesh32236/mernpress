import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackupsPage } from './BackupsPage.js';

function response(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data } as Response;
}

const list = {
  backups: [
    {
      fileName: 'mernpress-backup-20261105T090000Z.tar.gz',
      sizeBytes: 2048,
      createdAt: '2026-11-05T09:00:00.000Z',
    },
  ],
  retention: 5,
};

const emptyJobs = {
  items: [],
  pagination: { page: 1, perPage: 5, total: 0, totalPages: 0 },
};

const pendingJob = {
  id: 'job-1',
  type: 'backup.create',
  payload: {},
  status: 'PENDING' as const,
  priority: 0,
  attempts: 0,
  maxAttempts: 2,
  scheduledAt: '2026-11-06T17:00:00.000Z',
  lockedAt: null,
  lockedBy: null,
  startedAt: null,
  completedAt: null,
  lastError: null,
  createdAt: '2026-11-06T17:00:00.000Z',
  updatedAt: '2026-11-06T17:00:00.000Z',
};

const completedJob = {
  ...pendingJob,
  status: 'COMPLETED' as const,
  attempts: 1,
  startedAt: '2026-11-06T17:00:02.000Z',
  completedAt: '2026-11-06T17:00:03.000Z',
  updatedAt: '2026-11-06T17:00:03.000Z',
};

function urlOf(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
}

beforeEach(() => {
  document.cookie = 'mernpress_csrf=test-csrf; path=/';
  vi.stubGlobal('fetch', vi.fn());
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  cleanup();
});

describe('backups page', () => {
  it('lists backups with size, download and delete actions', async () => {
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.includes('/api/admin/jobs')) return response(emptyJobs);
      if (init?.method === 'DELETE') return response({ backups: [], retention: 5 });
      return response(list);
    });
    render(<BackupsPage />);

    expect(await screen.findByText('mernpress-backup-20261105T090000Z.tar.gz')).toBeDefined();
    expect(screen.getByText('2 KB')).toBeDefined();
    expect(screen.getByText(/newest 5 backups/)).toBeDefined();
    const download = screen.getByRole('link', { name: 'Download' });
    expect(download.getAttribute('href')).toBe(
      '/api/admin/backups/mernpress-backup-20261105T090000Z.tar.gz/download',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/backups/mernpress-backup-'),
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
    expect(await screen.findByText('No backups yet.')).toBeDefined();
  });

  it('queues a backup, shows the pending job and polls to completion', async () => {
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = urlOf(input);
      if (url.includes('/api/admin/jobs/job-1')) return response(completedJob);
      if (url.includes('/api/admin/jobs')) return response(emptyJobs);
      if (init?.method === 'POST') {
        return response({ ...list, job: pendingJob }, 202);
      }
      return response(list);
    });
    render(<BackupsPage />);
    await screen.findByText('mernpress-backup-20261105T090000Z.tar.gz');

    fireEvent.click(screen.getByRole('button', { name: 'Create backup' }));

    expect(
      await screen.findByText('Backup queued. The background worker will create it shortly.'),
    ).toBeDefined();
    expect(screen.getByText('pending')).toBeDefined();
    expect(
      (screen.getByRole('button', { name: 'Backup queued…' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByRole('button', { name: 'View in Scheduled Actions' })).toBeDefined();

    expect(
      await screen.findByText(
        'Backup created: mernpress-backup-20261105T090000Z.tar.gz.',
        undefined,
        {
          timeout: 4500,
        },
      ),
    ).toBeDefined();
    expect(screen.getByText('completed')).toBeDefined();
  });

  it('shows an active backup job found on load', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.includes('/api/admin/jobs')) {
        return response({
          items: [{ ...pendingJob, status: 'RUNNING', attempts: 1 }],
          pagination: { page: 1, perPage: 5, total: 1, totalPages: 1 },
        });
      }
      return response({ backups: [], retention: 5 });
    });
    render(<BackupsPage />);

    expect(await screen.findByText('running')).toBeDefined();
    expect(
      (screen.getByRole('button', { name: 'Backup running…' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

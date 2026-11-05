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
    vi.mocked(fetch).mockResolvedValue(response(list));
    render(<BackupsPage />);

    expect(await screen.findByText('mernpress-backup-20261105T090000Z.tar.gz')).toBeDefined();
    expect(screen.getByText('2 KB')).toBeDefined();
    expect(screen.getByText(/newest 5 backups/)).toBeDefined();
    const download = screen.getByRole('link', { name: 'Download' });
    expect(download.getAttribute('href')).toBe(
      '/api/admin/backups/mernpress-backup-20261105T090000Z.tar.gz/download',
    );

    vi.mocked(fetch).mockResolvedValue(response({ backups: [], retention: 5 }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/backups/mernpress-backup-'),
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
    expect(await screen.findByText('No backups yet.')).toBeDefined();
  });

  it('creates a backup and reports the file name', async () => {
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      if (init?.method === 'POST') return response(list);
      return response({ backups: [], retention: 5 });
    });
    render(<BackupsPage />);
    await screen.findByText('No backups yet.');
    fireEvent.click(screen.getByRole('button', { name: 'Create backup' }));

    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/api/admin/backups',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(
      await screen.findByText('Backup created: mernpress-backup-20261105T090000Z.tar.gz.'),
    ).toBeDefined();
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdatesPage } from './UpdatesPage.js';
import type { UpdateStatus } from './api.js';

function response(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data } as Response;
}

const base: UpdateStatus = {
  coreVersion: '0.1.0',
  source: 'local',
  manifestConfigured: false,
  lastCheckedAt: null,
  updatesAvailable: 0,
  items: [
    {
      id: 'core',
      name: 'MERNPress',
      type: 'core',
      installedVersion: '0.1.0',
      availableVersion: null,
      autoUpdates: false,
      status: 'current',
    },
    {
      id: 'mernpress',
      name: 'MERNPress',
      type: 'theme',
      installedVersion: '0.1.0',
      availableVersion: null,
      autoUpdates: true,
      status: 'current',
    },
    {
      id: 'hello-mernpress',
      name: 'Hello MERNPress',
      type: 'plugin',
      installedVersion: '1.0.0',
      availableVersion: null,
      autoUpdates: false,
      status: 'current',
    },
  ],
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

describe('updates screen', () => {
  it('shows installed versions and the local-check notice', async () => {
    vi.mocked(fetch).mockResolvedValue(response(base));
    render(<UpdatesPage />);

    expect(await screen.findByText('0.1.0')).toBeDefined();
    expect(screen.getByText(/No update service is configured/)).toBeDefined();
    expect(screen.getByText(/Hello MERNPress 1.0.0/)).toBeDefined();
    expect(screen.getByText('Automatic updates enabled')).toBeDefined();
  });

  it('runs Check again and reports the recorded time', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).includes('/check') && init?.method === 'POST') {
        return response({ ...base, lastCheckedAt: '2026-11-04T10:00:00.000Z' });
      }
      return response(base);
    });

    render(<UpdatesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Check again.' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/updates/check',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(
      await screen.findByText(/Installed versions re-read\. No update service is configured\./),
    ).toBeDefined();
  });

  it('shows an available update when a manifest reports a newer version', async () => {
    vi.mocked(fetch).mockResolvedValue(
      response({
        ...base,
        source: 'manifest',
        manifestConfigured: true,
        updatesAvailable: 1,
        items: base.items.map((item) =>
          item.type === 'core' ? { ...item, availableVersion: '0.2.0', status: 'update' } : item,
        ),
      }),
    );

    render(<UpdatesPage />);
    expect(await screen.findByText(/Update available:/)).toBeDefined();
    expect(screen.getByText(/0.2.0/)).toBeDefined();
  });
});

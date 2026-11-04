import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PluginsPage } from './PluginsPage.js';
import type { AuthUser } from './api.js';

const admin: AuthUser = { id: 'u1', username: 'admin', role: 'administrator', status: 'active' };

function response(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data } as Response;
}

const plugin = {
  id: 'hello-mernpress',
  name: 'Hello MERNPress',
  version: '1.0.0',
  author: 'The MERNPress team',
  description: 'This is not just a plugin.',
  details: 'Shows a rotating lyric in the admin toolbar.',
  active: false,
  autoUpdates: false,
};

const list = {
  plugins: [plugin],
  counts: { all: 1, active: 0, inactive: 1 },
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

describe('plugins screen', () => {
  it('lists plugins with status filters and activates one', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).includes('/activate') && init?.method === 'POST') {
        return response({
          plugins: [{ ...plugin, active: true }],
          counts: { all: 1, active: 1, inactive: 0 },
        });
      }
      return response(list);
    });

    render(<PluginsPage user={admin} />);

    expect(await screen.findByText('Hello MERNPress')).toBeDefined();
    expect(screen.getByText(/Version 1\.0\.0/)).toBeDefined();
    expect(screen.getByRole('button', { name: /^All/ })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Activate' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/plugins/hello-mernpress/activate',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(await screen.findByText('Plugin activated: Hello MERNPress.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeDefined();
  });

  it('saves the automatic update preference', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).includes('/auto-updates') && init?.method === 'POST') {
        return response({
          plugins: [{ ...plugin, autoUpdates: true }],
          counts: { all: 1, active: 0, inactive: 1 },
        });
      }
      return response(list);
    });

    render(<PluginsPage user={admin} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Enable auto-updates' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/plugins/auto-updates',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(await screen.findByText('Automatic plugin update preference saved.')).toBeDefined();
  });
  it('shows the plugin details dialog', async () => {
    vi.mocked(fetch).mockResolvedValue(response(list));
    render(<PluginsPage user={admin} />);
    await screen.findByText('Hello MERNPress');

    fireEvent.click(screen.getByRole('button', { name: 'View details' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Version 1\.0\.0/)).toBeDefined();
    expect(within(dialog).getByText('This is not just a plugin.')).toBeDefined();
    expect(within(dialog).getByText('Shows a rotating lyric in the admin toolbar.')).toBeDefined();
  });

  it('deletes an inactive plugin after confirmation', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input, init) => {
      if (init?.method === 'DELETE') {
        return response({ plugins: [], counts: { all: 0, active: 0, inactive: 0 } });
      }
      return response(list);
    });

    render(<PluginsPage user={admin} />);
    await screen.findByText('Hello MERNPress');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Are you sure you want to delete/)).toBeDefined();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/plugins/hello-mernpress',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
    expect(await screen.findByText('Plugin deleted: Hello MERNPress.')).toBeDefined();
    expect(screen.getByText('No plugins installed.')).toBeDefined();
  });
});

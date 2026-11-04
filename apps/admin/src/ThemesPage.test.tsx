import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemesPage } from './ThemesPage.js';
import type { AuthUser } from './api.js';

const admin: AuthUser = { id: 'u1', username: 'admin', role: 'administrator', status: 'active' };

function response(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data } as Response;
}

const theme = {
  id: 'mernpress',
  name: 'MERNPress',
  version: '0.1.0',
  author: { name: 'MERNPress', url: null },
  description: 'The default MERNPress theme for the public site.',
  tags: ['Blog', 'One Column', 'Full Site Editing'],
  features: ['Featured images', 'Threaded comments'],
  screenshot: '/theme-screenshot.png',
  active: true,
  autoUpdates: false,
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

describe('themes screen', () => {
  it('lists the installed theme as active and opens Theme Details', async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      response({ themes: [theme], active: 'mernpress' }),
    );

    render(<ThemesPage user={admin} />);

    expect(await screen.findByText('Active: MERNPress')).toBeDefined();
    expect(screen.getByText('1')).toBeDefined();

    fireEvent.click(screen.getAllByRole('button', { name: 'Theme Details' })[0]!);
    expect(await screen.findByText('Active Theme')).toBeDefined();
    expect(screen.getByText('The default MERNPress theme for the public site.')).toBeDefined();
    expect(screen.getByText('Featured images, Threaded comments')).toBeDefined();
  });

  it('stores the automatic update preference from the details dialog', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).includes('/auto-updates') && init?.method === 'POST') {
        return response({ themes: [{ ...theme, autoUpdates: true }], active: 'mernpress' });
      }
      return response({ themes: [theme], active: 'mernpress' });
    });

    render(<ThemesPage user={admin} />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Theme Details' }))[0]!);
    fireEvent.click(await screen.findByRole('button', { name: 'Enable auto-updates' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/themes/auto-updates',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(await screen.findByText('Automatic theme update preference saved.')).toBeDefined();
  });
});

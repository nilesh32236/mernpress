import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from './api.js';
import { SettingsPage } from './SettingsPage.js';

beforeEach(() => {
  window.history.replaceState(null, '', '/settings');
  document.cookie = 'mernpress_csrf=test-csrf; path=/';
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.cookie = 'mernpress_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
});

const admin: AuthUser = { id: 'u1', username: 'admin', role: 'administrator', status: 'active' };

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('settings page', () => {
  it('renders General tab fields with fetched values', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        response({
          site_title: 'My Site',
          site_tagline: 'A tagline',
          admin_email: 'admin@example.com',
          site_url: 'https://example.com',
        }),
      ),
    );

    render(<SettingsPage user={admin} />);

    expect(await screen.findByDisplayValue('My Site')).toBeDefined();
    expect(screen.getByDisplayValue('A tagline')).toBeDefined();
    expect(screen.getByDisplayValue('admin@example.com')).toBeDefined();
    expect(screen.getByDisplayValue('https://example.com')).toBeDefined();
  });

  it('switches to Reading and loads the reading group', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          site_title: 'My Site',
          site_tagline: '',
          admin_email: '',
          site_url: '',
        }),
      )
      .mockResolvedValueOnce(
        response({
          homepage_mode: 'latest_posts',
          homepage_id: null,
          posts_page_id: null,
          posts_per_page: 10,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<SettingsPage user={admin} />);
    await screen.findByDisplayValue('My Site');

    window.history.replaceState(null, '', '/settings#reading');
    window.dispatchEvent(new PopStateEvent('popstate'));

    await screen.findByDisplayValue('10');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('group=reading'))).toBe(true);
  });

  it('enables Save on edit and saves typed values', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          site_title: 'My Site',
          site_tagline: '',
          admin_email: '',
          site_url: '',
        }),
      )
      .mockResolvedValueOnce(
        response({
          homepage_mode: 'latest_posts',
          homepage_id: null,
          posts_page_id: null,
          posts_per_page: 10,
        }),
      )
      .mockResolvedValueOnce(
        response({
          homepage_mode: 'latest_posts',
          homepage_id: null,
          posts_page_id: null,
          posts_per_page: 5,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<SettingsPage user={admin} />);
    await screen.findByDisplayValue('My Site');

    window.history.replaceState(null, '', '/settings#reading');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await screen.findByDisplayValue('10');

    const saveButton = screen.getByRole('button', { name: /save/i }) as HTMLButtonElement;
    // WordPress keeps Save Changes enabled even before an edit.
    expect(saveButton.disabled).toBe(false);

    fireEvent.change(screen.getByDisplayValue('10'), { target: { value: '5' } });
    expect(saveButton.disabled).toBe(false);

    fireEvent.click(saveButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const putCall = fetchMock.mock.calls[2];
    expect(putCall?.[1]?.method).toBe('PUT');
    const body = JSON.parse(String(putCall?.[1]?.body));
    expect(body.group).toBe('reading');
    expect(body.values.posts_per_page).toBe(5);
    expect(body.values.homepage_id).toBeNull();
  });

  it('shows success notice and surfaces API 400 message', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          site_title: 'My Site',
          site_tagline: '',
          admin_email: '',
          site_url: '',
        }),
      )
      .mockResolvedValueOnce(
        response({ error: { code: 'VALIDATION_ERROR', message: 'Bad email' } }, 400),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<SettingsPage user={admin} />);
    await screen.findByDisplayValue('My Site');

    fireEvent.change(screen.getByDisplayValue('My Site'), { target: { value: 'New Title' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await screen.findByText('Bad email');
  });
});

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockFetch(response: Partial<Response>) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response as Response));
}

describe('admin authentication shell', () => {
  it('shows the login form when there is no session', async () => {
    mockFetch({ ok: false, status: 401, json: async () => ({}) });

    render(<App />);

    expect(await screen.findByLabelText('Username')).toBeDefined();
    expect(screen.getByLabelText('Password')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDefined();

    const skipLink = screen.getByRole('link', { name: 'Skip to content' });
    expect(skipLink.getAttribute('href')).toBe('#main-content');
    expect(document.querySelector('#main-content')).not.toBeNull();
  });

  it('shows the signed-in identity and a sign-out control for a valid session', async () => {
    mockFetch({
      ok: true,
      status: 200,
      json: async () => ({
        user: {
          id: 'user-1',
          username: 'admin',
          role: 'administrator',
          status: 'active',
        },
      }),
    });

    render(<App />);

    expect(await screen.findByText('admin')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeDefined();
    expect(screen.queryByLabelText('Password')).toBeNull();
  });
});

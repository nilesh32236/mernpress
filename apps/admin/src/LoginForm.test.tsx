import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from './LoginForm.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('LoginForm', () => {
  it('submits credentials with the pre-auth CSRF token and reports success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 'pre-auth-token' }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          user: {
            id: 'user-1',
            username: 'admin',
            role: 'administrator',
            status: 'active',
          },
          csrfToken: 'session-token',
          expiresAt: '2026-10-25T00:00:00.000Z',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const onSuccess = vi.fn();

    render(<LoginForm onSuccess={onSuccess} />);

    expect(screen.getByLabelText('Username or Email Address')).toBeDefined();
    expect(screen.getByLabelText('Password')).toBeDefined();

    fireEvent.change(screen.getByLabelText('Username or Email Address'), {
      target: { value: 'admin' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'correct horse battery staple' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'admin', role: 'administrator' }),
      );
    });

    const loginInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(loginInit.method).toBe('POST');
    expect(loginInit.credentials).toBe('include');
    expect((loginInit.headers as Record<string, string>)['x-csrf-token']).toBe('pre-auth-token');
  });

  it('shows a generic error for invalid credentials', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 'pre-auth-token' }))
      .mockResolvedValueOnce(
        jsonResponse(401, {
          error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<LoginForm onSuccess={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Username or Email Address'), {
      target: { value: 'admin' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Invalid username or password.',
    );
  });

  it('shows a rate-limit message without revealing account details', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 'pre-auth-token' }))
      .mockResolvedValueOnce(
        jsonResponse(429, {
          error: { code: 'RATE_LIMITED', message: 'Too many login attempts.' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<LoginForm onSuccess={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Username or Email Address'), {
      target: { value: 'admin' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Too many attempts.');
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResetPasswordForm } from './ResetPasswordForm.js';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ResetPasswordForm', () => {
  it('validates the confirmation and submits the new password once', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 'pre-auth-token' }))
      .mockResolvedValueOnce(jsonResponse(204, null));
    vi.stubGlobal('fetch', fetchMock);

    render(<ResetPasswordForm resetKey="reset-key-value" login="admin" />);

    expect(screen.getByText(/account/)).toBeDefined();
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'new-password-2026' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'different-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Password' }));
    expect(await screen.findByText('The passwords do not match.')).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(0);

    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'new-password-2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Password' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/reset-password',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(await screen.findByText(/Your password has been reset/)).toBeDefined();
    const init = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      key: 'reset-key-value',
      login: 'admin',
      password: 'new-password-2026',
    });
  });

  it('shows the server error for an expired link', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { csrfToken: 'pre-auth-token' }))
      .mockResolvedValueOnce(
        jsonResponse(400, {
          error: {
            code: 'INVALID_RESET_KEY',
            message: 'This password reset link is invalid or has expired.',
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<ResetPasswordForm resetKey="expired-key" login="admin" />);
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'new-password-2026' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'new-password-2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Password' }));

    expect(
      await screen.findByText('This password reset link is invalid or has expired.'),
    ).toBeDefined();
  });
});

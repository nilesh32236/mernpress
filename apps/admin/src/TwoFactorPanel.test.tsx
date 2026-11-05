import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  confirmTwoFactor,
  disableTwoFactor,
  fetchTwoFactorStatus,
  regenerateRecoveryCodes,
  setupTwoFactor,
} from './api.js';
import { TwoFactorPanel } from './TwoFactorPanel.js';

vi.mock('./api.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    fetchTwoFactorStatus: vi.fn(),
    setupTwoFactor: vi.fn(),
    confirmTwoFactor: vi.fn(),
    disableTwoFactor: vi.fn(),
    regenerateRecoveryCodes: vi.fn(),
  };
});

beforeEach(() => {
  vi.mocked(fetchTwoFactorStatus).mockResolvedValue({
    enabled: false,
    confirmedAt: null,
    recoveryCodesRemaining: 0,
  });
  vi.mocked(setupTwoFactor).mockResolvedValue({
    secret: 'JBSWY3DPEHPK3PXP',
    otpauthUrl: 'otpauth://totp/MERNPress:admin?secret=JBSWY3DPEHPK3PXP',
    recoveryCodes: ['ABCD-EFGH', 'IJKL-MNOP'],
  });
  vi.mocked(confirmTwoFactor).mockResolvedValue({
    enabled: true,
    confirmedAt: '2026-11-05T10:00:00.000Z',
    recoveryCodesRemaining: 2,
  });
  vi.mocked(disableTwoFactor).mockResolvedValue({
    enabled: false,
    confirmedAt: null,
    recoveryCodesRemaining: 0,
  });
  vi.mocked(regenerateRecoveryCodes).mockResolvedValue({
    recoveryCodes: ['WXYZ-2345', '6789-ABCD'],
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('two-factor panel', () => {
  it('enrolls with a secret, recovery codes and a confirming code', async () => {
    render(<TwoFactorPanel />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Enable two-factor authentication' }),
    );

    expect(await screen.findByText('JBSWY3DPEHPK3PXP')).toBeDefined();
    expect(screen.getByText(/otpauth:\/\/totp/)).toBeDefined();
    expect(screen.getByText(/ABCD-EFGH/)).toBeDefined();

    fireEvent.change(screen.getByLabelText('Six-digit code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enable two-factor authentication' }));

    await waitFor(() => expect(vi.mocked(confirmTwoFactor)).toHaveBeenCalledWith('123456'));
    expect(await screen.findByText(/Two-factor authentication enabled/)).toBeDefined();
    expect(screen.getByText(/2 recovery codes remaining/)).toBeDefined();
  });

  it('disables with password and code when enabled', async () => {
    vi.mocked(fetchTwoFactorStatus).mockResolvedValue({
      enabled: true,
      confirmedAt: '2026-11-05T10:00:00.000Z',
      recoveryCodesRemaining: 8,
    });
    render(<TwoFactorPanel />);
    await screen.findByText(/8 recovery codes remaining/);

    fireEvent.change(screen.getByLabelText('Password to disable'), {
      target: { value: 'password-2026' },
    });
    fireEvent.change(screen.getByLabelText('Authentication code or recovery code'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Disable two-factor authentication' }));

    await waitFor(() =>
      expect(vi.mocked(disableTwoFactor)).toHaveBeenCalledWith('password-2026', '123456'),
    );
    expect(await screen.findByText('Two-factor authentication disabled.')).toBeDefined();
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  changeOwnPassword,
  createApplicationPassword,
  fetchApplicationPasswords,
  fetchLocales,
  fetchProfile,
  revokeApplicationPassword,
  updateProfile,
  type AuthUser,
  type UserProfile,
} from './api.js';
import { ProfilePage } from './ProfilePage.js';

vi.mock('./api.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    fetchProfile: vi.fn(),
    updateProfile: vi.fn(),
    changeOwnPassword: vi.fn(),
    fetchLocales: vi.fn(),
    fetchApplicationPasswords: vi.fn(),
    createApplicationPassword: vi.fn(),
    revokeApplicationPassword: vi.fn(),
  };
});

const admin: AuthUser = { id: 'u1', username: 'admin', role: 'administrator', status: 'active' };

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'u1',
    username: 'admin',
    email: 'admin@example.com',
    displayName: 'Admin',
    firstName: null,
    lastName: null,
    nickname: null,
    bio: null,
    website: null,
    syntaxHighlighting: true,
    locale: 'en_US',
    role: 'administrator',
    createdAt: '2026-10-01T09:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(fetchProfile).mockResolvedValue(makeProfile());
  vi.mocked(updateProfile).mockResolvedValue(makeProfile());
  vi.mocked(changeOwnPassword).mockResolvedValue(undefined);
  vi.mocked(fetchLocales).mockResolvedValue([{ value: 'en_US', label: 'English (United States)' }]);
  vi.mocked(fetchApplicationPasswords).mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('profile page', () => {
  it('renders the account details from the profile API', async () => {
    render(<ProfilePage user={admin} />);

    expect(((await screen.findByLabelText('Username')) as HTMLInputElement).value).toBe('admin');
    expect((screen.getByLabelText('Display name publicly as') as HTMLInputElement).value).toBe(
      'Admin',
    );
    expect((screen.getByLabelText('Email (required)') as HTMLInputElement).value).toBe(
      'admin@example.com',
    );
  });

  it('saves the display name and notifies the parent', async () => {
    const onProfileUpdated = vi.fn();
    render(<ProfilePage user={admin} onProfileUpdated={onProfileUpdated} />);

    await screen.findByLabelText('Username');
    fireEvent.change(screen.getByLabelText('Display name publicly as'), {
      target: { value: 'admin' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Account details' }));

    await waitFor(() =>
      expect(vi.mocked(updateProfile)).toHaveBeenCalledWith({
        username: 'admin',
        displayName: 'admin',
        firstName: null,
        lastName: null,
        nickname: null,
        email: 'admin@example.com',
        bio: null,
        website: null,
        syntaxHighlighting: true,
        locale: 'en_US',
      }),
    );
    expect(await screen.findByText('Profile updated.')).toBeDefined();
    expect(onProfileUpdated).toHaveBeenCalledWith({ username: 'admin' });
  });

  it('rejects a password confirmation mismatch on the client', async () => {
    render(<ProfilePage user={admin} />);
    await screen.findByLabelText('Username');
    fireEvent.click(screen.getByRole('button', { name: 'Set New Password' }));

    fireEvent.change(screen.getByLabelText('Current password'), {
      target: { value: 'old-password' },
    });
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'new-password' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'different' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Change password' }));

    expect(await screen.findByText('The new passwords do not match.')).toBeDefined();
    expect(vi.mocked(changeOwnPassword)).not.toHaveBeenCalled();
  });

  it('changes the password and clears the fields on success', async () => {
    render(<ProfilePage user={admin} />);
    await screen.findByLabelText('Username');
    fireEvent.click(screen.getByRole('button', { name: 'Set New Password' }));

    fireEvent.change(screen.getByLabelText('Current password'), {
      target: { value: 'old-password' },
    });
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'new-password' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'new-password' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Change password' }));

    await waitFor(() =>
      expect(vi.mocked(changeOwnPassword)).toHaveBeenCalledWith({
        currentPassword: 'old-password',
        newPassword: 'new-password',
      }),
    );
    expect(await screen.findByText('Password updated.')).toBeDefined();
    expect((screen.getByLabelText('Current password') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('New password') as HTMLInputElement).value).toBe('');
  });

  it('surfaces the server password policy error', async () => {
    vi.mocked(changeOwnPassword).mockRejectedValueOnce(
      new ApiError(
        400,
        'VALIDATION_ERROR',
        'newPassword: Password must contain at least one uppercase letter.',
      ),
    );

    render(<ProfilePage user={admin} />);
    await screen.findByLabelText('Username');
    fireEvent.click(screen.getByRole('button', { name: 'Set New Password' }));

    fireEvent.change(screen.getByLabelText('Current password'), {
      target: { value: 'old-password' },
    });
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'new-password' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'new-password' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Change password' }));

    expect(
      await screen.findByText('newPassword: Password must contain at least one uppercase letter.'),
    ).toBeDefined();
  });
  it('saves the syntax highlighting and language preferences', async () => {
    render(<ProfilePage user={admin} />);
    await screen.findByLabelText('Username');

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Disable syntax highlighting when editing code' }),
    );
    fireEvent.submit(screen.getByRole('form', { name: 'Account details' }));

    await waitFor(() =>
      expect(vi.mocked(updateProfile)).toHaveBeenCalledWith(
        expect.objectContaining({ syntaxHighlighting: false, locale: 'en_US' }),
      ),
    );
  });

  it('creates an application password and shows it once', async () => {
    vi.mocked(createApplicationPassword).mockResolvedValue({
      password: 'abcd efgh ijkl mnop qrst uvwx',
      item: {
        id: 'ap1',
        name: 'CI deploy',
        createdAt: '2026-11-04T10:00:00.000Z',
        lastUsedAt: null,
        lastUsedIp: null,
      },
    });

    render(<ProfilePage user={admin} />);
    await screen.findByLabelText('Username');
    fireEvent.click(screen.getByRole('button', { name: 'Add New Application Password' }));
    fireEvent.change(screen.getByLabelText('New Application Password Name'), {
      target: { value: 'CI deploy' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Add application password' }));

    await waitFor(() =>
      expect(vi.mocked(createApplicationPassword)).toHaveBeenCalledWith('CI deploy'),
    );
    expect(await screen.findByText('abcd efgh ijkl mnop qrst uvwx')).toBeDefined();
    expect(screen.getByText('CI deploy')).toBeDefined();
    expect(
      screen.getByText(/Application password created\. Copy it now; it cannot be shown again\./),
    ).toBeDefined();
  });

  it('revokes an application password', async () => {
    vi.mocked(fetchApplicationPasswords).mockResolvedValue([
      {
        id: 'ap1',
        name: 'CI deploy',
        createdAt: '2026-11-04T10:00:00.000Z',
        lastUsedAt: '2026-11-04T10:05:00.000Z',
        lastUsedIp: '127.0.0.1',
      },
    ]);
    vi.mocked(revokeApplicationPassword).mockResolvedValue(undefined);

    render(<ProfilePage user={admin} />);
    const revoke = await screen.findByRole('button', { name: 'Revoke' });
    fireEvent.click(revoke);

    await waitFor(() => expect(vi.mocked(revokeApplicationPassword)).toHaveBeenCalledWith('ap1'));
    expect(await screen.findByText('Application password revoked: CI deploy.')).toBeDefined();
  });
});

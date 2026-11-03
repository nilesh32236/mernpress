import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  changeOwnPassword,
  fetchProfile,
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
  };
});

const admin: AuthUser = { id: 'u1', username: 'admin', role: 'administrator', status: 'active' };

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'u1',
    username: 'admin',
    email: 'admin@example.com',
    displayName: 'Admin',
    role: 'administrator',
    createdAt: '2026-10-01T09:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(fetchProfile).mockResolvedValue(makeProfile());
  vi.mocked(updateProfile).mockResolvedValue(makeProfile());
  vi.mocked(changeOwnPassword).mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('profile page', () => {
  it('renders the account details from the profile API', async () => {
    render(<ProfilePage user={admin} />);

    expect(((await screen.findByLabelText('Username')) as HTMLInputElement).value).toBe('admin');
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Admin');
    expect((screen.getByLabelText('Email (required)') as HTMLInputElement).value).toBe(
      'admin@example.com',
    );
  });

  it('saves the display name and notifies the parent', async () => {
    const onProfileUpdated = vi.fn();
    render(<ProfilePage user={admin} onProfileUpdated={onProfileUpdated} />);

    await screen.findByLabelText('Username');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Super Admin' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Account details' }));

    await waitFor(() =>
      expect(vi.mocked(updateProfile)).toHaveBeenCalledWith({
        username: 'admin',
        displayName: 'Super Admin',
        email: 'admin@example.com',
      }),
    );
    expect(await screen.findByText('Profile updated.')).toBeDefined();
    expect(onProfileUpdated).toHaveBeenCalledWith({ username: 'admin' });
  });

  it('rejects a password confirmation mismatch on the client', async () => {
    render(<ProfilePage user={admin} />);
    await screen.findByLabelText('Username');

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
});

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  createUser,
  deleteUser,
  fetchUsers,
  updateUserRole,
  type AdminUser,
  type AdminUserList,
  type AuthUser,
} from './api.js';
import { UsersPage } from './UsersPage.js';

vi.mock('./api.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    fetchUsers: vi.fn(),
    createUser: vi.fn(),
    updateUserRole: vi.fn(),
    updateUserStatus: vi.fn(),
    resetUserPassword: vi.fn(),
    deleteUser: vi.fn(),
  };
});

const admin: AuthUser = { id: 'u1', username: 'admin', role: 'administrator', status: 'active' };

const SELF = makeUser({
  id: 'u1',
  username: 'admin',
  role: 'administrator',
  postCount: 0,
  createdAt: '2026-10-15T08:00:00.000Z',
});
const EDITOR = makeUser({});
const AUTHOR = makeUser({
  id: 'u3',
  username: 'author-c',
  email: null,
  displayName: null,
  role: 'author',
  postCount: 0,
  createdAt: '2026-10-21T10:00:00.000Z',
});

function makeUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 'u2',
    username: 'editor-b',
    email: 'editor-b@example.com',
    displayName: 'Editor B',
    role: 'editor',
    status: 'active',
    createdAt: '2026-10-20T09:00:00.000Z',
    postCount: 3,
    ...overrides,
  };
}

function list(items: AdminUser[], total = items.length): AdminUserList {
  return {
    items,
    pagination: { page: 1, perPage: 10, total, totalPages: Math.max(1, Math.ceil(total / 10)) },
  };
}

function rowFor(username: string): HTMLElement {
  const row = screen.getByText(username).closest('tr');
  if (!row) throw new Error(`No table row for ${username}`);
  return row;
}

beforeEach(() => {
  window.history.replaceState(null, '', '/users');
  vi.mocked(fetchUsers).mockResolvedValue(list([SELF, EDITOR, AUTHOR]));
  vi.mocked(createUser).mockResolvedValue(makeUser({ id: 'u4', username: 'new-user' }));
  vi.mocked(updateUserRole).mockResolvedValue(makeUser({ role: 'editor' }));
  vi.mocked(deleteUser).mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('users page', () => {
  it('renders rows from the users API', async () => {
    render(<UsersPage user={admin} />);

    expect(await screen.findByText('editor-b')).toBeDefined();
    expect(screen.getAllByText('Editor').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Administrator').length).toBeGreaterThan(0);
    expect(screen.getByRole('cell', { name: '3' })).toBeDefined();
    expect(screen.getAllByText('Editor B').length).toBeGreaterThan(0);
    expect(screen.getAllByText('editor-b@example.com').length).toBeGreaterThan(0);
  });

  it('submits a search term and resets to page one', async () => {
    render(<UsersPage user={admin} />);
    await screen.findByText('editor-b');

    fireEvent.change(screen.getByLabelText('Search Users'), { target: { value: 'ali' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search Users' }));

    await waitFor(() =>
      expect(vi.mocked(fetchUsers)).toHaveBeenLastCalledWith({
        search: 'ali',
        page: 1,
        perPage: 10,
      }),
    );
  });

  it('validates the add-user form and creates a user', async () => {
    render(<UsersPage user={admin} />);
    await screen.findByText('editor-b');

    fireEvent.click(screen.getByRole('button', { name: 'Add User' }));
    fireEvent.submit(screen.getByRole('form', { name: 'Add user' }));

    expect(await screen.findByText('Username is required.')).toBeDefined();
    expect(vi.mocked(createUser)).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Username/), { target: { value: 'new-user' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-pass' } });
    fireEvent.change(screen.getByLabelText('Repeat Password (required)'), {
      target: { value: 'secret-pass' },
    });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'author' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Add user' }));

    await waitFor(() =>
      expect(vi.mocked(createUser)).toHaveBeenCalledWith({
        username: 'new-user',
        password: 'secret-pass',
        role: 'author',
      }),
    );
    expect(await screen.findByText('User “new-user” created.')).toBeDefined();
  });

  it('hides delete and disable actions on the current user row', async () => {
    render(<UsersPage user={admin} />);
    await screen.findByText('editor-b');

    const selfRow = rowFor('admin');
    expect(within(selfRow).queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(within(selfRow).queryByRole('button', { name: 'Disable' })).toBeNull();
    fireEvent.click(within(selfRow).getByRole('button', { name: 'Edit' }));
    expect(await screen.findByRole('button', { name: 'Reset password' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    const otherRow = rowFor('editor-b');
    expect(within(otherRow).getByRole('button', { name: 'Delete' })).toBeDefined();
  });

  it('changes a role through the modal', async () => {
    render(<UsersPage user={admin} />);
    await screen.findByText('editor-b');

    fireEvent.click(within(rowFor('author-c')).getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');

    fireEvent.change(within(dialog).getByLabelText('Role'), { target: { value: 'editor' } });
    fireEvent.submit(within(dialog).getByRole('form', { name: 'Change user role' }));

    await waitFor(() => expect(vi.mocked(updateUserRole)).toHaveBeenCalledWith('u3', 'editor'));
    expect(await screen.findByText(/Role for “author-c” updated to Editor/)).toBeDefined();
  });

  it('requires a reassignment target before deleting a user with posts', async () => {
    render(<UsersPage user={admin} />);
    await screen.findByText('editor-b');

    fireEvent.click(within(rowFor('editor-b')).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByText(/3 posts will be reassigned/i)).toBeDefined();
    expect(
      (within(dialog).getByRole('button', { name: 'Delete User' }) as HTMLButtonElement).disabled,
    ).toBe(true);

    const select = (await within(dialog).findByLabelText('Reassign posts to')) as HTMLSelectElement;
    expect(select.options).toHaveLength(2); // placeholder + author-c
    fireEvent.change(select, { target: { value: 'u3' } });

    await waitFor(() =>
      expect(
        (within(dialog).getByRole('button', { name: 'Delete User' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );

    fireEvent.submit(within(dialog).getByRole('form', { name: 'Delete user' }));
    await waitFor(() => expect(vi.mocked(deleteUser)).toHaveBeenCalledWith('u2', 'u3'));
    expect(await screen.findByText('User “editor-b” deleted.')).toBeDefined();
  });

  it('surfaces API domain errors from the users API', async () => {
    vi.mocked(createUser).mockRejectedValueOnce(
      new ApiError(409, 'SELF_ROLE_CHANGE', 'You cannot change your own role.'),
    );

    render(<UsersPage user={admin} />);
    await screen.findByText('editor-b');

    fireEvent.click(screen.getByRole('button', { name: 'Add User' }));
    fireEvent.change(screen.getByLabelText(/Username/), { target: { value: 'new-user' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-pass' } });
    fireEvent.change(screen.getByLabelText('Repeat Password (required)'), {
      target: { value: 'secret-pass' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Add user' }));

    expect(await screen.findByText('You cannot change your own role.')).toBeDefined();
  });

  it('shows the no-access empty state when the API rejects with 403', async () => {
    // The page also fetches per-role counts, so every call must reject.
    vi.mocked(fetchUsers).mockRejectedValue(
      new ApiError(403, 'FORBIDDEN', 'Insufficient capability'),
    );

    render(<UsersPage user={admin} />);

    expect(await screen.findByText('No user management access')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Add User' })).toBeNull();
  });
});

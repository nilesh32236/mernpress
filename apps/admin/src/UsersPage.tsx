import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  ApiError,
  actionErrorMessage,
  createUser,
  deleteUser,
  fetchUsers,
  resetUserPassword,
  updateUserRole,
  updateUserStatus,
  type AdminUser,
  type AdminUserList,
  type AuthUser,
  type UserRole,
} from './api.js';
import {
  EmptyState,
  ErrorState,
  Notice,
  PageHeader,
  Skeleton,
  type NoticeMessage,
} from './components.js';
import { pluralize } from './format.js';
import { roleLabel } from './roles.js';

const PER_PAGE = 10;
const REASSIGN_LIMIT = 100;
const MAX_SEARCH_LENGTH = 200;
const ROLES: UserRole[] = ['administrator', 'editor', 'author', 'contributor', 'subscriber'];

// The admin design system has no standalone dialog block (Terms dialogs use
// window.confirm). Reuse `.content-card` for the panel and keep the backdrop
// positioning local to this screen so styles.css stays untouched.
const OVERLAY_STYLE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 100,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '16px',
  background: 'rgba(0, 0, 0, 0.56)',
};

const PANEL_STYLE: CSSProperties = {
  width: '100%',
  maxWidth: '34rem',
  maxHeight: '90vh',
  overflowY: 'auto',
  boxShadow: '0 12px 28px rgba(0, 0, 0, 0.28)',
};

type DialogKind = 'add' | 'role' | 'password' | 'delete';

interface DialogState {
  kind: DialogKind;
  target: AdminUser | null;
}

function sanitizeSearch(value: string): string {
  return value.trim().slice(0, MAX_SEARCH_LENGTH);
}

function totalPagesFor(data: AdminUserList | null): number {
  if (!data) return 1;
  return Math.max(
    1,
    Math.ceil(data.pagination.total / Math.max(1, data.pagination.perPage || PER_PAGE)),
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>('input, select, textarea')?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-overlay" style={OVERLAY_STYLE}>
      <div
        ref={panelRef}
        className="content-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={PANEL_STYLE}
      >
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function DialogActions({
  submitLabel,
  busyLabel,
  submitting,
  disabled = false,
  onCancel,
}: {
  submitLabel: string;
  busyLabel: string;
  submitting: boolean;
  disabled?: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="side-actions">
      <button
        type="submit"
        className="button primary-button"
        disabled={submitting || disabled}
        aria-busy={submitting}
      >
        {submitting ? busyLabel : submitLabel}
      </button>
      <button type="button" className="button secondary-button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

function AddUserDialog({
  onCancel,
  onSuccess,
}: {
  onCancel: () => void;
  onSuccess: (message: string) => void;
}) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('subscriber');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const name = username.trim();
    if (!name) {
      setError('Username is required.');
      return;
    }
    if (!password) {
      setError('Password is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createUser({
        username: name,
        password,
        role,
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        ...(email.trim() ? { email: email.trim() } : {}),
      });
      onSuccess(`User “${name}” created.`);
    } catch (caught) {
      setError(actionErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add New User" onClose={onCancel}>
      <form onSubmit={handleSubmit} aria-label="Add user">
        <div className="field">
          <label htmlFor="add-user-username">Username</label>
          <input
            id="add-user-username"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            disabled={saving}
            autoComplete="off"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="add-user-name">Name</label>
          <input
            id="add-user-name"
            type="text"
            maxLength={100}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            disabled={saving}
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label htmlFor="add-user-email">Email</label>
          <input
            id="add-user-email"
            type="email"
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={saving}
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label htmlFor="add-user-password">Password</label>
          <input
            id="add-user-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={saving}
            autoComplete="new-password"
            required
          />
          <p className="field-help">The server enforces the password policy.</p>
        </div>
        <div className="field">
          <label htmlFor="add-user-role">Role</label>
          <select
            id="add-user-role"
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole)}
            disabled={saving}
          >
            {ROLES.map((value) => (
              <option key={value} value={value}>
                {roleLabel(value)}
              </option>
            ))}
          </select>
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <DialogActions
          submitLabel="Add User"
          busyLabel="Creating…"
          submitting={saving}
          onCancel={onCancel}
        />
      </form>
    </Modal>
  );
}

function ChangeRoleDialog({
  target,
  onCancel,
  onSuccess,
}: {
  target: AdminUser;
  onCancel: () => void;
  onSuccess: (message: string) => void;
}) {
  const [role, setRole] = useState<UserRole>(target.role);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateUserRole(target.id, role);
      onSuccess(`Role for “${target.username}” updated to ${roleLabel(role)}.`);
    } catch (caught) {
      setError(actionErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Change role: ${target.username}`} onClose={onCancel}>
      <form onSubmit={handleSubmit} aria-label="Change user role">
        <div className="field">
          <label htmlFor="change-role-role">Role</label>
          <select
            id="change-role-role"
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole)}
            disabled={saving}
          >
            {ROLES.map((value) => (
              <option key={value} value={value}>
                {roleLabel(value)}
              </option>
            ))}
          </select>
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <DialogActions
          submitLabel="Update Role"
          busyLabel="Saving…"
          submitting={saving}
          onCancel={onCancel}
        />
      </form>
    </Modal>
  );
}

function ResetPasswordDialog({
  target,
  onCancel,
  onSuccess,
}: {
  target: AdminUser;
  onCancel: () => void;
  onSuccess: (message: string) => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!password) {
      setError('Password is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await resetUserPassword(target.id, password);
      onSuccess(`Password reset for “${target.username}”.`);
    } catch (caught) {
      setError(actionErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Reset password: ${target.username}`} onClose={onCancel}>
      <form onSubmit={handleSubmit} aria-label="Reset user password">
        <div className="field">
          <label htmlFor="reset-user-password">New password</label>
          <input
            id="reset-user-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={saving}
            autoComplete="new-password"
            required
          />
          <p className="field-help">The user is signed out of other sessions after a reset.</p>
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <DialogActions
          submitLabel="Reset Password"
          busyLabel="Resetting…"
          submitting={saving}
          onCancel={onCancel}
        />
      </form>
    </Modal>
  );
}

function DeleteUserDialog({
  target,
  currentUserId,
  onCancel,
  onSuccess,
}: {
  target: AdminUser;
  currentUserId: string;
  onCancel: () => void;
  onSuccess: (message: string) => void;
}) {
  const [candidates, setCandidates] = useState<AdminUser[] | null>(null);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [reassignTo, setReassignTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const requiresReassign = target.postCount > 0;

  useEffect(() => {
    if (!requiresReassign) return;
    let active = true;
    fetchUsers({ page: 1, perPage: REASSIGN_LIMIT })
      .then((result) => {
        if (!active) return;
        setCandidates(result.items);
      })
      .catch((caught) => {
        if (!active) return;
        setCandidateError(actionErrorMessage(caught));
      });
    return () => {
      active = false;
    };
  }, [requiresReassign]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (requiresReassign && !reassignTo) {
      setError('Choose a user to reassign the posts to.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await deleteUser(target.id, reassignTo ? reassignTo : undefined);
      onSuccess(`User “${target.username}” deleted.`);
    } catch (caught) {
      setError(actionErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  const others = (candidates ?? []).filter(
    (candidate) => candidate.id !== target.id && candidate.id !== currentUserId,
  );

  return (
    <Modal title={`Delete user: ${target.username}`} onClose={onCancel}>
      <form onSubmit={handleSubmit} aria-label="Delete user">
        <p className="field-help">
          Deleting this user cannot be undone.
          {requiresReassign ? ` ${pluralize(target.postCount, 'post')} will be reassigned.` : ''}
        </p>
        {requiresReassign ? (
          <div className="field">
            <label htmlFor="delete-reassign">Reassign posts to</label>
            <select
              id="delete-reassign"
              value={reassignTo}
              onChange={(event) => setReassignTo(event.target.value)}
              disabled={saving}
            >
              <option value="">Select a user</option>
              {others.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.username}
                </option>
              ))}
            </select>
            {candidateError ? (
              <p className="field-error" role="alert">
                {candidateError}
              </p>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <DialogActions
          submitLabel="Delete User"
          busyLabel="Deleting…"
          submitting={saving}
          disabled={requiresReassign && !reassignTo}
          onCancel={onCancel}
        />
      </form>
    </Modal>
  );
}

export function UsersPage({ user }: { user: AuthUser }) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminUserList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetchUsers({ ...(search ? { search } : {}), page, perPage: PER_PAGE })
      .then((result) => {
        if (!active) return;
        setData(result);
        setLoading(false);
      })
      .catch((caught) => {
        if (!active) return;
        if (caught instanceof ApiError && caught.status === 403) {
          setDenied(true);
        } else {
          setError(actionErrorMessage(caught));
        }
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [search, page, reloadKey]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(sanitizeSearch(searchInput));
    setPage(1);
  }

  function openDialog(kind: DialogKind, target: AdminUser | null) {
    setNotice(null);
    setDialog({ kind, target });
  }

  function finishDialog(message: string) {
    setDialog(null);
    setNotice({ tone: 'success', text: message });
    setReloadKey((value) => value + 1);
  }

  async function toggleStatus(target: AdminUser) {
    const nextStatus = target.status === 'active' ? 'disabled' : 'active';
    if (
      nextStatus === 'disabled' &&
      !window.confirm(`Disable “${target.username}”? They will be signed out immediately.`)
    ) {
      return;
    }
    if (pendingAction !== null) return;
    setPendingAction(`status:${target.id}`);
    setNotice(null);
    try {
      await updateUserStatus(target.id, nextStatus);
      setNotice({
        tone: 'success',
        text:
          nextStatus === 'disabled'
            ? `User “${target.username}” disabled.`
            : `User “${target.username}” enabled.`,
      });
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setPendingAction(null);
    }
  }

  if (denied) {
    return (
      <>
        <PageHeader eyebrow="Users" title="Users" />
        <EmptyState
          title="No user management access"
          message="Your account does not have permission to manage users."
        />
      </>
    );
  }

  const totalPages = totalPagesFor(data);
  const total = data?.pagination.total ?? 0;

  return (
    <>
      <div className="list-title-row">
        <span className="title-badge" aria-hidden="true">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </span>
        <h1>Users</h1>
        <button
          type="button"
          className="button primary-button list-add-new"
          onClick={() => openDialog('add', null)}
        >
          <span aria-hidden="true">+</span> Add New User
        </button>
      </div>
      <div className="users-subheader">
        <span className="sub-count">All Users ({total})</span>
        <span className="sub-sep" aria-hidden="true">
          |
        </span>
        <span className="sub-signed">
          You are signed in as {user.username} ({user.role.toUpperCase()})
        </span>
      </div>

      {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}

      <div className="tablenav">
        <div className="alignleft">
          <span className="displaying-num">{pluralize(total, 'user')}</span>
        </div>
        <div className="alignright">
          <form className="search-form" onSubmit={handleSearch} role="search">
            <label htmlFor="user-search">Search Users</label>
            <input
              id="user-search"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Username"
            />
            <button type="submit" className="button secondary-button">
              Search
            </button>
          </form>
        </div>
      </div>

      {error ? (
        <ErrorState
          title="Could not load users"
          message={error}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : loading ? (
        <Skeleton label="Loading users…" lines={5} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title={search ? 'No matching users' : 'No users found'}
          message={
            search
              ? 'Try a different search term.'
              : 'Create your first user account to get started.'
          }
          action={
            <button
              type="button"
              className="button primary-button"
              onClick={() => openDialog('add', null)}
            >
              Add New User
            </button>
          }
        />
      ) : (
        <>
          <div className="table-scroll">
            <table className="content-table widefat fixed striped users">
              <caption className="screen-reader-text">Users</caption>
              <thead>
                <tr>
                  <th scope="col" className="check-column">
                    <input type="checkbox" />
                  </th>
                  <th scope="col">Username</th>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Posts</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => {
                  const isSelf = item.id === user.id;
                  return (
                    <tr key={item.id}>
                      <th scope="row" className="check-column">
                        <input type="checkbox" />
                      </th>
                      <td className="username column-username">
                        <span className="user-cell">
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                          <span className="row-title">{item.username}</span>
                          {isSelf ? <span className="you-badge">you</span> : null}
                          {isSelf ? <span className="no-terms"> (You)</span> : null}
                        </span>
                        {item.status === 'disabled' ? (
                          <span className="status-badge status-draft disabled-badge">Disabled</span>
                        ) : null}
                      </td>
                      <td className="column-name">{item.displayName ?? '—'}</td>
                      <td className="column-email">{item.email ?? '—'}</td>
                      <td className="role column-role">{roleLabel(item.role)}</td>
                      <td className="posts column-posts">{pluralize(item.postCount, 'post')}</td>
                      <td className="actions column-actions">
                        <div className="row-actions">
                          {!isSelf ? (
                            <button
                              type="button"
                              className="icon-action"
                              aria-label="Change role"
                              title="Change role"
                              onClick={() => openDialog('role', item)}
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                              </svg>
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="icon-action"
                            aria-label="Reset password"
                            title="Reset password"
                            onClick={() => openDialog('password', item)}
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <circle cx="7.5" cy="15.5" r="4.5" />
                              <path d="m11 12 10-10" />
                              <path d="m15 8 3 3" />
                            </svg>
                          </button>
                          {!isSelf ? (
                            <>
                              <button
                                type="button"
                                className="icon-action"
                                aria-label={item.status === 'active' ? 'Disable' : 'Enable'}
                                title={item.status === 'active' ? 'Disable' : 'Enable'}
                                disabled={pendingAction !== null}
                                aria-busy={pendingAction === `status:${item.id}`}
                                onClick={() => void toggleStatus(item)}
                              >
                                {item.status === 'active' ? (
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                  >
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="4.9" y1="4.9" x2="19.1" y2="19.1" />
                                  </svg>
                                ) : (
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                  >
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                    <polyline points="22 4 12 14.01 9 11.01" />
                                  </svg>
                                )}
                              </button>
                              <button
                                type="button"
                                className="icon-action danger"
                                aria-label="Delete…"
                                title="Delete user"
                                onClick={() => openDialog('delete', item)}
                              >
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <nav className="pagination" aria-label="Users pagination">
            <div className="tablenav-pages">
              <span className="displaying-num">{pluralize(total, 'user')}</span>
              <span className="pagination-links">
                <button
                  type="button"
                  className="button secondary-button pagination-button prev"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  « Previous
                </button>
                <span className="page-numbers current">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  className="button secondary-button pagination-button next"
                  disabled={page >= totalPages}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next »
                </button>
              </span>
            </div>
          </nav>
        </>
      )}

      {dialog?.kind === 'add' ? (
        <AddUserDialog onCancel={() => setDialog(null)} onSuccess={finishDialog} />
      ) : null}
      {dialog?.kind === 'role' && dialog.target ? (
        <ChangeRoleDialog
          target={dialog.target}
          onCancel={() => setDialog(null)}
          onSuccess={finishDialog}
        />
      ) : null}
      {dialog?.kind === 'password' && dialog.target ? (
        <ResetPasswordDialog
          target={dialog.target}
          onCancel={() => setDialog(null)}
          onSuccess={finishDialog}
        />
      ) : null}
      {dialog?.kind === 'delete' && dialog.target ? (
        <DeleteUserDialog
          target={dialog.target}
          currentUserId={user.id}
          onCancel={() => setDialog(null)}
          onSuccess={finishDialog}
        />
      ) : null}
    </>
  );
}

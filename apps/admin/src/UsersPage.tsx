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
import { navigate, useLocation } from './router.js';
import { SCREEN_OPTIONS_EVENT, screenPerPage } from './screenOptions.js';

const DEFAULT_PER_PAGE = 10;
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
    Math.ceil(data.pagination.total / Math.max(1, data.pagination.perPage || DEFAULT_PER_PAGE)),
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
  onResetPassword,
  onToggleStatus,
}: {
  target: AdminUser;
  onCancel: () => void;
  onSuccess: (message: string) => void;
  onResetPassword: () => void;
  onToggleStatus: () => void;
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
        <div className="dialog-secondary-actions">
          <button
            type="button"
            className="button secondary-button"
            onClick={onResetPassword}
            disabled={saving}
          >
            Reset password
          </button>
          <button
            type="button"
            className="button secondary-button"
            onClick={onToggleStatus}
            disabled={saving}
          >
            {target.status === 'active' ? 'Disable user' : 'Enable user'}
          </button>
        </div>
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
  const location = useLocation();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('');
  const [roleCounts, setRoleCounts] = useState<Record<string, number>>({});
  const [data, setData] = useState<AdminUserList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [perPage, setPerPage] = useState(() => screenPerPage('users', DEFAULT_PER_PAGE));
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'delete' | ''>('');
  const [bulkRole, setBulkRole] = useState<UserRole | ''>('');
  const [bulkBusy, setBulkBusy] = useState(false);

  // "Users → Add User" navigates here with ?action=add, like WordPress user-new.php.
  useEffect(() => {
    if (new URLSearchParams(location.search).get('action') === 'add') {
      setDialog({ kind: 'add', target: null });
    }
  }, [location.search]);

  useEffect(() => {
    if (denied) return;
    let active = true;
    const roles: UserRole[] = ['administrator', 'editor', 'author', 'contributor', 'subscriber'];
    Promise.all(
      roles.map((role) =>
        fetchUsers({ ...(search ? { search } : {}), role, page: 1, perPage: 1 }).then(
          (result) => [role, result.pagination.total] as const,
        ),
      ),
    )
      .then((entries) => {
        if (!active) return;
        setRoleCounts(Object.fromEntries(entries));
      })
      .catch(() => {
        // Counts are cosmetic; a failure must not block the roster.
      });
    return () => {
      active = false;
    };
  }, [denied, reloadKey, search]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetchUsers({
      ...(search ? { search } : {}),
      ...(roleFilter ? { role: roleFilter } : {}),
      page,
      perPage,
    })
      .then((result) => {
        if (!active) return;
        setData(result);
        setSelected(new Set());
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
  }, [search, page, roleFilter, perPage, reloadKey]);

  useEffect(() => {
    function onOptions() {
      setPerPage(screenPerPage('users', DEFAULT_PER_PAGE));
    }
    window.addEventListener(SCREEN_OPTIONS_EVENT, onOptions);
    return () => window.removeEventListener(SCREEN_OPTIONS_EVENT, onOptions);
  }, []);

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

  function toggleSelected(id: string): void {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll(): void {
    if (!data) return;
    const ids = data.items.map((item) => item.id);
    setSelected((current) => (ids.every((id) => current.has(id)) ? new Set() : new Set(ids)));
  }

  async function runBulkAction(): Promise<void> {
    if (bulkAction !== 'delete' || selected.size === 0) return;
    const targets = (data?.items ?? []).filter(
      (item) => selected.has(item.id) && item.id !== user.id,
    );
    if (targets.length === 0) {
      setNotice({ tone: 'error', text: 'You cannot delete your own account.' });
      return;
    }
    if (!window.confirm(`Delete ${targets.length} user(s)? This cannot be undone.`)) {
      return;
    }
    setBulkBusy(true);
    setNotice(null);
    try {
      for (const target of targets) {
        await deleteUser(target.id);
      }
      setNotice({ tone: 'success', text: `${targets.length} user(s) deleted.` });
      setSelected(new Set());
      setBulkAction('');
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setBulkBusy(false);
    }
  }

  async function runBulkRoleChange(): Promise<void> {
    if (bulkRole === '' || selected.size === 0) return;
    const targets = (data?.items ?? []).filter((item) => selected.has(item.id));
    if (targets.length === 0) return;
    setBulkBusy(true);
    setNotice(null);
    try {
      for (const target of targets) {
        await updateUserRole(target.id, bulkRole);
      }
      setNotice({
        tone: 'success',
        text: `Role for ${targets.length} user(s) changed to ${roleLabel(bulkRole)}.`,
      });
      setSelected(new Set());
      setBulkRole('');
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setBulkBusy(false);
    }
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
        <h1>Users</h1>
        <button
          type="button"
          className="button page-title-action"
          onClick={() => openDialog('add', null)}
        >
          Add User
        </button>
      </div>
      <ul className="subsubsub" aria-label="User role filter">
        <li>
          <button
            type="button"
            className="subsubsub-tab"
            aria-current={roleFilter === '' ? 'true' : undefined}
            onClick={() => {
              setRoleFilter('');
              setPage(1);
            }}
          >
            All <span className="count">({total})</span>
          </button>
        </li>
        {(
          [
            ['administrator', 'Administrator'],
            ['editor', 'Editor'],
            ['author', 'Author'],
            ['contributor', 'Contributor'],
            ['subscriber', 'Subscriber'],
          ] as const
        )
          .filter(([role]) => (roleCounts[role] ?? 0) > 0 || roleFilter === role)
          .map(([role, label]) => (
            <li key={role}>
              <button
                type="button"
                className="subsubsub-tab"
                aria-current={roleFilter === role ? 'true' : undefined}
                onClick={() => {
                  setRoleFilter(role);
                  setPage(1);
                }}
              >
                {label} <span className="count">({roleCounts[role] ?? 0})</span>
              </button>
            </li>
          ))}
      </ul>

      {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}

      <div className="search-row">
        <form className="search-form" onSubmit={handleSearch} role="search">
          <label htmlFor="user-search" className="screen-reader-text">
            Search Users
          </label>
          <input
            id="user-search"
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <button type="submit" className="button secondary-button">
            Search Users
          </button>
        </form>
      </div>

      <div className="tablenav">
        <div className="alignleft">
          <label htmlFor="users-bulk-action" className="screen-reader-text">
            Bulk actions
          </label>
          <select
            id="users-bulk-action"
            className="bulk-select"
            value={bulkAction}
            onChange={(event) => setBulkAction(event.target.value as 'delete' | '')}
          >
            <option value="">Bulk actions</option>
            <option value="delete">Delete</option>
          </select>
          <button
            type="button"
            className="button secondary-button bulk-apply"
            disabled={bulkBusy || bulkAction === '' || selected.size === 0}
            onClick={() => void runBulkAction()}
          >
            {bulkBusy ? 'Applying…' : 'Apply'}
          </button>
          <label htmlFor="users-role-action" className="screen-reader-text">
            Change role to
          </label>
          <select
            id="users-role-action"
            className="bulk-select"
            value={bulkRole}
            onChange={(event) => setBulkRole(event.target.value as UserRole | '')}
          >
            <option value="">Change role to…</option>
            <option value="administrator">Administrator</option>
            <option value="editor">Editor</option>
            <option value="author">Author</option>
            <option value="contributor">Contributor</option>
            <option value="subscriber">Subscriber</option>
          </select>
          <button
            type="button"
            className="button secondary-button bulk-apply"
            disabled={bulkBusy || bulkRole === '' || selected.size === 0}
            onClick={() => void runBulkRoleChange()}
          >
            Change
          </button>
        </div>
        <div className="alignright">
          <span className="displaying-num">{`${total} ${total === 1 ? 'item' : 'items'}`}</span>
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
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={
                        data.items.length > 0 && data.items.every((item) => selected.has(item.id))
                      }
                      onChange={() => toggleSelectAll()}
                    />
                  </th>
                  <th scope="col">Username</th>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Posts</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => {
                  const isSelf = item.id === user.id;
                  return (
                    <tr key={item.id}>
                      <th scope="row" className="check-column">
                        <input
                          type="checkbox"
                          aria-label={`Select ${item.username}`}
                          checked={selected.has(item.id)}
                          onChange={() => toggleSelected(item.id)}
                        />
                      </th>
                      <td className="username column-username">
                        <span className="user-cell">
                          <span className="user-avatar" aria-hidden="true">
                            <svg width="32" height="32" viewBox="0 0 32 32">
                              <rect width="32" height="32" rx="16" fill="#dcdcde" />
                              <circle cx="16" cy="12" r="5" fill="#a7aaad" />
                              <path d="M6 30c0-5.5 4.5-9 10-9s10 3.5 10 9" fill="#a7aaad" />
                            </svg>
                          </span>
                          <span className="row-title">{item.username}</span>
                        </span>
                        {item.status === 'disabled' ? (
                          <span className="status-badge status-draft disabled-badge">Disabled</span>
                        ) : null}
                        <div className="row-actions">
                          <button
                            type="button"
                            className="row-action-link"
                            onClick={() => openDialog('role', item)}
                          >
                            Edit
                          </button>
                          {!isSelf ? (
                            <>
                              <span className="row-action-sep" aria-hidden="true">
                                {' '}
                                |{' '}
                              </span>
                              <button
                                type="button"
                                className="row-action-link is-danger"
                                onClick={() => openDialog('delete', item)}
                              >
                                Delete
                              </button>
                            </>
                          ) : null}
                          <span className="row-action-sep" aria-hidden="true">
                            {' '}
                            |{' '}
                          </span>
                          <button
                            type="button"
                            className="row-action-link"
                            onClick={() => navigate(`/posts?author=${item.id}`)}
                          >
                            View
                          </button>
                        </div>
                      </td>
                      <td className="column-name">{item.displayName ?? '—'}</td>
                      <td className="column-email">{item.email ?? '—'}</td>
                      <td className="role column-role">{roleLabel(item.role)}</td>
                      <td className="posts column-posts">{item.postCount}</td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                <tr>
                  <th scope="col" className="check-column">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={
                        data.items.length > 0 && data.items.every((item) => selected.has(item.id))
                      }
                      onChange={() => toggleSelectAll()}
                    />
                  </th>
                  <th scope="col">Username</th>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Posts</th>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="tablenav bottom">
            <div className="alignleft">
              <label htmlFor="users-bulk-action-bottom" className="screen-reader-text">
                Bulk actions
              </label>
              <select
                id="users-bulk-action-bottom"
                className="bulk-select"
                value={bulkAction}
                onChange={(event) => setBulkAction(event.target.value as 'delete' | '')}
              >
                <option value="">Bulk actions</option>
                <option value="delete">Delete</option>
              </select>
              <button
                type="button"
                className="button secondary-button bulk-apply"
                disabled={bulkBusy || bulkAction === '' || selected.size === 0}
                onClick={() => void runBulkAction()}
              >
                {bulkBusy ? 'Applying…' : 'Apply'}
              </button>
            </div>
            <div className="alignright">
              <span className="displaying-num">{`${total} ${total === 1 ? 'item' : 'items'}`}</span>
            </div>
          </div>

          {totalPages > 1 ? (
            <nav className="pagination" aria-label="Users pagination">
              <div className="tablenav-pages">
                <span className="displaying-num">{pluralize(total, 'user')}</span>
                <span className="pagination-links">
                  <button
                    type="button"
                    className="button secondary-button pagination-button"
                    aria-label="First page"
                    title="First page"
                    disabled={page <= 1}
                    onClick={() => setPage(1)}
                  >
                    «
                  </button>
                  <button
                    type="button"
                    className="button secondary-button pagination-button"
                    aria-label="Previous page"
                    title="Previous page"
                    disabled={page <= 1}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                  >
                    ‹
                  </button>
                  <span className="page-numbers current">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    className="button secondary-button pagination-button"
                    aria-label="Next page"
                    title="Next page"
                    disabled={page >= totalPages}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    ›
                  </button>
                  <button
                    type="button"
                    className="button secondary-button pagination-button"
                    aria-label="Last page"
                    title="Last page"
                    disabled={page >= totalPages}
                    onClick={() => setPage(totalPages)}
                  >
                    »
                  </button>
                </span>
              </div>
            </nav>
          ) : null}
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
          onResetPassword={() => setDialog({ kind: 'password', target: dialog.target })}
          onToggleStatus={() => {
            const target = dialog.target;
            setDialog(null);
            if (target) void toggleStatus(target);
          }}
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

import { useEffect, useState, type FormEvent } from 'react';
import {
  actionErrorMessage,
  changeOwnPassword,
  fetchProfile,
  updateProfile,
  type AuthUser,
  type UserProfile,
} from './api.js';
import { Notice, PageHeader, Skeleton, ErrorState, type NoticeMessage } from './components.js';
import { formatDateTime } from './format.js';
import { roleLabel } from './roles.js';

const MIN_PASSWORD_LENGTH = 8;

export function ProfilePage({
  user,
  onProfileUpdated,
}: {
  user: AuthUser;
  onProfileUpdated?: (u: { username: string }) => void;
}) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);

  const [username, setUsername] = useState(user.username);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [accountError, setAccountError] = useState<string | null>(null);
  const [savingAccount, setSavingAccount] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);

    fetchProfile()
      .then((result) => {
        if (!active) return;
        setProfile(result);
        setUsername(result.username);
        setDisplayName(result.displayName ?? '');
        setEmail(result.email ?? '');
        setLoading(false);
      })
      .catch((caught) => {
        if (!active) return;
        setLoadError(actionErrorMessage(caught));
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reloadKey]);

  async function handleAccountSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingAccount || !profile) return;
    const name = username.trim();
    if (!name) {
      setAccountError('Username is required.');
      return;
    }
    const nextDisplayName = displayName.trim();
    const nextEmail = email.trim();
    if (
      name === profile.username &&
      nextDisplayName === (profile.displayName ?? '') &&
      nextEmail === (profile.email ?? '')
    ) {
      setAccountError(null);
      setNotice({ tone: 'info', text: 'No changes to save.' });
      return;
    }
    setSavingAccount(true);
    setAccountError(null);
    setNotice(null);
    try {
      const updated = await updateProfile({
        username: name,
        displayName: nextDisplayName ? nextDisplayName : null,
        email: nextEmail ? nextEmail : null,
      });
      setProfile(updated);
      setUsername(updated.username);
      setDisplayName(updated.displayName ?? '');
      setEmail(updated.email ?? '');
      setNotice({ tone: 'success', text: 'Profile updated.' });
      onProfileUpdated?.({ username: updated.username });
    } catch (caught) {
      setAccountError(actionErrorMessage(caught));
    } finally {
      setSavingAccount(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingPassword) return;
    if (!currentPassword) {
      setPasswordError('Current password is required.');
      return;
    }
    if (!newPassword) {
      setPasswordError('New password is required.');
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('The new passwords do not match.');
      return;
    }
    setSavingPassword(true);
    setPasswordError(null);
    setNotice(null);
    try {
      await changeOwnPassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setNotice({ tone: 'success', text: 'Password updated.' });
    } catch (caught) {
      setPasswordError(actionErrorMessage(caught));
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Users"
        title="Profile"
        description={`Account settings for ${user.username}.`}
      />

      {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}

      {loadError ? (
        <ErrorState
          title="Could not load your profile"
          message={loadError}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      ) : loading ? (
        <Skeleton label="Loading profile…" lines={4} />
      ) : profile ? (
        <div className="form-main">
          <section className="content-card" aria-labelledby="profile-account-heading">
            <h2 id="profile-account-heading">Account</h2>
            <form onSubmit={handleAccountSubmit} aria-label="Account details">
              <div className="field">
                <label htmlFor="profile-username">Username</label>
                <input
                  id="profile-username"
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  disabled={savingAccount}
                  autoComplete="username"
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="profile-name">Name</label>
                <input
                  id="profile-name"
                  type="text"
                  maxLength={100}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  disabled={savingAccount}
                  autoComplete="name"
                />
              </div>

              <div className="field">
                <label htmlFor="profile-email">Email</label>
                <input
                  id="profile-email"
                  type="email"
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={savingAccount}
                  autoComplete="email"
                />
              </div>

              <div className="meta-grid">
                <div>
                  <span className="meta-label">Role</span>
                  <span>{roleLabel(profile.role)}</span>
                </div>
                <div>
                  <span className="meta-label">Registered</span>
                  <span>{formatDateTime(profile.createdAt)}</span>
                </div>
              </div>

              {accountError ? (
                <p className="form-error" role="alert">
                  {accountError}
                </p>
              ) : null}

              <div className="side-actions">
                <button
                  type="submit"
                  className="button primary-button"
                  disabled={savingAccount}
                  aria-busy={savingAccount}
                >
                  {savingAccount ? 'Saving…' : 'Save Profile'}
                </button>
              </div>
            </form>
          </section>

          <section className="content-card" aria-labelledby="profile-password-heading">
            <h2 id="profile-password-heading">Change password</h2>
            <form onSubmit={handlePasswordSubmit} aria-label="Change password">
              <div className="field">
                <label htmlFor="profile-current-password">Current password</label>
                <input
                  id="profile-current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  disabled={savingPassword}
                  autoComplete="current-password"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="profile-new-password">New password</label>
                <input
                  id="profile-new-password"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  disabled={savingPassword}
                  autoComplete="new-password"
                  required
                />
                <p className="field-help">
                  At least {MIN_PASSWORD_LENGTH} characters. The server may require more.
                </p>
              </div>
              <div className="field">
                <label htmlFor="profile-confirm-password">Confirm new password</label>
                <input
                  id="profile-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  disabled={savingPassword}
                  autoComplete="new-password"
                  required
                />
              </div>

              {passwordError ? (
                <p className="form-error" role="alert">
                  {passwordError}
                </p>
              ) : null}

              <div className="side-actions">
                <button
                  type="submit"
                  className="button primary-button"
                  disabled={savingPassword}
                  aria-busy={savingPassword}
                >
                  {savingPassword ? 'Updating…' : 'Update Password'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}

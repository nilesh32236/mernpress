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
  const [bio, setBio] = useState('');
  const [website, setWebsite] = useState('');
  const [accountError, setAccountError] = useState<string | null>(null);
  const [savingAccount, setSavingAccount] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

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
        setBio(result.bio ?? '');
        setWebsite(result.website ?? '');
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
    const nextBio = bio.trim();
    const nextWebsite = website.trim();
    if (
      name === profile.username &&
      nextDisplayName === (profile.displayName ?? '') &&
      nextEmail === (profile.email ?? '') &&
      nextBio === (profile.bio ?? '') &&
      nextWebsite === (profile.website ?? '')
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
        bio: nextBio ? nextBio : null,
        website: nextWebsite ? nextWebsite : null,
      });
      setProfile(updated);
      setUsername(updated.username);
      setDisplayName(updated.displayName ?? '');
      setEmail(updated.email ?? '');
      setBio(updated.bio ?? '');
      setWebsite(updated.website ?? '');
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
      <PageHeader title="Profile" />

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
        <div className="settings-panel profile-panel">
          <form onSubmit={handleAccountSubmit} aria-label="Account details">
            <h2 className="profile-section-title">Name</h2>
            <div className="field">
              <label htmlFor="profile-username">Username</label>
              <div>
                <input
                  id="profile-username"
                  type="text"
                  value={username}
                  readOnly
                  disabled
                  autoComplete="username"
                />
                <p className="field-help">Usernames cannot be changed.</p>
              </div>
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

            <h2 className="profile-section-title">Contact Info</h2>
            <div className="field">
              <label htmlFor="profile-email">Email (required)</label>
              <div>
                <input
                  id="profile-email"
                  type="email"
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={savingAccount}
                  autoComplete="email"
                />
                <p className="field-help">
                  This address is used for admin purposes and notifications.
                </p>
              </div>
            </div>
            <div className="field">
              <label htmlFor="profile-website">Website</label>
              <input
                id="profile-website"
                type="url"
                maxLength={2048}
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                disabled={savingAccount}
              />
            </div>

            <h2 className="profile-section-title">About Yourself</h2>
            <div className="field">
              <label htmlFor="profile-bio">Biographical Info</label>
              <div>
                <textarea
                  id="profile-bio"
                  rows={5}
                  maxLength={2000}
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  disabled={savingAccount}
                />
                <p className="field-help">
                  Share a little biographical information to fill out your profile.
                </p>
              </div>
            </div>
            <div className="field">
              <span className="field-label">Profile Picture</span>
              <div className="profile-picture">
                <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
                  <rect width="96" height="96" fill="#dcdcde" />
                  <circle cx="48" cy="36" r="15" fill="#a7aaad" />
                  <path d="M18 90c0-16.5 13.5-27 30-27s30 10.5 30 27" fill="#a7aaad" />
                </svg>
                <p className="field-help">
                  You can change your profile picture on{' '}
                  <a href="https://gravatar.com" target="_blank" rel="noreferrer">
                    Gravatar
                  </a>
                  .
                </p>
              </div>
            </div>

            {accountError ? (
              <p className="form-error" role="alert">
                {accountError}
              </p>
            ) : null}

            <p className="profile-submit">
              <button
                type="submit"
                className="button primary-button"
                disabled={savingAccount}
                aria-busy={savingAccount}
              >
                {savingAccount ? 'Saving…' : 'Update Profile'}
              </button>
            </p>
          </form>

          <form onSubmit={handlePasswordSubmit} aria-label="Change password">
            <h2 className="profile-section-title">Account Management</h2>
            {!passwordOpen ? (
              <p className="profile-submit">
                <button
                  type="button"
                  className="button secondary-button"
                  onClick={() => setPasswordOpen(true)}
                >
                  Set New Password
                </button>
              </p>
            ) : (
              <>
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
                  <div>
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

                <p className="profile-submit">
                  <button
                    type="submit"
                    className="button primary-button"
                    disabled={savingPassword}
                    aria-busy={savingPassword}
                  >
                    {savingPassword ? 'Updating…' : 'Update Password'}
                  </button>
                </p>
              </>
            )}
          </form>
        </div>
      ) : null}
    </>
  );
}

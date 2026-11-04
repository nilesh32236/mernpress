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
import { COLOR_SCHEMES, applyColorScheme, getColorScheme } from './colorScheme.js';
import {
  infiniteScrollEnabled,
  keyboardShortcutsEnabled,
  setInfiniteScroll,
  setKeyboardShortcuts,
  setToolbar,
  toolbarEnabled,
} from './preferences.js';

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
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  const [adminColor, setAdminColor] = useState(getColorScheme);
  const [shortcutsEnabled, setShortcutsEnabled] = useState(() => keyboardShortcutsEnabled());
  const [showToolbar, setShowToolbar] = useState(() => toolbarEnabled());
  const [disableInfiniteScroll, setDisableInfiniteScroll] = useState(
    () => !infiniteScrollEnabled(),
  );
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
        setFirstName(result.firstName ?? '');
        setLastName(result.lastName ?? '');
        setNickname(result.nickname ?? '');
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
    const nextFirstName = firstName.trim();
    const nextLastName = lastName.trim();
    const nextNickname = nickname.trim();
    const nextEmail = email.trim();
    const nextBio = bio.trim();
    const nextWebsite = website.trim();
    if (
      name === profile.username &&
      nextDisplayName === (profile.displayName ?? '') &&
      nextFirstName === (profile.firstName ?? '') &&
      nextLastName === (profile.lastName ?? '') &&
      nextNickname === (profile.nickname ?? '') &&
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
        firstName: nextFirstName ? nextFirstName : null,
        lastName: nextLastName ? nextLastName : null,
        nickname: nextNickname ? nextNickname : null,
        email: nextEmail ? nextEmail : null,
        bio: nextBio ? nextBio : null,
        website: nextWebsite ? nextWebsite : null,
      });
      setProfile(updated);
      setUsername(updated.username);
      setDisplayName(updated.displayName ?? '');
      setFirstName(updated.firstName ?? '');
      setLastName(updated.lastName ?? '');
      setNickname(updated.nickname ?? '');
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

  const displayNameChoices: string[] = [];
  const addChoice = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (trimmed && !displayNameChoices.includes(trimmed)) displayNameChoices.push(trimmed);
  };
  addChoice(username);
  addChoice(firstName);
  addChoice(lastName);
  addChoice(nickname);
  if (firstName.trim() && lastName.trim()) {
    addChoice(`${firstName.trim()} ${lastName.trim()}`);
    addChoice(`${lastName.trim()} ${firstName.trim()}`);
  }
  addChoice(displayName);

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
            <h2 className="profile-section-title">Personal Options</h2>
            <div className="field">
              <span className="field-label">Administration Color Scheme</span>
              <fieldset
                className="scheme-list"
                role="radiogroup"
                aria-label="Administration Color Scheme"
              >
                <legend className="screen-reader-text">Administration Color Scheme</legend>
                {COLOR_SCHEMES.map((scheme) => (
                  <div
                    key={scheme.id}
                    className={`color-option${adminColor === scheme.id ? ' selected' : ''}`}
                  >
                    <input
                      id={`admin_color_${scheme.id}`}
                      type="radio"
                      name="admin_color"
                      value={scheme.id}
                      checked={adminColor === scheme.id}
                      onChange={() => {
                        setAdminColor(scheme.id);
                        applyColorScheme(scheme.id);
                      }}
                    />
                    <label htmlFor={`admin_color_${scheme.id}`}>{scheme.label}</label>
                    <div className="color-palette" aria-hidden="true">
                      {scheme.swatch.map((color, index) => (
                        <div
                          key={`${scheme.id}-${index}`}
                          className="color-palette-shade"
                          style={{ backgroundColor: color }}
                        >
                          &nbsp;
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </fieldset>
            </div>

            <div className="field">
              <span className="field-label">Keyboard Shortcuts</span>
              <div>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={shortcutsEnabled}
                    onChange={(event) => {
                      setShortcutsEnabled(event.target.checked);
                      setKeyboardShortcuts(event.target.checked);
                    }}
                  />
                  <span>Enable the command palette shortcut (Ctrl/Cmd+K)</span>
                </label>
              </div>
            </div>

            <div className="field">
              <span className="field-label">Toolbar</span>
              <div>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={showToolbar}
                    onChange={(event) => {
                      setShowToolbar(event.target.checked);
                      setToolbar(event.target.checked);
                    }}
                  />
                  <span>Show Toolbar when viewing site</span>
                </label>
              </div>
            </div>

            <div className="field">
              <span className="field-label">Infinite Scrolling</span>
              <div>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={disableInfiniteScroll}
                    onChange={(event) => {
                      setDisableInfiniteScroll(event.target.checked);
                      setInfiniteScroll(!event.target.checked);
                    }}
                  />
                  <span>Disable infinite scrolling in the Media Library grid view</span>
                </label>
              </div>
            </div>

            <h2 className="profile-section-title">Name</h2>
            <div className="field">
              <label htmlFor="profile-username">Username</label>
              <div className="profile-username-row">
                <input
                  id="profile-username"
                  type="text"
                  value={username}
                  readOnly
                  disabled
                  autoComplete="username"
                />
                <span className="field-help">Usernames cannot be changed.</span>
              </div>
            </div>

            <div className="field">
              <label htmlFor="profile-first-name">First Name</label>
              <input
                id="profile-first-name"
                type="text"
                maxLength={100}
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                disabled={savingAccount}
                autoComplete="given-name"
              />
            </div>

            <div className="field">
              <label htmlFor="profile-last-name">Last Name</label>
              <input
                id="profile-last-name"
                type="text"
                maxLength={100}
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                disabled={savingAccount}
                autoComplete="family-name"
              />
            </div>

            <div className="field">
              <label htmlFor="profile-nickname">Nickname</label>
              <input
                id="profile-nickname"
                type="text"
                maxLength={100}
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                disabled={savingAccount}
                autoComplete="nickname"
              />
            </div>

            <div className="field">
              <label htmlFor="profile-display-name">Display name publicly as</label>
              <select
                id="profile-display-name"
                value={displayName || username}
                onChange={(event) => setDisplayName(event.target.value)}
                disabled={savingAccount}
              >
                {displayNameChoices.map((choice) => (
                  <option key={choice} value={choice}>
                    {choice}
                  </option>
                ))}
              </select>
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

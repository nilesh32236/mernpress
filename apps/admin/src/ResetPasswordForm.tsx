import { useState, type FormEvent } from 'react';
import { actionErrorMessage, resetPassword } from './api.js';
import { ADMIN_BASE } from './router.js';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Reset screen reached from the lost-password e-mail
 * (`/admin/?action=rp&key=…&login=…`). The token is single-use and expires;
 * the server revalidates it and enforces the password policy.
 */
export function ResetPasswordForm({ resetKey, login }: { resetKey: string; login: string }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('The passwords do not match.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await resetPassword({ key: resetKey, login, password });
      setPassword('');
      setConfirm('');
      setDone(true);
    } catch (caught) {
      setError(actionErrorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="login-screen" aria-labelledby="reset-password-heading">
      <div className="login-logo" aria-hidden="true">
        <span>M</span>
      </div>
      <div className="login-card">
        <h1 id="reset-password-heading">Reset Password</h1>
        {done ? (
          <>
            <p className="login-help" role="status">
              Your password has been reset. You can now log in with your new password.
            </p>
            <p className="login-submit">
              <a className="button primary-button button-large" href={`${ADMIN_BASE}/`}>
                Log In
              </a>
            </p>
          </>
        ) : (
          <>
            <p className="login-help">
              Enter your new password below for the account <strong>{login}</strong>.
            </p>
            <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
              {error ? (
                <p className="login-error" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="field">
                <label htmlFor="reset-password">New password</label>
                <input
                  id="reset-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  maxLength={128}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="field">
                <label htmlFor="reset-password-confirm">Confirm new password</label>
                <input
                  id="reset-password-confirm"
                  type="password"
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  maxLength={128}
                  required
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  disabled={submitting}
                />
              </div>
              <p className="login-submit">
                <button
                  type="submit"
                  className="button primary-button button-large"
                  disabled={submitting}
                >
                  {submitting ? 'Saving…' : 'Save Password'}
                </button>
              </p>
            </form>
            <p className="login-back">
              <a href={`${ADMIN_BASE}/`}>← Back to Log In</a>
            </p>
          </>
        )}
      </div>
    </section>
  );
}

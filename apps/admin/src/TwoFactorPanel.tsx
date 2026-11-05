import { useEffect, useState, type FormEvent } from 'react';
import {
  actionErrorMessage,
  confirmTwoFactor,
  disableTwoFactor,
  fetchTwoFactorStatus,
  regenerateRecoveryCodes,
  setupTwoFactor,
  type TwoFactorSetup,
  type TwoFactorStatus,
} from './api.js';
import { Notice, Skeleton, type NoticeMessage } from './components.js';
import { formatDateTime } from './format.js';

/**
 * Profile → Two-Factor Authentication.
 *
 * TOTP enrollment shows the secret and otpauth URL (no QR dependency), recovery
 * codes once, and requires a valid code before enabling. Disabling and
 * regenerating recovery codes require the account password.
 */
export function TwoFactorPanel() {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [confirmCode, setConfirmCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  useEffect(() => {
    let active = true;
    fetchTwoFactorStatus()
      .then((result) => {
        if (active) setStatus(result);
      })
      .catch((caught) => {
        if (active) setError(actionErrorMessage(caught));
      });
    return () => {
      active = false;
    };
  }, []);

  async function beginSetup() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setSetup(await setupTwoFactor());
      setNewCodes(null);
    } catch (caught) {
      setError(actionErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await confirmTwoFactor(confirmCode.trim());
      setStatus(next);
      setSetup(null);
      setConfirmCode('');
      setNotice({
        tone: 'success',
        text: 'Two-factor authentication enabled. Store your recovery codes safely.',
      });
    } catch (caught) {
      setError(actionErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function disable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await disableTwoFactor(password, disableCode.trim());
      setStatus(next);
      setPassword('');
      setDisableCode('');
      setNewCodes(null);
      setNotice({ tone: 'success', text: 'Two-factor authentication disabled.' });
    } catch (caught) {
      setError(actionErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function regenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await regenerateRecoveryCodes(recoveryPassword);
      setNewCodes(result.recoveryCodes);
      setRecoveryPassword('');
      setStatus((current) =>
        current ? { ...current, recoveryCodesRemaining: result.recoveryCodes.length } : current,
      );
      setNotice({ tone: 'success', text: 'New recovery codes generated.' });
    } catch (caught) {
      setError(actionErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="two-factor-panel" aria-labelledby="two-factor-heading">
      <h2 id="two-factor-heading" className="profile-section-title">
        Two-Factor Authentication
      </h2>
      {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {!status ? (
        <Skeleton label="Loading two-factor status…" lines={2} />
      ) : status.enabled ? (
        <>
          <p className="field-help">
            Enabled{status.confirmedAt ? ` on ${formatDateTime(status.confirmedAt)}` : ''}.{' '}
            {status.recoveryCodesRemaining} recovery code
            {status.recoveryCodesRemaining === 1 ? '' : 's'} remaining.
          </p>

          <form className="two-factor-form" onSubmit={(event) => void regenerate(event)}>
            <div className="field">
              <label htmlFor="two-factor-recovery-password">Password to regenerate codes</label>
              <input
                id="two-factor-recovery-password"
                type="password"
                autoComplete="current-password"
                value={recoveryPassword}
                onChange={(event) => setRecoveryPassword(event.target.value)}
                disabled={busy}
                required
              />
            </div>
            <button type="submit" className="button secondary-button" disabled={busy}>
              Regenerate recovery codes
            </button>
          </form>

          {newCodes ? (
            <div className="two-factor-codes" role="status">
              <p>Store these recovery codes now. Each works once and cannot be shown again.</p>
              <pre>{newCodes.join('\n')}</pre>
            </div>
          ) : null}

          <hr />

          <form className="two-factor-form" onSubmit={(event) => void disable(event)}>
            <p className="field-help">Disabling requires your password and a valid code.</p>
            <div className="field">
              <label htmlFor="two-factor-disable-password">Password to disable</label>
              <input
                id="two-factor-disable-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="two-factor-disable-code">Authentication code or recovery code</label>
              <input
                id="two-factor-disable-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={disableCode}
                onChange={(event) => setDisableCode(event.target.value)}
                disabled={busy}
                required
              />
            </div>
            <button type="submit" className="button is-danger" disabled={busy}>
              Disable two-factor authentication
            </button>
          </form>
        </>
      ) : setup ? (
        <>
          <p className="field-help">
            Add this secret to your authenticator app, then enter the six-digit code it shows.
          </p>
          <p>
            <strong>Secret:</strong> <code>{setup.secret}</code>
          </p>
          <p className="two-factor-uri">
            <code>{setup.otpauthUrl}</code>
          </p>
          <div className="two-factor-codes" role="status">
            <p>Recovery codes (shown once):</p>
            <pre>{setup.recoveryCodes.join('\n')}</pre>
          </div>
          <form className="two-factor-form" onSubmit={(event) => void confirm(event)}>
            <div className="field">
              <label htmlFor="two-factor-confirm-code">Six-digit code</label>
              <input
                id="two-factor-confirm-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={confirmCode}
                onChange={(event) => setConfirmCode(event.target.value)}
                disabled={busy}
                required
              />
            </div>
            <button type="submit" className="button primary-button" disabled={busy}>
              {busy ? 'Verifying…' : 'Enable two-factor authentication'}
            </button>{' '}
            <button
              type="button"
              className="button secondary-button"
              onClick={() => {
                setSetup(null);
                setConfirmCode('');
              }}
              disabled={busy}
            >
              Cancel
            </button>
          </form>
        </>
      ) : (
        <>
          <p className="field-help">
            Add a second step to sign-in using an authenticator app. You will also receive one-time
            recovery codes.
          </p>
          <button
            type="button"
            className="button primary-button"
            onClick={() => void beginSetup()}
            disabled={busy}
          >
            Enable two-factor authentication
          </button>
        </>
      )}
    </section>
  );
}

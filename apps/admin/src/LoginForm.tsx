import { useEffect, useRef, useState, type FormEvent } from 'react';
import { login, loginErrorMessage } from './api.js';
import type { AuthUser } from './api.js';

interface LoginFormProps {
  onSuccess: (user: AuthUser) => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const result = await login(username, password, remember);
      setPassword('');
      onSuccess(result.user);
    } catch (caught) {
      setError(loginErrorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="login-screen" aria-labelledby="login-heading">
      <div className="login-logo" aria-hidden="true">
        <span>M</span>
      </div>
      <div className="login-card">
        <h1 id="login-heading" className="screen-reader-text">
          MERNPress admin
        </h1>
        <form className="auth-form" onSubmit={handleSubmit}>
          {error ? (
            <p id="login-error" className="login-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="field">
            <label htmlFor="username">Username or Email Address</label>
            <input
              ref={usernameRef}
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={254}
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              aria-describedby={error ? 'login-error' : undefined}
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="login-password-wrap">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                maxLength={128}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-describedby={error ? 'login-error' : undefined}
              />
              <button
                type="button"
                className="login-show-password"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((value) => !value)}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  aria-hidden="true"
                >
                  {showPassword ? (
                    <>
                      <path d="M17.9 17.9A10.4 10.4 0 0 1 12 20C5.5 20 1.5 12 1.5 12a18.6 18.6 0 0 1 4.4-5.4" />
                      <path d="M9.9 4.2A9.5 9.5 0 0 1 12 4c6.5 0 10.5 8 10.5 8a19 19 0 0 1-2.4 3.4" />
                      <path d="M1 1l22 22" />
                    </>
                  ) : (
                    <>
                      <path d="M1.5 12S5.5 4 12 4s10.5 8 10.5 8-4 8-10.5 8S1.5 12 1.5 12Z" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  )}
                </svg>
              </button>
            </div>
          </div>

          <div className="login-submit-row">
            <label className="login-remember">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              Remember Me
            </label>
            <button
              className="button primary-button login-submit"
              type="submit"
              disabled={submitting}
              aria-busy={submitting}
            >
              {submitting ? 'Logging in…' : 'Log In'}
            </button>
          </div>
        </form>
      </div>

      <p className="login-back">
        <a href="/">← Go to MERNPress</a>
      </p>
    </section>
  );
}

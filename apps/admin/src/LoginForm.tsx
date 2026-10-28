import { useEffect, useRef, useState, type FormEvent } from 'react';
import { login, loginErrorMessage } from './api.js';
import type { AuthUser } from './api.js';

interface LoginFormProps {
  onSuccess: (user: AuthUser) => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
      const result = await login(username, password);
      setPassword('');
      onSuccess(result.user);
    } catch (caught) {
      setError(loginErrorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="login-heading">
      <p className="eyebrow">Secure admin · Phase 4</p>
      <h1 id="login-heading">MERNPress admin</h1>
      <p className="lede">
        Sign in to manage posts and pages. The block editor and media library arrive in later
        phases.
      </p>

      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="username">Username</label>
          <input
            ref={usernameRef}
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={64}
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            aria-describedby={error ? 'login-error' : undefined}
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            maxLength={128}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby={error ? 'login-error' : undefined}
          />
        </div>

        {error ? (
          <p id="login-error" className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <button
          className="primary-button"
          type="submit"
          disabled={submitting}
          aria-busy={submitting}
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="note">
        Session tokens stay in HttpOnly cookies. No token is written to localStorage or
        sessionStorage.
      </p>
    </section>
  );
}

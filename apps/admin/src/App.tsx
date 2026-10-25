import { useEffect, useState } from 'react';
import { fetchSession, logout, type AuthUser } from './api.js';
import { LoginForm } from './LoginForm.js';

export function App() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetchSession()
      .then((sessionUser) => {
        if (active) {
          setUser(sessionUser);
        }
      })
      .catch(() => {
        if (active) {
          setUser(null);
          setSessionError('Could not check your session. Check the API connection.');
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (user === undefined) {
    return (
      <div className="app-shell">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <Header />
        <main id="main-content" className="card" tabIndex={-1} aria-busy="true">
          <p className="eyebrow">Secure admin · Phase 2</p>
          <h1>MERNPress admin</h1>
          <p className="lede" role="status">
            Checking your session…
          </p>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Header />
      <main id="main-content" className="card" tabIndex={-1}>
        {user ? (
          <SignedIn user={user} onSignedOut={() => setUser(null)} />
        ) : (
          <>
            {sessionError ? (
              <p className="form-error" role="alert">
                {sessionError}
              </p>
            ) : null}
            <LoginForm
              onSuccess={(nextUser) => {
                setSessionError(null);
                setUser(nextUser);
              }}
            />
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="site-header">
      <span className="wordmark">MERNPress</span>
      <span className="phase-badge">Phase 2 · Auth</span>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <p>MERNPress foundation · authentication only; no content features are enabled.</p>
    </footer>
  );
}

function SignedIn({ user, onSignedOut }: { user: AuthUser; onSignedOut: () => void }) {
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    setSigningOut(true);
    setError(null);
    try {
      await logout();
      onSignedOut();
    } catch {
      setError('Could not sign out. Check the API connection and try again.');
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <section aria-labelledby="session-heading">
      <p className="eyebrow">Authenticated</p>
      <h1 id="session-heading">MERNPress admin</h1>
      <p className="lede">
        Signed in as <strong>{user.username}</strong>.
      </p>
      <dl className="status-list">
        <div>
          <dt>Role</dt>
          <dd>{user.role}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{user.status}</dd>
        </div>
      </dl>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <button
        className="primary-button"
        type="button"
        onClick={handleSignOut}
        disabled={signingOut}
      >
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>

      <p className="note">
        No CMS dashboard, content, editor or media feature is implemented in this slice.
      </p>
    </section>
  );
}

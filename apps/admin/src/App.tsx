import { useEffect, useRef, useState } from 'react';
import { fetchSession, logout, setUnauthorizedHandler, type AuthUser } from './api.js';
import { ContentEditor } from './ContentEditor.js';
import { ContentList } from './ContentList.js';
import { Dashboard } from './Dashboard.js';
import { LoginForm } from './LoginForm.js';
import { NavigationGuardProvider, useNavigationGuard } from './navigation-guard.js';
import { canReadContent, roleLabel } from './roles.js';
import { navigate, parseRoute, useLocation, type Route } from './router.js';

export function App() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionAttempt, setSessionAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setSessionError(null);

    fetchSession()
      .then((sessionUser) => {
        if (active) {
          setUser(sessionUser);
        }
      })
      .catch(() => {
        if (active) {
          setUser(null);
          setSessionError('Could not check your session. Check the API connection and try again.');
        }
      });

    return () => {
      active = false;
    };
  }, [sessionAttempt]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setSessionError('Your session expired. Sign in again.');
    });
    return () => setUnauthorizedHandler(undefined);
  }, []);

  if (user === undefined) {
    return (
      <div className="app-frame">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <header className="app-header">
          <a className="brand" href="/" aria-label="MERNPress admin home">
            MERNPress
          </a>
          <span className="phase-badge">Phase 4 · Content</span>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1} aria-busy="true">
          <div className="content-card">
            <p className="eyebrow">Secure admin</p>
            <h1>MERNPress admin</h1>
            <p className="lede" role="status">
              Checking your session…
            </p>
          </div>
        </main>
        <footer className="app-footer">
          <p>MERNPress content administration</p>
        </footer>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-frame">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <header className="app-header">
          <a className="brand" href="/" aria-label="MERNPress admin home">
            MERNPress
          </a>
          <span className="phase-badge">Phase 4 · Content</span>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>
          {sessionError ? (
            <div className="notice notice-error" role="alert">
              <p>{sessionError}</p>
              <button
                type="button"
                className="button secondary-button"
                onClick={() => setSessionAttempt((value) => value + 1)}
              >
                Try again
              </button>
            </div>
          ) : null}
          <LoginForm
            onSuccess={(nextUser) => {
              setSessionError(null);
              setUser(nextUser);
            }}
          />
        </main>
        <footer className="app-footer">
          <p>MERNPress content administration</p>
        </footer>
      </div>
    );
  }

  return (
    <NavigationGuardProvider>
      <SignedInApp user={user} onSignedOut={() => setUser(null)} />
    </NavigationGuardProvider>
  );
}

function SignedInApp({ user, onSignedOut }: { user: AuthUser; onSignedOut: () => void }) {
  const location = useLocation();
  const route = parseRoute(location.pathname);
  const mainRef = useRef<HTMLElement>(null);
  const previousPath = useRef(location.pathname + location.search);

  useEffect(() => {
    const current = location.pathname + location.search;
    if (previousPath.current !== current) {
      previousPath.current = current;
      mainRef.current?.focus();
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    document.title = pageTitle(route);
  }, [route]);

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <AppHeader user={user} route={route} onSignedOut={onSignedOut} />
      <main id="main-content" className="main-content" tabIndex={-1} ref={mainRef}>
        <RouteView user={user} route={route} />
      </main>
      <footer className="app-footer">
        <p>MERNPress Phase 4 · Content administration</p>
      </footer>
    </div>
  );
}

function pageTitle(route: Route): string {
  switch (route.name) {
    case 'dashboard':
      return 'MERNPress admin · Dashboard';
    case 'list':
      return `MERNPress admin · ${route.type === 'post' ? 'Posts' : 'Pages'}`;
    case 'new':
      return `MERNPress admin · New ${route.type}`;
    case 'edit':
      return `MERNPress admin · Edit ${route.type}`;
    case 'notFound':
      return 'MERNPress admin · Not found';
  }
}

function RouteView({ user, route }: { user: AuthUser; route: Route }) {
  switch (route.name) {
    case 'dashboard':
      return <Dashboard user={user} />;
    case 'list':
      return <ContentList user={user} type={route.type} />;
    case 'new':
      return <ContentEditor user={user} type={route.type} />;
    case 'edit':
      return <ContentEditor user={user} type={route.type} id={route.id} />;
    case 'notFound':
      return (
        <div className="content-card">
          <p className="eyebrow">Not found</p>
          <h1>Page not found</h1>
          <p className="lede">That admin route does not exist.</p>
          <a
            className="button primary-button"
            href="/"
            onClick={(event) => {
              event.preventDefault();
              navigate('/');
            }}
          >
            Back to dashboard
          </a>
        </div>
      );
  }
}

function AppHeader({
  user,
  route,
  onSignedOut,
}: {
  user: AuthUser;
  route: Route;
  onSignedOut: () => void;
}) {
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirmNavigation } = useNavigationGuard();

  async function handleSignOut() {
    if (!confirmNavigation()) {
      return;
    }
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
    <header className="app-header">
      <div className="header-top">
        <a className="brand" href="/" aria-label="MERNPress admin home">
          MERNPress
        </a>
        <span className="phase-badge">Phase 4 · Content</span>
      </div>
      <nav className="primary-nav" aria-label="Primary">
        <NavLink to="/" label="Dashboard" active={route.name === 'dashboard'} />
        {canReadContent(user) ? (
          <>
            <NavLink
              to="/posts"
              label="Posts"
              active={
                route.name !== 'dashboard' && route.name !== 'notFound' && route.type === 'post'
              }
            />
            <NavLink
              to="/pages"
              label="Pages"
              active={
                route.name !== 'dashboard' && route.name !== 'notFound' && route.type === 'page'
              }
            />
          </>
        ) : null}
      </nav>
      <div className="user-panel">
        <p className="user-identity">
          Signed in as <strong>{user.username}</strong>
          <span className="role-label">{roleLabel(user.role)}</span>
        </p>
        <button
          type="button"
          className="button secondary-button"
          onClick={() => void handleSignOut()}
          disabled={signingOut}
          aria-busy={signingOut}
        >
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </header>
  );
}

function NavLink({ to, label, active }: { to: string; label: string; active: boolean }) {
  const { confirmNavigation } = useNavigationGuard();
  return (
    <a
      className={`nav-link${active ? ' nav-link-active' : ''}`}
      href={to}
      aria-current={active ? 'page' : undefined}
      onClick={(event) => {
        event.preventDefault();
        if (!confirmNavigation()) {
          return;
        }
        navigate(to);
      }}
    >
      {label}
    </a>
  );
}

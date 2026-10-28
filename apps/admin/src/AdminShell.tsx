import { useEffect, useRef, useState } from 'react';
import { logout, type AuthUser } from './api.js';
import type { Route } from './router.js';
import { breadcrumbs, navigate } from './router.js';
import { Breadcrumbs, type BreadcrumbItem } from './components.js';
import { useNavigationGuard } from './navigation-guard.js';
import { canManageTerms, canReadContent, roleLabel } from './roles.js';
import type { ReactNode } from 'react';

interface AdminShellProps {
  user: AuthUser;
  route: Route;
  onSignedOut: () => void;
  children: ReactNode;
}

function topBarTitle(route: Route): string {
  switch (route.name) {
    case 'dashboard':
      return 'Dashboard';
    case 'list':
      return route.type === 'post' ? 'Posts' : 'Pages';
    case 'new':
      return `New ${route.type}`;
    case 'edit':
      return `Edit ${route.type}`;
    case 'terms':
      return 'Categories & Tags';
    case 'notFound':
      return 'Not found';
  }
}

export function AdminShell({ user, route, onSignedOut, children }: AdminShellProps) {
  const { confirmNavigation } = useNavigationGuard();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem('mernpress:sidebar-collapsed') === '1';
    } catch {
      return false;
    }
  });
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    try {
      window.localStorage.setItem('mernpress:sidebar-collapsed', collapsed ? '1' : '0');
    } catch {
      // ignore storage errors
    }
  }, [collapsed]);
  const previousPath = useRef(
    typeof window === 'undefined' ? '' : window.location.pathname + window.location.search,
  );

  useEffect(() => {
    const current = window.location.pathname + window.location.search;
    if (previousPath.current !== current) {
      previousPath.current = current;
      mainRef.current?.focus();
    }
  }, [route]);

  async function handleSignOut() {
    if (!confirmNavigation()) {
      return;
    }
    setSigningOut(true);
    setSignOutError(null);
    try {
      await logout();
      onSignedOut();
    } catch {
      setSignOutError('Could not sign out. Check the API connection and try again.');
    } finally {
      setSigningOut(false);
    }
  }

  useEffect(() => {
    if (mobileOpen && !wasOpen.current) {
      wasOpen.current = true;
      const firstLink = sidebarRef.current?.querySelector<HTMLElement>('a, button');
      firstLink?.focus();
    }
    if (!mobileOpen && wasOpen.current) {
      wasOpen.current = false;
      toggleRef.current?.focus();
    }
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }
      const container = sidebarRef.current;
      if (!container) {
        return;
      }
      const focusable = container.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  const breadcrumbItems: BreadcrumbItem[] = breadcrumbs(route);

  const navItems: Array<{ to: string; label: string; active: boolean; show: boolean }> = [
    { to: '/', label: 'Dashboard', active: route.name === 'dashboard', show: true },
    {
      to: '/posts',
      label: 'Posts',
      active:
        route.name !== 'dashboard' &&
        route.name !== 'notFound' &&
        'type' in route &&
        route.type === 'post',
      show: canReadContent(user),
    },
    {
      to: '/pages',
      label: 'Pages',
      active:
        route.name !== 'dashboard' &&
        route.name !== 'notFound' &&
        'type' in route &&
        route.type === 'page',
      show: canReadContent(user),
    },
    { to: '/terms', label: 'Terms', active: route.name === 'terms', show: canManageTerms(user) },
  ];

  return (
    <div
      className={`app-shell${collapsed ? ' sidebar-collapsed' : ''}${mobileOpen ? ' sidebar-open' : ''}`}
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      {mobileOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        id="admin-sidebar"
        className="admin-sidebar"
        aria-label="Primary navigation"
        ref={sidebarRef}
      >
        <div className="sidebar-brand">
          <a
            className="brand"
            href="/"
            aria-label="MERNPress admin home"
            onClick={(e) => {
              e.preventDefault();
              if (confirmNavigation()) navigate('/');
            }}
          >
            <span className="brand-mark">M</span>
            <span className="brand-text">MERNPress</span>
          </a>
          <span className="phase-badge">Phase 4 · Content</span>
        </div>
        <nav className="sidebar-nav" aria-label="Content">
          <p className="nav-group-label">Content</p>
          <ul>
            {navItems
              .filter((item) => item.show)
              .map((item) => (
                <li key={item.to}>
                  <a
                    className={`nav-link${item.active ? ' nav-link-active' : ''}`}
                    href={item.to}
                    aria-current={item.active ? 'page' : undefined}
                    aria-label={item.label}
                    onClick={(event) => {
                      event.preventDefault();
                      if (!confirmNavigation()) {
                        return;
                      }
                      navigate(item.to);
                      setMobileOpen(false);
                    }}
                  >
                    <span className="nav-link-text">{item.label}</span>
                  </a>
                </li>
              ))}
          </ul>
        </nav>
      </aside>

      <div className="admin-main">
        <header className="top-bar">
          <div className="top-bar-left">
            <button
              type="button"
              className="icon-button sidebar-toggle"
              ref={toggleRef}
              aria-expanded={mobileOpen}
              aria-controls="admin-sidebar"
              aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
              onClick={() => setMobileOpen((value) => !value)}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <button
              type="button"
              className="icon-button sidebar-collapse-toggle"
              aria-expanded={!collapsed}
              aria-controls="admin-sidebar"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={() => setCollapsed((value) => !value)}
            >
              {collapsed ? (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="9 6 15 12 9 18" />
                </svg>
              ) : (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="15 6 9 12 15 18" />
                </svg>
              )}
            </button>
            <h1 className="top-bar-title">{topBarTitle(route)}</h1>
          </div>
          <div className="top-bar-right">
            <div className="user-panel">
              <p className="user-identity">
                <strong>{user.username}</strong>
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
              {signOutError ? (
                <p className="form-error" role="alert">
                  {signOutError}
                </p>
              ) : null}
            </div>
          </div>
        </header>

        <main id="main-content" className="main-content" tabIndex={-1} ref={mainRef}>
          <Breadcrumbs
            items={breadcrumbItems}
            onNavigate={(to) => {
              if (confirmNavigation()) {
                navigate(to);
              }
            }}
          />
          {children}
        </main>

        <footer className="app-footer">
          <p>MERNPress Phase 4 · Content administration</p>
        </footer>
      </div>
    </div>
  );
}

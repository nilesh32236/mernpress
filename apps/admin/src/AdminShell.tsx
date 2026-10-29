import { useEffect, useRef, useState } from 'react';
import { logout, type AuthUser } from './api.js';
import type { Route } from './router.js';
import { breadcrumbs, navigate } from './router.js';
import { ADMIN_BASE } from './router.js';
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
    case 'users':
      return 'Users';
    case 'profile':
      return 'Profile';
    case 'settings':
      return 'Settings';
    case 'notFound':
      return 'Not found';
  }
}

export function AdminShell({ user, route, onSignedOut, children }: AdminShellProps) {
  const { confirmNavigation } = useNavigationGuard();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);

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
  // The editor is a focused workspace with its own header; a shell breadcrumb
  // would duplicate navigation and sit behind the editor toolbar.
  const isEditorRoute = route.name === 'new' || route.name === 'edit';

  const navItems: Array<{
    to: string;
    label: string;
    active: boolean;
    show: boolean;
    icon: ReactNode;
  }> = [
    {
      to: '/',
      label: 'Dashboard',
      active: route.name === 'dashboard',
      show: true,
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="7" height="9" />
          <rect x="14" y="3" width="7" height="5" />
          <rect x="14" y="12" width="7" height="9" />
          <rect x="3" y="16" width="7" height="5" />
        </svg>
      ),
    },
    {
      to: '/posts',
      label: 'Posts',
      active:
        route.name !== 'dashboard' &&
        route.name !== 'notFound' &&
        'type' in route &&
        route.type === 'post',
      show: canReadContent(user),
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      ),
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
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      ),
    },
    {
      to: '/terms',
      label: 'Terms',
      active: route.name === 'terms',
      show: canManageTerms(user),
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.24H4a1 1 0 0 0-1 1v5.59a2 2 0 0 0 .59 1.41l9.58 9.59a2 2 0 0 0 2.83 0l4.59-4.59a2 2 0 0 0 0-2.83z" />
          <circle cx="7.5" cy="7.5" r="1" />
        </svg>
      ),
    },
    {
      to: '/users',
      label: 'Users',
      active: route.name === 'users',
      show: user.role === 'administrator',
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      to: '/settings',
      label: 'Settings',
      active: route.name === 'settings',
      show: user.role === 'administrator',
      icon: (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
    },
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
            href={ADMIN_BASE}
            aria-label="MERNPress admin home"
            onClick={(e) => {
              e.preventDefault();
              if (confirmNavigation()) navigate('/admin');
            }}
          >
            <span className="brand-mark">M</span>
            <span className="brand-text">MERNPress</span>
          </a>
        </div>
        <nav className="sidebar-nav" aria-label="Primary">
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
                    onClick={(event) => {
                      event.preventDefault();
                      if (!confirmNavigation()) {
                        return;
                      }
                      navigate(item.to);
                      setMobileOpen(false);
                    }}
                  >
                    <span className="nav-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span className="nav-link-text">{item.label}</span>
                  </a>
                </li>
              ))}
          </ul>
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <a
              className="sidebar-user-name sidebar-profile-link"
              href="/profile"
              aria-label={`Profile for ${user.username}`}
              onClick={(event) => {
                event.preventDefault();
                if (confirmNavigation()) {
                  navigate('/profile');
                  setMobileOpen(false);
                }
              }}
            >
              {user.username}
            </a>
            <p className="sidebar-user-role">{roleLabel(user.role)}</p>
          </div>
          <button
            type="button"
            className="button secondary-button sidebar-signout"
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
            {isEditorRoute ? null : (
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
            )}
            {isEditorRoute ? null : <span className="top-bar-title">{topBarTitle(route)}</span>}
          </div>
          <div className="top-bar-right" />
        </header>

        <main
          id="main-content"
          className={`main-content${isEditorRoute ? ' main-content-editor' : ''}`}
          tabIndex={-1}
          ref={mainRef}
        >
          {isEditorRoute ? (
            children
          ) : (
            <div className="main-content-inner">
              <Breadcrumbs
                items={breadcrumbItems}
                onNavigate={(to) => {
                  if (confirmNavigation()) {
                    navigate(to);
                  }
                }}
              />
              {children}
            </div>
          )}
        </main>

        <footer className="app-footer">
          <p>MERNPress Content administration</p>
        </footer>
      </div>
    </div>
  );
}

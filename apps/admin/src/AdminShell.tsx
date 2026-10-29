import { useEffect, useRef, useState } from 'react';
import { logout, type AuthUser } from './api.js';
import type { Route } from './router.js';
import { breadcrumbs, navigate, newContentPath } from './router.js';
import { ADMIN_BASE } from './router.js';
import { Breadcrumbs, type BreadcrumbItem } from './components.js';
import { useNavigationGuard } from './navigation-guard.js';
import { canCreateContent, canManageTerms, canReadContent, roleLabel } from './roles.js';
import type { ReactNode } from 'react';

interface AdminShellProps {
  user: AuthUser;
  route: Route;
  onSignedOut: () => void;
  children: ReactNode;
}

interface SubItem {
  label: string;
  to: string;
  active: boolean;
}

interface NavEntry {
  to: string;
  label: string;
  active: boolean;
  show: boolean;
  icon: ReactNode;
  subs: SubItem[];
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

function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '••';
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return trimmed.substring(0, 2).toUpperCase();
}

function DashboardIcon() {
  return (
    <svg
      width="17"
      height="17"
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
  );
}

function PostIcon() {
  return (
    <svg
      width="17"
      height="17"
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
  );
}

function PageIcon() {
  return (
    <svg
      width="17"
      height="17"
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
  );
}

function TagIcon() {
  return (
    <svg
      width="17"
      height="17"
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
  );
}

function UsersIcon() {
  return (
    <svg
      width="17"
      height="17"
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
  );
}

function SettingsIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function AdminShell({ user, route, onSignedOut, children }: AdminShellProps) {
  const { confirmNavigation } = useNavigationGuard();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
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

  // Escape closes the top-bar dropdowns without stealing the sidebar logic.
  useEffect(() => {
    if (!newMenuOpen && !userMenuOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setNewMenuOpen(false);
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [newMenuOpen, userMenuOpen]);

  const breadcrumbItems: BreadcrumbItem[] = breadcrumbs(route);
  // The editor is a focused workspace with its own header; a shell breadcrumb
  // would duplicate navigation and sit behind the editor toolbar.
  const isEditorRoute = route.name === 'new' || route.name === 'edit';

  const isPostRoute =
    route.name !== 'dashboard' &&
    route.name !== 'notFound' &&
    'type' in route &&
    route.type === 'post';
  const isPageRoute =
    route.name !== 'dashboard' &&
    route.name !== 'notFound' &&
    'type' in route &&
    route.type === 'page';
  const isAdmin = user.role === 'administrator';
  const canCreate = canCreateContent(user);
  const hash = typeof window === 'undefined' ? '' : window.location.hash;

  const navItems: NavEntry[] = [
    {
      to: '/',
      label: 'Dashboard',
      active: route.name === 'dashboard',
      show: true,
      icon: <DashboardIcon />,
      subs: [{ label: 'Home', to: '/', active: route.name === 'dashboard' }],
    },
    {
      to: '/posts',
      label: 'Posts',
      active: isPostRoute,
      show: canReadContent(user),
      icon: <PostIcon />,
      subs: [
        {
          label: 'All Posts',
          to: '/posts',
          active: route.name === 'list' && route.type === 'post',
        },
        ...(canCreate
          ? [
              {
                label: 'Add New',
                to: newContentPath('post'),
                active: route.name === 'new' && route.type === 'post',
              },
            ]
          : []),
        ...(canManageTerms(user)
          ? [{ label: 'Categories & Tags', to: '/terms', active: route.name === 'terms' }]
          : []),
      ],
    },
    {
      to: '/pages',
      label: 'Pages',
      active: isPageRoute,
      show: canReadContent(user),
      icon: <PageIcon />,
      subs: [
        {
          label: 'All Pages',
          to: '/pages',
          active: route.name === 'list' && route.type === 'page',
        },
        ...(canCreate
          ? [
              {
                label: 'Add New',
                to: newContentPath('page'),
                active: route.name === 'new' && route.type === 'page',
              },
            ]
          : []),
      ],
    },
    {
      to: '/terms',
      label: 'Terms',
      active: route.name === 'terms',
      show: canManageTerms(user) && !isPostRoute,
      icon: <TagIcon />,
      subs: [],
    },
    {
      to: '/users',
      label: 'Users',
      active: route.name === 'users' || route.name === 'profile',
      show: isAdmin,
      icon: <UsersIcon />,
      subs: [
        { label: 'All Users', to: '/users', active: route.name === 'users' },
        { label: 'Profile', to: '/profile', active: route.name === 'profile' },
      ],
    },
    {
      to: '/settings',
      label: 'Settings',
      active: route.name === 'settings',
      show: isAdmin,
      icon: <SettingsIcon />,
      subs: [
        {
          label: 'General',
          to: '/settings',
          active: route.name === 'settings' && (hash === '' || hash === '#general'),
        },
        {
          label: 'Reading',
          to: '/settings#reading',
          active: route.name === 'settings' && hash === '#reading',
        },
        {
          label: 'Writing',
          to: '/settings#writing',
          active: route.name === 'settings' && hash === '#writing',
        },
      ],
    },
  ];

  function go(to: string) {
    if (!confirmNavigation()) {
      return;
    }
    navigate(to);
    setMobileOpen(false);
    setNewMenuOpen(false);
    setUserMenuOpen(false);
  }

  function toggleExpanded(label: string) {
    setExpanded((current) => ({ ...current, [label]: !(current[label] ?? false) }));
  }

  const visibleItems = navItems.filter((item) => item.show);
  const railMode = collapsed;

  return (
    <div
      className={`wp-shell${collapsed ? ' sidebar-collapsed' : ''}${mobileOpen ? ' sidebar-open' : ''}`}
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      {/* Dark admin bar across the full width, above sidebar + content. */}
      <header className="admin-bar" aria-label="Admin toolbar">
        <div className="admin-bar-left">
          <button
            type="button"
            className="admin-bar-icon-button sidebar-toggle"
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
          <a
            className="admin-bar-brand"
            href={ADMIN_BASE}
            aria-label="MERNPress admin home"
            onClick={(e) => {
              e.preventDefault();
              go('/admin');
            }}
          >
            <span className="brand-mark" aria-hidden="true">
              M
            </span>
            <span className="brand-text">MERNPress</span>
          </a>
          <a
            className="visit-site-pill"
            href="/"
            target="_blank"
            rel="noreferrer"
            title="Visit public site"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span>Visit Site</span>
          </a>
          {canCreate ? (
            <div className={`admin-bar-menu${newMenuOpen ? ' is-open' : ''}`}>
              <button
                type="button"
                className="admin-bar-new"
                aria-expanded={newMenuOpen}
                aria-label="New content menu"
                onClick={() => {
                  setNewMenuOpen((value) => !value);
                  setUserMenuOpen(false);
                }}
              >
                <span aria-hidden="true" className="plus-mark">
                  +
                </span>
                <span>New</span>
                <span className="chev" aria-hidden="true">
                  <ChevronDownIcon />
                </span>
              </button>
              <div className="admin-bar-pop" role="presentation">
                <a
                  href={newContentPath('post')}
                  tabIndex={newMenuOpen ? undefined : -1}
                  onClick={(e) => {
                    e.preventDefault();
                    go(newContentPath('post'));
                  }}
                >
                  <PostIcon />
                  <span>Post</span>
                </a>
                <a
                  href={newContentPath('page')}
                  tabIndex={newMenuOpen ? undefined : -1}
                  onClick={(e) => {
                    e.preventDefault();
                    go(newContentPath('page'));
                  }}
                >
                  <PageIcon />
                  <span>Page</span>
                </a>
                {isAdmin ? (
                  <a
                    href="/users"
                    tabIndex={newMenuOpen ? undefined : -1}
                    onClick={(e) => {
                      e.preventDefault();
                      go('/users');
                    }}
                  >
                    <UsersIcon />
                    <span>User</span>
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}
          {isEditorRoute ? null : <span className="top-bar-title">{topBarTitle(route)}</span>}
        </div>
        <div className="admin-bar-right">
          <div className={`admin-bar-menu user-menu${userMenuOpen ? ' is-open' : ''}`}>
            <button
              type="button"
              className="admin-bar-user"
              aria-expanded={userMenuOpen}
              aria-label="User profile menu"
              onClick={() => {
                setUserMenuOpen((value) => !value);
                setNewMenuOpen(false);
              }}
            >
              <span className="hello-name">Hello, {user.username}</span>
              <span className="avatar-circle" aria-hidden="true">
                {initials(user.username)}
              </span>
              <span className="chev" aria-hidden="true">
                <ChevronDownIcon />
              </span>
            </button>
            {/* Always mounted so the single 'Sign out' button is queryable;
                hidden with opacity/pointer-events only (never display:none). */}
            <div className="admin-bar-pop" role="presentation">
              <a
                href="/profile"
                tabIndex={userMenuOpen ? undefined : -1}
                onClick={(e) => {
                  e.preventDefault();
                  go('/profile');
                }}
              >
                <UsersIcon />
                <span>Profile</span>
              </a>
              <button
                type="button"
                tabIndex={userMenuOpen ? undefined : -1}
                onClick={() => void handleSignOut()}
                disabled={signingOut}
                aria-busy={signingOut}
              >
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
              </button>
            </div>
          </div>
        </div>
      </header>
      {newMenuOpen || userMenuOpen ? (
        <button
          type="button"
          className="menu-backdrop"
          aria-label="Close menus"
          onClick={() => {
            setNewMenuOpen(false);
            setUserMenuOpen(false);
          }}
        />
      ) : null}

      <div className="shell-body">
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
          <button
            type="button"
            className="collapse-toggle"
            aria-label={railMode ? 'Expand menu' : 'Collapse menu'}
            title={railMode ? 'Expand menu' : 'Collapse menu'}
            onClick={() => {
              if (!mobileOpen) {
                setCollapsed((value) => !value);
              } else {
                setMobileOpen(false);
              }
            }}
          >
            {railMode && !mobileOpen ? (
              <>
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
                  <polyline points="13 17 18 12 13 7" />
                  <polyline points="6 17 11 12 6 7" />
                </svg>
              </>
            ) : (
              <>
                <span className="collapse-label">
                  {mobileOpen ? 'Close menu' : 'Collapse menu'}
                </span>
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
                  <polyline points="11 17 6 12 11 7" />
                  <polyline points="18 17 13 12 18 7" />
                </svg>
              </>
            )}
          </button>
          <nav className="sidebar-nav" aria-label="Primary">
            <ul>
              {visibleItems.map((item) => {
                const hasSubs = item.subs.length > 0;
                const isOpen = expanded[item.label] ?? item.active;
                return (
                  <li
                    key={item.to + item.label}
                    className={`nav-item${item.active ? ' is-active' : ''}${railMode && !mobileOpen ? ' rail-item' : ''}`}
                  >
                    <div className="nav-row">
                      <a
                        className={`nav-link${item.active ? ' nav-link-active' : ''}`}
                        href={item.to}
                        aria-current={item.active ? 'page' : undefined}
                        onClick={(event) => {
                          event.preventDefault();
                          go(item.subs[0]?.to ?? item.to);
                        }}
                        title={railMode && !mobileOpen ? item.label : undefined}
                      >
                        <span className="nav-icon" aria-hidden="true">
                          {item.icon}
                        </span>
                        <span className="nav-link-text">{item.label}</span>
                      </a>
                      {hasSubs ? (
                        <button
                          type="button"
                          className={`nav-chevron${isOpen ? ' is-open' : ''}`}
                          aria-label={`Toggle ${item.label} submenu`}
                          aria-expanded={isOpen}
                          onClick={() => toggleExpanded(item.label)}
                        >
                          <ChevronDownIcon />
                        </button>
                      ) : null}
                    </div>
                    {hasSubs &&
                      (railMode && !mobileOpen ? (
                        <div className="rail-flyout" aria-hidden="true">
                          <p className="rail-flyout-title">{item.label}</p>
                          {item.subs.map((sub) => (
                            <span
                              key={sub.label}
                              className={`rail-flyout-link${sub.active ? ' is-active' : ''}`}
                            >
                              {sub.label}
                            </span>
                          ))}
                        </div>
                      ) : isOpen ? (
                        <ul className="nav-submenu">
                          {item.subs.map((sub) => (
                            <li key={sub.label}>
                              <a
                                className={`nav-sublink${sub.active ? ' is-active' : ''}`}
                                href={sub.to}
                                aria-current={sub.active ? 'page' : undefined}
                                onClick={(event) => {
                                  event.preventDefault();
                                  go(sub.to);
                                }}
                              >
                                <span className="sub-dot" aria-hidden="true" />
                                <span>{sub.label}</span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : null)}
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="sidebar-footer">
            <div className="sidebar-user">
              <p className="sidebar-user-name" aria-hidden="true">
                {user.username}
              </p>
              <p className="sidebar-user-role">{roleLabel(user.role)}</p>
            </div>
            {signOutError ? (
              <p className="form-error" role="alert">
                {signOutError}
              </p>
            ) : null}
          </div>
        </aside>

        <div className="admin-main">
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
    </div>
  );
}

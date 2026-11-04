import { useEffect, useRef, useState } from 'react';
import {
  Icon,
  media as mediaIcon,
  page as pageIcon,
  people,
  post as postIcon,
  settings as settingsIcon,
  tool,
} from '@wordpress/icons';
import { fetchPosts, logout, type AdminPost, type AuthUser } from './api.js';
import type { Route } from './router.js';
import { navigate, newContentPath } from './router.js';
import { ADMIN_BASE } from './router.js';
import { useNavigationGuard } from './navigation-guard.js';
import { keyboardShortcutsEnabled } from './preferences.js';
import { canCreateContent, canManageTerms, canReadContent } from './roles.js';
import {
  DASHBOARD_COLUMNS_EVENT,
  DASHBOARD_WIDGETS,
  DASHBOARD_WIDGETS_EVENT,
  SCREEN_COLUMNS,
  SCREEN_COLUMNS_EVENT,
  SCREEN_VIEW_MODE_EVENT,
  dashboardColumns,
  dashboardHiddenWidgets,
  screenHiddenColumns,
  screenPerPage,
  screenViewMode,
  setDashboardColumns,
  setDashboardWidgetHidden,
  setScreenColumnHidden,
  setScreenPerPage,
  setScreenViewMode,
  type DashboardColumns,
  type ScreenViewMode,
} from './screenOptions.js';
import type { ReactNode } from 'react';

function screenKey(route: Route): string {
  switch (route.name) {
    case 'list':
      return route.type === 'post' ? 'posts' : 'pages';
    case 'dashboard':
      return 'dashboard';
    case 'media':
      return 'media';
    case 'users':
      return 'users';
    case 'terms':
      return 'terms';
    case 'settings':
      return 'settings';
    case 'profile':
      return 'profile';
    default:
      return '';
  }
}

function screenHelp(route: Route): {
  title: string;
  sections: Array<{ heading: string; body: string }>;
  links: Array<{ label: string; href: string }>;
} {
  const support = { label: 'Support forums', href: 'https://wordpress.org/support/forums/' };
  switch (route.name) {
    case 'list':
      return {
        title: route.type === 'post' ? 'Posts' : 'Pages',
        sections: [
          {
            heading: 'Overview',
            body: 'This screen lists every post or page you can manage. Use the status links above the table to narrow the list, or the search box to find a specific item.',
          },
          {
            heading: 'Screen Content',
            body: 'The table shows the title, author, categories, tags and publication date. Row actions appear when you hover a row: Edit, Trash (or Restore) and View.',
          },
          {
            heading: 'Available Actions',
            body: 'Hover a row to Edit, Quick Edit, Trash or Preview/View it. Use Screen Options to hide columns or switch view mode.',
          },
          {
            heading: 'Bulk Actions',
            body: 'Select two or more rows, choose an action from the Bulk actions list and click Apply to move several items to the trash or restore them at once.',
          },
        ],
        links: [
          {
            label:
              route.type === 'post' ? 'Documentation on Managing Posts' : 'Documentation on Pages',
            href:
              route.type === 'post'
                ? 'https://wordpress.org/documentation/article/posts-screen/'
                : 'https://wordpress.org/documentation/article/pages-screen/',
          },
          support,
        ],
      };
    case 'media':
      return {
        title: 'Media Library',
        sections: [
          {
            heading: 'Overview',
            body: 'This screen lists every uploaded file. Use the grid/list toggles to change the view and the filters to narrow by type or month.',
          },
          {
            heading: 'Screen Content',
            body: 'Grid view shows thumbnails; list view shows the file, author, upload target and date. Click an item for Attachment details.',
          },
          {
            heading: 'Bulk Actions',
            body: 'Click Bulk select to reveal checkboxes, then select attachments and delete them in one action.',
          },
        ],
        links: [
          {
            label: 'Documentation on Media Library',
            href: 'https://wordpress.org/documentation/article/media-library-screen/',
          },
          support,
        ],
      };
    case 'users':
      return {
        title: 'Users',
        sections: [
          {
            heading: 'Overview',
            body: 'This screen lists every account on the site. Role links above the table filter the list by role, and the search box looks up usernames.',
          },
          {
            heading: 'Screen Content',
            body: 'Columns show Username, Name, Email, Role and Posts. Sort Username or Email with the column headers.',
          },
          {
            heading: 'Roles',
            body: 'Administrators manage settings and users. Editors manage all content. Authors manage their own posts, and subscribers only read content.',
          },
        ],
        links: [
          {
            label: 'Documentation on Managing Users',
            href: 'https://wordpress.org/documentation/article/users-screen/',
          },
          support,
        ],
      };
    case 'terms':
      return {
        title: 'Categories and Tags',
        sections: [
          {
            heading: 'Overview',
            body: 'Categories and tags group posts. Categories can have a hierarchy; tags are flat.',
          },
          {
            heading: 'Screen Content',
            body: 'The left column adds a term; the right table lists Name, Description, Slug and Count. Sort by any of those columns.',
          },
          {
            heading: 'Bulk Actions',
            body: 'Select several terms and use Bulk actions to delete them. Deleting a term never deletes the posts assigned to it.',
          },
        ],
        links: [
          {
            label: 'Documentation on Categories',
            href: 'https://wordpress.org/documentation/article/categories-screen/',
          },
          support,
        ],
      };
    case 'settings':
      return {
        title: 'Settings',
        sections: [
          {
            heading: 'Overview',
            body: 'General holds the site title, tagline, address and formats. Reading controls the homepage and posts per page. Writing controls the default category and author.',
          },
          {
            heading: 'Screen Content',
            body: 'Each settings group is a separate screen; use the Settings submenu in the sidebar to switch between them.',
          },
        ],
        links: [
          {
            label: 'Documentation on Settings',
            href: 'https://wordpress.org/documentation/article/settings-general-screen/',
          },
          support,
        ],
      };
    case 'profile':
      return {
        title: 'Profile',
        sections: [
          {
            heading: 'Overview',
            body: 'Your username cannot be changed. Update your display name, email address, website or password here.',
          },
          {
            heading: 'Personal Options',
            body: 'Choose an admin colour scheme. The preference is stored in this browser.',
          },
        ],
        links: [
          {
            label: 'Documentation on Your Profile',
            href: 'https://wordpress.org/documentation/article/users-your-profile-screen/',
          },
          support,
        ],
      };
    case 'dashboard':
      return {
        title: 'Dashboard',
        sections: [
          {
            heading: 'Overview',
            body: 'This screen is the control centre for the site. Widgets can be collapsed with the arrow in their header and reordered with the up/down arrows.',
          },
          {
            heading: 'Screen Options',
            body: 'Use Screen Options to show or hide dashboard boxes and switch between one and four layout columns.',
          },
        ],
        links: [
          {
            label: 'Documentation on Dashboard',
            href: 'https://wordpress.org/documentation/article/dashboard-screen/',
          },
          support,
        ],
      };
    case 'tools':
      return {
        title: 'Tools',
        sections: [
          {
            heading: 'Overview',
            body: 'Available Tools lists the export and site-health screens. Export downloads posts and pages; Site Health reports database, storage and scheduler checks.',
          },
        ],
        links: [
          {
            label: 'Documentation on Tools',
            href: 'https://wordpress.org/documentation/article/tools-screen/',
          },
          support,
        ],
      };
    case 'updates':
      return {
        title: 'Updates',
        sections: [
          {
            heading: 'Overview',
            body: 'This screen reports the current MERNPress build. This installation is deployed from source and does not check for remote updates.',
          },
        ],
        links: [
          {
            label: 'Documentation on Updating WordPress',
            href: 'https://wordpress.org/documentation/article/updating-wordpress/',
          },
          support,
        ],
      };
    default:
      return { title: 'Help', sections: [], links: [] };
  }
}

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

function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '••';
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return trimmed.substring(0, 2).toUpperCase();
}

function DashboardGaugeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M3.5 17a8.5 8.5 0 1 1 17 0" />
      <path d="M12 17l4.2-5.2" />
      <circle cx="12" cy="17" r="1.4" fill="currentColor" stroke="none" />
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
  const [metaPanel, setMetaPanel] = useState<'options' | 'help' | null>(null);
  const [helpTab, setHelpTab] = useState(0);
  const [perPageChoice, setPerPageChoice] = useState(10);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AdminPost[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
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

  // The editor is a focused workspace with its own header; a shell breadcrumb
  // would duplicate navigation and sit behind the editor toolbar.
  const isEditorRoute = route.name === 'new' || route.name === 'edit';
  const currentScreen = screenKey(route);
  const supportsPerPage = ['posts', 'pages', 'users', 'terms', 'media'].includes(currentScreen);
  const screenColumns = SCREEN_COLUMNS[currentScreen] ?? [];
  const supportsViewMode = ['posts', 'pages'].includes(currentScreen);
  const isDashboard = currentScreen === 'dashboard';
  const [hiddenWidgets, setHiddenWidgets] = useState<Set<string>>(() => dashboardHiddenWidgets());
  const [dashColumns, setDashColumns] = useState<DashboardColumns>(() => dashboardColumns());
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() =>
    screenHiddenColumns(currentScreen),
  );
  const [viewMode, setViewModeChoice] = useState<ScreenViewMode>(() =>
    screenViewMode(currentScreen),
  );

  useEffect(() => {
    setHiddenColumns(screenHiddenColumns(currentScreen));
    setViewModeChoice(screenViewMode(currentScreen));
    setHiddenWidgets(dashboardHiddenWidgets());
    setDashColumns(dashboardColumns());
    setHelpTab(0);
  }, [currentScreen, metaPanel]);

  useEffect(() => {
    const sync = () => {
      setHiddenColumns(screenHiddenColumns(currentScreen));
      setViewModeChoice(screenViewMode(currentScreen));
    };
    const syncDashboard = () => {
      setHiddenWidgets(dashboardHiddenWidgets());
      setDashColumns(dashboardColumns());
    };
    window.addEventListener(SCREEN_COLUMNS_EVENT, sync);
    window.addEventListener(SCREEN_VIEW_MODE_EVENT, sync);
    window.addEventListener(DASHBOARD_WIDGETS_EVENT, syncDashboard);
    window.addEventListener(DASHBOARD_COLUMNS_EVENT, syncDashboard);
    return () => {
      window.removeEventListener(SCREEN_COLUMNS_EVENT, sync);
      window.removeEventListener(SCREEN_VIEW_MODE_EVENT, sync);
      window.removeEventListener(DASHBOARD_WIDGETS_EVENT, syncDashboard);
      window.removeEventListener(DASHBOARD_COLUMNS_EVENT, syncDashboard);
    };
  }, [currentScreen]);

  useEffect(() => {
    setMetaPanel(null);
  }, [route.name, 'type' in route ? route.type : '']);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'k' &&
        keyboardShortcutsEnabled()
      ) {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const query = searchQuery.trim();
    if (query.length === 0) {
      setSearchResults([]);
      return;
    }
    let active = true;
    const handle = window.setTimeout(() => {
      setSearchBusy(true);
      fetchPosts({ search: query, perPage: 8 })
        .then((result) => {
          if (active) setSearchResults(result.items);
        })
        .catch(() => {
          if (active) setSearchResults([]);
        })
        .finally(() => {
          if (active) setSearchBusy(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [searchOpen, searchQuery]);

  useEffect(() => {
    if (metaPanel !== 'options' || !supportsPerPage) return;
    setPerPageChoice(screenPerPage(currentScreen, currentScreen === 'media' ? 24 : 10));
  }, [metaPanel, currentScreen, supportsPerPage]);

  const help = screenHelp(route);

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
  const searchParams =
    typeof window === 'undefined'
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search);

  const navItems: NavEntry[] = [
    {
      to: '/',
      label: 'Dashboard',
      active: route.name === 'dashboard',
      show: true,
      icon: <span className="dashicons dashicons-dashboard" />,
      subs: [
        { label: 'Home', to: '/', active: route.name === 'dashboard' },
        ...(isAdmin
          ? [{ label: 'Updates', to: '/updates', active: route.name === 'updates' }]
          : []),
      ],
    },
    {
      to: '/posts',
      label: 'Posts',
      active: isPostRoute,
      show: canReadContent(user),
      icon: <span className="dashicons dashicons-admin-post" />,
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
          ? [
              {
                label: 'Categories',
                to: '/terms?taxonomy=category',
                active: route.name === 'terms' && searchParams.get('taxonomy') !== 'tag',
              },
              {
                label: 'Tags',
                to: '/terms?taxonomy=tag',
                active: route.name === 'terms' && searchParams.get('taxonomy') === 'tag',
              },
            ]
          : []),
      ],
    },
    {
      to: '/media',
      label: 'Media',
      active: route.name === 'media',
      show: canReadContent(user),
      icon: <span className="dashicons dashicons-admin-media" />,
      subs: [
        { label: 'Library', to: '/media', active: route.name === 'media' },
        {
          label: 'Add Media File',
          to: '/media?upload=1',
          active: route.name === 'media' && searchParams.get('upload') === '1',
        },
      ],
    },
    {
      to: '/pages',
      label: 'Pages',
      active: isPageRoute,
      show: canReadContent(user),
      icon: <span className="dashicons dashicons-admin-page" />,
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
      to: '/users',
      label: 'Users',
      active: route.name === 'users' || route.name === 'profile',
      show: isAdmin,
      icon: <span className="dashicons dashicons-admin-users" />,
      subs: [
        { label: 'All Users', to: '/users', active: route.name === 'users' },
        { label: 'Add User', to: '/users?action=add', active: false },
        { label: 'Profile', to: '/profile', active: route.name === 'profile' },
      ],
    },
    {
      to: '/tools',
      label: 'Tools',
      active: route.name === 'tools',
      show: isAdmin,
      icon: <span className="dashicons dashicons-admin-tools" />,
      subs: [
        {
          label: 'Available Tools',
          to: '/tools',
          active:
            route.name === 'tools' &&
            !['export', 'health'].includes(searchParams.get('section') ?? ''),
        },
        {
          label: 'Export',
          to: '/tools?section=export',
          active: route.name === 'tools' && searchParams.get('section') === 'export',
        },
        {
          label: 'Site Health',
          to: '/tools?section=health',
          active: route.name === 'tools' && searchParams.get('section') === 'health',
        },
      ],
    },
    {
      to: '/settings',
      label: 'Settings',
      active: route.name === 'settings',
      show: isAdmin,
      icon: <span className="dashicons dashicons-admin-settings" />,
      subs: [
        {
          label: 'General',
          to: '/settings',
          active: route.name === 'settings' && (hash === '' || hash === '#general'),
        },
        {
          label: 'Writing',
          to: '/settings#writing',
          active: route.name === 'settings' && hash === '#writing',
        },
        {
          label: 'Reading',
          to: '/settings#reading',
          active: route.name === 'settings' && hash === '#reading',
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

  const visibleItems = navItems.filter((item) => item.show);
  const railMode = collapsed;

  return (
    <div
      className={`wp-shell${collapsed ? ' sidebar-collapsed' : ''}${mobileOpen ? ' sidebar-open' : ''}${isEditorRoute ? ' editor-mode' : ''}`}
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
          <div className="admin-bar-site">
            <a className="admin-bar-site-name" href="/" aria-label="Visit MERNPress">
              <span className="brand-home dashicons dashicons-wordpress" aria-hidden="true" />
              <span className="brand-text">MERNPress</span>
            </a>
            <a
              className="admin-bar-visit"
              href="/"
              target="_blank"
              rel="noreferrer"
              title="Visit public site"
            >
              Visit Site
            </a>
          </div>
          <button
            type="button"
            className="admin-bar-search"
            aria-label="Search admin"
            title="Search (Ctrl+K)"
            onClick={() => setSearchOpen(true)}
          >
            <span className="dashicons dashicons-search" aria-hidden="true" />
            <span className="admin-bar-search-hint">Ctrl+K</span>
          </button>
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
                  <span className="dashicons dashicons-admin-post" />
                  <span>Post</span>
                </a>
                <a
                  href="/media?upload=1"
                  tabIndex={newMenuOpen ? undefined : -1}
                  onClick={(e) => {
                    e.preventDefault();
                    go('/media?upload=1');
                  }}
                >
                  <span className="dashicons dashicons-admin-media" />
                  <span>Media</span>
                </a>
                <a
                  href={newContentPath('page')}
                  tabIndex={newMenuOpen ? undefined : -1}
                  onClick={(e) => {
                    e.preventDefault();
                    go(newContentPath('page'));
                  }}
                >
                  <span className="dashicons dashicons-admin-page" />
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
                    <span className="dashicons dashicons-admin-users" />
                    <span>User</span>
                  </a>
                ) : null}
              </div>
            </div>
          ) : null}
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
              <span className="hello-name">Howdy, {user.username}</span>
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
              {signOutError ? (
                <p className="signout-error" role="alert">
                  {signOutError}
                </p>
              ) : null}
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
          <nav className="sidebar-nav" aria-label="Primary">
            <ul>
              {visibleItems.map((item) => {
                const hasSubs = item.subs.length > 0;
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
                    </div>
                    {hasSubs && !(railMode && !mobileOpen) ? (
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
                              <span>{sub.label}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </nav>
          <button
            type="button"
            className="collapse-toggle"
            aria-label={railMode ? 'Expand Menu' : 'Collapse Menu'}
            title={railMode ? 'Expand Menu' : 'Collapse Menu'}
            onClick={() => {
              if (!mobileOpen) {
                setCollapsed((value) => !value);
              } else {
                setMobileOpen(false);
              }
            }}
          >
            <span className="collapse-label">{mobileOpen ? 'Close Menu' : 'Collapse Menu'}</span>
            <span
              className={`dashicons dashicons-collapse collapse-glyph${railMode && !mobileOpen ? ' is-collapsed' : ''}`}
              aria-hidden="true"
            />
          </button>
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
                <div id="screen-meta-links" className="screen-meta-links">
                  {['dashboard', 'posts', 'pages', 'users', 'terms', 'media'].includes(
                    currentScreen,
                  ) &&
                  !(
                    route.name === 'users' &&
                    new URLSearchParams(window.location.search).get('action') === 'add'
                  ) ? (
                    <button
                      type="button"
                      className={`button show-settings${metaPanel === 'options' ? ' is-active' : ''}`}
                      aria-expanded={metaPanel === 'options'}
                      aria-controls="screen-options-wrap"
                      onClick={() =>
                        setMetaPanel((current) => (current === 'options' ? null : 'options'))
                      }
                    >
                      Screen Options
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={`button show-settings${metaPanel === 'help' ? ' is-active' : ''}`}
                    aria-expanded={metaPanel === 'help'}
                    aria-controls="contextual-help-wrap"
                    onClick={() => setMetaPanel((current) => (current === 'help' ? null : 'help'))}
                  >
                    Help
                  </button>
                </div>

                {metaPanel === 'options' ? (
                  <div
                    id="screen-options-wrap"
                    className="screen-meta-panel"
                    role="region"
                    aria-label="Screen Options"
                  >
                    <h2>Screen Options</h2>
                    {isDashboard ? (
                      <>
                        <fieldset className="metabox-prefs">
                          <legend>Boxes</legend>
                          {DASHBOARD_WIDGETS.map((widget) => (
                            <label key={widget.id}>
                              <input
                                type="checkbox"
                                checked={!hiddenWidgets.has(widget.id)}
                                onChange={(event) =>
                                  setDashboardWidgetHidden(widget.id, !event.target.checked)
                                }
                              />
                              {widget.label}
                            </label>
                          ))}
                        </fieldset>
                        <fieldset className="screen-options-view-mode">
                          <legend>Layout</legend>
                          {[1, 2, 3, 4].map((count) => (
                            <label key={count}>
                              <input
                                type="radio"
                                name="dashboard-columns"
                                checked={dashColumns === count}
                                onChange={() => {
                                  setDashboardColumns(count as DashboardColumns);
                                  setDashColumns(count as DashboardColumns);
                                }}
                              />
                              {count}
                            </label>
                          ))}
                        </fieldset>
                      </>
                    ) : null}
                    {screenColumns.length > 0 ? (
                      <fieldset className="metabox-prefs">
                        <legend>Columns</legend>
                        {screenColumns.map((column) => (
                          <label key={column.id}>
                            <input
                              type="checkbox"
                              checked={!hiddenColumns.has(column.id)}
                              onChange={(event) =>
                                setScreenColumnHidden(
                                  currentScreen,
                                  column.id,
                                  !event.target.checked,
                                )
                              }
                            />
                            {column.label}
                          </label>
                        ))}
                      </fieldset>
                    ) : null}
                    {supportsPerPage ? (
                      <fieldset className="screen-options">
                        <legend>Pagination</legend>
                        <label htmlFor="screen-per-page">Number of items per page:</label>
                        <input
                          id="screen-per-page"
                          type="number"
                          min={1}
                          max={100}
                          value={perPageChoice}
                          onChange={(event) =>
                            setPerPageChoice(
                              Math.min(100, Math.max(1, Number(event.target.value) || 1)),
                            )
                          }
                        />
                        <button
                          type="button"
                          className="button"
                          onClick={() => {
                            setScreenPerPage(currentScreen, perPageChoice);
                            setMetaPanel(null);
                          }}
                        >
                          Apply
                        </button>
                      </fieldset>
                    ) : null}
                    {supportsViewMode ? (
                      <fieldset className="screen-options-view-mode">
                        <legend>View mode</legend>
                        <label>
                          <input
                            type="radio"
                            name="screen-view-mode"
                            checked={viewMode === 'compact'}
                            onChange={() => {
                              setScreenViewMode(currentScreen, 'compact');
                              setViewModeChoice('compact');
                            }}
                          />
                          Compact view
                        </label>
                        <label>
                          <input
                            type="radio"
                            name="screen-view-mode"
                            checked={viewMode === 'extended'}
                            onChange={() => {
                              setScreenViewMode(currentScreen, 'extended');
                              setViewModeChoice('extended');
                            }}
                          />
                          Extended view
                        </label>
                      </fieldset>
                    ) : null}
                    {!isDashboard &&
                    screenColumns.length === 0 &&
                    !supportsPerPage &&
                    !supportsViewMode ? (
                      <p className="screen-options-note">
                        This screen has no configurable options.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {metaPanel === 'help' ? (
                  <div
                    id="contextual-help-wrap"
                    className="screen-meta-panel contextual-help"
                    role="region"
                    aria-label="Help"
                  >
                    <div className="contextual-help-tabs">
                      <ul>
                        {help.sections.map((section, index) => (
                          <li key={section.heading} className={index === helpTab ? 'active' : ''}>
                            <a
                              href={`#help-panel-${index}`}
                              aria-controls={`help-panel-${index}`}
                              aria-current={index === helpTab ? 'true' : undefined}
                              onClick={(event) => {
                                event.preventDefault();
                                setHelpTab(index);
                              }}
                            >
                              {section.heading}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="contextual-help-panels">
                      {help.sections[helpTab] ? (
                        <div id={`help-panel-${helpTab}`}>
                          <h3>{help.sections[helpTab]!.heading}</h3>
                          <p>{help.sections[helpTab]!.body}</p>
                        </div>
                      ) : (
                        <p>No help available for this screen.</p>
                      )}
                    </div>
                    {help.links.length > 0 ? (
                      <div className="contextual-help-sidebar">
                        <p>
                          <strong>For more information:</strong>
                        </p>
                        {help.links.map((link) => (
                          <p key={link.href}>
                            <a href={link.href} target="_blank" rel="noreferrer">
                              {link.label}
                            </a>
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {children}
              </div>
            )}
          </main>

          <footer className="app-footer">
            <p>Thank you for creating with MERNPress.</p>
            <p className="footer-version">Version 0.1.0</p>
          </footer>
        </div>
      </div>

      {searchOpen ? (
        <div
          className="command-overlay"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSearchOpen(false);
          }}
        >
          <div
            className="command-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Search admin"
          >
            <input
              ref={searchInputRef}
              type="search"
              placeholder="Search posts and pages…"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              aria-label="Search posts and pages"
            />
            <div className="command-results">
              {searchQuery.trim().length === 0 ? (
                <>
                  <p className="command-heading">Quick navigation</p>
                  {[
                    { label: 'Dashboard', to: '/admin' },
                    { label: 'All Posts', to: '/posts' },
                    { label: 'Add New Post', to: '/posts/new' },
                    { label: 'Media Library', to: '/media' },
                    { label: 'Pages', to: '/pages' },
                    { label: 'Users', to: '/users' },
                    { label: 'Settings', to: '/settings' },
                  ].map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      className="command-item"
                      onClick={() => {
                        setSearchOpen(false);
                        go(item.to);
                      }}
                    >
                      <span>{item.label}</span>
                    </button>
                  ))}
                </>
              ) : searchBusy ? (
                <p className="command-empty">Searching…</p>
              ) : searchResults.length === 0 ? (
                <p className="command-empty">No results.</p>
              ) : (
                searchResults.map((post) => (
                  <button
                    key={post.id}
                    type="button"
                    className="command-item"
                    onClick={() => {
                      setSearchOpen(false);
                      go(
                        post.type === 'page' ? `/pages/${post.id}/edit` : `/posts/${post.id}/edit`,
                      );
                    }}
                  >
                    <span className="command-badge">{post.type === 'page' ? 'Page' : 'Post'}</span>
                    <span>{post.title}</span>
                  </button>
                ))
              )}
            </div>
            <div className="command-footer">
              <span>Esc to close</span>
              <span>Enter to open the first result</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

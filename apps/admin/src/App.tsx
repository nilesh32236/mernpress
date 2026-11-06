import { useEffect, useState } from 'react';
import { fetchScreenOptions, fetchSession, setUnauthorizedHandler, type AuthUser } from './api.js';
import { applyColorScheme } from './colorScheme.js';
import { hydrateScreenOptions } from './screenOptions.js';
import { ContentEditor } from './ContentEditor.js';
import { ToolsPage } from './ToolsPage.js';
import { RedirectsPage } from './RedirectsPage.js';
import { BackupsPage } from './BackupsPage.js';
import { UpdatesPage } from './UpdatesPage.js';
import { CommentsPage } from './CommentsPage.js';
import { ThemesPage } from './ThemesPage.js';
import { ThemeInstallPage } from './ThemeInstallPage.js';
import { CustomizePage } from './CustomizePage.js';
import { PluginsPage } from './PluginsPage.js';
import { PluginInstallPage } from './PluginInstallPage.js';
import { SiteEditorPage } from './SiteEditorPage.js';
import { FontsPage } from './FontsPage.js';
import { ImportPage } from './ImportPage.js';
import { PersonalDataPage } from './PersonalDataPage.js';
import { ConnectorsPage } from './ConnectorsPage.js';
import { ConsentPage } from './ConsentPage.js';
import { LanguagesPage } from './LanguagesPage.js';
import { LanguagesProvider } from './languages-context.js';
import { ContentList } from './ContentList.js';
import { TermsPage } from './TermsPage.js';
import { MediaPage } from './MediaPage.js';
import { Dashboard } from './Dashboard.js';
import { AnalyticsPage } from './AnalyticsPage.js';
import { LoginForm } from './LoginForm.js';
import { ResetPasswordForm } from './ResetPasswordForm.js';
import { UsersPage } from './UsersPage.js';
import { ProfilePage } from './ProfilePage.js';
import { SettingsPage } from './SettingsPage.js';
import { AdminShell } from './AdminShell.js';
import { NavigationGuardProvider } from './navigation-guard.js';
import { navigate, parseRoute, useLocation, type Route } from './router.js';
import { ADMIN_BASE } from './router.js';

export function App() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionAttempt, setSessionAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setSessionError(null);

    fetchSession()
      .then(async (sessionUser) => {
        if (!active) return;
        if (sessionUser?.adminColor) {
          // The server is authoritative; replace the localStorage cache.
          applyColorScheme(sessionUser.adminColor);
        }
        if (sessionUser) {
          const options = await fetchScreenOptions().catch(() => null);
          if (active && options) hydrateScreenOptions(options);
        }
        if (active) setUser(sessionUser);
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

  // WordPress serves the reset form from a link with `action=rp&key&login`;
  // it must render even when a session exists, because using it signs out.
  const resetParams = new URLSearchParams(window.location.search);
  const resetKey = resetParams.get('key');
  const resetLogin = resetParams.get('login');
  if (resetParams.get('action') === 'rp' && resetKey && resetLogin) {
    return (
      <div className="app-frame login-frame">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <main id="main-content" className="login-page" tabIndex={-1}>
          <ResetPasswordForm resetKey={resetKey} login={resetLogin} />
        </main>
      </div>
    );
  }

  if (user === undefined) {
    return (
      <div className="app-frame">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <header className="app-header">
          <a className="brand" href={ADMIN_BASE} aria-label="MERNPress admin home">
            MERNPress
          </a>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1} aria-busy="true">
          <div className="content-card">
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
      <div className="app-frame login-frame">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <main id="main-content" className="login-page" tabIndex={-1}>
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
      </div>
    );
  }

  return (
    <NavigationGuardProvider>
      <SignedInApp
        user={user}
        onSignedOut={() => setUser(null)}
        onUserUpdated={(partial) =>
          setUser((current) => (current ? { ...current, ...partial } : current))
        }
      />
    </NavigationGuardProvider>
  );
}

function SignedInApp({
  user,
  onSignedOut,
  onUserUpdated,
}: {
  user: AuthUser;
  onSignedOut: () => void;
  onUserUpdated: (partial: Partial<AuthUser>) => void;
}) {
  const location = useLocation();
  const route = parseRoute(location.pathname);

  useEffect(() => {
    document.title = pageTitle(route);
  }, [route]);

  return (
    <AdminShell user={user} route={route} onSignedOut={onSignedOut}>
      <LanguagesProvider>
        <RouteView user={user} route={route} onUserUpdated={onUserUpdated} />
      </LanguagesProvider>
    </AdminShell>
  );
}

function pageTitle(route: Route): string {
  switch (route.name) {
    case 'dashboard':
      return 'MERNPress admin · Dashboard';
    case 'analytics':
      return 'MERNPress admin · Analytics';
    case 'list':
      return `MERNPress admin · ${route.type === 'post' ? 'Posts' : 'Pages'}`;
    case 'new':
      return `MERNPress admin · New ${route.type}`;
    case 'edit':
      return `MERNPress admin · Edit ${route.type}`;
    case 'terms':
      return 'MERNPress admin · Categories & Tags';
    case 'media':
      return 'MERNPress admin · Media';
    case 'comments':
      return 'MERNPress admin · Comments';
    case 'themes':
      return 'MERNPress admin · Themes';
    case 'themeInstall':
      return 'MERNPress admin · Add Themes';
    case 'customize':
      return 'MERNPress admin · Customize';
    case 'siteEditor':
      return 'MERNPress admin · Editor';
    case 'fonts':
      return 'MERNPress admin · Fonts';
    case 'import':
      return 'MERNPress admin · Import';
    case 'exportPersonalData':
      return 'MERNPress admin · Export Personal Data';
    case 'erasePersonalData':
      return 'MERNPress admin · Erase Personal Data';
    case 'connectors':
      return 'MERNPress admin · Connectors';
    case 'consent':
      return 'MERNPress admin · Consent';
    case 'languages':
      return 'MERNPress admin · Languages';
    case 'plugins':
      return 'MERNPress admin · Plugins';
    case 'pluginInstall':
      return 'MERNPress admin · Add Plugins';
    case 'users':
      return 'MERNPress admin · Users';
    case 'profile':
      return 'MERNPress admin · Profile';
    case 'settings':
      return 'MERNPress admin · Settings';
    case 'tools':
      return 'MERNPress admin · Tools';
    case 'redirects':
      return 'MERNPress admin · Redirects';
    case 'backups':
      return 'MERNPress admin · Backups';
    case 'updates':
      return 'MERNPress admin · Updates';
    case 'notFound':
      return 'MERNPress admin · Not found';
  }
}

function Forbidden() {
  return (
    <div className="content-card">
      <h1>No access</h1>
      <p className="lede">Only administrators can open this screen.</p>
    </div>
  );
}

function RouteView({
  user,
  route,
  onUserUpdated,
}: {
  user: AuthUser;
  route: Route;
  onUserUpdated: (partial: Partial<AuthUser>) => void;
}) {
  switch (route.name) {
    case 'dashboard':
      return <Dashboard user={user} />;
    case 'analytics':
      return <AnalyticsPage />;
    case 'list':
      return <ContentList user={user} type={route.type} />;
    case 'new':
      return <ContentEditor user={user} type={route.type} />;
    case 'edit':
      return <ContentEditor user={user} type={route.type} id={route.id} />;
    case 'terms':
      return <TermsPage user={user} />;
    case 'media':
      return <MediaPage user={user} />;
    case 'comments':
      return user.role === 'subscriber' ? <Forbidden /> : <CommentsPage user={user} />;
    case 'themes':
      return user.role === 'administrator' ? <ThemesPage user={user} /> : <Forbidden />;
    case 'themeInstall':
      return user.role === 'administrator' ? <ThemeInstallPage user={user} /> : <Forbidden />;
    case 'customize':
      return user.role === 'administrator' ? <CustomizePage /> : <Forbidden />;
    case 'siteEditor':
      return user.role === 'administrator' ? <SiteEditorPage user={user} /> : <Forbidden />;
    case 'fonts':
      return user.role === 'administrator' ? <FontsPage /> : <Forbidden />;
    case 'import':
      return user.role === 'administrator' ? <ImportPage /> : <Forbidden />;
    case 'exportPersonalData':
      return user.role === 'administrator' ? <PersonalDataPage type="EXPORT" /> : <Forbidden />;
    case 'erasePersonalData':
      return user.role === 'administrator' ? <PersonalDataPage type="ERASE" /> : <Forbidden />;
    case 'connectors':
      return user.role === 'administrator' ? <ConnectorsPage /> : <Forbidden />;
    case 'consent':
      return user.role === 'administrator' ? <ConsentPage /> : <Forbidden />;
    case 'languages':
      return user.role === 'administrator' ? <LanguagesPage /> : <Forbidden />;
    case 'plugins':
      return user.role === 'administrator' ? <PluginsPage user={user} /> : <Forbidden />;
    case 'pluginInstall':
      return user.role === 'administrator' ? <PluginInstallPage user={user} /> : <Forbidden />;
    case 'users':
      return user.role === 'administrator' ? <UsersPage user={user} /> : <Forbidden />;
    case 'profile':
      return <ProfilePage user={user} onProfileUpdated={onUserUpdated} />;
    case 'settings':
      return user.role === 'administrator' ? <SettingsPage user={user} /> : <Forbidden />;
    case 'tools':
      return user.role === 'administrator' ? <ToolsPage /> : <Forbidden />;
    case 'redirects':
      return user.role === 'administrator' ? <RedirectsPage /> : <Forbidden />;
    case 'backups':
      return user.role === 'administrator' ? <BackupsPage /> : <Forbidden />;
    case 'updates':
      return user.role === 'administrator' ? <UpdatesPage /> : <Forbidden />;
    case 'notFound':
      return (
        <div className="content-card">
          <h1>Page not found</h1>
          <p className="lede">That admin route does not exist.</p>
          <a
            className="button primary-button"
            href={ADMIN_BASE}
            onClick={(event) => {
              event.preventDefault();
              navigate('/admin');
            }}
          >
            Back to dashboard
          </a>
        </div>
      );
  }
}

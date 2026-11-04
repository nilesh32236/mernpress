import { useEffect, useState } from 'react';
import {
  actionErrorMessage,
  checkUpdates,
  fetchUpdates,
  type UpdateItem,
  type UpdateStatus,
} from './api.js';
import { Notice, PageHeader, Skeleton, type NoticeMessage } from './components.js';

function formatCheckedAt(value: string | null): string {
  if (!value) return 'never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'never';
  return date.toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function itemsOf(status: UpdateStatus, type: UpdateItem['type']): UpdateItem[] {
  return status.items.filter((item) => item.type === type);
}

function itemLabel(item: UpdateItem): string {
  return `${item.name} ${item.installedVersion}`;
}

/**
 * Dashboard → Updates (WordPress 7.1 layout).
 *
 * The check is real: with a configured manifest the service compares installed
 * core/theme/plugin versions against published ones and records the check
 * time. Without a manifest the screen re-reads installed versions and says so
 * rather than claiming everything is current.
 */
export function UpdatesPage() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let active = true;
    fetchUpdates()
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

  async function runCheck() {
    if (checking) return;
    setChecking(true);
    setNotice(null);
    setError(null);
    try {
      const result = await checkUpdates();
      setStatus(result);
      setNotice({
        tone: 'success',
        text: result.manifestConfigured
          ? result.updatesAvailable > 0
            ? `${result.updatesAvailable} update${
                result.updatesAvailable === 1 ? '' : 's'
              } available.`
            : 'All installed versions are current.'
          : 'Installed versions re-read. No update service is configured.',
      });
    } catch (caught) {
      setNotice({ tone: 'error', text: actionErrorMessage(caught) });
    } finally {
      setChecking(false);
    }
  }

  if (error) {
    return (
      <div className="updates-page">
        <PageHeader title="MERNPress Updates" />
        <p role="alert" className="form-error">
          {error}
        </p>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="updates-page">
        <PageHeader title="MERNPress Updates" />
        <Skeleton label="Loading update status…" lines={5} />
      </div>
    );
  }

  const themes = itemsOf(status, 'theme');
  const plugins = itemsOf(status, 'plugin');
  const core = itemsOf(status, 'core')[0];
  const themeAuto = themes.every((item) => item.autoUpdates);
  const pluginAuto = plugins.every((item) => item.autoUpdates);
  const themeUpdates = themes.filter((item) => item.status === 'update');
  const pluginUpdates = plugins.filter((item) => item.status === 'update');
  const checked = Boolean(status.lastCheckedAt);
  const canClaimLatest = status.manifestConfigured && checked;

  return (
    <div className="updates-page">
      <PageHeader title="MERNPress Updates" />
      {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}

      <section aria-label="Update overview">
        <p>
          Updates may take several minutes to complete. If there is no feedback after 5 minutes, or
          if there are errors, please refer to the Help section above.
        </p>
        <p>
          Current version: <strong>{status.coreVersion}</strong>
        </p>
        <p>
          {status.lastCheckedAt
            ? `Last checked on ${formatCheckedAt(status.lastCheckedAt)}. `
            : 'Not checked yet. '}
          <button
            type="button"
            className="button-link update-check-link"
            onClick={() => void runCheck()}
            disabled={checking}
          >
            {checking ? 'Checking…' : 'Check again.'}
          </button>
        </p>
        {status.manifestConfigured ? (
          <p>
            Automatic updates are {themeAuto ? 'enabled' : 'disabled'} for themes and{' '}
            {pluginAuto ? 'enabled' : 'disabled'} for plugins. Update checks use the configured
            release manifest.
          </p>
        ) : (
          <p className="update-source-note">
            No update service is configured for this build, so only installed versions are read. Set{' '}
            <code>UPDATE_MANIFEST_URL</code> to a release manifest to check for newer versions.
          </p>
        )}
      </section>

      <section aria-labelledby="core-updates-heading">
        <h2 id="core-updates-heading">MERNPress</h2>
        {core?.status === 'update' ? (
          <p>
            <strong>Update available:</strong> MERNPress {core.availableVersion} (installed{' '}
            {core.installedVersion}). This build deploys from source.
          </p>
        ) : canClaimLatest ? (
          <p>You have the latest version of MERNPress.</p>
        ) : (
          <p>You are running MERNPress {status.coreVersion}.</p>
        )}
      </section>

      <section aria-labelledby="plugins-updates-heading">
        <h2 id="plugins-updates-heading">Plugins</h2>
        {plugins.length === 0 ? (
          <p>No plugins installed.</p>
        ) : pluginUpdates.length === 0 ? (
          <p>
            {status.manifestConfigured ? 'Your plugins are all up to date.' : 'Installed plugins:'}
          </p>
        ) : null}
        {plugins.length > 0 ? (
          <ul className="update-list">
            {plugins.map((item) => (
              <li key={item.id}>
                {itemLabel(item)}
                {item.status === 'update' ? (
                  <span className="update-available"> — update to {item.availableVersion}</span>
                ) : null}
                <span className="update-auto">
                  {item.autoUpdates ? 'Automatic updates enabled' : 'Automatic updates disabled'}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="themes-updates-heading">
        <h2 id="themes-updates-heading">Themes</h2>
        {themeUpdates.length === 0 ? (
          <p>
            {status.manifestConfigured ? 'Your themes are all up to date.' : 'Installed themes:'}
          </p>
        ) : null}
        <ul className="update-list">
          {themes.map((item) => (
            <li key={item.id}>
              {itemLabel(item)}
              {item.status === 'update' ? (
                <span className="update-available"> — update to {item.availableVersion}</span>
              ) : null}
              <span className="update-auto">
                {item.autoUpdates ? 'Automatic updates enabled' : 'Automatic updates disabled'}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

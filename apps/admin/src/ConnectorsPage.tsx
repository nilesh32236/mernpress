import { useEffect, useState, type FormEvent } from 'react';
import {
  actionErrorMessage,
  disconnectConnector,
  fetchConnectors,
  setConnectorKey,
  type ConnectorState,
} from './api.js';
import { Notice, PageHeader, Skeleton, type NoticeMessage } from './components.js';
import { navigate } from './router.js';

/**
 * Settings → Connectors (WordPress 7.1).
 *
 * WordPress stores provider credentials here for plugins to share. MERNPress
 * keeps the same surface: provider rows with a key field, a masked "Connected"
 * state and disconnect. Keys are encrypted at rest and no bundled feature
 * consumes them yet, which the screen says plainly.
 */
export function ConnectorsPage() {
  const [connectors, setConnectors] = useState<ConnectorState[] | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchConnectors()
      .then((items) => {
        if (active) setConnectors(items);
      })
      .catch((caught) => {
        if (active) setError(actionErrorMessage(caught));
      });
    return () => {
      active = false;
    };
  }, []);

  async function connect(event: FormEvent<HTMLFormElement>, connector: ConnectorState) {
    event.preventDefault();
    if (busyId) return;
    const apiKey = keys[connector.id]?.trim() ?? '';
    if (!apiKey) return;
    setBusyId(connector.id);
    setNotice(null);
    setError(null);
    try {
      const items = await setConnectorKey(connector.id, apiKey);
      setConnectors(items);
      setKeys((current) => ({ ...current, [connector.id]: '' }));
      setNotice({ tone: 'success', text: `${connector.name} credentials saved.` });
    } catch (caught) {
      setError(actionErrorMessage(caught));
    } finally {
      setBusyId(null);
    }
  }

  async function disconnect(connector: ConnectorState) {
    if (busyId) return;
    setBusyId(connector.id);
    setNotice(null);
    try {
      const items = await disconnectConnector(connector.id);
      setConnectors(items);
      setNotice({ tone: 'success', text: `${connector.name} disconnected.` });
    } catch (caught) {
      setError(actionErrorMessage(caught));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader title="Connectors" />
      {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="connectors-screen">
        <p className="connectors-intro">
          All of your API keys and credentials are stored here and shared across features. Configure
          once and use everywhere.
        </p>

        <div className="connectors-banner">
          <div>
            <p>
              AI features can use these connectors to generate featured images, alt text, titles and
              excerpts. No AI feature is bundled with this build yet, so saved keys are stored
              encrypted and not used until one ships.
            </p>
            <button
              type="button"
              className="button primary-button"
              onClick={() => navigate('/plugins')}
            >
              Browse plugins
            </button>
          </div>
          <span className="connectors-banner-art" aria-hidden="true">
            ⚗
          </span>
        </div>

        {connectors === null ? (
          <Skeleton label="Loading connectors…" lines={3} />
        ) : (
          <ul className="connectors-list">
            {connectors.map((connector) => (
              <li key={connector.id} className="connector-row" data-connector={connector.id}>
                <span className="connector-icon" aria-hidden="true">
                  {connector.name.slice(0, 1)}
                </span>
                <div className="connector-copy">
                  <strong>{connector.name}</strong>
                  <span className="connector-description">{connector.description}</span>
                  {connector.configured ? (
                    <span className="connector-status">Connected · key {connector.maskedKey}</span>
                  ) : null}
                </div>
                {connector.configured ? (
                  <button
                    type="button"
                    className="button secondary-button"
                    onClick={() => void disconnect(connector)}
                    disabled={busyId === connector.id}
                  >
                    Disconnect
                  </button>
                ) : (
                  <form
                    className="connector-connect"
                    onSubmit={(event) => void connect(event, connector)}
                    aria-label={`Connect ${connector.name}`}
                  >
                    <label htmlFor={`connector-${connector.id}-key`} className="screen-reader-text">
                      {connector.name} API key
                    </label>
                    <input
                      id={`connector-${connector.id}-key`}
                      type="password"
                      placeholder="API key"
                      value={keys[connector.id] ?? ''}
                      onChange={(event) =>
                        setKeys((current) => ({ ...current, [connector.id]: event.target.value }))
                      }
                      disabled={busyId === connector.id}
                    />
                    <button
                      type="submit"
                      className="button primary-button"
                      disabled={busyId === connector.id || !(keys[connector.id] ?? '').trim()}
                    >
                      {busyId === connector.id ? 'Saving…' : 'Connect'}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="connectors-footer">
          Only the built-in providers are listed. Additional connectors require a plugin runtime,
          which this build does not include.
        </p>
      </div>
    </>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import {
  actionErrorMessage,
  completeDataRequest,
  createDataRequest,
  downloadPersonalData,
  fetchDataRequests,
  type DataRequest,
  type DataRequestType,
} from './api.js';
import { Notice, PageHeader, Skeleton, type NoticeMessage } from './components.js';

function formatRequested(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Tools → Export Personal Data / Erase Personal Data (WordPress 7.1).
 *
 * Both screens share the same request workflow. An export request can produce a
 * real JSON download of the account's profile, posts and comments. An erasure
 * request anonymises the profile and comment authorship when the administrator
 * confirms it; the account itself is kept, matching WordPress.
 */
export function PersonalDataPage({ type }: { type: DataRequestType }) {
  const isExport = type === 'EXPORT';
  const title = isExport ? 'Export Personal Data' : 'Erase Personal Data';
  const [requests, setRequests] = useState<DataRequest[] | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchDataRequests(type)
      .then((items) => {
        if (active) setRequests(items);
      })
      .catch((caught) => {
        if (active) setError(actionErrorMessage(caught));
      });
    return () => {
      active = false;
    };
  }, [type]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const created = await createDataRequest(type, email);
      setRequests((current) => [created, ...(current ?? [])]);
      setEmail('');
      setNotice({
        tone: 'success',
        text: isExport ? 'Data export request created.' : 'Data erasure request created.',
      });
    } catch (caught) {
      setError(actionErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function complete(request: DataRequest) {
    if (actionId) return;
    setActionId(request.id);
    setError(null);
    try {
      const updated = await completeDataRequest(request.id);
      setRequests((current) =>
        (current ?? []).map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      setNotice({
        tone: 'success',
        text: isExport
          ? 'Export request marked as completed.'
          : 'Personal data erased and the request marked as completed.',
      });
    } catch (caught) {
      setError(actionErrorMessage(caught));
    } finally {
      setActionId(null);
    }
  }

  async function download(request: DataRequest) {
    if (actionId) return;
    setActionId(request.id);
    setError(null);
    try {
      await downloadPersonalData(request.id);
    } catch (caught) {
      setError(actionErrorMessage(caught));
    } finally {
      setActionId(null);
    }
  }

  const pending = (requests ?? []).filter((request) => request.status === 'PENDING');

  return (
    <>
      <PageHeader title={title} />
      {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="personal-data-screen">
        <p className="import-intro">
          {isExport
            ? 'This tool helps site owners comply with local laws and regulations by exporting known data for a given user as a JSON file.'
            : 'This tool helps site owners comply with local laws and regulations by deleting or anonymizing known data for a given user.'}
        </p>

        <div className="personal-data-panel">
          <h2>{isExport ? 'Add Data Export Request' : 'Add Data Erasure Request'}</h2>
          <form
            onSubmit={submit}
            aria-label={isExport ? 'Add export request' : 'Add erase request'}
          >
            <div className="field">
              <label htmlFor={`requester-${type}`}>Username or email address</label>
              <input
                id={`requester-${type}`}
                type="text"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={254}
                required
                disabled={busy}
              />
            </div>
            <div className="field actions">
              <button type="submit" className="button primary-button" disabled={busy}>
                {busy ? 'Sending…' : 'Send Request'}
              </button>
            </div>
          </form>
        </div>

        <div className="personal-data-list">
          <p className="personal-data-filter">
            {isExport ? 'Export' : 'Erase'} personal data list — All ({requests?.length ?? 0})
            {pending.length > 0 ? ` · ${pending.length} pending` : ''}
          </p>
          {requests === null ? (
            <Skeleton label="Loading requests…" lines={3} />
          ) : requests.length === 0 ? (
            <p className="personal-data-empty">No items found.</p>
          ) : (
            <div className="table-scroll">
              <table className="content-table widefat fixed striped">
                <thead>
                  <tr>
                    <th scope="col" className="column-requester">
                      Requester
                    </th>
                    <th scope="col" className="column-status">
                      Status
                    </th>
                    <th scope="col" className="column-requested">
                      Requested
                    </th>
                    <th scope="col" className="column-next-steps">
                      Next steps
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((request) => (
                    <tr key={request.id}>
                      <td className="column-requester">{request.email}</td>
                      <td className="column-status">
                        {request.status === 'PENDING' ? 'Pending' : 'Completed'}
                      </td>
                      <td className="column-requested">{formatRequested(request.createdAt)}</td>
                      <td className="column-next-steps">
                        {request.status === 'COMPLETED' ? (
                          <span className="personal-data-done">{request.note ?? 'Completed'}</span>
                        ) : isExport ? (
                          <>
                            <button
                              type="button"
                              className="button-link"
                              onClick={() => void download(request)}
                              disabled={actionId === request.id}
                            >
                              Download personal data
                            </button>
                            {' · '}
                            <button
                              type="button"
                              className="button-link"
                              onClick={() => void complete(request)}
                              disabled={actionId === request.id}
                            >
                              Mark as completed
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="button-link is-danger"
                            onClick={() => void complete(request)}
                            disabled={actionId === request.id}
                          >
                            Erase personal data
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

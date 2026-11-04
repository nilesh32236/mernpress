import { useState, type ChangeEvent, type FormEvent } from 'react';
import { actionErrorMessage, importWordPress, type ImportResult } from './api.js';
import { Notice, PageHeader, type NoticeMessage } from './components.js';
import { navigate } from './router.js';

interface ImporterRow {
  name: string;
  description: string;
  action: 'wordpress' | 'converter' | 'unavailable';
}

const IMPORTERS: ImporterRow[] = [
  {
    name: 'Categories and Tags Converter',
    description: 'Convert existing categories to tags or tags to categories, selectively.',
    action: 'converter',
  },
  {
    name: 'WordPress',
    description:
      'Import posts, pages, categories and tags from a WordPress export (WXR) file. Attachments, comments and users are not imported.',
    action: 'wordpress',
  },
  {
    name: 'Blogger',
    description: 'Import posts, comments and users from a Blogger blog.',
    action: 'unavailable',
  },
  {
    name: 'LiveJournal',
    description: 'Import posts from LiveJournal using their API.',
    action: 'unavailable',
  },
  {
    name: 'Movable Type and TypePad',
    description: 'Import posts and comments from a Movable Type or TypePad blog.',
    action: 'unavailable',
  },
  {
    name: 'RSS',
    description: 'Import posts from an RSS feed.',
    action: 'unavailable',
  },
  {
    name: 'Tumblr',
    description: 'Import posts and media from Tumblr using their API.',
    action: 'unavailable',
  },
];

/**
 * Tools → Import (WordPress 7.1). The WordPress importer is real: it reads a WXR
 * export in the browser, posts the XML to the API and reports what was created.
 * Importers for third-party services are listed but unavailable in this build.
 */
export function ImportPage() {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [xml, setXml] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setResult(null);
    setError(null);
    if (!file) {
      setFileName(null);
      setXml(null);
      return;
    }
    setFileName(file.name);
    setXml(await file.text());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!xml || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const imported = await importWordPress(xml);
      setResult(imported);
      setNotice({
        tone: imported.failed > 0 ? 'warning' : 'success',
        text: `Import finished: ${imported.posts} post${imported.posts === 1 ? '' : 's'}, ${imported.pages} page${
          imported.pages === 1 ? '' : 's'
        }, ${imported.terms} term${imported.terms === 1 ? '' : 's'}. ${imported.skipped} item${
          imported.skipped === 1 ? '' : 's'
        } skipped, ${imported.failed} failed.`,
      });
    } catch (caught) {
      setError(actionErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Import" />
      {notice ? <Notice notice={notice} onDismiss={() => setNotice(null)} /> : null}

      <div className="import-screen">
        <p className="import-intro">
          If you have posts or comments in another system, MERNPress can import those into this
          site. To get started, choose a system to import from below:
        </p>

        <table className="content-table widefat importers-table">
          <tbody>
            {IMPORTERS.map((importer) => (
              <tr key={importer.name}>
                <td className="import-name">
                  <strong>{importer.name}</strong>
                  <p className="import-actions">
                    {importer.action === 'wordpress' ? (
                      <button
                        type="button"
                        className="button-link"
                        onClick={() => setOpen((value) => !value)}
                        aria-expanded={open}
                      >
                        {open ? 'Close importer' : 'Run Importer'}
                      </button>
                    ) : importer.action === 'converter' ? (
                      <button
                        type="button"
                        className="button-link"
                        onClick={() => navigate('/tools')}
                      >
                        Open
                      </button>
                    ) : (
                      <span className="import-unavailable">Not available in this build</span>
                    )}
                  </p>
                  <p className="import-description">{importer.description}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {open ? (
          <div className="import-form-panel">
            <h2>Import WordPress</h2>
            <p className="field-help">
              Choose a WordPress export file (<code>.xml</code>, WXR format) to upload and import.
            </p>
            <form onSubmit={submit} aria-label="Import WordPress">
              <div className="field">
                <label htmlFor="import-file">Import file</label>
                <input
                  id="import-file"
                  type="file"
                  accept=".xml,text/xml,application/xml"
                  onChange={(event) => void onFile(event)}
                  disabled={busy}
                />
                {fileName ? <p className="field-help">Selected: {fileName}</p> : null}
              </div>
              <div className="field actions">
                <button type="submit" className="button primary-button" disabled={!xml || busy}>
                  {busy ? 'Importing…' : 'Upload file and import'}
                </button>
              </div>
            </form>
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            {result && result.errors.length > 0 ? (
              <div className="import-errors">
                <h3>Items that failed</h3>
                <ul>
                  {result.errors.map((entry) => (
                    <li key={`${entry.title}-${entry.message}`}>
                      <strong>{entry.title}</strong>: {entry.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}

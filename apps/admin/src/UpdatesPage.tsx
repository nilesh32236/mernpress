import { PageHeader } from './components.js';

export function UpdatesPage() {
  return (
    <>
      <PageHeader title="Updates" />
      <section className="content-card" aria-labelledby="core-updates-heading">
        <h2 id="core-updates-heading">MERNPress</h2>
        <table className="widefat update-table">
          <tbody>
            <tr>
              <td className="update-version">Version 0.1.0</td>
              <td>You have the latest version of MERNPress.</td>
            </tr>
          </tbody>
        </table>
        <p className="field-help">
          This installation is deployed from source. Automatic update checks are not configured for
          this build.
        </p>
      </section>
    </>
  );
}

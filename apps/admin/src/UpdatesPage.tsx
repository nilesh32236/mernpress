import { PageHeader } from './components.js';

export function UpdatesPage() {
  return (
    <>
      <PageHeader title="MERNPress Updates" />
      <section className="content-card" aria-labelledby="core-updates-heading">
        <h2 id="core-updates-heading">Current version: 0.1.0</h2>
        <p className="lede">You have the latest version of MERNPress.</p>
        <p className="field-help">
          This installation is deployed from source. Automatic update checks are not configured for
          this build.
        </p>
      </section>
    </>
  );
}

import { PageHeader } from './components.js';

export function UpdatesPage() {
  return (
    <div className="updates-page">
      <PageHeader title="MERNPress Updates" />
      <section aria-label="Update overview">
        <p>
          Updates may take several minutes to complete. If there is no feedback after 5 minutes, or
          if there are errors, please refer to the Help section above.
        </p>
        <p>
          Current version: <strong>0.1.0</strong>
        </p>
        <p>
          This installation is deployed from source, so automatic update checks are not configured
          for this build.
        </p>
      </section>

      <section aria-labelledby="core-updates-heading">
        <h2 id="core-updates-heading">MERNPress</h2>
        <p>You have the latest version of MERNPress.</p>
      </section>

      <section aria-labelledby="plugins-updates-heading">
        <h2 id="plugins-updates-heading">Plugins</h2>
        <p>Plugins are not enabled in this build.</p>
      </section>

      <section aria-labelledby="themes-updates-heading">
        <h2 id="themes-updates-heading">Themes</h2>
        <p>Themes are not enabled in this build.</p>
      </section>
    </div>
  );
}

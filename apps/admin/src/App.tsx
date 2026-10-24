export function App() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <header className="site-header">
        <span className="wordmark">MERNPress</span>
        <span className="phase-badge">Phase 1</span>
      </header>

      <main id="main-content" className="card" tabIndex={-1}>
        <p className="eyebrow">Repository foundation</p>
        <h1>MERNPress admin</h1>
        <p className="lede">
          The admin application is running. Authentication, content management and the block editor
          arrive in later phases; this page exists to prove the build, routing and deployment
          foundation.
        </p>

        <dl className="status-list">
          <div>
            <dt>API liveness</dt>
            <dd>
              <a href="http://127.0.0.1:4000/api/health">Open /api/health</a>
            </dd>
          </div>
          <div>
            <dt>API readiness</dt>
            <dd>
              <a href="http://127.0.0.1:4000/api/ready">Open /api/ready</a>
            </dd>
          </div>
          <div>
            <dt>Public site</dt>
            <dd>
              <a href="http://localhost:3000">Open the web placeholder</a>
            </dd>
          </div>
        </dl>

        <p className="note">
          No CMS features are implemented in Phase 1. This page contains no authentication form and
          no content controls.
        </p>
      </main>

      <footer className="site-footer">
        <p>MERNPress foundation · API, admin and public web are separate applications.</p>
      </footer>
    </div>
  );
}

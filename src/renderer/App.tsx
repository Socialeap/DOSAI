import type { RuntimeSnapshot } from '../contracts/runtime';

export function App({ runtime }: { readonly runtime: RuntimeSnapshot }) {
  const runtimeRows = [
    ['Electron', runtime.versions.electron],
    ['Chromium', runtime.versions.chromium],
    ['Node', runtime.versions.node],
    ['V8', runtime.versions.v8],
  ] as const;

  return (
    <div className="app-shell">
      <header className="titlebar">
        <h1>DOSAI</h1>
        <div className="shell-state" aria-label="Shell status">
          <span className="status-dot" aria-hidden="true" />
          Local shell
        </div>
      </header>

      <main className="workspace">
        <section className="empty-state" aria-labelledby="session-heading">
          <div className="empty-state-copy">
            <p className="context-label">{runtime.platformProfile}</p>
            <h2 id="session-heading">No active session</h2>
            <p className="session-note">Runtime boundaries are loaded. Agent execution is unavailable.</p>
          </div>

          <dl className="runtime-list" aria-label="Packaged runtime versions">
            {runtimeRows.map(([label, value]) => (
              <div className="runtime-row" key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <footer className="statusbar">
        <span>{runtime.platform}/{runtime.architecture}</span>
        <span>Phase 1 shell</span>
      </footer>
    </div>
  );
}

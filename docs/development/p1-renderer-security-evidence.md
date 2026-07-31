# P1.3 Renderer Security Evidence

**Status:** `[?] EVIDENCE_PENDING`<br>
**Evidence captured:** `2026-07-31T16:48:20-04:00`<br>
**Decision basis:** Accepted ADR 0001 and Electron security guidance<br>
**Review decision:** Owner review pending

This record covers the P1.3 renderer resource, process-isolation, navigation,
session, and IPC boundary. It introduces one read-only runtime query and does
not activate agent execution, filesystem, credential, database, network, or
other effect authority.

## Enforced Controls

- Production loads only `dosai://app/`. The standard, secure custom protocol
  serves `index.html` and hash-named JavaScript or CSS assets from the packaged
  renderer root. It rejects every other host, path, suffix, query, fragment,
  credential, port, and request method.
- Production responses set a restrictive CSP with `default-src 'none'`,
  self-only scripts and styles, no connections, no frames, no workers, no
  objects, no forms, and no base URL. Responses also set `nosniff`,
  `same-origin` resource policy, and `no-referrer`.
- The default session denies all permissions. Production requests are limited
  to the canonical application resource grammar. Development requests are
  limited to HTTP and WebSocket traffic on `127.0.0.1:5173` and receive a
  development-only CSP without `unsafe-eval`.
- The window explicitly enables sandboxing, context isolation, and web
  security while disabling renderer Node integration, subframe and worker Node
  integration, WebViews, WebSQL, mixed content, spelling services, and packaged
  DevTools.
- New windows are denied. Main-frame navigation, frame navigation, and
  redirects are checked against the exact environment-specific document URL.
  WebView attachment is denied application-wide.
- The preload exposes only `runtime.getSnapshot()`. Main registers only
  `dosai:runtime:get-snapshot`, accepts no arguments, verifies that the sender
  belongs to a `BrowserWindow`, requires its main frame, and requires the exact
  trusted document URL before returning a non-secret runtime snapshot.
- The package disables Electron's `GrantFileProtocolExtraPrivileges` fuse.

## Validation Results

| Command or inspection | Result |
| --- | --- |
| `pnpm run typecheck` | PASS; tooling, main, preload, renderer, and workers checked independently |
| `pnpm run test` | PASS; 15 tests total, including six P1.3 security suites and all nine prior architecture tests |
| `pnpm run check` | PASS; all typechecks, tests, and three production Vite builds |
| `pnpm run package` | PASS; arm64 package, nine fuses, 11 ASAR entries, and least-privilege plist |
| `pnpm exec electron-fuses read --app out/DOSAI-darwin-arm64/DOSAI.app` | PASS; file-protocol privileges, RunAsNode, Node options, and CLI inspect disabled; ASAR integrity and ASAR-only load enabled |
| `codesign --verify --deep --strict --verbose=2 out/DOSAI-darwin-arm64/DOSAI.app` | PASS; bundle valid on disk and satisfies its designated requirement |
| Clean packaged launch | PASS; Accessibility reported `dosai://app/` and the typed IPC snapshot returned Electron 43.2.0, Chromium 150.0.7871.129, Node 24.18.0, and V8 15.0.1240245-electron.0 |
| Packaged response-header capture | PASS; document returned 200, HTML MIME type, exact production CSP, `same-origin`, `no-referrer`, and `nosniff` |
| Compromised-renderer simulation | PASS; `require` and `process` were absent; inline script, external fetch, `file://` fetch, Node import, popup creation, and hostile navigation were blocked; only `runtime.getSnapshot` was exposed |
| `pnpm run dev` | PASS; exact loopback renderer, development CSP, preload, typed IPC, and clean SIGINT shutdown |
| Authority source scan and `git diff --check` | PASS; no generic IPC, raw process execution, shell opening, `loadFile`, insecure window setting, or whitespace error found |

## Faults Found and Remediated

1. The first resource-policy test showed that the URL parser normalizes
   `assets/../index.html` to `/index.html` before policy evaluation. The path
   could not escape the renderer root, but accepting a noncanonical request
   weakened the stated allowlist. The policy now requires both parsed authority
   checks and an exact match against the original canonical request grammar.
2. Initial packaged inspection reported the retired `file://` document because
   macOS reused a P1.2 process that had loaded the previous ASAR before the
   bundle was replaced. All DOSAI instances were terminated and a direct clean
   launch then reported `dosai://app/`. Future package inspections must begin
   from a confirmed clean process state.
3. The first packaging attempt could not resolve GitHub inside the filesystem
   sandbox while retrieving the pinned Electron archive. Re-running the same
   command with approved network access succeeded; dependency versions and
   package contents did not change.
4. Computer Use automatically launched the packaged app while the development
   app was already running, which initially obscured the development window.
   Targeting the pinned Electron application path isolated the loopback window
   and confirmed development behavior.

## Known Limitations

- P1.3 is not the P1 exit gate. P1.4 still owns broader forbidden-authority
  architecture checks and the remaining crash and renderer-compromise corpus.
- Rejected sender states are exercised through the same deterministic policy
  function used by the main handler. The live app confirms the accepted sender;
  it intentionally exposes no generic primitive with which an untrusted frame
  could manufacture arbitrary IPC during packaged testing.
- The runtime query returns version and platform metadata only. Future IPC
  operations must add operation-specific validation and policy authorization;
  this read-only proof does not pre-authorize them.
- Runtime probes used a temporary loopback DevTools launch switch to simulate a
  compromised renderer. Normal packaged launch keeps DevTools disabled, and
  the test instance was terminated after evidence capture.
- The local package remains ad hoc signed and is not notarized. Release signing,
  entitlements, notarization, and rollback controls belong to P11.

## Review Basis

The implementation follows Electron's official recommendations to prefer a
custom protocol over `file://`, set a restrictive CSP, constrain navigation and
new windows, validate every IPC sender, keep Node integration disabled, enable
context isolation and sandboxing, and review fuses.

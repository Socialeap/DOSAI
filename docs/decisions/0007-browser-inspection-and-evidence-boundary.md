# ADR 0007: Browser Inspection and Evidence Boundary

- **Status:** Accepted
- **Date:** 2026-07-31
- **Status updated:** 2026-07-31T03:18:25-04:00
- **Decision owner:** Repository owner
- **Related controls:** F04, F11
- **Related plan phases:** P6, P9

## Context

Remote content is hostile and browser inspection can expose cookies, storage,
authorization headers, request bodies, personal data, and deceptive UI state.
Loading a page is itself a network effect, and Electron's debugger can invoke
mutating or secret-bearing CDP methods; neither navigation nor CDP is inherently
read-only.

## Decision

### Browser Host and Session

- Create remote content only as a main-owned `WebContentsView`, never inside the
  HUD renderer DOM. Give it no preload or application bridge and set at least
  `nodeIntegration: false`, Node integration in workers and subframes off,
  `contextIsolation: true`, `sandbox: true`, `webSecurity: true`, insecure-content
  and experimental features off, the `<webview>` tag off, and DevTools off.
- Create a fresh high-entropy non-`persist:` partition with cache disabled before
  constructing each inspection view. Verify it is non-persistent and has no
  storage path. Never use the default session, a caller-chosen partition, a
  previously used partition, or a session shared with another view or operation.
- Use only dedicated non-production test accounts containing synthetic data.
  Never adopt, copy, attach, import, or remotely debug a personal, production, or
  separately authenticated browser profile.
- Permit owner-entered authentication only inside the isolated test view for an
  approved flow. Disable capture during credential entry and authentication
  transitions; do not provide password-manager, autofill, clipboard, credential
  import, cookie export, or token-inspection features.
- Keep trusted window chrome, origin and environment identity, capture state, and
  approval UI outside and visually distinct from remote content. Remote content
  cannot cover, imitate programmatically, or receive events from trusted controls.

### Navigation and Host Capabilities

- Treat initial navigation, redirects, subframes, subresources, WebSockets, form
  submission, clicks, and reloads as typed network capabilities. Bind each plan
  to exact normalized schemes, origins, paths where needed, account, environment,
  request classes, resource and byte limits, and expiry. A visual label or page
  title never establishes identity.
- Allow secure protocols and normal certificate validation only. Deny by default
  `file:`, custom and external protocols, insecure transport, certificate bypass,
  loopback, link-local and private-network targets, unapproved proxies, integrated
  authentication, client certificates, and destinations outside the operation
  plan. Redirects and DNS results are revalidated at use.
- Register navigation and request controls before the first load. Parse URLs with
  platform URL APIs, validate every frame and request independently, and fail
  closed on missing, malformed, opaque, inherited, or changed origins.
- Deny all new windows, popups, downloads, external-open requests, file choosers,
  drag-and-drop navigation, protocol handlers, extensions, and unapproved service
  worker behavior. A separately approved external URL may be shown as inert text;
  hostile content never reaches `shell.openExternal`.
- Install permission check and request handlers that deny by default, including
  media, display capture, geolocation, notifications, clipboard, filesystem,
  serial, USB, HID, Bluetooth, MIDI, sensors, pointer or keyboard lock, and device
  selection. No default Chromium or Electron permission behavior grants access.
- Capture-only inspection does not click, type, submit, upload, download, or
  mutate server state. Any interactive browser workflow is a separate typed
  operation with its own effects and evidence; it cannot inherit a read-only
  label from the inspector.

### CDP Broker

- Restrict all `webContents.debugger` access to one reviewed broker module. The
  renderer, agents, packet handlers, evidence consumers, and generic main-process
  code never receive a debugger object, method string, target identifier, session
  identifier, or general `sendCommand` capability.
- Pin the Electron and bundled CDP versions. Define a compile-time allowlist of
  exact observational methods, parameter schemas, target types, response fields,
  and event types for each evidence operation. Unknown versions, methods, fields,
  targets, or events fail closed rather than falling through to the protocol.
- Prohibit broad or mutating domains and methods, including access to cookies,
  storage, request or response bodies, authorization data, runtime evaluation,
  script injection, bindings, CSP bypass, downloads, file access, target creation,
  emulation that changes page behavior, and browser-global state.
- Attach only to the exact registered inspection `webContents`. Bind every command
  and result to its view generation, main-frame identity, navigation or loader
  identity, normalized origin, operation digest, and capture sequence. Revalidate
  before and after capture; discard results if navigation, process, target, or
  policy state changed.
- Treat debugger detach, DevTools attachment, target replacement, renderer or
  browser-process crash, timeout, or protocol error as capture failure. Never
  silently reattach and reuse prior approval or partial evidence.

### Evidence Boundary

- Define origin-specific, versioned extraction profiles. Default DOM and
  accessibility evidence is structural metadata only and excludes values, free
  text, form state, editable content, URL queries and fragments, hidden content,
  scripts, styles, comments, storage, and event listeners. Text or attributes
  require an explicit allowlisted selector, field, purpose, and size.
- Do not collect raw console messages by default because applications routinely
  print credentials, tokens, personal data, and attacker-controlled text. Any
  future console schema must be separately approved and extract only bounded
  allowlisted fields before crossing the boundary.
- Permit image evidence only for an approved synthetic fixture or precisely
  bounded region and capture state. Apply deterministic masks and secret-canary
  checks in a dedicated memory-bounded evidence worker before any HUD, prompt,
  packet, audit, filesystem, database, cache, or export access. If sensitive
  content cannot be excluded with high confidence, emit no image.
- Keep raw CDP responses and frames transient inside the browser and evidence
  boundary, with no logging, crash-report attachment, retry cache, or general IPC.
  Destroy temporary buffers promptly. A renderer receives only the final bounded
  sanitized display model.
- Make each canonical sanitized artifact immutable and bind it to operation and
  capture-plan digests, session and view generations, exact origin and frame,
  navigation identity, viewport and scale, capture sequence, method and profile
  versions, redactions, exclusions, truncation, provenance, and retention class.
  Derived DOM, accessibility, OCR, image, and visual-difference summaries identify
  that source artifact and cannot authorize an action.

### Lifecycle and Recovery

- Register states such as `CREATED`, `AUTHENTICATING`, `READY`, `CAPTURING`,
  `TEARING_DOWN`, `DESTROYED`, and `QUARANTINED`. Only the browser broker advances
  state; capture is valid only in the exact approved state and generation.
- On completion, cancellation, timeout, navigation violation, or crash, stop
  requests, detach the debugger, destroy the `WebContents`, close network
  connections, terminate managed service workers, clear authentication, storage,
  cache and code-cache state, remove handlers, release all references and raw
  buffers, and verify no managed download or session artifact remains.
- Never reuse a torn-down session even when cleanup succeeds. If teardown or
  verification is uncertain, record `QUARANTINED`, block affected resources, and
  reconcile before another browser operation. Startup removes or reports orphaned
  managed artifacts before enabling inspection.
- An in-memory partition prevents ordinary session persistence but does not prove
  erasure from process memory, operating-system swap, crash dumps, GPU memory,
  provider logs, or unmanaged screenshots. Disable sensitive crash and network
  logging, test packaged filesystem behavior, minimize all source data, and state
  these residual limits explicitly.

## Consequences

Some authenticated inspection workflows remain unsupported. The architecture
trades convenience for a defensible secret and remote-code boundary. General CDP,
personal profiles, arbitrary screenshots, console capture, browser automation,
and unbounded multi-origin applications remain unavailable until a narrower
operation and evidence profile is approved and proven.

Chromium, Electron, GPU, operating-system, and remote-provider compromise remain
residual risks. A test account limits impact but does not make remote content or
captured claims trustworthy.

## Alternatives Rejected

- Loading remote pages in the HUD renderer risks privilege confusion.
- A shared persistent session can import unrelated credentials and state.
- Redacting only after persistence creates prohibited residual copies.
- A non-persistent partition reused across operations still shares live cookies,
  storage, cache, service workers, and authority.
- Calling arbitrary CDP methods from trusted main-process code defeats the broker
  even when the remote renderer is sandboxed.
- DOM selector redaction alone cannot reliably sanitize canvas, shadow DOM,
  overlays, race-driven content, or screenshots.
- A GET request, page load, or apparent inspection action can still cause remote
  side effects and cannot be globally classified as read-only.

## Evidence Required

P6 must test default-session and partition reuse, cache configuration timing,
Node and preload access, renderer and HUD compromise, IPC sender confusion,
origin parsing, redirects, subframes and fenced frames, DNS rebinding and private
network targets, mixed content, certificate errors, integrated authentication,
client certificates, proxies, popups, new targets, external protocols, downloads,
file choosers, drag-and-drop, every permission and device handler, extensions,
service workers, debugger method and target injection, CDP version drift, runtime
evaluation attempts, navigation races, debugger detach, renderer and browser
crashes, CPU, memory, DOM-node, pixel and network floods, capture during login,
malformed DOM and accessibility trees, overlays and canvas, teardown interruption,
and app restart.

Secret canaries must be placed in cookies, HTTP authentication, request and
response headers and bodies, URLs, local and session storage, IndexedDB, cache and
service-worker state, DOM text and attributes, form values, accessibility names,
console messages, images, frames, shadow DOM, and downloads. No canary may cross
into the HUD, prompt, packet, audit payload, managed file, database, cache, crash
report, or export. Tests must also prove that unrelated user profiles and browser
processes remain untouched and that uncertain capture or cleanup yields no
artifact and no false success.

P9 must prove canonical sanitized artifacts precede every derived summary and
that changed capture plans, origins, navigation identities, redaction profiles,
or transformer versions cannot reuse prior approval or evidence.

## Implementation References

- Electron security checklist: <https://www.electronjs.org/docs/latest/tutorial/security>
- Electron `WebContentsView`: <https://www.electronjs.org/docs/latest/api/web-contents-view>
- Electron session API: <https://www.electronjs.org/docs/latest/api/session>
- Electron debugger API: <https://www.electronjs.org/docs/latest/api/debugger>
- Chrome DevTools Protocol: <https://chromedevtools.github.io/devtools-protocol/>

## Revisit Conditions

Revisit only when an approved platform API can expose required evidence without
granting DOSAI access to prohibited session material. A new Electron or CDP major
version, evidence profile, permission, browser interaction, persistent session,
profile import, remote-debugging mode, or capture class requires renewed platform
review and adversarial evidence.

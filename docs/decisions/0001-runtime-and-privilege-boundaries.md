# ADR 0001: Runtime and Privilege Boundaries

- **Status:** Accepted
- **Date:** 2026-07-31
- **Status updated:** 2026-07-31T02:19:15-04:00
- **Decision owner:** Repository owner
- **Related controls:** F01, F04, F05, F12
- **Related plan phases:** P1-P3, P6-P7

## Context

Electron combines a privileged Node.js main process with Chromium renderers. A
renderer, remote page, parser, persistence worker, or long-running computation
must not inherit authority merely because it runs inside the DOSAI application.

## Decision

Use a multi-process architecture with explicit privilege separation:

- The React renderer is a presentation layer with no Node.js integration.
- A context-isolated preload exposes individual typed methods, never generic IPC.
- The Electron main process coordinates requests but does not hold execution
  grants, audit signing keys, raw credentials, or unrestricted database APIs.
- Policy, approval, execution, Git, audit, persistence, evidence processing, and
  watchdog functions use narrow services or workers with distinct interfaces.
- Remote content runs only in a sandboxed `WebContentsView` separate from the HUD.
- Heavy or adversarial parsing, image, database, and stream work never runs on the
  renderer or main event loop.
- Hardened Runtime is required. macOS App Sandbox compatibility and helper
  entitlements must be proven before choosing App Store distribution.

## Consequences

The architecture has more processes, schemas, lifecycle states, and packaging
work. In return, renderer compromise and worker failure have smaller authority,
and emergency control can remain independent from the UI.

## Alternatives Rejected

- A monolithic Electron main process has excessive privilege and availability
  coupling.
- Renderer-accessible generic IPC or Node APIs cannot enforce least authority.
- UI conventions alone do not create a trust boundary.

## Evidence Required

P1 must prove sandbox, context isolation, sender validation, navigation policy,
and forbidden import boundaries. P3 and P6 must prove helper and remote-content
containment under compromise and load.

## Revisit Conditions

Revisit if Electron cannot support required macOS sandboxing or signing, or if a
smaller native shell materially improves the verified boundary model.

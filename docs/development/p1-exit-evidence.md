# P1 Exit Engineering Evidence

**Status:** `[~] IN_PROGRESS`<br>
**Evidence captured:** `2026-07-31T18:12:47-04:00`<br>
**Engineering audit result:** `PASS`<br>
**Formal acceptance result:** `FAIL` (first `P1-AT-001` attempt; harness fault)<br>
**Decision basis:** Accepted P1 exit gate and Acceptance Testing and Evidence v1

This record covers the packaged Phase 1 shell's recovery, malformed-request,
navigation, renderer-compromise, and bounded-load behavior. It does not claim a
formal acceptance-suite pass, activate a runtime capability, or authorize Phase
2. The first formal attempt is preserved as a failure caused by a document
readiness race in the harness. The isolated remediation is accepted; formal
reruns follow its clean baseline commit.

## Implemented Controls

- A non-clean `render-process-gone` event reloads the trusted document through
  the existing custom protocol. Recovery is disabled during application quit,
  limited to three attempts per 60 seconds, and fails closed for invalid or
  regressing time.
- The preload rejects every argument to `runtime.getSnapshot()` before invoking
  IPC. Main independently retains its zero-argument and sender checks.
- `tests/runtime/p1-packaged-runtime-audit.mjs` uses fixed test code, an isolated
  temporary profile, loopback-only CDP, bounded deadlines and load, and one
  owned process group. It accepts no command-line input, performs no external
  effect, and removes its process group and profile.
- The harness labels its output `formal_acceptance_report: false`, returns only
  stable assertions and measurements, and performs a secret-pattern scan.

## Validation Results

| Command or inspection | Result |
| --- | --- |
| `pnpm run check` | PASS; five typecheck surfaces, 27 tests, and three production builds |
| `pnpm run package` | PASS after approved network retry; nine fuses, 11 ASAR entries, and least-privilege plist verified |
| `pnpm run audit:p1` | PASS; 29 packaged assertions, cleanup, and secret scan |
| Package identity | ASAR SHA-256 `b650cdea650335c18e2cb6ae99bcae971162af7dc919ced048cd834fe3652018` |
| Runtime identity | Electron 43.2.0, Chromium 150.0.7871.129, Node 24.18.0, V8 15.0.1240245-electron.0 |
| Boundary corpus | PASS; Node globals and import absent, bridge exact and frozen, unknown method absent, extra and 1 MiB arguments rejected, 100 duplicate reads stable, subframe bridge unavailable |
| Session and navigation corpus | PASS; inline script, external and file fetch, popup, permission, hostile navigation, and external protocol denied |
| Bounded load | PASS; 2,000 typed reads in 23 ms, renderer timer delay 8 ms, shell remained reachable |
| Recovery corpus | PASS; deliberate renderer crash reloaded a fresh trusted renderer; forced application termination restarted cleanly from the same isolated profile |
| Cleanup | PASS; owned process group exited and isolated profile was removed |

The audit ran on macOS 26.5.2 arm64. The package declares the accepted minimum
macOS version 15.0, but this host does not prove execution on that minimum.

## Faults Found and Remediated

1. The shell had no `render-process-gone` recovery path, so a crashed renderer
   could leave the main window unusable. The main process now performs bounded
   trusted reloads while explicitly suppressing recovery during quit.
2. JavaScript callers could pass extra or oversized arguments to the preload
   wrapper. Main rejected them, but the wrapper silently discarded them before
   IPC. The preload now rejects them locally, preserving defense in depth and a
   measurable no-effect boundary.
3. The first recovery budget used wall time and did not explicitly reject a
   clock moving backward. Production now uses monotonic time, a regressing
   injected clock fails closed, and both bounds have dedicated tests.
4. Packaging initially failed because the filesystem sandbox could not resolve
   GitHub while retrieving the exact pinned Electron archive. The unchanged
   package command passed with approved network access.
5. Formal runner 0.1.0 began its first boundary probe before `document.head`
   existed, producing `RUNTIME_EVALUATION_FAILED`. Runner 0.1.1 now waits for a
   healthy document before probing and emits only safe stable exception codes.

No application fault or external effect was observed. The failed run completed
cleanup and its evidence secret scan successfully.

## Formal Gate Progress

ADR 0011, catalog v2, schemas v2, registry v3, and the nine-item relocation are
Accepted. Catalog v3 remains the immutable first executable generation and its
first formal failure is retained. Catalog v4, runner 0.1.1, fixture manifests
v2, evidence schema v4, remediation lineage, and registry v5 are Accepted.

## Current Gate Sequence

Commit the accepted v4 digest-pinned state to satisfy the clean-subject
precondition, then rerun all three packaged suites into the ignored managed
evidence directory. Their reports and artifacts require independent review
before any P1 exit decision.

## Result

The implemented Phase 1 shell satisfies its local engineering audit and retains
zero execution authority. Formal `P1.EXIT` remains in progress with one
preserved harness failure, pending a clean remediated subject, three successful
formal runs, and report review; every runtime capability remains `UNVERIFIED`.

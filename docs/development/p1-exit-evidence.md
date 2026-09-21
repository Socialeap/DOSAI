# P1 Exit Engineering Evidence

**Status:** `[x] COMPLETE`<br>
**Evidence captured:** `2026-07-31T18:16:59-04:00`<br>
**Engineering audit result:** `PASS`<br>
**Formal acceptance result:** `PASS` (v4 rerun; first v3 failure preserved)<br>
**Decision basis:** Accepted P1 exit gate and Acceptance Testing and Evidence v1
**Review decision:** Owner accepted `2026-07-31T18:23:38-04:00`

This record covers the packaged Phase 1 shell's recovery, malformed-request,
navigation, renderer-compromise, and bounded-load behavior. The passing suites
do not by themselves activate a runtime capability or authorize Phase 2. The
first formal attempt is preserved as a failure caused by a document
readiness race in the harness. After the accepted isolated remediation, all
three formal v4 suites pass on one clean committed subject. The owner accepted
the gate evidence.

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
| `pnpm run check` | PASS; five typecheck surfaces, 47 tests, and three production builds |
| `pnpm run package` | PASS after approved network retry; nine fuses, 11 ASAR entries, and least-privilege plist verified |
| `pnpm run audit:p1` | PASS; 29 packaged assertions, cleanup, and secret scan |
| Formal package identity | SHA-256 `f17665f02b8b33062121bc74ec5cb69c33852702dc51469765614d4f385fdd95` |
| Runtime identity | Electron 43.2.0, Chromium 150.0.7871.129, Node 24.18.0, V8 15.0.1240245-electron.0 |
| Boundary corpus | PASS; Node globals and import absent, bridge exact and frozen, unknown method absent, extra and 1 MiB arguments rejected, 100 duplicate reads stable, subframe bridge unavailable |
| Session and navigation corpus | PASS; inline script, external and file fetch, popup, permission, hostile navigation, and external protocol denied |
| Bounded load | PASS; 2,000 typed reads in 24 ms, renderer timer delay 9 ms, shell remained reachable |
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

The accepted v4 state was committed as
`80e2fc656025e38e26e7cb857b7b140b63ae8f33`. All three suites passed and their
39 assertions, 17 artifacts, subject identity, cleanup, empty gaps, and secret
scans were independently revalidated. The accepted review record is
`docs/development/p1-formal-acceptance-evidence.md`.

## Result

The implemented Phase 1 shell satisfies its local engineering audit and retains
zero execution authority. Formal `P1.EXIT` is complete after three successful
v4 runs, independent report review, and owner acceptance. Only
`electron.typed_bridge` advances, with current-host and pinned-runtime
constraints; all effectful runtime capabilities remain `UNVERIFIED`.

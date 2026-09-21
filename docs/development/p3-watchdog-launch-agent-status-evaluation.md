# P3 Watchdog LaunchAgent Status Boundary Evaluation

**Status:** `ACCEPTED`<br>
**Recorded:** `2026-08-05T19:05:56-04:00`<br>
**Owner accepted v29:** `2026-08-05T20:36:41-04:00`<br>
**Implemented:** `2026-08-05T20:38:26-04:00`<br>
**Validated:** `2026-08-05T20:47:58-04:00`<br>
**Owner accepted v30:** `2026-08-06T02:49:00-04:00`<br>
**Decision:** Accepted ADR 0020<br>
**Accepted baseline:** Process ownership v30<br>
**Next gate:** Proposed ADR 0021 status-adapter architecture review

## Question

Choose the smallest step after accepted static plist-bearing package composition
that begins the Service Management lifecycle boundary without registering,
unregistering, loading, launching, or connecting to the service.

## Current Boundary

Accepted process ownership v28 binds a correctly signed local test app containing
the fixed named-service executable and byte-identical accepted LaunchAgent plist.
The package has never been registered, loaded, launched, or connected to DOSAI.
The Electron Main process and execution-service fixture retain no Service
Management, process-launch, registration, or application-connection authority.

The installed Xcode 26.6 / macOS 26.5 SDK confirms the macOS 15-compatible
`SMAppService` behavior selected by ADR 0020:

- `SMAppService.agent(plistName:)` selects a plist under the calling app's
  `Contents/Library/LaunchAgents` directory;
- `status` returns not registered, enabled, requires approval, or not found;
- `register()` may immediately bootstrap a LaunchAgent; and
- `unregister()` may terminate a running LaunchAgent without waiting for it to
  be reaped.

Because registration and unregistration can change launchd and process state,
they cannot be combined with the first Service Management source slice.

## Options Evaluated

### Register And Inspect In One Step

Rejected. Registration may immediately launch the accepted named-service
fixture and create persistent per-user background-item state. That requires an
exact registration, launch, cleanup, and app-interaction authorization plus
physical rollback evidence.

### Add The Final Electron Lifecycle Integration

Rejected. The accepted architecture does not yet choose a production
Main-to-ServiceManagement adapter. A native addon would move mutation authority
into Electron Main, while a helper would add a separately signed executable,
fixed process-launch path, protocol, package entry, and app-bundle context proof.
That decision should follow the no-effect API boundary rather than be assumed by
this slice.

### Compile-Only Fixed Status Candidate

Selected and implemented after owner acceptance. One Swift source candidate and
one adversarial source test were added. The candidate imports
`ServiceManagement`, constructs only `SMAppService.agent(plistName:)` with the
accepted fixed plist filename, and maps the four platform statuses to bounded
DOSAI observations. It has no entry point, executable output, package path,
invocation, or caller-controlled input.

## Implemented Files

- `native-helpers/execution-service/WatchdogLaunchAgentStatusCandidate.swift`
- `tests/security/p3-watchdog-launch-agent-status-candidate.test.mjs`

Both files are hash-bound by accepted process ownership v30. The Swift source
was typechecked only and was never compiled to an executable or invoked.

## Status Semantics

| Platform state | Candidate observation | DOSAI meaning |
| --- | --- | --- |
| `.notRegistered` | `NOT_REGISTERED` | Execution service unavailable; no fallback. |
| `.enabled` | `ENABLED` | Eligible to run only; not proof of liveness, XPC reachability, generation, or reconciliation. |
| `.requiresApproval` | `REQUIRES_APPROVAL` | Execution service unavailable pending an explicit user decision. |
| `.notFound` | `NOT_FOUND` | Package or service lookup is invalid; fail closed. |

No observation grants execution, registration, connection, or availability
authority. A future runtime must combine status with exact package identity,
authenticated XPC, service generation, and reconciliation evidence before it can
consider the service usable.

## Implemented Enforcement

The implementation proves:

1. only `ServiceManagement` is imported;
2. the plist filename is fixed and accepts no argument or environment input;
3. the switch handles exactly all four `SMAppService.Status` cases;
4. the result contains only the four bounded observations;
5. `register`, `unregister`, `openSystemSettingsLoginItems`, legacy status,
   launchctl, XPC, Virtualization, process, filesystem, and network APIs are
   absent;
6. typechecking targets arm64 macOS 15 without executable output; and
7. accepted v28, ADR 0020, plist, package script, and retained package evidence
   remain unchanged.

## Authority Boundary

Accepted process ownership v29 authorized only the two source changes. Accepted
process ownership v30 records their implementation evidence and twelve
successor-aware guard remediations. Neither generation authorizes:

- compiling or linking an executable;
- packaging, signing, or invoking the candidate;
- launching the DOSAI app or a helper;
- registration, unregistration, installation, loading, or service launch;
- opening System Settings or prompting for approval;
- connecting to the named Mach service;
- changing Electron Main or package composition; or
- VM, process, filesystem-data, network, journal, reconciliation, ownership-
  release, production-signing, or production behavior.

## Implementation Evidence

Final accepted process ownership v29 SHA-256 is
`def750d606cb1586b1fce47a7982b33614c1a4a21970f08970fcd2c56f62141d`.
Final accepted v30 is hash-bound to that immutable predecessor and has SHA-256
`b9abc5bf0791dff5254bfbe73cbe1e09c5792c8290de5eb0866f125f7482e10a`.
It changes only status-candidate evidence fields and four invariants, and binds:

- Swift source SHA-256
  `14a83456e08596bc777159196306f9e95b41e4d008d88230853b7ee20256d859`;
- adversarial test SHA-256
  `717b09ab087f89f536bca961f223cfa7800058a908ba6ee3a7e15de840be5ff3`;
- twelve exact successor-aware architecture and directory guard postimages; and
- explicit false observations for API invocation, runtime status, executable
  output, package mutation, registration, unregistration, System Settings,
  launch, and application connection.

The first full run exposed five stale exact-directory inventories. Updating
those inventories then exposed seven historical tests whose successor maps
ended at v28. All twelve changes are test-only, narrow, hash-bound in v30, and
preserve their accepted historical preimages. Focused status and successor-chain
checks pass 53 tests with no failures.

Pinned Node `24.18.0` and pnpm `11.18.0` validation passes:

```text
pnpm --config.verify-deps-before-run=warn run typecheck
8 TypeScript project checks passed

pnpm --config.verify-deps-before-run=warn test
416 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run build
main, preload, and renderer production builds passed
```

JSON parsing, predecessor and successor hashes, accepted package hashes and
layout, whitespace, and high-confidence secret checks pass. Pnpm repeated the
documented stale `node_modules` warning and used the installed lockfile
dependencies without changing dependency or lock files. No Service Management
API, signing tool, package command, app, helper, or packaged executable was
invoked.

## Known Limitations

- Compile-only source evidence does not prove app-bundle lookup context or
  physical `SMAppService.status` behavior.
- This slice does not choose the final Electron-to-native lifecycle adapter.
- Status does not prove process liveness, authenticated transport, service
  generation, ownership reconciliation, emergency-stop behavior, or cleanup.
- User approval, denial, disablement, registration, unregistration, relaunch,
  and cleanup remain physical owner-gated tests.

## Owner Decision

Accepted. V30 binds only the compile-only source, test, typecheck result, denial
observations, and twelve narrow guard remediations. It does not authorize a
package change, executable, signing operation, app or helper invocation,
registration, unregistration, service launch, or DOSAI application connection.

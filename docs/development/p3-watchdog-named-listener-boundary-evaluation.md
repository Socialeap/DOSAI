# P3 Watchdog Named-Listener Boundary Evaluation

**Status:** `ACCEPTED`<br>
**Recorded:** `2026-08-02T23:57:26-04:00`<br>
**Accepted:** `2026-08-03T00:01:52-04:00`<br>
**Implemented:** `2026-08-03T00:05:41-04:00`<br>
**Evidence accepted:** `2026-08-03T02:42:13-04:00`<br>
**Decision:** Accepted ADR 0020<br>
**Accepted baseline:** Process ownership v18 and schema registry v18

## Question

Choose the next bounded step between the accepted static anonymous XPC fixture
and ADR 0020's future per-user named LaunchAgent without creating an executable,
packaging a service declaration, registering, or launching anything.

## Current Boundary

Process ownership v16 accepts a signed static test app containing the exact
anonymous same-process XPC fixture. The package has no LaunchAgent plist,
`MachServices` declaration, ServiceManagement import, named listener,
application client, registration operation, or launch authority. The accepted
anonymous source and package postimages are hash-bound.

The next step must not repurpose or mutate that evidence fixture. Anonymous XPC
proves strict framing and code-requirement behavior, while a named Mach service
introduces different discovery, visibility, launchd, and directional identity
risks.

## Platform Findings

The installed macOS 26.5 SDK and local manual pages establish:

- `xpc_connection_create_mach_service` is available on the macOS 15 baseline;
- a listener must use `XPC_CONNECTION_MACH_SERVICE_LISTENER`;
- that flag is valid only for a service advertised in the process's launchd
  property list and cannot add a service dynamically;
- namespace lookup does not occur until connection activation;
- a per-user LaunchAgent must not use
  `XPC_CONNECTION_MACH_SERVICE_PRIVILEGED`;
- peer code requirements apply continuously to messages and drop requests that
  fail the listener requirement;
- a LaunchAgent with `MachServices` must check in for the advertised name; and
- `SMAppService.register()` may immediately bootstrap a LaunchAgent, while
  unregistering may terminate it asynchronously.

These semantics require separate gates for source declaration, executable
composition, plist packaging, registration, and physical launch behavior.

## Options Evaluated

### Package A LaunchAgent Plist Now

This would create an externally registerable declaration before DOSAI has a
reviewed named-listener implementation. It remains rejected.

### Convert The Accepted Anonymous Fixture

Changing the accepted anonymous transport would invalidate the proof baseline
and combine framing regression risk with named-service work. It is not selected.

### Add A Compile-Only Fixed Named-Listener Candidate

Add one new Swift source candidate that can construct only an inactive listener
for one fixed test Mach service and one exact incoming client code requirement.
The source is typechecked but not compiled into an executable, signed, packaged,
activated, registered, or launched. This is the selected next gate.

## Proposed Boundary

Process ownership v17 proposes these fixed identities:

- future test executable identifier:
  `com.socialeap.dosai.execution-service-fixture`;
- test Mach service identifier:
  `com.socialeap.dosai.execution-service-fixture.watchdog`;
- expected client identifier: `com.socialeap.dosai`; and
- expected TeamIdentifier: `3RD3TADLRY`.

Implementation added only:

- `native-helpers/execution-service/WatchdogNamedListenerCandidate.swift`; and
- `tests/security/p3-watchdog-named-listener-candidate.test.mjs`.

The candidate may use only the fixed service name,
`xpc_connection_create_mach_service`,
`XPC_CONNECTION_MACH_SERVICE_LISTENER`, and the accepted macOS 12+ peer code
requirement API to prepare an inactive listener. It cannot accept caller-supplied
names, requirements, identifiers, flags, queues, handlers, entitlements, PIDs,
paths, or payloads.

## Explicit Denials

This proposal grants no authority to:

- call `xpc_connection_activate`, accept a connection, or exchange a message;
- use `XPC_CONNECTION_MACH_SERVICE_PRIVILEGED`;
- compile or sign an executable;
- change the accepted anonymous XPC or package bytes;
- add a LaunchAgent or LaunchDaemon plist;
- import ServiceManagement or call `SMAppService`;
- package, install, register, unregister, launch, or connect from DOSAI;
- create or start a VM, target a PID, access files or networks, reconcile
  ownership, write the journal, or perform production work.

## Required Implementation Evidence

After owner acceptance, the compile-only slice must prove:

1. the accepted v16, anonymous transport, and package bytes remain exact;
2. the new source fixes all names and directional client identity internally;
3. Swift typechecking succeeds for arm64 macOS 15 without emitting an
   executable;
4. source scans reject activation, client connections, privileged flags,
   generic inputs, ServiceManagement, Virtualization, process, filesystem, and
   network APIs;
5. the proposed source and test are the only new implementation files; and
6. focused checks, eight typechecks, all repository tests, three builds, JSON,
   authority, whitespace, and secret scans pass.

## Proposal Validation

The exact governed toolchain was Node `24.18.0` and pnpm `11.18.0`.

```text
Combined process ownership v16-v17 checks
11 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run typecheck
8 TypeScript project checks passed

pnpm --config.verify-deps-before-run=warn test
322 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run build
main, preload, and renderer production builds passed
```

At proposal-validation time, process ownership v17 parsed strictly, was
hash-bound to accepted v16, changed
only execution-service proposal fields and matching invariants, and verifies all
five accepted anonymous-transport and package inputs by SHA-256. The proposed
Swift candidate and adversarial test were absent. No code-signing identity,
package output, launchd state, service status, or application runtime state was
used or changed by this evaluation.

## Implementation Evidence

The implemented Swift candidate:

- imports only `XPC`;
- fixes the future executable, Mach service, DOSAI client, and TeamIdentifier
  internally;
- exposes one zero-argument `makeInactiveListener()` factory;
- creates only an inactive listener with
  `XPC_CONNECTION_MACH_SERVICE_LISTENER`;
- applies the exact incoming DOSAI client code requirement before return; and
- contains no activation, event handler, messaging, client connection,
  privileged flag, executable entry point, or adjacent framework authority.

`swiftc -typecheck` passed for `arm64-apple-macos15.0` without an output path or
executable artifact. Process ownership v18 binds both final implementation
postimages and records every runtime, packaging, registration, and effect field
false.

```text
Focused implementation, evidence, and ripple checks
23 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run typecheck
8 TypeScript project checks passed

pnpm --config.verify-deps-before-run=warn test
330 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run build
main, preload, and renderer production builds passed
```

## Audit Remediation

The first full test run found five older exact-directory allowlists that still
encoded the pre-v17 four-file execution-service set. Each rejected only the new
authorized filename. The guards were updated narrowly to include
`WatchdogNamedListenerCandidate.swift`; the process-ownership v7 guard also
verifies that accepted v17 explicitly authorized the new source and test paths.
No guest, watchdog contract, runtime, or product implementation was weakened.
All 330 tests then passed.

## Known Limitations

- Typechecking does not prove launchd lookup, peer authentication, connection
  handling, disconnect reduction, or queue precedence for a named service.
- No executable or plist exists, so the proposed Mach service is not
  discoverable or launchable.
- Exact service-side and client-side signed runtime requirements remain future
  physical proofs.
- Service status, approval, registration, unregistration, crash, relaunch, and
  cleanup behavior remain separately owner-gated.

## Owner Decision

The repository owner accepted process ownership v17 and authorized only the two
compile-only source/test files. The repository owner subsequently accepted
process ownership v18 and its implementation evidence. No executable, signing,
package entry, plist, listener activation, connection, registration, launch, or
capability-state change is authorized or claimed.

# P3 Service Management Status Adapter Evaluation

**Status:** `ACCEPTED`<br>
**Recorded:** `2026-08-06T03:05:06-04:00`<br>
**Validated:** `2026-08-06T03:09:02-04:00`<br>
**Owner accepted:** `2026-08-06T03:59:18-04:00`<br>
**Decision basis:** Accepted ADR 0020<br>
**Accepted baseline:** Process ownership v30<br>
**Accepted decision:** ADR 0021, extending ADR 0020<br>
**Next gate:** Proposed process ownership v31 source-boundary review<br>

## Question

Select the final Electron-to-native adapter by which Electron Main may one day
observe the accepted LaunchAgent registration status without granting lifecycle
mutation, process launch, service connection, or execution authority.

This evaluation selects architecture only. It does not authorize an ownership
generation, source implementation, build, package change, native-module load,
status observation, application invocation, Service Management call, launchctl
call, registration, unregistration, service launch, or application connection.

## Fixed Contract

Every option is evaluated against the same accepted v30 contract:

| Property | Required value |
| --- | --- |
| Plist name | `com.socialeap.dosai.execution-service-fixture.plist` |
| Input | None |
| Output | `NOT_REGISTERED`, `ENABLED`, `REQUIRES_APPROVAL`, or `NOT_FOUND` |
| Unknown platform value | `NOT_FOUND` |
| Error, load failure, or invalid native return | `NOT_FOUND` |
| Minimum target | arm64 macOS 15 |
| Meaning | Observation only; never authorization, liveness, reachability, generation, reconciliation, or execution evidence |

The adapter must not accept a plist name, path, service identifier, operation,
argument, environment value, or arbitrary payload from Electron, the renderer,
or another process.

## Options Evaluated

### A. Packaged Native Status Probe Invoked On Demand

A dedicated Swift executable could compile the accepted status mapping, print
one bounded observation, and exit. This would isolate Service Management code
from Electron Main and reuse the current Swift implementation shape.

It is not selected. Electron Main currently has no process-launch authority,
and importing a process API to run one helper would introduce a generic
capability whose misuse is much broader than a read-only status property. The
probe would also need a separately proven executable identity, fixed launch
path, stdout framing, timeout, exit-code mapping, package entry, signing order,
and correct containing-app bundle context. A directly invoked nested executable
cannot be assumed to resolve the outer app's LaunchAgent declaration correctly
without physical proof. Those costs are disproportionate to one synchronous,
input-free observation.

### B. Native Helper Reached Through The Anonymous XPC Fixture Boundary

The accepted anonymous XPC fixture proves strict framing, peer identity, and
reduce-only behavior in a same-process test composition. It does not provide a
named runtime endpoint, application discovery, or a separately available
status service.

It is not selected. Asking the execution service for its own registration
status is circular: the observation must still work when that service is not
registered, denied, disabled, missing, or unreachable. Reusing the anonymous
fixture would require a new companion process or endpoint-transfer mechanism,
new lifecycle and package authority, and a second meaning for a transport whose
accepted purpose is watchdog control. XPC `INSPECT` remains service-health
evidence after authenticated connection; it is not an `SMAppService.status`
replacement.

### C. Status-Only Native Node-API Bridge In Electron Main

A first-party native Node-API module can be loaded only by a dedicated Electron
Main adapter. The native module can use the calling application's real bundle
context, construct only `SMAppService.agent(plistName:)` with the fixed accepted
plist name, read only `.status`, and return one bounded string. Electron Main
needs no child process, helper protocol, XPC dependency, caller-controlled
configuration, or service availability to obtain the observation.

This option is selected. It has the narrowest runtime path and the fewest new
failure boundaries. Its principal risk is that native code loaded into Electron
Main shares Main's process privileges. The design therefore requires a
separate status-only native target with one zero-argument export, no lifecycle
symbols, no generic Objective-C selector or native dispatch surface, strict
return validation, and no renderer exposure. A future registration adapter
must be a separately reviewed module and ownership gate; it cannot be added to
or inferred from this status target.

## Comparison

| Criterion | Packaged probe | Anonymous XPC reuse | Main-side Node-API bridge |
| --- | --- | --- | --- |
| Works when service is absent | Yes | No | Yes |
| Uses containing app context directly | Requires proof | No | Yes |
| Adds Main process-launch authority | Yes | No | No |
| Adds another service or endpoint | No | Yes | No |
| Reuses accepted anonymous watchdog meaning | No | Conflicts | No |
| Native code shares Electron Main privileges | No | No | Yes, tightly bounded |
| New framing or stdout protocol | Yes | Yes | No |
| Selected | No | No | Yes |

## Adapter Interface

The future TypeScript-facing port is conceptually:

```ts
type ExecutionServiceStatusObservation =
  | 'NOT_REGISTERED'
  | 'ENABLED'
  | 'REQUIRES_APPROVAL'
  | 'NOT_FOUND';

interface ExecutionServiceStatusAdapter {
  observe(): ExecutionServiceStatusObservation;
}
```

The interface has these mandatory rules:

1. `observe()` accepts zero arguments and is synchronous because it wraps one
   bounded platform property read.
2. The native export returns only one of the four accepted strings.
3. `.notRegistered`, `.enabled`, `.requiresApproval`, and `.notFound` map to
   their exact accepted DOSAI observations.
4. An unknown future platform value maps to `NOT_FOUND`.
5. Native module load failure, native exception, malformed return, unsupported
   platform, or any other adapter failure maps to `NOT_FOUND` without fallback.
6. `ENABLED` remains informational. It does not establish process liveness,
   authenticated XPC reachability, service generation, reconciliation, capsule
   ownership, execution eligibility, or authorization.
7. The adapter exposes no renderer IPC, registration method, unregistration
   method, settings method, raw platform object, diagnostic path, or error text.

The first implementation target, if later authorized, is arm64 macOS 15. Any
additional architecture or lower deployment target requires separate evidence.

## Authority Boundary And Non-Goals

This proposal grants no implementation or runtime authority. In particular:

- no status probe or native module is composed, built, loaded, invoked, signed,
  or packaged;
- no package script, Electron source, native-helper source, plist, or accepted
  v30 artifact is changed;
- no `SMAppService` method or property and no `launchctl` command is called;
- no registration, unregistration, System Settings action, installation,
  loading, service launch, app launch, or named-service connection occurs;
- no renderer or preload surface is added;
- no process, filesystem-data, network, XPC, journal, reconciliation, VM,
  execution, or production authority is added; and
- registration authority remains separate, false, and future owner-gated.

Accepted process ownership v30 remains byte-identical at SHA-256
`b9abc5bf0791dff5254bfbe73cbe1e09c5792c8290de5eb0866f125f7482e10a`.
The accepted compile-only candidate remains byte-identical at SHA-256
`14a83456e08596bc777159196306f9e95b41e4d008d88230853b7ee20256d859`.
No process ownership v31 is proposed by this evaluation.

## Required Future Gates

If the owner accepts ADR 0021, later work must remain sequential:

1. propose an ownership generation for only the status-only native target,
   dedicated Main adapter, and adversarial admission tests;
2. separately accept that proposal before creating implementation files;
3. prove exact export shape, fixed plist identity, four-value mapping, unknown
   and failure closure, macOS 15 compatibility, and absence of lifecycle APIs;
4. separately propose and accept package composition and signing before any
   native module is packaged or loaded;
5. separately authorize a physical status-only invocation in the signed app
   context; and
6. keep registration, unregistration, user-approval interaction, service
   launch, named XPC connection, and lifecycle cleanup under later independent
   gates.

## Proposal Validation

Pinned Node `24.18.0` and pnpm `11.18.0` validation passes:

```text
Focused accepted-v30 and status-candidate checks
8 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run typecheck
8 TypeScript project checks passed

pnpm --config.verify-deps-before-run=warn test
416 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run build
main, preload, and renderer production builds passed
```

Accepted v30, the compile-only Swift candidate, and `scripts/package.mjs`
retain their exact accepted hashes. No process ownership v31 or status-adapter
implementation path exists. Formatting and high-confidence secret checks pass.
Pnpm repeated the documented stale `node_modules` warning without changing a
dependency or lockfile.

## Owner Decision

Accepted. The owner selected only the status-only Electron Main Node-API bridge
architecture. Acceptance does not include an implementation, ownership
generation, package change, invocation, status result, or registration
authority.

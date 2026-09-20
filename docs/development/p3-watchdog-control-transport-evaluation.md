# P3 Watchdog Control Transport Evaluation

**Status:** `OWNER_ACCEPTED`  
**Recorded:** `2026-08-02T16:33:43-04:00`  
**Accepted:** `2026-08-02T17:34:57-04:00`  
**Proposal:** ADR 0020  
**Current ownership:** Accepted process ownership v10 over accepted v9  
**Current contracts:** Accepted schema registry v18 over accepted v17

## Question

Select the process lifecycle and authenticated control boundary for P3.4 without
adding execution authority before the owner accepts the boundary.

## Existing Constraints

- ADR 0003 requires the watchdog outside Electron Main and ordinary output,
  persistence, audit, and heavy-work paths.
- ADR 0014 assigns VM handles and destructive stop to one signed Swift execution
  service and reserves only inspect, stop-one, and stop-all on its priority path.
- Process ownership v8 keeps `native-helpers/execution-service` empty,
  application-unreachable, and without VM, launch, filesystem, or network
  authority.
- The current P3 registry reader is independently usable but read-only. It
  cannot stop, reclaim, repair, release ownership, or launch anything.
- The Main-side emergency path is priority and reduce-only, but it is not an
  independent native watchdog and has no isolation-unit handle.

## Platform Findings

Apple's XPC documentation separates three relevant lifecycles. A bundled XPC
service is a separate process but is tied to its client. A LaunchAgent is one
`launchd`-managed process per logged-in user. `SMAppService` registers a
LaunchAgent from a signed app bundle on supported DOSAI systems and exposes its
user authorization state.

XPC listeners and sessions can apply peer code requirements. Current APIs admit
same-team and exact signing-identifier requirements and drop or cancel peers
that fail them. This provides the platform identity layer but does not replace
DOSAI's session generation, anti-replay, strict message, and reduce-only checks.

The accepted macOS 15 baseline cannot use the Swift `XPCPeerRequirement`
wrapper, which the current SDK marks as macOS 26-only. The public C API
`xpc_connection_set_peer_code_signing_requirement`, available from macOS 12,
provides the required baseline-compatible enforcement and is the selected API
for the proposed anonymous transport fixture. Local preflight also established
that ad-hoc signing fails this authentication gate; a valid owner-authorized
development identity is required. Details are recorded in
`docs/development/p3-watchdog-xpc-transport-preflight.md`.

Virtualization.framework exposes stop on the `VZVirtualMachine` object. The
accepted architecture places that object in the execution service. Apple does
not document service-process death as equivalent to successful VM stop, so a
second process that merely terminates the service would not establish cleanup.

Sources:

- <https://developer.apple.com/documentation/xpc>
- <https://developer.apple.com/documentation/xpc/xpclistener>
- <https://developer.apple.com/documentation/xpc/xpcpeerrequirement>
- <https://developer.apple.com/documentation/servicemanagement/smappservice>
- <https://developer.apple.com/documentation/virtualization/vzvirtualmachine/stop(completionhandler:)>

## Options Evaluated

### Bundled XPC Service

It provides process isolation and structured IPC, but its documented
client-tied lifetime conflicts with the requirement to reduce authority after
Electron Main disconnects. It is not selected.

### Separate Watchdog Companion

A second process can survive service failure but cannot call stop on a VM object
owned by another process. Giving it PID or process-targeting fallback authority
would create a new hazardous boundary and still would not prove VM cleanup. It
is not selected.

### Root LaunchDaemon

A daemon survives UI failure but adds cross-user and root authority that the
per-user execution model does not need. It is not selected.

### Per-User Execution-Service LaunchAgent

The already selected execution service becomes a `launchd`-managed per-user
process. A dedicated priority lane in that process owns the reduce-only control
surface and can directly stop its own VM objects. Coordinator disconnect is a
local event that closes admission and schedules stop-all without waiting for
Electron, audit, or persistence. This is the recommended option.

## Safety Analysis

The recommended option minimizes authority holders: one native process owns the
VM and its cancellation primitive. Authentication combines platform peer code
requirements with service boot, ownership generation, session, sequence, and
request identities. The protocol contains no PID, path, executable, argument,
environment, shell, mount, network, or arbitrary payload operation.

Independence is bounded and stated precisely. The watchdog is independent of
Electron Main and ordinary service work, not independent of the process that
owns the VM. If that process dies, no in-process lane can run. The backend must
remain disabled until physical fault injection proves fail-closed VM teardown
and restart reconciliation. This is a required proof, not an implementation
assumption.

## Proposed First Implementation Slice

After owner acceptance, the next slice should remain no-effect:

1. Define process ownership v9 and schema registry v18 proposals for the exact
   LaunchAgent and XPC envelopes.
2. Implement only a signed test service and typed client with `INSPECT`,
   `STOP_ONE`, and `STOP_ALL` against inert fixture records.
3. Prove peer rejection, strict decoding, size bounds, replay handling,
   disconnect reduction, priority queue behavior, and packaged absence of any
   VM start or process-launch path.
4. Keep service registration owner-gated and test-only until packaged approval
   and cleanup behavior are accepted.

No Swift service, launch configuration, schema, ownership grant, executable,
registration, VM operation, process launch, or capability state is changed by
this evaluation.

## Owner Decision

The repository owner accepted ADR 0020's selection of an unprivileged per-user
LaunchAgent and in-service priority watchdog lane. Process ownership v9 and
schema registry v18 were subsequently accepted together as recorded in
`docs/development/p3-watchdog-control-contract-evidence.md`. Native
implementation remains limited to the exact no-effect test boundary they grant.
The accepted transport-free Swift control-core slice and ownership v10 delta
are recorded in `docs/development/p3-watchdog-control-core-evidence.md`.
Process ownership v11 was accepted, including test-only authorization to use an
existing valid Apple Development signing identity. The anonymous in-process
transport fixture and injected typed client are now implemented and proposed
for owner review under process ownership v12. Strict framing and ad-hoc peer
rejection are proven. Physical signing established that authorized selector
`UMXN25Z493` has actual TeamIdentifier `3RD3TADLRY`; the mismatched requirement
rejected it fail-closed. Process ownership v13 recorded the correction, and the
owner subsequently accepted v13 and authorized the actual TeamIdentifier for
the exact anonymous proof. A fresh signed fixture then authenticated on both
connections and verified disconnect reduction; process ownership v14 proposes
that evidence-only advancement. The implementation evidence is recorded in
`docs/development/p3-watchdog-xpc-transport-evidence.md`.

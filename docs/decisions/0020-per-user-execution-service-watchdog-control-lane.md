# ADR 0020: Per-User Execution Service Watchdog Control Lane

- **Status:** Accepted
- **Date:** 2026-08-02
- **Status updated:** 2026-08-02T17:34:57-04:00
- **Decision owner:** Repository owner
- **Related controls:** F02, F05, F06
- **Related plan phase:** P3.4
- **Extends:** ADR 0003 and ADR 0014
- **Related evaluation:** `docs/development/p3-watchdog-control-transport-evaluation.md`

## Context

ADR 0003 requires a minimal authenticated watchdog outside the renderer,
Electron main event loop, general persistence, audit, output, and heavy-work
paths. ADR 0014 assigns every `VZVirtualMachine` handle and destructive stop
operation to one signed Swift `dosai-execution-service`; Electron Main may only
use a future strict control contract.

The current P3 implementation has a read-only capsule-registry boundary and an
in-process priority emergency path, but no native service, authenticated
transport, independent stop authority, stale-owner reclamation, or VM teardown
proof. Process ownership v8 deliberately keeps the execution-service root empty
and application-unreachable.

Apple distinguishes a bundled XPC service, whose process lifetime is tied to
its client, from a per-user LaunchAgent managed by `launchd`. The watchdog must
continue reducing authority after Electron Main disconnects, so a
client-lifetime XPC service is not the required lifecycle boundary. A second
watchdog process would not own the `VZVirtualMachine` handles and could only ask
the execution service to stop or terminate that service. The latter would add
process-targeting authority while still depending on an unproven assumption
that helper death tears down every VM.

## Decision

Package `dosai-execution-service` as one unprivileged, per-user Swift
LaunchAgent registered through `SMAppService`. The user can inspect, approve,
disable, and unregister the service through macOS. DOSAI fails closed when the
service is absent or denied and never falls back to host execution, a root
daemon, an ad hoc child process, or a bundled client-lifetime XPC service.

The execution service remains the sole owner of VM construction, VM handles,
guest control, output limits, and VM destruction. Its watchdog is a dedicated
high-priority control lane inside that separate native process. This satisfies
independence from Electron and ordinary work while preserving direct access to
the exact VM ownership object. No second helper receives PID termination or VM
authority.

This decision selects the future boundary only. It grants no implementation,
registration, XPC, VM, process-launch, filesystem, network, reconciliation, or
production authority. Those authorities require later accepted ownership and
contract generations plus physical evidence.

### Lifecycle

- `launchd` manages one service process for the logged-in user. It never runs as
  root and never crosses user sessions.
- The service remains available while it owns a nonterminal capsule. Electron
  Main disconnect, renderer failure, ordinary queue failure, or audit failure
  cannot increase authority.
- Loss of the authenticated coordinator session immediately closes admission
  and schedules `STOP_ALL` on the reserved control lane. Reconnection cannot
  resume old work or cancel that reduction.
- Service startup admits no new work until its exact service generation,
  accepted registry history, and owned isolation inventory reconcile. Unknown,
  stale, conflicting, or incomplete ownership becomes blocked or quarantined.
- User denial, disablement, unregistration, service crash, or XPC failure makes
  execution unavailable. DOSAI surfaces the state without silently changing
  the service configuration.

### Authenticated Transport

Use a named Mach XPC service exposed by the LaunchAgent. Both listener and
client require the exact expected DOSAI team and signing identifiers through
XPC peer code requirements. Development fixtures use separately named,
test-only identities and cannot satisfy a production listener requirement.

Each accepted session also binds a service-generated random boot identifier,
the exact service generation, a coordinator-generated random session
identifier, and monotonically increasing request sequence. Each request has a
unique request identifier and a strict versioned operation envelope. A message
from another service boot, generation, session, or sequence is rejected;
identical replay may return only the cached idempotent result, while changed
reuse of an identifier terminates the session.

The transport admits only bounded dictionaries whose exact keys, types, sizes,
and enum values are declared in a future schema generation. It exposes no
generic remote-object selector, shell, executable, arguments, environment,
path, mount, socket, journal, database, signing, or arbitrary payload field.

### Reduce-Only Control Surface

The reserved lane admits exactly:

- `INSPECT`: return bounded state for registered DOSAI capsules and service
  health without paths, handles, PIDs, tokens, or host inventory.
- `STOP_ONE`: stop one exact capsule identifier in one exact supervisor and
  service generation.
- `STOP_ALL`: stop every capsule owned by the current service generation.

No operation creates, starts, resumes, reconfigures, retargets, or extends a
capsule. Requests never name a PID, process name, path, repository, VM label, or
caller-supplied process tree. Unknown identities fail closed without affecting
unrelated host work.

`STOP_ALL` has reserved queue capacity and precedence over `STOP_ONE`; both have
precedence over inspect, output, audit, persistence, guest graceful shutdown,
and ordinary control. Queue and response bounds are fixed. When graceful guest
shutdown exceeds its fixed allowance, the VM-owning service invokes the
framework destructive stop operation. Repeated and concurrent requests
converge on one terminal or quarantined result.

Emergency reduction starts before journal or registry writes. Evidence is
recorded afterward when those boundaries are available; failure produces an
explicit gap and cannot restore authority. `STOPPED` is returned only after the
owned VM and related service resources are verified absent. Uncertain cleanup
returns `QUARANTINED` and blocks affected resource reuse.

### Crash Boundary

Apple documents the VM stop API but does not document process death as a VM
teardown guarantee. DOSAI therefore makes no such claim from API inspection.
Physical fault injection must prove service-crash behavior, operating-system VM
teardown, bounded relaunch, stale-record reconciliation, and absence of orphaned
guest work. If that proof fails, the Virtualization.framework backend remains
disabled and this decision must be revisited before adding any fallback helper.

## Required Gates Before Implementation

1. Owner accepts this ADR without changing registry v16 or builder manifest v2.
2. An accepted process-ownership generation grants only the exact packaged
   service and Main-side typed client boundaries needed by the first slice.
3. An accepted schema generation defines strict request, response, session,
   replay, queue-limit, and error contracts.
4. A no-VM transport fixture proves mutual code-signing requirements, malformed
   and oversized rejection, cross-session replay rejection, disconnect-driven
   `STOP_ALL`, queue precedence, and absence of generic authority.
5. Packaged-app tests prove user approval, denied and disabled states,
   registration and unregistration behavior, exact helper identity, entitlement
   scope, and no unauthorized fallback.
6. VM enablement remains separately gated on every ADR 0014 supply-chain,
   isolation, teardown, crash, cleanup, and physical-host proof.

## Consequences

The watchdog can remain responsive when Electron Main, output, persistence, or
audit is unavailable, and the component that receives a stop request directly
owns the VM handle required to carry it out. The service remains unprivileged
and visible in macOS background-item controls.

This choice adds Service Management packaging, user-approval states, Mach XPC
authentication, native lifecycle logic, and fault-injection work. A crash of the
service itself is outside its in-process watchdog availability; safety then
depends on fail-closed restart reconciliation and physically proven VM teardown.

## Alternatives Considered

- **Bundled XPC service:** rejected because Apple defines it as tied to the
  client lifetime, which does not meet the Main-crash watchdog requirement.
- **Second watchdog helper:** rejected because it lacks the service-owned VM
  handles and would add narrow-but-dangerous process termination authority.
- **Root LaunchDaemon:** rejected because DOSAI needs no cross-user or elevated
  authority for per-user capsules.
- **Electron child process:** rejected because it is not the accepted signed
  service lifecycle and would add generic process-launch and PID hazards.
- **Watchdog in Electron Main:** rejected by ADR 0003 because event-loop,
  persistence, output, and renderer failures could make it unavailable.

## Platform Basis

- Apple documents LaunchAgents as per-user `launchd`-managed processes and
  `SMAppService` as the macOS 13+ registration API:
  <https://developer.apple.com/documentation/servicemanagement/smappservice>
- Apple documents XPC peer requirements for matching signing team, identifier,
  and entitlements:
  <https://developer.apple.com/documentation/xpc/xpcpeerrequirement>
- Apple documents the destructive `VZVirtualMachine.stop` operation but does not
  state that owner-process exit is an equivalent teardown guarantee:
  <https://developer.apple.com/documentation/virtualization/vzvirtualmachine/stop(completionhandler:)>

## Revisit Conditions

Revisit if physical crash tests cannot prove VM teardown and reconciliation,
the macOS background-service UX conflicts with distribution requirements, the
minimum supported macOS version changes, or Apple provides a stronger supported
VM ownership and emergency-stop primitive. Any companion process or broader
termination fallback requires a superseding ADR and new ownership generation.

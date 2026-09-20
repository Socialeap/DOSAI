# ADR 0021: Electron Main Service Management Status Adapter

- **Status:** Accepted
- **Date:** 2026-08-06
- **Status updated:** 2026-08-06T03:59:18-04:00
- **Decision owner:** Repository owner
- **Related controls:** F02, F05, F06
- **Related plan phase:** P3.4
- **Extends:** ADR 0020
- **Related evaluation:** `docs/development/p3-service-management-status-adapter-evaluation.md`

## Context

Accepted ADR 0020 selects an unprivileged per-user LaunchAgent registered with
`SMAppService`, while accepted process ownership v30 proves only an immutable,
compile-only Swift mapping of the service's registration status. Electron Main
still has no native status adapter, process-launch authority, Service Management
authority, package path, or application connection.

DOSAI must eventually surface absence, enablement, required approval, or an
invalid package lookup without treating any observation as authorization or
liveness. The observation must work when the execution service itself is
unavailable, and its implementation must not make registration authority an
incidental consequence of adding status visibility.

## Decision

Use a dedicated, first-party native Node-API status module loaded only by an
Electron Main adapter. The module has one zero-argument status export, embeds
the fixed plist name
`com.socialeap.dosai.execution-service-fixture.plist`, reads only the
corresponding `SMAppService.status` property in the calling app's bundle
context, and returns one bounded DOSAI observation.

The status module is structurally separate from every future registration or
lifecycle module. It may not export registration, unregistration, settings,
configuration, generic native dispatch, or raw Service Management objects.
Electron Main validates the native return and fails closed without fallback.

This ADR selects architecture only. It grants no implementation, ownership,
build, signing, package, loading, invocation, Service Management, launchctl,
registration, launch, connection, or production authority.

## Interface Contract

The Main-side port accepts no input and returns exactly one value:

- `NOT_REGISTERED`
- `ENABLED`
- `REQUIRES_APPROVAL`
- `NOT_FOUND`

Platform states map one-to-one to those values. Unknown future states, module
load failure, native exception, malformed native output, unsupported platform,
and every unclassified error map to `NOT_FOUND`.

The output is observation only. `ENABLED` does not prove process liveness,
authenticated XPC reachability, service generation, ownership reconciliation,
capsule state, execution availability, or authorization. The first eligible
implementation target is arm64 macOS 15.

## Security Boundary

Native code in Electron Main shares that process's privilege, so the accepted
implementation must minimize its trusted surface:

- one statically named native module and one zero-argument export;
- one compiled-in plist name and no caller-controlled identifiers or paths;
- only the four accepted output strings;
- no lifecycle methods, generic selectors, callback registration, arbitrary
  payloads, environment input, filesystem-data, network, process, XPC, journal,
  reconciliation, VM, or execution APIs;
- strict TypeScript-side return validation with fail-closed `NOT_FOUND`; and
- no preload, renderer, or application IPC exposure under this decision.

Registration authority remains separate and false. A later registration design
requires its own accepted architecture, ownership generation, package evidence,
physical authorization, cleanup proof, and user-state handling.

## Alternatives Considered

### Packaged Native Status Probe

Rejected because it would require Electron Main process-launch authority, an
additional signed executable and protocol, timeout and framing behavior, and
proof that a nested directly invoked executable resolves the containing app's
LaunchAgent declaration. Those boundaries are unnecessary for one bounded
property read.

### Existing Anonymous XPC Fixture

Rejected because the accepted fixture is same-process and test-only, exposes no
application runtime endpoint, and cannot report a service that is absent or
unreachable without circular dependency. Watchdog `INSPECT` is authenticated
service-health evidence, not registration-status evidence.

### Broader Electron Lifecycle Addon

Rejected because combining status with registration or unregistration would
give mutation authority to the first observation slice and make later review
unable to isolate the read-only boundary.

## Consequences

The selected adapter avoids child-process and companion-service authority and
uses the application's direct bundle context. It adds a future native binary to
Electron Main's trusted computing base and therefore requires strict source,
symbol, package, signing, and return-admission evidence before use.

The accepted Swift candidate remains an immutable semantic reference. A future
Node-API implementation must prove parity with its fixed mapping without
modifying that candidate or accepted process ownership v30.

## Required Gates

1. The owner accepts this ADR and its evaluation.
2. Only then may a process ownership generation be proposed for exact source
   and test paths; proposal acceptance must precede implementation.
3. Compile-only implementation evidence must precede package composition.
4. Package composition and test signing require separate owner acceptance and
   authorization.
5. Loading or invoking the module in the signed application requires a separate
   status-only physical proof gate.
6. Registration, unregistration, approval UI, service launch, XPC connection,
   and cleanup remain independent future gates.

## Revisit Conditions

Revisit if Node-API cannot provide a stable, exact macOS 15 build and package
boundary; if Service Management does not resolve the accepted plist from the
Electron application's bundle context; if static analysis cannot exclude
lifecycle symbols; or if Apple provides a narrower supported Electron-facing
status mechanism. Do not fall back to a helper process or XPC companion without
a superseding ADR and owner acceptance.

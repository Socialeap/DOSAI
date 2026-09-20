# P3 Watchdog XPC Transport Evidence

**Status:** `OWNER_ACCEPTED`<br>
**Recorded:** `2026-08-02T18:41:13-04:00`<br>
**Validated:** `2026-08-02T19:43:51-04:00`<br>
**Accepted:** `2026-08-02T19:41:47-04:00`<br>
**Identity correction accepted:** `2026-08-02T20:20:39-04:00`<br>
**Authenticated proof observed:** `2026-08-02T20:22:23-04:00`<br>
**Authenticated proof accepted:** `2026-08-02T20:46:43-04:00`<br>
**Decision:** Accepted ADR 0020<br>
**Accepted baseline:** Process ownership v14 and schema registry v18<br>

## Scope

This slice implements the accepted anonymous in-process XPC test boundary and
an uncomposed typed Main-side client. It adds strict runtime admission for the
accepted watchdog v1 session, request, and response schemas; fixed
`INSPECT`, `STOP_ONE`, and `STOP_ALL` client operations over an injected
transport; and a Swift XPC fixture that routes strict request dictionaries to
the accepted inert control core.

The client cannot create, discover, configure, register, or launch an XPC
service. The Swift fixture creates no named Mach service and has no application
composition. Neither side adds VM, process-launch, filesystem, network,
journal, reconciliation, PID-targeting, ownership-release, or production
authority.

## Ownership Delta

Accepted process ownership v14 is hash-bound to immutable accepted v13. It
changes only the execution-service authentication observations and matching
invariants while preserving every implementation byte and authority denial. It
records all of the following explicitly:

- an unsandboxed Keychain query verifies one installed Apple Development
  identity selected by `UMXN25Z493`;
- the owner authorized test-only use of that exact selector;
- the signed binary reports actual TeamIdentifier `3RD3TADLRY`, so the selector
  is not the peer-requirement Team ID;
- a successful authenticated peer was observed under exact TeamIdentifier
  `3RD3TADLRY` and fixture identifier
  `com.socialeap.dosai.watchdog-xpc-fixture`;
- the peer requirement was configured on both anonymous endpoint connections;
- client disconnect invoked reduce-only shutdown and left every inert record
  terminal;
- an ad-hoc-signed peer was physically rejected;
- Main retains no service-configuration or peer-requirement authority; and
- every production, registration, VM, process, filesystem, network, journal,
  reconciliation, generic-payload, and PID authority remains false.

Schema registry v18 remains byte-identical. No schema registry v19, LaunchAgent
property list, service registration, or application wiring was added. The
proposed registry v16 and Linux builder manifest v2 remain untouched.

## Contract And Client Behavior

Runtime admission requires exact plain data objects and arrays, rejects
accessors without invoking them, returns detached frozen values, enforces the
fixed 4096-byte frame limit, and preserves the accepted operation/result
relationships. `FAILED` and `QUARANTINED` remain distinct report states.

The typed client emits only sequential session-bound watchdog requests through
its injected transport. It closes on timeout, malformed or oversized response,
identity rebind, duplicate request identity, or capacity exhaustion. A session
is capped at 64 requests so the inert core's completed-response cache cannot
grow without bound through this transport.

## XPC And Peer Authentication

The Swift fixture uses an anonymous in-process XPC endpoint and the public
macOS 12-compatible
`xpc_connection_set_peer_code_signing_requirement` API. It applies the exact
same-team and exact-identifier requirement to both listener and client
connections. Frames are admitted only as strict XPC dictionaries with exact
keys, types, identities, sequence, operation, result, and optional capsule
identity.

The ad-hoc-signed arm64 macOS 15 fixture completes framing self-tests and is
then rejected by the peer requirement with `PEER_IDENTITY_REJECTED`. The
restricted Codex shell initially enumerated zero identities, while the
owner-authorized unsandboxed query verified one identity named with suffix
`UMXN25Z493`. Signing through that authorized selector succeeded. The resulting
binary reports `TeamIdentifier=3RD3TADLRY`, however, and the exact
`UMXN25Z493` peer requirement correctly rejected it. There is no
unauthenticated fallback. No synthetic trust root was installed, no Keychain
state was retained, and the fixture has no Keychain mutation or
signing-identity export path.

After explicit owner authorization of TeamIdentifier `3RD3TADLRY`, a fresh
three-source arm64 macOS 15 fixture was signed directly through selector
`UMXN25Z493`. Unsandboxed `codesign --verify --strict` passed, the binary
reported the fixed identifier and TeamIdentifier, and
`peer-auth-self-test 3RD3TADLRY` exited zero with `AUTHENTICATED`, both peer
requirements configured, and no synthetic trust. The temporary binary was then
removed and the Keychain inventory remained exactly one valid identity.

## Post-Acceptance Identity Correction

Accepted v12 recorded `UMXN25Z493` as a Team ID based on the independent review
and the owner's resulting authorization. Physical signing proved that it is the
certificate common-name suffix and a usable identity selector, not the
certificate's code-signing TeamIdentifier. Accepted v13 preserves immutable
v12 and records the exact distinction:

- authorized identity selector and certificate suffix: `UMXN25Z493`;
- observed code-signing TeamIdentifier: `3RD3TADLRY`;
- owner authorization for the selector: true;
- owner authorization to set the peer requirement to `3RD3TADLRY`: true; and
- authenticated peer observed in v13: false pending the physical run.

The signed peer rejection is a successful fail-closed result, not authenticated
transport evidence. The fixture was removed after inspection. No authorization
for the different TeamIdentifier is inferred.

Coordinator disconnect handling closes ordinary admission and invokes the
accepted core's reduce-only stop-all path. During the authenticated physical
run, the client was cancelled only after a strict response was admitted. The
fixture then observed the service-side disconnect, drained the internal
stop-all request, verified every inert capsule record terminal, and returned
`AUTHENTICATED`. Any disconnect timeout or nonterminal record would instead
have returned `DISCONNECT_REDUCTION_FAILED` with exit 77.

## Adversarial Results

Tests reject malformed, expanded, accessor-bearing, oversized, rebound,
duplicate, stale, and over-capacity messages. Native checks reject unknown XPC
keys, wrong XPC types, invalid team identifiers, unsupported CLI operations,
and hostile build-option accessors. Static scans prohibit named Mach services,
ServiceManagement, Virtualization, Security-framework mutation, process,
filesystem, standard-input, and network APIs.

The transport does not reuse the inert core's deterministic request fingerprint
as a message-authentication code and introduces no transport field named
`signature`. Stop reporting preserves deterministic `FAILED` separately from
uncertain `QUARANTINED`, addressing both informational constraints carried
forward from the independent review of the accepted core.

## Validation

The exact governed toolchain was Node `24.18.0` and pnpm `11.18.0`.

```text
Focused v12-v14 ownership and authenticated-evidence checks
15 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run typecheck
8 TypeScript project checks passed

pnpm --config.verify-deps-before-run=warn test
303 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run build
main, preload, and renderer production builds passed
```

The native test builds the exact four-source Swift fixture for arm64 macOS 15,
applies an ad-hoc signature, verifies architecture, target, linkage, framing,
CLI behavior, and fail-closed peer rejection, then removes the temporary build
directory. The owner-authorized signed run additionally verified one valid
Keychain identity, successful signing by selector `UMXN25Z493`, actual binary
TeamIdentifier `3RD3TADLRY`, and fail-closed rejection under the mismatched
requirement before removing the fixture. The pnpm flag preserves the existing stale `node_modules`
workspace-state record; no dependency or lockfile changed. The benign Git
fsmonitor IPC warning remains environmental. JSON parsing, exact source hashes,
authority scans, `git diff --check`, temporary-artifact cleanup, and
high-confidence secret scans pass.

## Known Limitations

- The anonymous same-process endpoint proves protocol and identity enforcement,
  not a separate process, named Mach service, or LaunchAgent lifecycle.
- Authenticated disconnect reduction is proven only for embedded inert records
  in the anonymous same-process fixture, not a separate service or physical VM.
- There is no service registration, discovery, packaging, application
  composition, VM handle, physical emergency-stop, crash cleanup, orphan
  reconciliation, or production lifecycle.
- Capsule records remain embedded inert fixtures; there is no registry or audit
  integration in this control lane.

## Owner Decision

The repository owner accepted process ownership v13 and authorized test-only
use of identity selector `UMXN25Z493` plus TeamIdentifier `3RD3TADLRY` in the
exact anonymous XPC peer requirement. Authentication and disconnect reduction
were then physically observed. The repository owner accepted process ownership
v14 and this evidence-only advancement. Acceptance does not authorize
registration, application composition, VM ownership, process launch,
filesystem or network access, reconciliation, journal access, or production
use.

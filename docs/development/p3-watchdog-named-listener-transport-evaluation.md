# P3 Watchdog Named-Listener Transport Evaluation

**Status:** `ACCEPTED`<br>
**Recorded:** `2026-08-03T02:44:31-04:00`<br>
**Validated:** `2026-08-03T02:47:31-04:00`<br>
**Accepted:** `2026-08-03T03:49:06-04:00`<br>
**Implemented:** `2026-08-03T03:55:25-04:00`<br>
**Evidence accepted:** `2026-08-03T17:05:48-04:00`<br>
**Decision:** Accepted ADR 0020<br>
**Accepted baseline:** Process ownership v18 and schema registry v18<br>
**Accepted baseline:** Process ownership v20 and schema registry v18

## Question

Choose the smallest step after the accepted inactive named-listener source that
can prepare strict authenticated service-side message handling without creating
an executable, package declaration, registration operation, or runtime effect.

## Current Boundary

Process ownership v18 accepts one fixed, compile-only inactive Mach listener.
The separate accepted anonymous XPC fixture already proves strict dictionary
admission, bounded replies, authenticated peers, and disconnect reduction, but
its service-side request path is private to the fixture. No named listener is
activated or connected to that path.

The accepted source and package evidence still contains no executable entry
point, LaunchAgent plist, `SMAppService` operation, registration, launch, or
application connection.

## Design Finding

A named adapter should not copy the strict decoder and reply construction. Two
independent implementations could drift while both appeared to implement the
same accepted watchdog schemas. The safer boundary is to extract only the
anonymous fixture's existing service-side event behavior into one internal
handler, retain the signed anonymous self-test as a regression proof, and let a
new fixed adapter install that same handler.

This changes the accepted transport source, so process ownership v19 binds its
exact v18 preimage and authorizes only the narrow refactor after separate owner
acceptance.

## Options Evaluated

### Duplicate The Framing Path

Rejected. A second decoder, reply builder, or disconnect path would create two
security-sensitive interpretations of the same strict contracts.

### Build Or Package The Service Now

Rejected. An executable or plist would combine source composition with
launchd-visible behavior before the named service-side adapter has passed
adversarial review.

### Extract One Shared Handler And Add A Compile-Only Adapter

Selected. The accepted anonymous fixture must continue exercising the extracted
handler. A new zero-configuration source may obtain the accepted fixed listener,
accept only XPC connection events, install the shared handler, and activate only
the listener and its incoming authenticated peers. The source is typechecked
without an entry point or executable output and is never invoked.

## Proposed Boundary

Process ownership v19 proposes only:

- a narrow refactor of
  `native-helpers/execution-service/WatchdogXPCTransport.swift` so its existing
  strict service-side decode, reply, and disconnect behavior is available to
  both test transports;
- a new
  `native-helpers/execution-service/WatchdogNamedListenerTransportCandidate.swift`
  with no caller-supplied configuration and no client connection path; and
- `tests/security/p3-watchdog-named-listener-transport-candidate.test.mjs` for
  strict source, compilation, regression, and authority checks.

The existing `WatchdogNamedListenerCandidate.swift`, inert control core,
anonymous fixture entry point, fixture runner, and package script remain
immutable inputs.

## Required Source Behavior

After owner acceptance, the implementation must:

1. preserve the accepted request key sets, frame limit, operation admission,
   reply shape, queue semantics, and disconnect reduction;
2. route the accepted anonymous fixture through the same extracted internal
   service-side handler used by the named adapter;
3. keep every service name, peer requirement, and identity fixed inside the
   accepted inactive-listener source;
4. let the named adapter accept only `XPC_TYPE_CONNECTION`, install the strict
   handler, and activate only that incoming peer and the fixed listener;
5. reject malformed or unexpected events by cancellation or no response, never
   by forwarding generic data; and
6. typecheck for `arm64-apple-macos15.0` without producing an executable.

## Explicit Denials

Process ownership v19 grants no authority to:

- add `@main`, `main.swift`, `dispatchMain`, or executable output;
- create a client XPC connection or connect from Electron Main;
- accept caller-supplied names, requirements, identities, queues, handlers,
  cores, PIDs, paths, flags, entitlements, or payloads;
- use privileged Mach-service lookup, ServiceManagement, or `SMAppService`;
- sign, package, add a plist, install, register, unregister, launch, or inspect
  live service state;
- create or start a VM, launch a process, access files or networks, reconcile
  ownership, write the audit journal, or perform production work.

## Required Implementation Evidence

If v19 is accepted, implementation evidence must prove:

1. every immutable input remains exact;
2. the accepted anonymous signed transport tests still pass through the shared
   handler without weaker admission;
3. source scans reject generic configuration, client connections, executable
   entry points, privileged flags, ServiceManagement, Virtualization, process,
   filesystem, and network APIs;
4. Swift typechecking succeeds without an output artifact;
5. no plist, package entry, registration, launch, or application path appears;
   and
6. focused checks, eight typechecks, all repository tests, three builds, JSON,
   hash, whitespace, artifact, and secret checks pass.

## Proposal Validation

Validation used exact Node `24.18.0` and pnpm `11.18.0`.

```text
Process ownership v18-v19 checks
10 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run typecheck
8 TypeScript project checks passed

pnpm --config.verify-deps-before-run=warn test
335 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run build
main, preload, and renderer production builds passed
```

Process ownership v19 parses strictly, is hash-bound to accepted v18, and has
SHA-256 `c5068a629101c38ad77c09ef3fecff9883493498c7cd9265a39f0e0c15daea46`.
All six accepted implementation inputs match their governed hashes. Whitespace,
artifact, executable-file, and high-risk secret scans pass; `git diff --check`
reports no finding beyond the existing benign fsmonitor warning.

At that proposal stage, no adapter source or security test, schema registry v19,
LaunchAgent plist, or executable existed. No code-signing, packaging,
registration, launch, or live service-state operation occurred.

## Implementation Evidence

The accepted v19 slice now:

- extracts the existing anonymous fixture routing block into one internal
  `routeWatchdogXPCServiceEvent` function without duplicating the strict decoder
  or reply builder;
- keeps the accepted anonymous fixture on that shared route, including malformed
  cancellation and disconnect reduction;
- adds one zero-argument `WatchdogNamedListenerTransportCandidate` factory that
  creates its inert core internally, obtains the accepted fixed listener,
  accepts only XPC connection events, installs the shared route, and activates
  only the listener and incoming peer; and
- typechecks the four-source candidate for `arm64-apple-macos15.0` without an
  output path or executable artifact.

The accepted anonymous XPC fixture still compiles, is ad-hoc signed in its
existing test harness, and passes strict framing plus fail-closed peer rejection
through the refactored shared route. The named adapter itself was not compiled
to an executable, signed, packaged, invoked, registered, or connected.

Process ownership v20 binds the three implementation postimages and every
governance-test remediation. Its SHA-256 is
`ef5376f22db89c618a0b01bcd4b70a07039bd2ed73816c3e56a673393b5b5973`.

```text
Focused implementation, signed-regression, ownership, and ripple checks
54 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run typecheck
8 TypeScript project checks passed

pnpm --config.verify-deps-before-run=warn test
344 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run build
main, preload, and renderer production builds passed
```

Both ownership generations parse strictly. Final implementation hashes,
whitespace, executable-file, plist, schema-artifact, and high-risk secret scans
pass; `git diff --check` reports no finding beyond the existing benign fsmonitor
warning.

## Audit Remediation

The first implementation checks exposed two expected proposal-state assertions:
v19 still required its transport preimage to be current and the adapter to be
absent. A targeted historical scan then found four older ownership tests that
also required the accepted anonymous transport preimage to remain the current
file, plus five exact execution-service directory allowlists.

Ten governance tests were updated narrowly. Historical ownership manifests and
their recorded preimage hashes remain unchanged; their tests now verify that
accepted v19 is the sole successor authority for the transport change. Directory
guards admit only `WatchdogNamedListenerTransportCandidate.swift`, and the v7
guard verifies the exact accepted v19 proposal paths. V20 hash-binds all ten
final remediation files. No schema, product contract, package, runtime, or
effect guard was weakened.

## Known Limitations

- Compile-only source cannot prove named-service discovery, peer
  authentication, message exchange, or disconnect behavior through launchd.
- No executable or plist exists, so the named service remains undiscoverable.
- User approval, registration, disabled state, unregistration, crash, relaunch,
  stale-owner reconciliation, and VM teardown remain separately owner-gated.
- The accepted anonymous fixture remains test-only and does not establish
  production identity or runtime authority.

## Owner Decision

The repository owner accepted process ownership v19 and authorized only the
three proposed implementation paths and compile-only behavior above. The owner
subsequently accepted process ownership v20 and its implementation evidence. No
executable, signing, packaging, plist, registration, launch, application
connection, VM, filesystem, network, journal, reconciliation, or production
effect is authorized or claimed.

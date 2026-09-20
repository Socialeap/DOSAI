# P3 v45 proof-observability repair evidence

Recorded 2026-09-20. Contributor: unclassified assistant; no specialized role.
**Source-only failure attribution is implemented and validated; no physical
attempt was made; real execution and private-beta release remain NO-GO.**

## Authorization and scope

The owner authorized a bounded source-only v45 observability repair and
validation after the single v44 physical result `NOT_FOUND` could not
distinguish a legitimate Service Management status from native-addon load or
native-call failure. Package signing, app launch, registration, service launch,
production use and real execution were expressly excluded.

Process ownership v45 binds accepted v44, the exact v44 physical receipt, the
five modified postimages, and two support postimages. Its physical-attempt
record fixes the prior source commit, one result, runner exit 0, attempt count
one, and exhausted authorization. Every physical, lifecycle, effect, retry,
network, filesystem, VM, process, journal and production authority remains
false.

## Implementation

The dedicated proof entry still performs at most one fixed-path addon load and
at most one zero-argument native observation. It continues to route admitted
native results through the accepted fail-closed Main adapter. Proof-only
monitoring now verifies that the native observer is an own data property, that
the call completed with zero arguments, and that its raw result is one of the
four existing accepted statuses.

The protocol preserves these native status outputs unchanged:

- `NOT_REGISTERED`
- `ENABLED`
- `REQUIRES_APPROVAL`
- `NOT_FOUND`

It adds three proof-specific, fail-closed outputs:

- `NATIVE_ADDON_LOAD_FAILED` when the single fixed-path load throws;
- `NATIVE_STATUS_CALL_FAILED` when the observer is absent or malformed, throws,
  receives anything other than zero arguments, or returns an unadmitted value;
- `ELECTRON_READINESS_FAILED` when Electron readiness rejects before any load.

The audit runner admits only those seven exact values under the unchanged
`DOSAI_SERVICE_MANAGEMENT_STATUS_PROOF_V1:` prefix. Its fixed executable,
zero-argument child invocation, 15,000 ms timeout, 1,024-byte output bound,
environment, no-retry behavior and absence of registration or lifecycle calls
remain unchanged. Normal Main, preload, renderer and the native addon source
are unchanged.

## Regression proof

The regression builds the actual dedicated CommonJS entry into a temporary
directory and evaluates it with inert Electron and addon stubs. It proves:

- a successfully loaded observer returning legitimate `NOT_FOUND` remains
  `NOT_FOUND` and receives exactly zero arguments;
- a thrown fixed-path load becomes `NATIVE_ADDON_LOAD_FAILED`;
- a throwing native observer becomes `NATIVE_STATUS_CALL_FAILED`;
- an unadmitted native result becomes `NATIVE_STATUS_CALL_FAILED`;
- rejected Electron readiness becomes `ELECTRON_READINESS_FAILED` without an
  addon-load attempt; and
- every case emits one bounded line and exits once with code 0.

The first v45 successor-chain run passed 24 of 25 and exposed only v44's
positive architecture test retaining its pre-v45 expected postimage. The owner-
authorized governance-maintenance scope was extended to that exact test path;
v45 binds its preimage and postimage, and the complete rerun passes.

## Validation

Using pinned Node 24.18.0 and existing locked dependencies:

- focused v37/v42/v43/v44/v45 and proof suite: **25/25 passed**;
- all eight TypeScript project checks passed;
- normal Main, preload and renderer builds passed;
- full repository suite: **516/516 passed**, with no failures, skips or
  cancellations, in 145.62 seconds; and
- JSON parsing, exact hashes and `git diff --check` passed.

No package command, code-signing command, app launch, native-module load,
Service Management status call, registration, service launch, XPC connection,
VM action, process-control action, network action, journal change, production
action or physical retry occurred. The slow native tests compiled and removed
their existing temporary compile-only fixtures; they did not package or launch
the DOSAI app.

## Release boundary

V45 makes a future physical result attributable but does not itself establish
native loading or a native status observation. Any package/sign/launch attempt
requires new explicit owner authorization. Independent native amd64 Linux
builders, accepted guest artifacts, and the remaining isolation and approval
proofs also remain required. Real execution and private-beta release remain
**NO-GO**.

## Release classification

**No Lovable action is required.** This is desktop-native source, tests and
governance evidence only. There is no backend migration, function deployment,
secret or provider configuration, frontend Publish, registration, distribution
or production release.

# P3 Watchdog Client Sequence-Integrity Evaluation

**Status:** `OWNER_ACCEPTED`<br>
**Recorded:** `2026-08-11T19:45:49-04:00`<br>
**Validated:** `2026-08-11T19:49:12-04:00`<br>
**Accepted:** `2026-08-13T17:05:00-04:00`<br>
**Decision:** Accepted ADR 0020 remains unchanged<br>
**Accepted baseline:** Process ownership v37<br>
**Baseline SHA-256:** `490ed96c98f54b6d5eb6620541805cf9a0c85322274ba8fd9b66c963a773d980`

## Question

Can the existing typed Main-side watchdog client safely use the accepted
strictly sequential watchdog protocol when callers start more than one
asynchronous operation before an earlier reply arrives?

## Finding

The native inert control core accepts only the exact next request sequence.
`InertWatchdogControlCore.submit` rejects any request whose sequence differs
from `expectedSequence` with `DOSAI_WATCHDOG_SEQUENCE_0001`.

`WatchdogControlClient` creates unique, increasing sequence numbers, but each
call reaches `transport.exchange(request)` before it waits for its reply. Two
calls can therefore have exchanges in progress together. The injected
`WatchdogControlTransport` type requires an asynchronous reply but does not
require peer delivery in invocation or sequence order. The existing client test
uses only one completed call before starting the next, so it does not exercise
this condition.

An eventual concrete transport that delivers request 2 before request 1 would
cause the strict service core to reject request 2. The shared XPC service route
rejects non-queued submissions by cancelling the peer. That is a correct
fail-closed service response, but it would make ordinary concurrent Main-side
calls unnecessarily fragile and could trigger the existing disconnect-reduction
path. No named service, Electron connection, or production client exists today,
so this is a future integration defect, not a claim about a current runtime.

The accepted XPC evidence statement that the client emits sequential requests
is accurate for its sequential fixture exercise. It is not a guarantee that
the current general `exchange` interface preserves sequence order under
concurrent calls.

## Options Considered

### Full Client Single-Flight Exchange

Serialize each call until its full response is admitted. This would prevent
out-of-order delivery, but an ordinary request that waits for the fixed
1,000 ms response timeout would also delay a subsequently requested emergency
`STOP_ALL`. That weakens the accepted priority intent in ADR 0020 and is not
selected as a standalone remedy.

### Rely On An Eventual XPC Implementation To Preserve Ordering

Rejected. The present injected transport interface makes no such ordering
promise, and an undocumented implementation property would be an unsafe basis
for the strict native admission rule.

### Bounded Priority-Aware Dispatch Contract

Recommended for a separately owner-gated successor slice. The successor must
make dispatch order an explicit, testable client/transport contract rather than
an incidental property of response timing:

1. At most one ordinary request may be in flight for a session.
2. Request IDs and sequence numbers are assigned only when a request is chosen
   for dispatch, never while it is merely queued.
3. An unissued `STOP_ALL` with reason `EMERGENCY_STOP` is selected before all
   unissued ordinary operations and receives the next sequence number.
4. A request already dispatched cannot be overtaken or unsent under the v1
   request/response contract. Its fixed 1,000 ms failure bound remains explicit;
   a timeout closes the client and must not dispatch queued work.
5. A future concrete peer transport must prove that client dispatch order is
   preserved through strict service admission, while response completion may be
   observed independently.
6. The service-side reduce-only disconnect behavior remains the safety fallback
   for a lost peer. This proposal does not claim that the present injection-only
   client can cause or prove that disconnect.

This preserves fail-closed sequence admission and gives an emergency request
priority over work that has not reached the service. It does not claim that
Main can preempt work already sent to a service; ADR 0020 assigns that
independent reduction responsibility to the service that owns the VM handle.

## Required Successor Scope

No current source path is authorized for this work. A proposed process-ownership
successor must bind accepted v37 and reserve only:

- `src/main/execution/watchdog-control-client.ts`; and
- `tests/security/p3-watchdog-control-client.test.mjs`.

It must preserve the accepted schemas, native core, anonymous XPC fixture,
named-listener sources, package paths, status-proof sources, and all P3.3
builder inputs byte-for-byte. It may not add an XPC client connection, native
module load, Service Management operation, registration, service launch,
process or VM control, filesystem or network access, journal use, package work,
or production authority.

The required adversarial tests must use an injected controllable transport only
and prove all of the following without opening a native connection:

- concurrent ordinary calls do not overlap at dispatch and reach the transport
  with contiguous sequences;
- an emergency `STOP_ALL` precedes unissued ordinary work and receives the next
  dispatch sequence;
- a timeout or malformed/rebound response closes the client and prevents every
  queued request from reaching the transport;
- queued capacity is bounded by the accepted session limit, request identity is
  still unique, and no rejected queued request consumes an observable transport
  exchange; and
- the client remains free of XPC, service-management, process, filesystem, and
  network authority.

## Non-Goals

This review creates no process-ownership generation and does not change source,
schema, test, package, native helper, service, signing, or proof artifact. It
does not invoke XPC, Service Management, a proof package, a native module,
signing, registration, launch, connection, VM, process, filesystem, network,
or builder operation. It makes no liveness, authentication, cancellation,
cleanup, or production claim.

## Validation Basis

The review inspected the current accepted source and contracts at these exact
hashes:

| Input | SHA-256 |
| --- | --- |
| `src/main/execution/watchdog-control-client.ts` | `bcbc9f508398a8df67812401d82d3686d6fe4cbaf8fca70427755535f2943007` |
| `tests/security/p3-watchdog-control-client.test.mjs` | `8436f52c05a64b219e244063b28db1ea40b3e8d0e305c92ec9ea0cbffae38942` |
| `docs/architecture/process-ownership-v37.json` | `490ed96c98f54b6d5eb6620541805cf9a0c85322274ba8fd9b66c963a773d980` |
| `docs/decisions/0020-per-user-execution-service-watchdog-control-lane.md` | `2d34f0af578052a2512dcabed803825b9833a7483d521ab69e3dca6f8d413559` |

The current test covers sequential request emission, response binding,
malformed/oversized response closure, duplicate request identity, the fixed
64-request session limit, and client authority denial. It has no controlled
overlap or emergency-priority case, which is the precise gap recorded here.

Post-record validation under Node `24.18.0` and pnpm `11.18.0` passed the
current focused watchdog client suite (6 of 6), all eight TypeScript project
checks, all 480 repository tests, and the normal Main, preload, and renderer
production builds. The repository's existing `node_modules`/lockfile
synchronization warning and benign Git fsmonitor IPC warning remain
environmental only. No validation command invoked the P3.4 proof package or
runner, signing, app launch, native-module load, status call, registration,
service launch, XPC connection, VM, process, filesystem, network, or builder
action.

## Owner Decision

The repository owner accepted the bounded priority-aware dispatch contract on
`2026-08-13T17:05:00-04:00`. The next eligible action is a successor ownership
proposal that binds the current accepted baseline and reserves only the typed
client and its injected-transport security test. This acceptance does not yet
authorize source/test change, an XPC connection, native-module load, Service
Management operation, registration, service launch, process or VM control,
filesystem or network access, journal use, package work, or production use.

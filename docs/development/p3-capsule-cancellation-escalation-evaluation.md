# P3 Capsule Cancellation Escalation Evaluation

**Status:** `OWNER_ACCEPTED`<br>
**Recorded:** `2026-08-11T21:08:23-04:00`<br>
**Validated:** `2026-08-11T21:08:23-04:00`<br>
**Accepted:** `2026-08-13T14:21:04-04:00`<br>
**Decision:** Accepted ADR 0003 remains unchanged<br>
**Accepted baseline:** Process ownership v8 (`00b8b078ad0186497063660f90c320b807e2d7b3991eb7be8f4d05cb8a7f730d`)

## Finding

The injection-only `CapsuleSupervisor` stores one cancellation promise per capsule.
An `emergencyStop` on an already `STOPPING` capsule joins that ordinary promise.
`stopRecord` awaits `process.stop(250)` without a local deadline, so it cannot
inspect liveness or call `process.forceStop()` when the injected graceful stop
never settles.

An in-memory adversarial handle suspended its ordinary graceful stop, then
received an emergency request:

```json
{"outcome":"pending","graceful":1,"forced":0,"state":"STOPPING"}
```

The emergency request was pending, no force stop was attempted, and the record
remained `STOPPING`. The simulation created no process, VM, XPC connection,
service, filesystem, network, journal, package, signing, or native action.
No application path can attach a process today, so this is a future integration
defect rather than a production claim.

## Recommended Contract

A separately owner-gated successor must make the existing 250 ms grace period
a local deadline. It must start one graceful attempt, race it against that
deadline, then make exactly one idempotent force attempt if the handle remains
alive. `STOPPED` requires a false liveness result; a timeout, throw,
contradiction, or remaining liveness returns `QUARANTINED` with `UNCERTAIN`
cleanup.

Concurrent ordinary, watchdog, and emergency callers must share that one
bounded reduction promise. They cannot add a grace window or force attempt.
This does not preempt a native operation, name a PID, target host work, or add
execution authority; it prevents an unresponsive graceful attempt from blocking
the existing forced-cleanup decision indefinitely.

## Required Successor Scope

No source path is authorized now. A successor ownership record must bind v8 and
reserve only `src/main/execution/capsule-supervisor.ts` and
`tests/security/p3-capsule-supervisor.test.mjs`. It must preserve the durable
coordinator, state store, audit binding, schemas, native helpers, watchdog
transport, packages, P3.3 builder inputs, and P3.4 proof paths byte-for-byte.
It may not add process launch or attachment, PID/process-tree targeting, VM,
filesystem/network access, Service Management, XPC, package work, journal
changes, or production authority.

Injected-handle tests must prove a suspended graceful stop reaches one forced
attempt after 250 ms; failed or still-alive forced cleanup quarantines; concurrent
callers share one graceful and one forced attempt; timely cleanup never forces;
and the no-authority source boundary remains intact.

## Validation Basis

| Input | SHA-256 |
| --- | --- |
| `src/main/execution/capsule-supervisor.ts` | `cb325b8ae9bd2f6c3432405e8f83b4087c98fecef6e6ec31ac2384628cd912cf` |
| `tests/security/p3-capsule-supervisor.test.mjs` | `2027558f38e08e9c6c1f84b0e00e8a38ace757f04a13ae28a96890ea927cba59` |
| `src/main/execution/durable-capsule-coordinator.ts` | `98c2e50c7abb7f56cf151bc94f9b2fcfdfb3a4929fa8e1bf1e116422754de4d3` |
| `tests/security/p3-durable-capsule-coordinator.test.mjs` | `bb339c27f8cf758eabc1e9d902af1e5d70e3b4abcf9d47cacdfd40b6389438ef` |
| `docs/decisions/0003-execution-isolation-cancellation-and-watchdog.md` | `dc2e4af3cb2e007a0f9a893b419ad7ff6ab3930829994348fa8b536470e2f47a` |

The present tests cover idempotency, output limits, watchdog timeout,
quarantine, and persistence-queue bypass. They do not suspend `stop()` while
an emergency caller arrives, which is the exact uncovered case.

## Owner Decision Needed

The owner accepted the bounded cancellation-escalation contract on
`2026-08-13T14:21:04-04:00`. A successor ownership record remains required
before any source/test change. Acceptance alone does not authorize
implementation or any runtime action.

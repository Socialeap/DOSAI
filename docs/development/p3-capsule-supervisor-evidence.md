# P3 Capsule Supervisor Implementation Evidence

**Status:** `IN_PROGRESS`<br>
**Validated:** `2026-08-01T13:06:58-04:00`<br>
**Scope:** Coordination-only P3 foundation; no process-launch authority

## Implemented Slice

The first P3 slice adds:

- exact, immutable no-effect capsule request admission with a fixed harmless
  executable allowlist, bounded arguments, sanitized environment names, and
  fixed wall-time/output limits;
- generation-bound capsule registration, start transition, process attachment,
  output accounting, and lifecycle snapshots;
- idempotent cancellation with graceful stop, forced stop, verified cleanup, and
  quarantine when cleanup remains uncertain; and
- deadline watchdog sweeps and a reduce-only emergency-stop coordinator that
  can only stop capsules registered by the supervisor.

The process handle is injected for testing. The application still has no process
execution import or launcher, and the authorization literal is
`NO_EFFECT_TEST_ONLY`. Selecting and proving the ADR 0003 isolation backend,
durable ownership records, authenticated watchdog transport, crash/orphan
reconciliation, and packaged positive execution remain later P3 work.

## Durable Ownership Slice

The owner accepted the second P3 slice and schema registry v11 with exact JSON Schemas for
the no-effect capsule request and durable capsule registry. Runtime admission
also enforces relational rules that JSON Schema cannot express, including unique
capsule identities and exact deadline derivation from the admitted request.

The state store uses a canonical owner-private directory, a bounded fixed state
file, strict ASCII-subset JSON with duplicate-key, BOM, negative-zero, depth, and node
limits, an owner-only temporary file, file sync, atomic replacement, and directory
sync. Revisions must advance monotonically within the store instance.

One owner-private marker now provides exclusive store ownership across Node
processes. The store holds and verifies the marker identity for its full lifetime,
rechecks it before and during state operations, and releases it only through an
explicit clean close. Contending processes fail without disturbing the active
writer, and marker deletion or replacement disables the original writer.

An unexplained marker is never reclaimed from a PID or elapsed time alone. A
crash therefore blocks new writer authority until the later authenticated
watchdog/reconciler can prove the previous owner is gone and account for the
evidence gap. This is a deliberate availability limit that prevents split-brain
takeover and PID-reuse mistakes.

On startup, restore requires a strictly newer supervisor generation. Every
persisted `REGISTERED`, `STARTING`, `RUNNING`, or `STOPPING` record becomes
`QUARANTINED` with reason `SUPERVISOR_CRASH`; the restored supervisor has no
invented process handle and cannot report cleanup success.

## Durable Coordinator Slice

The durable coordinator serializes ordinary register, begin, output, cancel,
and watchdog transitions. Each successful state-changing call advances and
atomically persists the registry revision before returning. A rejected write,
stale revision, or generation conflict moves the coordinator to `BROKEN`, after
which ordinary lifecycle authority fails closed.

Emergency stop does not wait behind the ordinary persistence queue. It always
attempts the supervisor's reduce-only cancellation path and reports persistence
as `DURABLE` or `FAILED` separately from the stop result. If a blocked ordinary
write later records pre-stop active state, the coordinator remains broken and a
newer supervisor generation quarantines that record on recovery. The coordinator
does not expose the supervisor's process-attachment method.

## Watchdog Reader Slice

A separate read-only registry boundary can inspect the latest durable capsule
snapshot without acquiring or weakening writer ownership. It neither creates the
state directory nor exposes save, ownership-release, launch, or cancellation
operations. A separate Node process can use this view while the coordinator owns
the registry, and it can inspect a durable snapshot when an unexplained owner
marker blocks writer takeover.

Reads use a file descriptor and verify that the opened file and current path name
the same owner-private regular file before reading. Bounded retries tolerate an
atomic writer replacement; symbolic links, unsafe permissions, unstable files,
oversized data, and malformed registry content fail closed.

## Fixed No-Effect Profiles Slice

The capsule request schema remains the accepted v1 transport envelope, but that
envelope is no longer sufficient for registration or durable recovery. A second
semantic gate admits exactly two immutable profiles:

- `/usr/bin/printf` with the sole argument `DOSAI_SAFE_TEST_OK`, an empty
  environment, a 1,000 ms wall-time limit, and an 18-byte output limit; and
- `/usr/bin/sleep` with the sole argument `0.01`, an empty environment, a
  1,000 ms wall-time limit, and a zero-byte output limit.

Schema-valid caller-controlled formats, arguments, environment values, longer
delays, and expanded time or output limits fail with
`DOSAI_CAPSULE_PROFILE_0001`. The supervisor and durable registry admission both
use this semantic gate, preventing restart from reintroducing an unapproved
profile. This slice adds no handler, executable identity check, or launch path.

The repository owner accepted this P3.5 slice on
`2026-08-01T13:17:27-04:00`.

## Bounded Cancellation Escalation

The repository owner accepted process ownership v38 on
`2026-08-13T14:49:56-04:00`. The supervisor now begins one injected graceful
stop attempt and waits no longer than the fixed local 250 ms grace period. A
timely graceful stop that verifies the injected handle is no longer alive is
reported `STOPPED` without a force attempt. A pending, rejected, or still-alive
graceful attempt receives one injected forced-cleanup attempt; only a false
liveness observation after that attempt is reported `STOPPED`. Any forced-stop
failure, failed liveness observation, or remaining liveness is
`QUARANTINED` with `UNCERTAIN` cleanup.

Ordinary cancellation, watchdog expiry, and emergency stop continue to join the
same per-capsule reduction. An injected suspended graceful stop therefore cannot
create additional grace windows or force attempts when those callers overlap.
The new adversarial tests prove one graceful and one force attempt in that case,
force-failure and remaining-liveness quarantine, timely graceful no-force
cleanup, immutable result snapshots, and the retained injection-only source
boundary. No process is launched or attached by the application.

## Write-Slot Race Remediation

Full-suite validation on `2026-08-02T03:24:43-04:00` exposed a scheduling race
in the state store's same-process write exclusion. `save()` checked ownership
with asynchronous filesystem I/O before setting its `writing` flag. If a second
save entered during that first await, either call could claim the slot; the
earlier caller could incorrectly receive `DOSAI_CAPSULE_STORE_BUSY_0001`.

The store now claims the in-process slot synchronously before its first await
and releases it through the existing `finally` path on every success or failure.
The first invocation therefore deterministically owns the write attempt, close
cannot race an admitted write, and all ownership and durability checks still run
before filesystem mutation. The ten state-store tests passed in four concurrent
independent repetitions after the correction.

## Validation

The focused P3 suites pass twenty-two tests:

```text
node --test tests/governance/p3-capsule-contracts.test.mjs \
  tests/security/p3-capsule-supervisor.test.mjs \
  tests/security/p3-capsule-state-store.test.mjs \
  tests/security/p3-durable-capsule-coordinator.test.mjs
22 tests passed
```

Code-level validation on `2026-08-02T03:25:35-04:00` passes all eight TypeScript
project checks, the full repository suite with 226 tests, and the production
build using exact Node `24.18.0` and pnpm `11.18.0`. Electron packaging also
passes with nine declared fuses and eleven ASAR entries.

The accepted v38 postimages and governance record pass fifteen focused checks,
all eight TypeScript project checks, all 487 repository tests, and the normal
Main, preload, and renderer production builds under Node `24.18.0` and pnpm
`11.18.0` on `2026-08-13T14:52:16-04:00`.

## Known Limitations

- This is not P3 acceptance evidence and does not update the capability matrix.
- No real child process is launched by the application.
- The two fixed no-effect profiles are admission contracts only; executable
  identity revalidation and packaged handler execution remain unavailable.
- Ordinary coordinator transitions are durably acknowledged and cross-process
  writer exclusion is enforced. Automatic crash-marker reclamation remains
  unavailable until an authenticated independent reconciler can prove stale
  ownership; unexplained ownership blocks startup.
- A separate process can inspect the registry through a read-only boundary, but
  authenticated watchdog transport, stop authority, process independence, and
  stale-owner reclamation remain pending.
- Proposed registry v17 binds each durable registry revision to the accepted
  single-writer audit journal and fails closed on registry-only schema-valid
  rollback, mutation, or a dual-store ordering gap. Coordinated valid-prefix
  rollback of both unanchored local artifacts remains outside local assurance.
  `docs/development/p3-capsule-registry-audit-binding-evidence.md`
- Process-tree ownership, whole-isolation-unit destruction, and independent
  watchdog survival under coordinator crash are not yet proven.
- No renderer or IPC path exposes the supervisor.

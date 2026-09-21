# P3 Watchdog Control Core Evidence

**Status:** `OWNER_ACCEPTED`<br>
**Recorded:** `2026-08-02T17:52:58-04:00`<br>
**Validated:** `2026-08-02T17:55:55-04:00`<br>
**Accepted:** `2026-08-02T18:11:42-04:00`<br>
**Decision:** Accepted ADR 0020<br>
**Accepted baseline:** Process ownership v9 and schema registry v18<br>
**Ownership:** Accepted process ownership v10 over accepted v9

## Scope

This slice implements the first permitted watchdog component as an ad-hoc-signed
Swift control core over embedded inert capsule records. It proves strict
admission, identity and sequence fencing, bounded queues, stop priority,
idempotent completed-request replay, changed-request rejection, disconnect
reduction, and quarantine-preserving stop behavior without adding a transport.

The fixture is application-unreachable and exposes only `describe` and
`self-test` command-line operations. It consumes no standard input and accepts
no external capsule record, request payload, path, process identifier,
executable, argument, environment, mount, socket, VM configuration, journal
record, or arbitrary data.

## Ownership Delta

Proposed process ownership v10 is hash-bound to immutable accepted v9 and
changes only the execution-service declaration and corresponding invariants.
It records the exact two Swift source files and their SHA-256 digests. The
execution-service remains a test fixture with all of the following false:

- application reachability and registration authority;
- XPC listener and production service authority;
- VM creation, VM start, and process-launch authority;
- filesystem, network, journal, and reconciliation authority; and
- generic payload, PID targeting, and ownership-release authority.

No capability state, accepted schema, accepted ADR, or unrelated ownership
boundary changes. Registry v16 and Linux builder manifest v2 remain untouched
and retain their existing owner-review status.

## Control Behavior

The core admits only exact `INSPECT`, `STOP_ONE`, and `STOP_ALL` dictionaries
under the accepted no-effect authorization. Session, service boot, service
generation, supervisor generation, UUIDv4, positive sequence, operation-specific
fields, and exact-key checks fail closed.

Pending work is bounded to eight inspect requests, sixteen stop-one requests,
and one independently reserved stop-all request. Drain order is always
`STOP_ALL`, `STOP_ONE`, then `INSPECT`. Coordinator disconnect closes ordinary
admission, discards queued ordinary requests, and reserves an internal stop-all
request without waiting for persistence or audit.

Completed identical request IDs replay the original response identity without
reapplying mutation. Reuse of a request ID with changed content closes the
session and schedules stop-all. Sequence gaps, stale identity, unexpected
fields, unsafe authorization, and capacity expansion are rejected.

Stop operations can mutate only embedded in-memory fixture records. Existing
`FAILED` or `QUARANTINED` records remain quarantined and report
`QUARANTINED`; they are never relabeled as successfully stopped. Repeated stops
of a known clean terminal record are idempotent.

## Adversarial Results

The native self-test exercises:

- malformed and expanded dictionaries;
- wrong session, boot, service, supervisor, authorization, and sequence values;
- inspect and stop-one capacity limits plus the reserved stop-all slot;
- stop-all precedence over ordinary pending work;
- identical completed replay and changed request-ID reuse;
- disconnect admission closure and internal stop-all scheduling;
- idempotent stop of clean records; and
- explicit preservation of uncertain cleanup as quarantine.

The host security test compiles the exact source set for arm64 macOS 15, applies
an ad-hoc signature, verifies the signature and minimum OS, inspects linked
libraries, runs the self-test, and rejects every unsupported CLI shape with a
fixed protocol error. Static checks prohibit ServiceManagement,
Virtualization, XPC, Network, process-launch, filesystem, standard-input, and
network APIs.

The initial simulation found that stop-one and stop-all could report `STOPPED`
for an already failed or quarantined record. The implementation now preserves
the uncertain state and returns `QUARANTINED`. Four older pre-implementation
tests also assumed that the execution-service directory was empty; those tests
now require exactly the two owner-authorized Swift files while preserving their
guest-runtime and authority exclusions.

## Validation

The exact governed toolchain was Node `24.18.0` and pnpm `11.18.0`.

```text
Focused ownership, contract, and Swift control-core checks
25 tests passed; 0 failed

Native Swift build, signature, platform, self-test, and CLI security checks
2 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run typecheck
8 TypeScript project checks passed

pnpm --config.verify-deps-before-run=warn test
274 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run build
main, preload, and renderer production builds passed
```

The pnpm flag preserved the existing stale `node_modules` workspace-state
record while using installed exact lockfile dependencies. No dependency or
lockfile change was made. `git diff --check`, JSON parsing, exact source digest,
accepted-input immutability, linked-authority, whitespace, and high-confidence
secret checks pass. The benign Git fsmonitor IPC warning remains environmental.

## Known Limitations

- There is no XPC listener, peer code-requirement authentication, native frame
  decoder, or typed Electron client composition.
- There is no LaunchAgent property list, SMAppService registration, service
  discovery, packaged identity, or production lifecycle.
- Queue behavior is deterministic in-memory simulation, not concurrent or
  physical load testing.
- Capsule records are embedded inert fixtures. There is no registry, audit
  journal, coordinator, VM, process tree, filesystem, or network integration.
- Service-process crash cleanup, restart reconciliation, orphan recovery, and
  physical VM teardown remain unproven and unavailable.
- The binary is built only in a temporary test location and is not packaged,
  committed, deployed, or published.

## Owner Decision

The repository owner accepted process ownership v10 and this inert control-core
implementation together. Acceptance authorizes only the exact test-fixture
source and behavior recorded here; it does not authorize XPC, service
registration, application composition, VM ownership, process launch,
filesystem or network access, reconciliation, journal access, or production
use.

Independent review found no blocker and carried two informational constraints
into the next gate: transport authentication must not treat the core's
deterministic unkeyed request fingerprint as a message-authentication code, and
future stop reports must distinguish deterministic `FAILED` from uncertain
`QUARANTINED` cleanup.

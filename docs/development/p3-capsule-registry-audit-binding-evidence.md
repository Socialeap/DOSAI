# P3 Capsule Registry Audit-Journal Binding Evidence

**Status:** `ACCEPTED`  
**Recorded:** `2026-08-02T16:26:00-04:00`  
**Accepted:** `2026-08-02T16:33:07-04:00`  
**Decision:** Accepted ADR 0019  
**Ownership:** Accepted process ownership v8  
**Contracts:** Accepted schema registry v17

## Scope

This slice binds every capsule-registry initialization, startup reconciliation,
and ordinary state-changing coordinator operation to the accepted P2.3
single-writer audit journal. It detects registry-only schema-valid rollback,
same-revision mutation, state/journal ordering gaps, and invalid semantic event
chains before ordinary lifecycle work can continue.

The implementation adds no handler, executable identity check, process launch,
VM operation, network access, package access, source build, grant, policy, or
production authority. All capability states remain unchanged.

## Decision And Contract Lineage

- ADR 0019 accepts a state-first, journal-acknowledgement-second protocol and
  explicitly rejects claims of atomic dual-store commit.
- Process ownership v8 is hash-bound to immutable v7 and permits Main to receive
  only an injected inert binding port. Main cannot import the audit helper and
  receives no journal instance, database handle, authentication token, generic
  append method, signing method, or reconciliation authority.
- Registry v17 is stacked on the exact immutable v16 bytes and changes only
  `audit-event-proposal` and `audit-event` from v1 to v2. Builder manifest v2 and
  all four owner-review artifacts retain their pre-slice SHA-256 digests.
- Audit v1 remains admitted and verifiable. V2 adds only
  `CAPSULE_REGISTRY_REVISION_COMMITTED` and
  `CAPSULE_REGISTRY_RECOVERY_GAP` under the dedicated
  `dosai.capsule-registry` source with `SUPERVISOR_OBSERVATION` provenance.

## Durable Protocol

The audit helper canonicalizes and hashes the strict registry bytes. Each
committed event binds the registry schema, supervisor generation, revision,
previous registry digest, current registry digest, and one fixed transition
kind. The helper traverses the complete authenticated source history and
requires revision increments of exactly one, exact digest linkage, stable
generation for ordinary transitions, and a strictly newer generation only for
startup reconciliation.

The coordinator performs each transition in this order:

1. Retain the last durably bound registry as the transition predecessor.
2. Atomically save the next monotonically revised registry.
3. Request and verify a durable journal acknowledgement through the injected
   binding port.
4. Return success only after both durable operations succeed.

State-save failure or binding failure moves the coordinator to `BROKEN`.
Startup verifies the current registry against the complete capsule-event chain
before reconciliation. Missing state, an older or modified state document, a
newer unbound state document, a gap event, or invalid chain semantics blocks
startup without repairing either artifact.

Emergency stop remains outside the ordinary queue. It reduces in-memory capsule
state first, then attempts registry persistence and audit binding. Failure is
reported as `FAILED`, leaves the coordinator broken, and never restores or
creates authority.

## Adversarial Results

- A schema-valid revision-2 registry replaced by valid revision 1 is rejected on
  restart while the journal remains at revision 2.
- A valid registry with the same revision but changed timestamp is rejected by
  canonical digest mismatch.
- State saved while audit is unavailable returns no successful transition and
  is rejected on restart as state-ahead.
- An audit append whose acknowledgement result is lost is accepted on restart
  only when the journal proves the exact saved state; startup then records the
  next reconciliation revision.
- Authenticated revision jumps, duplicate revisions, wrong generation changes,
  recovery-gap events, forged credentials, source substitution, provenance
  substitution, unknown transitions, malformed digests, extra payload fields,
  and generic log events fail closed.
- Emergency stop still reaches `STOPPED` when the journal is unavailable; its
  unbound durable state blocks restart pending a future authenticated reconciler.
- Existing v1 audit mutation, deletion, truncation, reorder, replay, writer
  exclusion, storage exhaustion, commit-unknown, checkpoint, and local rollback
  limitation tests continue to pass.

## Validation

The exact governed toolchain was Node `24.18.0` and pnpm `11.18.0`.

```text
pnpm --config.verify-deps-before-run=warn run typecheck
8 TypeScript project checks passed

pnpm --config.verify-deps-before-run=warn test
257 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run build
main, preload, and renderer production builds passed
```

The flag prevented pnpm from rewriting an existing stale `node_modules`
workspace-state record; each command reported that warning and used the already
installed exact lockfile dependencies. No dependency or lockfile change was
made by this slice.

Focused new governance, ownership, coordinator, and real SQLite integration
coverage passes 33 tests. Combined P2 journal/checkpoint and P3 capsule
compatibility coverage passes 58 tests. `git diff --check`, process/network
authority scans, high-confidence changed-file secret scans, and immutable-file
digest checks pass. The benign Git fsmonitor IPC warning remains environmental.

## Immutable Inputs

```text
schema-registry-v16.json
5fe93957da3af2eea4e1bbdd29034ab42dbe57eac747ff3f5e366eb86368144e

linux-builder-manifest.schema.json v2
3d8a9c010cb84a62ad9668c585ba25910b2f6f64a69ea433841afa842a464da2

builder-input-v2.ts
cba6e83e2114c793d0e266e0be98b62c767823e88e6abf417da167179b4eac6b

p3-linux-builder-snapshot-contract.test.mjs
d2eca59dc2a92e77e0d22f06629b46e782885efc5b027535994527cbec1556cf
```

## Known Limitations

- The recovery-gap event is strictly admitted but no component has authority to
  emit a repair decision; unexplained gaps remain blocked.
- The application has no production composition path for the journal and
  capsule coordinator. The binding is proven through the real helper and
  SQLite journal in isolated integration tests.
- Binding detects registry/journal disagreement only while at least one artifact
  retains the newer history. A coordinated valid-prefix rollback of both local,
  unsigned, unanchored artifacts remains undetectable until independently
  retained Phase 11 checkpoints are proven.
- Independent watchdog transport, stale-owner reconciliation, process-tree
  cancellation, executable identity, isolation lifecycle, and process launch
  remain unavailable.

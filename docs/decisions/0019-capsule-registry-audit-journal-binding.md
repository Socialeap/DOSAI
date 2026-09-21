# ADR 0019: Capsule Registry Audit-Journal Binding

- **Status:** Accepted
- **Status updated:** `2026-08-02T16:15:41-04:00`
- **Decision owner:** Repository owner
- **Owner decision:** Approved the independent-audit remediation
- **Related evidence:** `docs/development/p3-capsule-registry-audit-binding-evidence.md`

## Context

The P3 durable capsule coordinator stores a monotonically revised, owner-private
registry. Strict admission and atomic replacement detect malformed data, but a
schema-valid older registry can replace the current file after a clean close.
The accepted P2.3 audit journal is hash chained and single writer, but audit
contract v1 admits only writer-epoch and synthetic-probe events. Process
ownership v7 also prevents Main from importing or holding journal authority.

The registry and journal use separate durable stores. They therefore cannot
form one atomic transaction: state-first can leave an unjournaled registry,
while journal-first can describe state that was never durably saved.

## Decision

Introduce versioned capsule-registry audit events and a narrow injected binding
port. The audit helper alone owns canonical registry hashing, source
authentication, append, and event traversal. Main imports only the inert port
contract and never receives a journal instance, authentication token, generic
append API, database handle, or signing authority.

Every initialization, startup reconciliation, and ordinary state-changing
coordinator operation uses this protocol:

1. Verify that the current registry exactly matches the complete accepted
   capsule-event chain.
2. Persist the next registry revision atomically.
3. Append and durably acknowledge an event containing the new canonical digest,
   previous digest, revision, supervisor generation, and fixed transition kind.
4. Return success only after both stores acknowledge durability.

Any missing, duplicated, reordered, mismatched, uncertain, or failed binding
moves the coordinator to `BROKEN` or blocks startup. DOSAI does not automatically
repair, roll forward, or roll back either artifact. A later authenticated
reconciler may record the separately governed recovery-gap event.

Emergency stop remains priority and reduce-only. Cancellation begins before
audit or persistence and never waits behind the ordinary queue. Its subsequent
registry save and journal binding are best effort; failure is reported and
leaves the coordinator broken without restoring authority.

## Security And Operational Consequences

- Registry-only schema-valid rollback and same-revision mutation are detected
  when the journal remains intact.
- Coupled rollback of both unanchored local artifacts remains undetectable. The
  claim is fail-closed cross-artifact continuity, not absolute rollback
  prevention; independently retained anchoring remains a Phase 11 gate.
- A crash between the two durable writes creates an explicit blocked state,
  never a successful transition.
- Audit event v1 and the journal hash algorithm remain compatible and immutable.
- This decision adds no process-launch, VM, network, package, source-build,
  policy, grant, or production authority.

## Alternatives Considered

- **Journal first:** rejected because it can authorize a transition whose state
  was never durable.
- **Treat the two stores as atomic:** rejected because no shared transaction
  exists.
- **Store the registry inside the journal database:** potentially stronger but
  a broader ownership and persistence redesign than this P3 slice requires.
- **Reuse `SYNTHETIC_AUDIT_PROBE`:** rejected because it would mislabel capsule
  lifecycle evidence and cannot express revision continuity.

## Revisit Conditions

Revisit if the registry moves into the journal transaction, an authenticated
reconciler receives accepted repair authority, the event contract changes, or
Phase 11 independently retained checkpoints alter rollback assurance.

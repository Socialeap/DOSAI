# ADR 0011: Acceptance Gate Phasing and Coverage Preservation

- **Status:** Accepted
- **Date:** 2026-07-31
- **Status updated:** 2026-07-31T17:28:39-04:00
- **Decision owner:** Repository owner
- **Related finding:** P1-GATE-001
- **Related plan phase:** P1-P11

## Context

Acceptance-test catalog v1 assigned worker recovery, parser, stream, image, and
database worker load, trusted execution-stop availability, and the physical
minimum/current macOS release matrix to the P1 exit gate. Accepted runtime and
phase boundaries require all of those worker and execution capabilities to be
absent in P1. Their implementations belong to P3, P7, and P9, while physical
release-matrix proof already belongs to P11.

Because P2 depends on P1, satisfying the v1 scenarios literally would require
later phases to execute before their prerequisite. Implementing test-only
privileged workers or a false stop control in P1 would weaken the exact boundary
the gate is intended to prove. Skipping the scenarios would violate the accepted
PASS semantics.

## Decision

### Immutable Lineage

- Preserve acceptance-test catalog v1, its schemas, evidence schema, and schema
  registry v2 byte-for-byte for historical verification.
- Create catalog v2, catalog and evidence schemas v2, schema registry v3, and a
  machine-readable v1-to-v2 relocation manifest. The repository owner accepted
  them as one synchronized governance decision.
- Bind every relocated obligation to its v1 source scenario, exact v2 target
  scenarios, owning phases, and a stable coverage ID. Validation fails if any
  obligation is removed, duplicated ambiguously, mapped backward in phase order,
  or left only in prose.

### Phase Ownership

- P1 tests the current development host, the declared minimum package metadata,
  renderer and unclean application recovery, bounded typed-bridge load, main and
  renderer responsiveness, and the enforced absence of worker, execution, and
  trusted-stop authority.
- P3 tests generic worker crash recovery and the independent trusted-stop path
  under saturation after execution capsules and the watchdog exist.
- P7 tests bounded database-worker saturation with persistence and search
  lifecycle invariants after that worker exists.
- P9 tests bounded parser, stream, and image-derivation worker saturation with
  exact fallback and canonical-source invariants after those workers exist.
- P11 retains clean-install execution on minimum and current physical Apple
  Silicon profiles. P1 continues to verify that the package declares macOS 15.0
  and boots on the current registered development host; it makes no minimum-OS
  execution claim.

### Gate Semantics

- Relocation changes the earliest phase at which evidence can exist; it does not
  remove an assertion, capability boundary, failure mode, platform obligation,
  artifact class, cleanup requirement, or final release condition.
- A phase tests unavailable future capabilities by proving their absence, not by
  introducing a privileged test bypass. The owning phase later tests their
  positive, negative, fault, load, recovery, and cleanup behavior.
- Catalog v2 retains all 36 suite identities. Scenario IDs remain stable where
  their purpose remains recognizable; new owner-phase scenarios receive new
  child IDs.
- Evidence created under one catalog version never satisfies another. The
  governed runner must record the exact accepted catalog, schema registry,
  fixture manifest, package, and report-schema identities.

## Security and Operational Consequences

P1 can complete without prematurely creating worker or execution authority.
Worker and stop safety remains mandatory in the first phase where those
components exist and again in the P11 release matrix. Historical v1 reports stay
verifiable, while no v1 result can be relabeled as v2 evidence.

The P1 engineering audit remains non-formal. Catalog v2 acceptance alone does
not pass P1; the governed runner, exact fixture manifests, current-host report,
and owner review are still required. Physical minimum/current release proof is a
P11 release prerequisite and cannot be converted into a P1 capability claim.

## Alternatives Rejected

- Implementing dormant production workers in P1 would enlarge the attack surface
  before their contracts, brokers, cancellation, persistence, and evidence
  controls exist.
- Test-only privileged workers or CDP-controlled stop hooks would not exercise
  production ownership boundaries and could become bypasses.
- Marking the worker and platform cases skipped would make PASS incompatible with
  the accepted evidence contract.
- Deleting the obligations would reduce security and release coverage.
- Keeping the circular dependency would permanently block P2 and every phase
  that owns the required implementation.

## Evidence Required

Before acceptance, static validation must prove v1 artifact digests are
unchanged, all 36 suites remain, suite and scenario IDs are unique, every v1
obligation has an exact v2 disposition, no P1 scenario requires a future
component, all relocated obligations appear in their owning scenarios, all
suites remain `NOT_IMPLEMENTED`, and v2 reports bind only catalog v2 and schema
registry v3.

P1 completion then requires the accepted governed runner and fixture manifests
to produce schema-valid current-host package, boundary, recovery, navigation,
malformed-request, load, cleanup, and secret-scan evidence. P11 remains
responsible for minimum/current physical clean-install proof.

## Revisit Conditions

Revisit this decision if phase dependencies change, a component moves owners,
the supported platform matrix changes, or an acceptance obligation cannot be
executed through the same production boundary it tests. Any further relocation
requires a new immutable catalog version, machine-readable predecessor mapping,
no-weakening proof, and owner approval.

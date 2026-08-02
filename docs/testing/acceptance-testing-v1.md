# DOSAI Acceptance Testing and Evidence v1

- **Status:** Accepted
- **Catalog version:** 1
- **Status updated:** 2026-07-31T14:48:38-04:00
- **Decision owner:** Repository owner
- **Related plan item:** P0.6

## Purpose and Non-Claims

This document and the machine-readable
[`acceptance-test-catalog-v1.json`](acceptance-test-catalog-v1.json) convert every
live development phase gate into stable test suites and define the evidence
report required for a gate claim.

The catalog is a specification, not proof. Every suite initially has
`implementation_state: NOT_IMPLEMENTED`; no phase, capability, control, or
integration becomes supported because a test ID or expected result exists.

Accepted ADRs, `SECURITY.md`, Baseline Contracts v1, and the live development
plan remain authoritative. A test must fail rather than weaken those sources.

## Runner Contract

The future runner is invoked from a leased repository root without a shell:

```text
pnpm exec dosai-acceptance run --catalog docs/testing/acceptance-test-catalog-v1.json --suite <SUITE_ID> --report-dir-env DOSAI_EVIDENCE_DIR
```

- The runner receives executable and arguments as an array and uses
  `shell: false`. Suite IDs come only from the accepted catalog.
- `DOSAI_EVIDENCE_DIR` resolves through the evidence broker to an owner-only,
  ignored, local managed directory. The command never accepts an arbitrary
  report path from a test fixture, renderer, agent, or repository file.
- The runner loads one exact catalog digest and one exact fixture-manifest
  digest. Unknown, missing, changed, duplicated, retired, or unimplemented suites
  return `BLOCKED` or `ERROR`, never `PASS`.
- The runner records its own executable digest, version, schema validator and
  version, dependency lock, repository head, dirty state, platform profile,
  component versions, and policy and registry versions.
- Test processes run through the same ownership, limits, cancellation, watchdog,
  filesystem, network, audit, persistence, and cleanup boundaries being tested.
  Tests do not receive a privileged bypass that production code lacks.
- A dedicated synthetic test mode may inject failures through narrow compiled
  fault points. It cannot accept arbitrary code, method names, filesystem paths,
  SQL, CDP, IPC, signals, or provider requests. Packaged release builds omit or
  cryptographically disable the fault controller.

The runner package and fixture manifests are implemented in their owning phases.
P0.6 defines their stable contract and gate mapping only.

## Suite and Scenario Rules

Each suite has an immutable ID such as `P3-AT-002`. Each required scenario has a
child ID such as `P3-AT-002-S01`, a mode, and one bounded requirement.

Scenario modes are `POSITIVE`, `NEGATIVE`, `SECURITY`, `FAULT`, `RECOVERY`,
`LOAD`, `PERFORMANCE`, `ACCESSIBILITY`, `PACKAGING`, and `REVIEW`. A fixture
manifest expands each scenario into exact versioned cases containing:

1. Synthetic inputs and preconditions with digests and data classes.
2. Exact setup operations and expected setup state.
3. Typed action or observation steps with limits and deadlines.
4. Stable machine assertion IDs and expected result codes.
5. Required canonical and derived artifact classes.
6. Expected external effects and reconciliation method.
7. Cancellation, teardown, retention, and deletion postconditions.
8. Secret-canary set version without storing canary values in the manifest.
9. Supported platform and dependency matrix.
10. Known fixture limitations and the rule that makes the case ineligible for a
    stronger claim.

Fixture, runner, assertion, and catalog changes create new immutable versions.
Prior reports keep their original references. A test may be `RETIRED` only after
a replacement covers every requirement and the owner accepts the catalog change.

## Result Semantics

Suite and scenario results are:

| Result | Meaning | Satisfies a gate |
| --- | --- | --- |
| `PASS` | Every required assertion and global pass condition is proven for the exact recorded subject. | Yes, after evidence and owner review. |
| `FAIL` | At least one expected postcondition is false. | No. |
| `BLOCKED` | A prerequisite, dependency, identity, environment, or owner action prevents a valid run. | No. |
| `SKIPPED` | The runner did not execute the required scenario. | No. |
| `ERROR` | The harness, validator, fixture, report, or evidence path failed. | No. |

A suite can report `PASS` only when all required scenarios pass and all seven
catalog gate conditions hold:

- `ALL_REQUIRED_SCENARIOS_PASS`
- `NO_PROHIBITED_DATA`
- `NO_UNKNOWN_OUTCOME`
- `CLEANUP_VERIFIED`
- `REPORT_SCHEMA_VALID`
- `ARTIFACTS_VERIFIED`
- `NO_UNAPPROVED_EFFECT`

Flaky retry does not erase a failed attempt. Each run is immutable with a new
`run_id` and attempt number. The phase review includes every attempt and explains
why a later pass does or does not supersede earlier evidence. A nondeterministic
or irreproducible pass cannot support a capability claim.

## Evidence Report v1

Every run emits one object conforming to
[`evidence-report.schema.json`](../architecture/schemas/v1/evidence-report.schema.json).
The report is canonical sanitized D2 evidence and contains no raw stdout,
browser content, repository text, command payload, path, URL, credential,
provider response, exception, or secret canary.

The report binds:

- Catalog, suite, scenario, runner, validator, fixture, repository, package,
  dependency, schema, policy, platform, hardware, and component identities.
- Start and finish time, monotonic or audit sequence references, duration, exit
  code, and exact fixed command argument array.
- Stable expected and observed assertion codes, not free-form hostile output.
- Artifact identities, required classes, manifests, digests, media types, data
  classes, byte lengths, retention profiles, and current availability.
- Cleanup result, expected and observed external-effect state, reconciliation,
  secret-scan result, limitations, and explicit gaps.

Raw or detailed evidence is stored only as separately admitted canonical
artifacts governed by ADRs 0008 and 0010. Reports reference artifact manifests;
they do not embed source bytes. A missing, expired, corrupt, inaccessible, or
deleted required artifact invalidates the evidence-dependent claim.

The schema makes `PASS` incompatible with a failed, blocked, skipped, or errored
scenario; failed assertion; unavailable referenced artifact; unknown cleanup;
partial, unknown, or expected-versus-observed external-effect mismatch; failed
or unrun secret scan; nonzero exit; or any evidence gap. Runtime validation
additionally checks cross-reference completeness, suite-phase agreement,
scenario coverage, required artifact classes, time ordering, duration, command
equality, and catalog and fixture digests.

Reports are never edited to add review. Owner and independent-review decisions
are separate signed audit records that bind the immutable report digest. A
capability record may reference only reports with current accepted review.

## Phase Gate Catalog

Each phase has exactly three required catalog suites. Scenario descriptions in
the machine catalog are normative; fixture matrices expand them without reducing
coverage.

| Phase | Required suites | Gate proof |
| --- | --- | --- |
| P0 | `P0-AT-001` through `P0-AT-003` | Governing authority and statuses agree; schema registry and references validate; F01-F12 map to proof; production access is absent; all unproven capabilities remain `UNVERIFIED`. |
| P1 | `P1-AT-001` through `P1-AT-003` | A packaged shell boots on the platform matrix, preserves renderer/preload/main boundaries, rejects IPC and navigation attacks, and stays responsive under worker load without execution capability. |
| P2 | `P2-AT-001` through `P2-AT-003` | Typed intents, tier policy, trusted approval, single-use grants, durable audit, key and continuity handling, failure denial, and the stop exception satisfy ADRs 0002 and 0004. |
| P3 | `P3-AT-001` through `P3-AT-003` | Exact typed execution is isolated; cancellation and cleanup cover all and only owned resources; independent stop remains available under saturation and crash recovery. |
| P4 | `P4-AT-001` through `P4-AT-003` | Lease identity and workspace containment resist path and ownership attacks; Git creates only reviewed objects and refs; remote mutation uses exact compare-and-swap and honest reconciliation. |
| P5 | `P5-AT-001` through `P5-AT-003` | Protected framing, peer authentication, ordering, replay defense, backpressure, durable delivery, reconnect, provenance, and manual fallback satisfy ADR 0006. |
| P6 | `P6-AT-001` through `P6-AT-003` | Dedicated browser sessions, navigation and permission denial, CDP allowlisting, D0 exclusion, canonical evidence, race handling, bounds, and teardown satisfy ADR 0007. |
| P7 | `P7-AT-001` through `P7-AT-003` | Admission, visibility, search, retention, deletion, SQLite cleanup, backup, restore, encryption decision, export, and independent verification satisfy ADRs 0004 and 0008. |
| P8 | `P8-AT-001` through `P8-AT-003` | Discovery isolation, pre-admission, strict validation, complete manifests, inert review, activation, exact invocation, effect routing, revocation, and target publication satisfy ADR 0009. |
| P9 | `P9-AT-001` through `P9-AT-003` | Exact canonical artifacts survive bounds and chunking; lossy code, log, DOM, and image views remain non-authoritative; approvals, replay, gaps, and exports satisfy ADR 0010. |
| P10 | `P10-AT-001` through `P10-AT-003` | Only approved test integrations complete end-to-end workflows; GitHub and Claude paths reconcile honestly; Stripe and production boundaries deny by default; manual fallbacks remain usable. |
| P11 | `P11-AT-001` through `P11-AT-003` | The release matrix, signing and notarization, entitlements, supply chain, rollback, evidence package, independent verifier, external review, finding closure, capability claims, and owner release decision all pass. |

## Gate Computation

A phase may become `COMPLETE` only when:

1. Its accepted catalog digest is current and all three required suites are
   `IMPLEMENTED` rather than merely specified.
2. Every required fixture case ran on every required platform and dependency
   profile and produced a schema-valid immutable report.
3. The latest eligible run and all relevant prior attempts are available, secret
   scanned, cleanup verified, and free of unknown effects or gaps.
4. Required canonical artifacts and independent-verifier results remain
   available under their retention policy.
5. Every mapped Critical and High control has passing negative and failure proof;
   no open finding invalidates a result.
6. Capability records are updated only for the exact actor, environment,
   versions, constraints, and fallback that the accepted reports establish.
7. The repository owner accepts the phase evidence, or P11 records the required
   independent review and owner release decision.

`BLOCKED`, `SKIPPED`, `ERROR`, unsupported environment, unavailable artifact,
stale dependency, changed policy, changed schema, dirty unrecorded worktree, or
unreconciled external state keeps the gate open. The status history records the
reason rather than converting absence into success.

## Safety and Evidence Storage

- Tests use only synthetic fixtures, dedicated local stores, isolated browser
  profiles, owned processes, leased worktrees, and approved non-production test
  accounts. Fixture values must not resemble real credentials.
- D0 canaries are generated ephemerally by a dedicated harness and supplied only
  to the boundary under test. Reports contain only the canary-set version and
  pass or fail state. A detected leak stops the suite and triggers the security
  stop-work procedure.
- Evidence directories are ignored, owner-only, inventoried managed copies.
  Reports and artifacts use Baseline Contracts v1 retention profiles. Tests
  verify cleanup but do not claim memory, swap, SSD, provider, or unmanaged-copy
  erasure.
- Tests may never contact production, use personal browser or agent sessions,
  weaken macOS or Electron security, mutate a default branch, self-approve, or
  grant a generic bypass. A fixture requesting one of these outcomes must prove
  denial without performing it.

## Catalog Change Control

The accepted catalog is content-addressed and immutable. A new requirement,
fixture group, platform, integration, or security finding creates a new catalog
version and schema registry generation. Removing or weakening a gate requires an
ADR and owner approval. A later version preserves predecessor identity and a
machine-readable requirement and suite mapping.

P0.6 completes only when this document, schema registry v2, catalog v1, catalog
schema, and evidence-report schema are accepted; all 12 phases have required
suites; F01-F12 and all phase exit gates have machine coverage; all suites remain
truthfully `NOT_IMPLEMENTED`; and validation finds no schema, ID, phase, control,
capability, reference, or governing-document conflict.

## Known Limitations

- The `dosai-acceptance` runner, fixture manifests, failure controller, artifact
  broker, independent verifier, and selected JSON Schema validator do not exist
  yet. Their owning phases must implement and prove them before any suite passes.
- Static Phase 0 validation can parse and cross-check the proposed schemas, but a
  pinned Draft 2020-12 validator and official conformance fixtures are selected
  and locked with the P1 toolchain.
- Catalog grouping proves requirement coverage only after every scenario is
  expanded into reviewed fixtures. A suite title or scenario description alone
  is not executable proof.

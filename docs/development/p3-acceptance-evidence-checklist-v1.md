# P3 acceptance evidence checklist v1

Status: **SOURCE-ONLY PREPARATION; NO ACCEPTANCE OR EXECUTION AUTHORITY**.
Role: unclassified assistant; no specialized repository role assigned.
Baseline: merged PR #19, full main SHA bound in the checklist.

## Purpose

The [machine-readable checklist](../testing/p3-acceptance-evidence-checklist-v1.json)
projects existing P3 manifest declarations into 27 individually scoped evidence
obligations. It preserves the exact artifact classes and scenario evidence gaps
from the existing manifest and handler proposals. It introduces no new acceptance
requirements and does not register a schema, change a manifest, implement a
handler or interpret any receipt.

There are 27 assertion occurrences but only 25 unique assertion labels.
`P3_WORKTREE_REMAINS_CLEAN` occurs in three different scenarios. Deduplicating by
assertion label alone would lose two separate cleanup obligations. Each row is
therefore keyed by the full suite/scenario/case/assertion tuple. One future
cleanup observation must never silently discharge all three occurrences.

| Scenario | Existing handler plan | Occurrences | Existing evidence gap |
| --- | --- | ---: | --- |
| P3-AT-001-S01 | Typed execution capsule | 4 | Accepted guest result, plan/grant/generation chain, signed candidate command/environment |
| P3-AT-001-S02 | Execution attack corpus | 5 | Physical attack corpus, guest escape negatives, cleanup and worktree |
| P3-AT-002-S01 | Cancellation fault matrix | 4 | Physical cancellation, owned descendants/handles, signed candidate timing |
| P3-AT-002-S02 | Scoped cleanup security | 5 | Physical resource teardown, unrelated canaries, remote reconciliation |
| P3-AT-003-S01 | Watchdog saturation matrix | 4 | Physical saturation, independent deadline, cleanup |
| P3-AT-003-S02 | Crash reconciliation matrix | 5 | Physical crash recovery, orphan/quarantine inventory, worktree |

Every row remains `NOT_COLLECTED` and `UNPROVEN`. These labels describe formal
P3 acceptance evidence only. Source tests and host-profile fixture results cannot
satisfy them. The checklist is not an accepted fixture generation, runtime receipt
schema, evidence validator or substitute for the existing runner.

## Prerequisite order and current stop

1. Preserve the already recorded PASS gates for integration, packaged macOS
   lifecycle and Debian trust roots. Do not repeat spent lifecycle attempts.
2. Establish qualifying independent native-amd64 builder evidence and accepted
   guest artifacts. Native-only, zero-cost and writer/trust requirements remain;
   current authorization permits no provisioning, dispatch, build or execution.
3. After physical prerequisites, obtain exact owner acceptance of the proposed
   schema, manifests and handler plan before implementing handlers or changing
   the runner/catalog/registry. The historical proposal's lifecycle snapshot is
   not a new request to replay that completed proof.
4. Only after the separately accepted implementation and activation generation
   may the three formal P3 suites run on an exact clean signed candidate. Scope
   evidence to every occurrence and retain required artifact classes. Missing,
   duplicate, malformed or contradictory evidence cannot be inferred as PASS.
5. Owner acceptance of P3 evidence precedes the representative app workflow and
   functional app acceptance. Existing BETA-CP-004/005/006 remain open.

The checklist tests reject source-document omissions, duplicate rows, scope
changes, lost artifact classes and invented acceptance (162 row mutations).
They do **not** exercise receipt rejection or physical cleanup. The existing
fixture-proposal regression confirms the current runner still returns
`DOSAI_ACCEPTANCE_SUITE_NOT_IMPLEMENTED_0001` / exit 2 for P3.

## Local checks

Use Node exactly 24.18.0 with retained lockfile-matched dependencies:

```sh
node scripts/report-native-profile-source-integrity.mjs
node --test --test-concurrency=1 tests/governance/p3-acceptance-evidence-checklist.test.mjs tests/governance/p3-acceptance-handler-implementation-proposal.test.mjs tests/governance/p3-acceptance-fixture-generation-proposal.test.mjs
node scripts/report-private-beta-readiness.mjs
```

The middle command passes ten source-only test groups. Integrity must report 35
files and zero tests run; readiness must remain exit 2 / NO_GO. These results
provide no builder receipts or acceptance assertion passes.

Validation passed **61/61 focused groups on Node 24.18.0**: the ten checklist
and proposal groups plus 51 existing profile, integrity and readiness checks.
The merged integrity report still verifies 35 files; readiness remains NO_GO.

## Release classification

This increment adds a supplemental checklist, source-consistency tests and
operator documentation only. Historical acceptance proposals, schema registry,
catalog, runner, manifests, models and workflows remain unchanged. No
provisioning, dispatch, executor, host mutation, build, guest execution or paid
activity is performed or authorized. Native-only and all existing gates remain.

No migration, durable live-state change, backend deployment, secret, environment
or provider configuration is required. **No Lovable action is required.** No
frontend Publish or application deployment is required. Review/merge is separate
from any future authority or acceptance decision.

## Supplemental synthetic negative evidence vectors

The source-only
[vector builder](../../tests/fixtures/p3/acceptance-evidence-negative-vectors-v1.mjs)
prepares six fault types for every scoped occurrence: missing assertion,
duplicate occurrence, contradictory synthetic outcomes, wrong scenario, missing
artifact class and malformed artifact reference. Three additional vectors reuse
an otherwise matching cleanup fragment from a different declared scenario.
Total: **165 synthetic vectors** across all 27 occurrences.

The fragments deliberately use `SYNTHETIC_SUCCESS` / `SYNTHETIC_FAILURE` and
`SYNTHETIC_ONLY` references. They are not serialized runtime receipts or a
registered schema. Every vector says fixture-only, expected rejection and no
acceptance authority. The builder has no imports, I/O, network, signing or host
operations and is unreachable from the app and accepted runner.

The four new test groups verify complete coverage, correct fault construction,
independent clones, deterministic output, pinned source inputs and import
isolation. **They do not test receipt rejection by a handler:** no P3 handler
exists or is implemented here. A later owner-authorized handler generation must
map these inputs into its accepted receipt format and independently demonstrate
actual rejection; merely generating the vectors never proves that behavior.

```sh
node --test tests/governance/p3-acceptance-negative-vectors.test.mjs
```

Use pinned Node 24.18.0. The supplemental
[source record](../architecture/p3-acceptance-negative-vectors-source-record-v1.json)
binds the fixture, tests and unchanged checklist/proposal/catalog/runner/manifests.
Native-only and all physical, implementation and acceptance prerequisites remain.
No provisioning, dispatch, executor, host mutation, builds, guest execution or
paid activity is added. **No Lovable action is required.** No deployment,
configuration, secret, migration or frontend Publish action is required.

Supplemental validation: **65/65 focused groups passed on Node 24.18.0**.
The integrity CLI still verifies 35 pinned files; beta readiness remains
exit 2 / NO_GO with BETA-CP-004/005/006. No acceptance suite or host action ran.

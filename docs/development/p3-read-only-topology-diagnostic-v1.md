# Read-only mount-topology diagnostic v1

Status: SOURCE ONLY, NOT ACTIVATED; runtime NO_GO.
Role: unclassified assistant; no specialized repository role assigned.

This diagnostic attributes the previously ambiguous MOUNTINFO_TARGET_FS_OR_ROOT
rejection without relaxing that predicate. It projects only target/ancestor/
submount metadata from bounded mountinfo bytes: mount/parent IDs, device,
filesystem class, full/other root class and read/write class. Arbitrary source,
root and mount paths are never emitted. Namespace identities are checked before
and after collection. Missing or multiple target rows are diagnostic facts,
never qualification success. Equal samples do not prove continuous stability.

Native Linux x86-64 is required before reads. Collection has a five-second alarm,
a 256 KiB read limit, 2048 input rows, 32 projected rows and 16 KiB output limit.
Malformed, unavailable, overflowing or timed-out input returns a fixed rejection
and exit 2 without input/error disclosure. There is no retry. The collector
has no external dependencies, command/path arguments, subprocesses or host-write
APIs. It reads only fixed mountinfo and namespace links.

The first increment intentionally does NOT open/stat the registry directory:
that could trigger an automount. Registration names/enabled states and Docker
architecture are explicitly NOT_OBSERVED. Original qualification remains
separate and mandatory. No writer inventory, source match, trust authentication,
independence, zero-cost account eligibility or builder proof is established.

## Inactive workflow proposal

`docs/proposals/p3-mount-topology-diagnostics-v1.yml` embeds the exact collector
in two fixed standard ubuntu-24.04 jobs with five-minute job limits,
permissions: {}, native runner context checks and a ten-second outer timeout.
It has no checkout, third-party actions, cache or artifact upload. It is outside
.github/workflows and cannot be dispatched as a workflow in this location.
Moving it into the active directory requires a separate reviewed activation
increment. A dispatch then requires fresh exact owner authorization after source
SHA/digests and public-repository zero-cost eligibility are reverified.
No previously spent authorization may be reused.

## Offline validation

```sh
python3 -I -B tests/governance/p3-mount-topology-diagnostic.test.py
node --test --test-concurrency=1 tests/source-only/p3-beta-regression-v1.mjs
```

Nine Python tests pass using synthetic byte inputs and mocked I/O only. They
cover automount overlays, other roots/filesystems, missing targets/submounts,
redaction, malformed/duplicate/oversized rows, namespace types/change, native
preflight, unreadable inputs, timeout failure reporting, read limits/descriptor
cleanup and byte-exact inactive workflow embedding. All 65 existing Node checks
pass on Node 24.18.0. No live collector or workflow was invoked.

## Release classification

Source-only collector, inactive proposal, offline tests and documentation;
original collectors, workflows, manifests, acceptance states and native-only
gates are unchanged. No provisioning, dispatch, host mutation, executor, builds,
guest execution or paid activity occurred. No migration, backend deployment,
secret/environment/provider setting or durable live-state change is required.
No Lovable action is required. No frontend Publish or app deployment is required.
Review/merge grants no activation or dispatch authority. BETA-CP-004/005/006
remain open; diagnostic observations cannot clear them.

# Kernel/writer diagnostic failure attribution: source only

Status: **PREPARED_INACTIVE_NOT_DISPATCHED**.
Based on merged PR #12, main `09a44100c78999038b01084606a0e15bb8b66f9d`.
Role: unclassified assistant; no specialized role assigned.
This increment supplies source and offline fixtures only. It supplies no workflow
activation, dispatch, executor, host mutation, build, guest execution or paid
activity authority. Effectful executor work and beta readiness remain NO_GO.

## Observed failure and its limit

The separately authorized [run 40563905019](https://github.com/Socialeap/DOSAI/actions/runs/40563905019)
executed once at that merged SHA, attempt 1. Both jobs emitted:

```text
DOSAI_KERNEL_WRITER_DIAGNOSTIC_FAILURE_V1:REJECTED
DOSAI_HOST_OBSERVATION_FAILURE_V1:KERNEL_WRITER_DIAGNOSTIC_REJECTED
```

No kernel/writer diagnostic, binfmt diagnostic, host success or builder receipt
resulted. The generic collector rejection does not identify its internal stage.
The cause is **unconfirmed**. No retry was performed and that one-dispatch
authorization is consumed. The compact source record retains only the run link,
commit, attempt, fixed failures and absence of receipts; no full host log is
copied into the repository.

## Inactive versioned successor

New source: `scripts/p3-kernel-writer-diagnostic-v2.py`.
The original collector and both dispatchable workflows remain byte-identical.
Nothing invokes the successor from a workflow. Historical records, v1/v2 removal
contracts, checkpoints and admission/reporting paths remain unchanged.

The successor changes failure attribution only. Its original acceptance
conditions, command projections, no-follow file traversal, sizes, query count,
time limits, native architecture requirement, identity rechecks and success
schema remain intact. Successful output deliberately retains
`DOSAI_KERNEL_WRITER_DIAGNOSTIC_V1:`. Optional signature/package/unit failures
still produce UNKNOWN with the existing fixed reason; they do not establish a
clean writer boundary or change to a successful trust decision.

Hard rejection prints exactly one line to stderr, exits 2 and emits no success
record:

```text
DOSAI_KERNEL_WRITER_DIAGNOSTIC_FAILURE_V2:<ALLOWLISTED_CODE>
```

The [source record](../architecture/p3-kernel-writer-attribution-source-record.json)
binds the successor, fixture/test inputs and unchanged active inputs by SHA-256,
and contains the closed code catalog. Codes never include exception messages,
paths, file contents, query output or environment values. Unanticipated errors
map to `UNEXPECTED_FAILURE`; otherwise-unclassified explicit rejections map to
`UNSPECIFIED_REJECTION`. No raw traceback is emitted by the collector's normal
failure handler. An outer launcher timeout or interpreter failure could still
prevent a collector line; this source does not invent evidence in that case.

| Code family | What the code attributes |
| --- | --- |
| `ENTRY_PRECONDITION`, `CONTEXT_INVALID`, `ROOT_OPEN` | Invocation, fixed run context, or read-only root opening |
| `NATIVE_PLATFORM`, `COMMAND_PROJECTION` | Native OS/architecture or validated fixed query construction |
| `KERNEL_RELEASE_READ`, `KERNEL_RELEASE_MISMATCH` | Initial bounded release read or equality check |
| `REGISTRY_OPEN`, `REGISTRY_STAT` | No-follow registry opening or descriptor metadata |
| `MOUNTINFO_READ`, `MOUNTINFO_ENCODING`, `MOUNTINFO_ROW_LIMIT`, `MOUNTINFO_ROW_FORMAT`, `MOUNTINFO_ID_FORMAT` | Bounded own mountinfo input and parsing |
| `MOUNTINFO_SUBMOUNT`, `MOUNTINFO_TARGET_FS_OR_ROOT`, `MOUNTINFO_DEVICE_OR_INODE_MISMATCH`, `MOUNTINFO_TARGET_COUNT` | Original strict mount-topology rejection |
| `NAMESPACE_READ`, `NAMESPACE_LINK_READ`, `NAMESPACE_ID_FORMAT` | Own namespace directory/link access or opaque ID validation |
| `REGISTRY_RECHECK_CHANGED`, `KERNEL_RELEASE_RECHECK_READ`, `KERNEL_RELEASE_RECHECK_MISMATCH` | Valid post-query identity changed, or release recheck unavailable/changed |
| `COLLECTION_DEADLINE`, `QUERY_DEADLINE`, `PROCESS_DEADLINE`, `OUTPUT_BOUND_OR_ENCODING` | Existing time or encoded-output limits |

Attribution reports the first detected condition, not exhaustive host topology
or root cause. Shared registry/mount/namespace codes can occur during either
sample. `REGISTRY_RECHECK_CHANGED` means two valid samples differed; an invalid
second sample instead retains its specific read/parser code. Query failures
within optional observations stay UNKNOWN; a later mandatory deadline/recheck
may still reject the whole collection. None of these codes authenticates a
kernel, excludes privileged writers, or authorizes execution.

## Representative fixtures and local validation

`tests/fixtures/p3/kernel-writer-attribution-v2.json` contains 12 synthetic mount
topologies. Each is tested against both collectors: valid cases produce equal
results and rejected cases remain rejected. They include a lone binfmt mount,
an unrelated root mount, autofs plus binfmt at the same target in both row
orders, two binfmt target mounts, a submount, wrong filesystem/root/device,
missing target and malformed input.

The autofs-plus-binfmt case is an **unconfirmed hypothesis** for the hosted
failure. It deterministically produces `MOUNTINFO_TARGET_FS_OR_ROOT` in the
fixture. It does not prove those rows existed on the runner. Stacked mounts
remain rejected: this increment does not select the topmost mount, ignore
autofs, change the original single-target condition or relax any safety gate.

All **23 attribution tests pass on Python 3.9.6 and 3.15.0**. Coverage includes
the 12 mount cases plus missing/oversized/symlinked release files, native/release
mismatch, missing registry/mountinfo/namespace data, hostile namespace text,
namespace/release changes during collection, optional UNKNOWN behavior,
context/attempt validation, deadlines, output overflow, exact query allowlisting,
mocked child cleanup and fixed errors without sensitive markers. Positive
fixtures preserve byte-equivalent success encoding and all proof fields false.

The combined suite passes **50/50 focused checks on pinned Node 24.18.0**,
including the new wrapper and previous activation, diagnostic, removal-model,
readiness, workflow-digest and host-verifier tests. The readiness reporter still
returns expected exit 2, NO_GO, with BETA-CP-004/005/006.

```sh
/usr/bin/python3 -B tests/governance/p3-kernel-writer-attribution.test.py -v
/opt/homebrew/bin/python3 -B tests/governance/p3-kernel-writer-attribution.test.py -v
node --test --test-concurrency=1 tests/governance/p3-kernel-writer-attribution.test.mjs tests/governance/p3-kernel-writer-workflow-activation.test.mjs tests/governance/p3-kernel-writer-diagnostic.test.mjs tests/governance/p3-binfmt-removal-v2.test.mjs tests/governance/p3-exact-binfmt-removal-plan.test.mjs tests/governance/p3-binfmt-diagnostic.test.mjs tests/governance/private-beta-critical-path-status.test.mjs tests/governance/p3-native-builder-host-observability-repair.test.mjs tests/governance/p3-native-builder-host-observation-verifier.test.mjs
node scripts/report-private-beta-readiness.mjs
```

Use the repository's pinned Node executable, with the retained acceptance-tool
dependencies available locally. The Python 3.15 path is the local supplementary
runtime, not a new installation requirement. Fixtures use temporary directories
and fake query responses; subprocess launch/cleanup tests use mocks. No live
Linux proc, kernel package database or service manager was queried, and no
build, host preparation or guest execution was performed. These tests provide
no external-provider, production, latency or reliability result.

## Sequential review and execution gates

1. Owner reviews this exact source increment. Source merge, if separately
   approved, leaves the current manual workflow unchanged and the successor
   inactive. Stop if acceptance, bounds or any historical input drifts.
2. Only after source review/merge and owner instruction, prepare a separate
   workflow activation increment binding the successor's exact bytes. Review
   the inline source and wrapper/failure handling against this record. This
   increment does not prepare or activate that workflow change.
3. Only after the activation increment is approved and merged, verify its exact
   merged SHA/ref, actual remote workflow digest and current zero-cost
   eligibility. Missing or mismatched evidence is a stop condition. Obtain
   fresh authorization for one diagnostic dispatch; no retry or other activity
   is implied by a failure or by this source merge.
4. If a later authorized run emits a fixed code, attribute only that detected
   check and reassess source-only. No code, UNKNOWN observation or complete
   inventory advances native builder qualification, source authentication,
   trusted writer exclusion, runtime admission or execution authority.

No backend migration, durable backend state, function deployment, secret,
environment/provider configuration or live activation is required by this diff.
**No Lovable action is required.** No frontend Publish or application deployment
is required. Owner review is the next action; workflow activation, a future
exact dispatch authorization and eventual application QA remain separate gates.
No reset, upgrade, recharge or paid activity was performed or authorized. The
120-credit mission ceiling remains in effect.

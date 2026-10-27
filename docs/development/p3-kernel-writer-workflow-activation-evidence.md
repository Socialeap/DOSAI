# Kernel/writer diagnostic workflow activation increment

Status: **PREPARED_FOR_REVIEW_NOT_DISPATCHED**.
Based on merged PR #11, main `0cd5daf8b8cb1d24d97e07b66ffa8e9d1c374e8e`.
Role: unclassified assistant; no specialized role assigned.
Authorization covers preparation of this separate activation increment only.
It does not authorize merge, dispatch, executor implementation, host mutation,
builds, guest execution or paid activity.

## Separate manual workflow

New path: `.github/workflows/p3-kernel-writer-diagnostics.yml`.
Workflow name: `P3 kernel and writer diagnostics`.
SHA-256:
`4d05e479c2009693a5d20c56fa94fdef085e2b1997ad16aaa5fbda5ca1790994`.

The existing native-host workflow remains byte-identical with SHA-256
`1e8daa3e67ff54200dda1f0c587dfc1b9501341ddfb8608d4a0b52fbb03da53c`.
It is neither replaced nor automatically invoked. A separate workflow keeps
its historic v1/v2 contracts, model/test guards and readiness bindings intact.
No checkpoint successor or reporter change is necessary because this increment
changes no existing admission/evidence path and adds no runtime acceptance.

The new workflow is an exact copy of the existing host observation program,
except for its workflow name, concurrency group and one inline kernel/writer
collector before the existing binfmt collector in each job. Tests reconstruct
that complete transformation byte-for-byte. The source code comes directly
from PR #11, with its original SHA-256
`6f40494ee7e3c00fa0557ef2f8779d67dd1e44dd9a1301d32b149ecc58450185`.

Each job retains all original native architecture, image, DMI, Docker, binfmt
and receipt checks. The new collector adds a stricter
`KERNEL_WRITER_DIAGNOSTIC_REJECTED` failure only. A successful diagnostic cannot
skip any original check or bypass `BINFMT_MISC_INTERPRETER_ACTIVE`. Existing
registration files still reject the host. The original host success receipt
format is unchanged, while kernel/writer output has its own diagnostic prefix.
A host receipt, if ever produced, would still require the original independent
two-host verification and would supply no builder receipt.

## Boundaries and limits

- `workflow_dispatch` only: no push/PR/schedule/reusable-workflow trigger,
  caller-selected inputs or automatic dispatch.
- `permissions: {}`; two fixed standard `ubuntu-24.04` jobs; five-minute job
  deadlines; concurrency cancellation remains false. This workflow's queue
  group is not a privileged-writer exclusion mechanism.
- No checkout, third-party action, secret reference, cache, artifact upload,
  container launch, installer, compiler, guest operation or paid runner.
- Exact inline Python, isolated mode and bytecode writes disabled. Kernel/writer
  collector has the reviewed 7-second collection/8-second alarm limits plus
  a fixed 10-second outer kill timeout. Existing binfmt collector keeps its
  five-second outer timeout.
- The reviewed collector can issue only the five bounded read-only package/unit
  projections. Failure cleanup may terminate only its own query child. It
  cannot remove registrations, control services, escalate privileges or accept
  caller-selected commands or files.
- Source-match, writer-exclusion, runtime-admission and execution-authority
  assertions stay false. Missing/unsupported observations remain UNKNOWN.
  No owner/provider trust assumption is accepted by source placement or merge.

The [activation record](../architecture/p3-kernel-writer-workflow-activation-record.json)
binds the new/old workflows, both collectors, PR #11 source record and unchanged
checkpoint v2. Those are review/dispatch-preflight inputs, not an executed
receipt. A later dispatch must hash the actual remote workflow bytes against
this record and independently verify its exact merged commit and named ref.
The current readiness reporter does not authenticate or consume this diagnostic
workflow's outputs; they cannot promote its gates.

## Local validation

All **49 focused checks pass on pinned Node 24.18.0**, including four activation
checks and prior kernel/writer, v1/v2 removal, binfmt, readiness and host-verifier
checks. The two Python fixture wrappers execute the prior 14 kernel/writer and
15 binfmt adversarial cases without any live query. Both complete inline shell
programs pass `bash -n`, and the new YAML parses locally.

```sh
node --test tests/governance/p3-kernel-writer-workflow-activation.test.mjs
node scripts/report-private-beta-readiness.mjs
```

The reporter retains its expected exit code 2 and NO_GO blockers
BETA-CP-004/005/006. No new runtime evidence is claimed. Workflow, diagnostic,
v1/v2 contract/model and checkpoint preimages were checked byte-for-byte; no
native/build suite or remote run was executed under the no-build boundary.

## Sequential owner gates

1. Review this exact source increment and separately approve its merge. Merge
   only makes the manual workflow discoverable on the default branch.
2. After merge, select the full merged commit and a named ref, verify their
   equality and the actual remote workflow digest above, and recheck public
   repository/standard-runner zero-cost eligibility. Stop on any mismatch or
   unavailable cost check. Do not choose the older host-only workflow by name.
3. Obtain fresh authorization for exactly one dispatch of
   `p3-kernel-writer-diagnostics.yml` on those exact bytes, with no retry,
   executor, host mutation, builds, guest execution or paid activity. No prior
   authorization covers this future run.
4. Parse only bounded timestamped diagnostic output; workflow logs also echo
   source text. Treat observations as untrusted. Kernel package metadata and
   fixed unit snapshots do not prove vendor source correspondence or writer
   exclusion. Further source review and owner trust decisions remain separate.

No backend migration, function/configuration deployment, secret, provider
setting, Lovable activation, frontend Publish, application deployment, account
reset or paid activity is required. The only future activation is GitHub manual
workflow discovery after approved merge. Existing safety gates and the 120-credit
ceiling remain. Beta and effectful executor status remain NO_GO.

# Failure-attribution workflow activation increment

Status: **PREPARED_FOR_REVIEW_NOT_DISPATCHED**.
Based on PR #13's verified merged main
`1d512f883d9dbd5d34849b67e84cb75453e7a323`.
Role: unclassified assistant; no specialized role assigned.
The owner authorized preparation only. Merge, dispatch, executor, host mutation,
builds, guest execution and paid activity remain unauthorized by this increment.

## Exact separate workflow

New path: `.github/workflows/p3-kernel-writer-attribution-diagnostics.yml`.
Name: `P3 kernel and writer attribution diagnostics`.
SHA-256:
`0b3b12bb600a67274acb8a7e211edf22cc4741539fbe8189c75da0595d2646b6`.

This is an exact copy of the earlier kernel/writer workflow except for its name
and the two inline kernel/writer collector bodies. Both bodies are byte-exact
copies of PR #13's reviewed `scripts/p3-kernel-writer-diagnostic-v2.py`, SHA-256
`9d1805b38d2c4fe299d86e696ae2993324bd1403e4f2dff3140bc8b560234294`.
Neither earlier workflow, collector source, historical source/activation record,
checkpoint nor readiness reporter changes.

The new workflow shares the existing `p3-kernel-writer-diagnostics` concurrency
group with its predecessor, retaining `cancel-in-progress: false`. Queue
serialization does not establish privileged-writer exclusion. Manual merge
would make this workflow discoverable on main; it does not dispatch it.

All original native architecture, runner/image, DMI, Docker and binfmt predicates
and the original host success receipt remain unchanged. Native Linux x86-64 and
Docker amd64 are still required. Any binfmt registration still triggers the
original rejection gate. No mount-stack exception or emulation fallback exists.
The exact-copy test reconstructs the whole workflow, rather than merely counting
individual checks. Successful diagnostics cannot bypass host admission checks.

## Fixed errors and preserved limits

The wrapper remains the same bounded isolated/no-bytecode Python invocation,
with the existing ten-second outer kill timeout. Nonzero exit still emits
`DOSAI_HOST_OBSERVATION_FAILURE_V1:KERNEL_WRITER_DIAGNOSTIC_REJECTED` and stops
before binfmt collection or host-success emission. Collector stderr is retained:

```text
DOSAI_KERNEL_WRITER_DIAGNOSTIC_FAILURE_V2:<ALLOWLISTED_CODE>
DOSAI_HOST_OBSERVATION_FAILURE_V1:KERNEL_WRITER_DIAGNOSTIC_REJECTED
```

Success output retains `DOSAI_KERNEL_WRITER_DIAGNOSTIC_V1:` and diagnostic-only
status. An outer timeout/interpreter failure may emit only the host failure;
absence of a collector line cannot be assigned an internal stage. The cause of
run 40563905019 remains unconfirmed. Synthetic autofs/binfmt stacks still reject
and do not establish that topology on the prior runner.

- Manual `workflow_dispatch` only; empty permissions; no caller inputs or
  push/PR/schedule/reusable-workflow trigger.
- Two fixed standard `ubuntu-24.04` jobs with five-minute job limits. Collector
  native/first-attempt context checks, seven-second collection, eight-second
  alarm, file/query/output bounds and five fixed read-only projections remain.
- No checkout, third-party action, secret, artifact, cache, installer, compiler,
  image build/pull, service control, registration writer, guest or executor.
- Optional unsupported signature/package/unit observations remain UNKNOWN.
  Source match, writer exclusion, runtime admission and execution authority
  remain false. No owner/provider trust decision is accepted.

## Source-preparation guard successor

PR #13's Python guard intentionally prohibited attribution code in every
workflow and bound its own original bytes in the immutable source record.
Adding the new workflow first reproduced exactly that guard failure; the other
22 attribution tests passed. Activation requires reconciling that preparatory
assertion rather than skipping the suite or editing the historical record.

Only that guard's final activation/input-binding block changes. The
[activation record](../architecture/p3-kernel-writer-attribution-workflow-activation-record.json)
binds its original and current hashes plus a before/after transition fixture.
The new test replaces the current block with its recorded preimage and hashes
the entire reconstructed file against PR #13's original digest. Unrelated guard
edits therefore fail. The current guard admits exactly the named workflow and
hardcoded digest above, verifies the strict false-authority set and guard
transition, checks every other original input unchanged, and continues rejecting
attribution code in any other workflow. All 23 substantive fixture tests remain.

## Local evidence

All **56 focused checks pass on pinned Node 24.18.0**, including six new
activation cases. They verify exact inline-source transformation, native/manual
scope, protected inputs, inert failure propagation, changed/unsafe workflow and
forged-authority rejection, and the narrow guard transition. Both complete
inline Bash programs pass `bash -n`; both inline collector programs parse with
Python AST without execution; the YAML parses locally with safe Psych loading.

The 23 attribution Python tests pass on Python 3.9.6 and 3.15.0. The combined
Node suite also includes the prior 14 kernel/writer and 15 binfmt Python cases,
both removal models, historical activation, readiness and host verification.
The inert wrapper fixture tests all 30 fixed codes plus an outer-failure case
without a collector line. A shell fixture consumes inert heredoc text and
returns a chosen failure; it never launches timeout, Python or a host query.

```sh
node --test --test-concurrency=1 tests/governance/p3-kernel-writer-attribution-workflow-activation.test.mjs tests/governance/p3-kernel-writer-attribution.test.mjs tests/governance/p3-kernel-writer-workflow-activation.test.mjs tests/governance/p3-kernel-writer-diagnostic.test.mjs tests/governance/p3-binfmt-removal-v2.test.mjs tests/governance/p3-exact-binfmt-removal-plan.test.mjs tests/governance/p3-binfmt-diagnostic.test.mjs tests/governance/private-beta-critical-path-status.test.mjs tests/governance/p3-native-builder-host-observability-repair.test.mjs tests/governance/p3-native-builder-host-observation-verifier.test.mjs
node scripts/report-private-beta-readiness.mjs
```

Use Node exactly `24.18.0` and retained local acceptance-tool dependencies. The
reporter still exits 2 with NO_GO and BETA-CP-004/005/006. It does not consume this
diagnostic workflow or promote its output to runtime evidence. No live kernel,
package database, service manager or writer boundary was queried. No external
provider, production or performance result is claimed; no build was run.

## Sequential owner gates

1. Review this exact source increment and approve merge separately. Stop on
   changed protected inputs, weakened predicates, unbounded collection or a
   broader guard exception. Merge alone makes a manual workflow discoverable.
2. Only after approved merge, select its full merged SHA and named ref, verify
   they agree, hash the actual remote workflow bytes against the digest above,
   and recheck current public-repository/standard-runner zero-cost eligibility.
   Stop on any mismatch or unavailable check; do not use the older workflow.
3. Obtain fresh exact authorization for one dispatch of
   `p3-kernel-writer-attribution-diagnostics.yml` at those verified bytes. No
   retry, executor, mutation, build, guest execution or paid activity is implied.
   No current dispatch authorization remains.
4. If later authorized, inspect only bounded timestamped diagnostic output;
   logs also echo source text. Treat records as untrusted. Attribute only a
   detected check, preserve UNKNOWN where no code exists, and reassess source
   and writer-boundary evidence without advancing runtime authority.

This diff requires no backend migration, durable backend state, function
deployment, secret, provider/environment configuration or app activation.
**No Lovable action is required.** No frontend Publish or application deployment
is required. Owner application QA remains a later beta gate after its native
builder and P3 prerequisites. No reset, upgrade, recharge or paid activity is
authorized; the 120-credit mission ceiling remains. Beta and executor status
remain NO_GO.

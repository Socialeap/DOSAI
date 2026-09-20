# Supervised execution fixture increment

Locally runnable proof of the execution control flow. **GO for supervised
synthetic-fixture evaluation; NO-GO for a working external-execution private
beta or distribution.** This tool is outside the Electron application and does
not enable any runtime capability or change a canonical phase status.

The owner requested the smallest local execution increment on 2026-09-20.
This implementation reuses accepted P2 policy, schemas, synthetic approval and
single-use grant proofs, and the local audit writer. It does not implement the
future probabilistic Typed Decision Plane, depend on Jev, or introduce another
effect-authorizing kernel. Contributor: unclassified assistant, no specialized
repository role adopted.

## Supported path

```text
closed typed request -> allowlist -> configuration/identity/permission preflight
    -> fixed route -> immutable plan -> exact operator confirmation
    -> fresh preflight -> durable intent -> P2 synthetic approval/grant proof
    -> fresh preflight -> single-use consumption -> pure fixture computation
    -> durable outcome receipt
```

| Action | Fixed handler | Result from the synthetic corpus |
| --- | --- | --- |
| `SUMMARIZE_FIXTURE` | `fixture.summary.v1` | 3 suites, 18 passed, 1 failed |
| `LIST_FIXTURE_FAILURES` | `fixture.failures.v1` | 1 suite, 4 passed, 1 failed |

These counts are fixture data, not the repository test result. Inputs are exactly
`{version: 1, action, fixture: "beta-core-v1", generation: "1"}`. There are no
caller-provided scripts, handlers, paths, providers, free text or credentials.
The two routes have distinct fixed synthetic resource identities. Plans bind
the request, route, fixture digest, P2 plan and policy version. The P2 synthetic
`STAGING` target deliberately exercises its Red approval proof without accessing
any staging system. Every receipt states `SYNTHETIC_NO_EFFECT_TEST_ONLY`.

## Operator runbook

Use the repository-pinned **Node 24.18.0** and existing locked dependencies.
Do not upgrade the dependency pins to run this proof. From the repository root:

```sh
node --version
node node_modules/typescript/bin/tsc -p tools/supervised-execution/tsconfig.json --noEmit
node --test tests/security/supervised-execution.test.mjs
node tools/supervised-execution/run.mjs SUMMARIZE_FIXTURE
```

1. Verify the displayed action, fixed fixture, route, digest and expiry.
2. To approve this fixture only, type the displayed `APPROVE <planDigest>` line
   within 60 seconds. Any other answer denies. A timeout stops the session.
   Piped input and noninteractive approval are rejected.
3. Expect `SUCCEEDED` **and** `LOCAL_DURABLE`. Denial/stop/unknown exits 1;
   invalid invocation or noninteractive use exits 2. A missing, failed or
   `UNRECORDED` receipt is not success.
4. The printed ignored `evidence/supervised-fixture-*` directory contains
   `receipts.json`, `audit.sqlite3`, and (after authorization) a separate
   `audit.sqlite3.grant-<planDigest>` P2 proof journal. Preserve that directory
   for local diagnosis. Never commit captured evidence.
5. Repeat with `LIST_FIXTURE_FAILURES`; then try `no` at the prompt and confirm
   `OWNER_DENIED`. Owner QA and acceptance remain outstanding until the owner
   runs and reviews these cases.

Both command entry points reject a symlinked, dangling or non-directory
`evidence` root before creating session files. They canonicalize the repository,
verify containment and recheck directory identity before returning a session
path. `EVIDENCE_ROOT_REJECTED` requires owner diagnosis; the tool does not follow
or remove the rejected path. These path checks are not OS isolation against a
same-user process racing directory replacement.

The accepted P2 grant-proof API can only create a fresh journal; it has no
reopen-identity input. Each immutable plan therefore gets its own proof journal,
and the outcome receipt references its grant ID, P2 plan digest, audit sequence
and exact journal suffix. No existing journal contract was changed.

The receipt journal stores each admitted receipt-body digest in the existing
synthetic probe schema. The JSON export carries the body and its exact durable
acknowledgement. The tool verifies journal continuity through its last retained
acknowledgement before reporting a result. During a session, deletion, corruption,
identity substitution or rollback behind the retained head blocks further work.
Original exports/acknowledgements must be independently retained to detect
subsequent local rollback; a new process cannot infer a missing historical tail.

Recovery is deliberately conservative: any failed run ends that session's grant
authority. Replays, cloned plans and plans from another session are rejected.
Start a new invocation with a fresh plan after diagnosing the failure. There is
no automatic retry or recovery of a half-finished job. An intent without a
verified outcome remains uncertain. An outcome-journal failure returns
`UNKNOWN`, withholds the result and blocks new work. Stop remains available
without a working journal; no OS processes need stopping in this fixture tool.
Sessions allow one pending plan, 32 preparation attempts and at most 160 retained
receipt records. These bounds are not a general task queue.

## Reproduce the local measurement

```sh
node tools/supervised-execution/benchmark.mjs
```

This runs exactly ten automated synthetic confirmations, alternating the two
actions. It writes ignored local evidence and reports setup and governed-path
p50/p95, success counts, runtime/platform, and explicit limitations. Human
approval time is excluded. There are zero provider/model calls. Do not use this
small sample to infer beta reliability, provider savings, calibrated confidence,
Jev parity or performance improvement. Repeat under a declared hardware/load
profile before making any comparison.

## Remaining go/no-go gates

- **Real execution: NO-GO.** ADRs 0003, 0014 and 0018 still require accepted
  isolation, independent native Linux build evidence and packaged macOS proofs.
  This tool cannot run a repository job, shell command, browser or provider action.
- **Production-grade approval: NO-GO.** The terminal confirmation and ephemeral
  P2 test authority are in one development process. They prove binding and failure
  behavior, not an authenticated native owner-presence boundary against compromised
  application code. No real action may rely on them.
- **Runtime integration: NO-GO.** No Electron/preload/HUD import, registered
  operation, execution broker, provider adapter, service launch or plugin changed.
  Those require their accepted contracts and dependency gates.
- **Watchdog:** stop revokes fixture authority before attempting audit. This
  single-process tool has no independently scheduled watchdog and cannot prove
  cancellation during blocked OS I/O or teardown of a real execution capsule.
- **Assurance:** the P2 authorization uses ephemeral software test signing.
  Outcome receipts claim local durability only. Hardware key protection,
  independently anchored history, exported signature verification and crash
  recovery of a real effect remain unproven.
- **Existing integration baseline:** seven historical P3 guard failures require
  the separate v42 acceptance/repair process. Do not delete those assertions or
  mark P3 complete based on this increment.

Release classification: offline developer tooling, tests and documentation only.
**No Lovable action is required.** No backend migration, secret, configuration,
deployment or frontend Publish is needed. Next steps are review of this exact
increment, owner fixture QA, and availability/acceptance of the existing execution
prerequisites. No merge, beta release or distribution is authorized by test success.

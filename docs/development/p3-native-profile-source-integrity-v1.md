# Native-host source integrity report v1

Status: **SOURCE ONLY; RUNTIME NO_GO**.
Role: unclassified assistant; no specialized repository role assigned.
PR #18 was verified on merged main
`9f53aaf41424f883e03cdbacee14faee6f388c89` (also bound in the manifest).
All 37 existing focused groups passed on Node 24.18.0 before this increment.

## Purpose and scope

The read-only reporter provides one deterministic check of the 35 source files
bound by the host-profile source record, namespace correction, offline functional
coverage and native/writer feasibility packet. It checks the actual current
bytes against a fixed manifest, itself SHA-256 pinned in the reporter. Missing
files or changed bytes reject; updating only an input's claimed digest cannot
make the changed manifest pass its pin. Historical records remain unchanged.

The reporter neither imports the fixture models nor executes their tests. It
accepts no command-line arguments, input paths, external receipts or host data.
Its test-only byte loader allows negative cases without modifying tracked files.
Returned reports are frozen; every effect authority remains false.

A successful report means **source integrity only**. It does not mean the tests
ran, the current Git commit is merged, the code is trustworthy, a signature
proves truth, replay is durably prevented, or the application is ready. The
manifest and reporter share the repository trust boundary; coordinated edits to
both require normal review and are not detected as external tampering. This is
not a live attestation service, runtime trust registry or hostile concurrent
filesystem verifier. No runtime consumer or app import is added.

## Operator sequence

Use pinned Node 24.18.0 with retained lockfile-matched dependencies:

```sh
node scripts/report-native-profile-source-integrity.mjs
node --test --test-concurrency=1 tests/governance/p3-native-host-profile.test.mjs tests/governance/p3-native-host-profile-v2.test.mjs tests/governance/p3-native-host-profile-v2-functional.test.mjs tests/governance/p3-native-profile-source-integrity.test.mjs
node scripts/report-private-beta-readiness.mjs
```

The integrity report must exit 0 and report 35 verified files, zero tests run,
NO_GO and false authorities. Rejection exits 2 with a fixed diagnostic that does
not echo input bytes or filesystem errors. The second command runs the actual
42 focused test groups. The final command independently checks existing beta
gates: expected exit 2, NO_GO, BETA-CP-004/005/006. These are separate results;
never substitute a source-integrity pass for tests or release readiness.

Negative tests cover changed and missing bytes for each of the 35 files (70
cases), altered manifest paths/digests/authority claims, invalid or oversized
bytes, loader failures, and absence of app imports or host-effect APIs.

Validation: **51/51 focused checks passed on Node 24.18.0**, including the
42 profile/integrity groups and nine existing critical-path governance groups.
The integrity CLI passed with 35 verified files; extra arguments rejected with
exit 2; the independent beta-readiness CLI retained exit 2 and all three blockers.
No builds or physical/provider operations were run.

## Release and next boundary

This increment adds a read-only development reporter, fixed source manifest,
tests and documentation. It does not alter workflows, models, runtime wire
schemas, gates, acceptance state or native-only requirements. No provisioning,
dispatch, executor, host mutation, builds, guest execution or paid activity is
performed or authorized. Native host eligibility and real writer enforcement
remain unresolved; physical builder receipts, formal P3 acceptance and the
representative app workflow still block functional app acceptance.

No backend migration, durable live-state change, function deployment, secret,
provider setting, environment configuration or activation is required.
**No Lovable action is required.** No frontend Publish or application deployment
is required. Owner source review precedes merge; merge conveys no live authority.

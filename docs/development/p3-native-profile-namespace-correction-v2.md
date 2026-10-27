# Native-host fixture namespace correction v2

Status: **PREPARED SOURCE ONLY; RUNTIME NO_GO**.
Baseline: merged main `71030aa9143c8ad815c2eb6f5d6d6c99f9949bc3`.
Role: unclassified assistant; no specialized repository role assigned.
The owner authorized this versioned source correction and negative tests.
No provisioning, dispatch, executor, host mutation, builds, guest execution or
paid activity is implemented or authorized.

## Narrow correction and immutable history

`tests/fixtures/p3/native-host-profile-model-v2.mjs` is a copy of the v1 fixture
model with exactly two changes: `mount_namespace` and `user_namespace` must be
strings before their existing regular expressions are evaluated. There is no
coercion, normalization or conversion of arrays/objects into namespace strings.

The owner-confirmed finding SEC-NHP-001 concerned single-element namespace
arrays accepted through JavaScript regex coercion. Re-signing and repinning a
synthetic context could produce a positive v1 relational result for those
non-string values. V2 rejects them with the existing fixed fixture error.

The original model, its 13-test corpus, source record, host profile and boundary
proposal remain byte-identical. The correction neither edits the v1 hashes nor
rewrites its historical behavior. A differential test continues to reproduce
the two original array cases in v1 while requiring v2 rejection. The
[correction record](../architecture/p3-native-host-profile-namespace-correction-v2.json)
binds both versions, the new tests and every original source-record input.

This versions the fixture implementation only. The profile digest, signature
domain and envelope, canonical bytes, export interfaces, success schema,
time/size limits, trust bindings and all native/writer/privilege/cost checks are
unchanged. Valid scalar namespace fixtures produce identical v1/v2 results.
Runtime wire-suite registration and accepted schema/ADR generations do not change.

## Offline validation

The new six-group suite first ran against an unfixed v2 copy: three groups
passed and three failed, including the array regressions and non-string matrix.
After the two guards, all six groups pass. The combined relevant suite passes
**83/83 checks on pinned Node 24.18.0**.

Coverage includes:

- Both confirmed single-element array cases with valid fixture signatures and
  consistently repinned contexts.
- Sixty non-string combinations: both namespace fields, before-only/after-only/
  matching snapshots, and arrays, nested arrays, empty arrays, objects, null,
  booleans and numbers.
- Valid minimum/ordinary/maximum-length scalar identities with byte-equivalent
  signing input and equal immutable v1/v2 result objects; eighteen malformed
  scalar combinations continue to reject in both versions.
- Native/emulation, registration, privilege, expiry, cost, owner-policy and
  signature-denial smoke checks in v2, plus the unchanged original regressions.
- Exact two-guard source transformation, immutable history/input hashes,
  application import isolation and absence of host-operation imports.

```sh
node --test tests/governance/p3-native-host-profile-v2.test.mjs
node scripts/report-private-beta-readiness.mjs
```

Use Node exactly 24.18.0 and retained lockfile-matched dependencies. Keys used by
the new tests are ephemeral software key objects in memory; no private key is
exported or persisted. No live host or provider was queried. No native/build
suite was invoked, and no performance or physical assurance claim is made.

## Remaining gates and release classification

The corrected fixture remains unreachable from the application and grants no
runtime authority. Source match, writer exclusion, continuous emptiness, runtime
admission and execution authority stay false; builder receipts remain zero.
Real trust registration, replay persistence, host availability/zero-cost proof,
writer enforcement, live verification and physical acceptance remain unresolved.
The readiness reporter still exits 2 with NO_GO and BETA-CP-004/005/006.

Owner review and any source merge are the next gates. No activation, provider
selection or execution follows from this correction. All existing native-only,
workflow, collector, contract, checkpoint and acceptance gates remain intact.

This diff adds a versioned fixture, tests, a supplemental source record and
documentation. It requires no backend migration, durable live-state change,
function deployment, secret, provider/environment configuration or application
activation. **No Lovable action is required.** No frontend Publish or application
deployment is required. Later activation and owner app QA remain separate gates.
The 120-credit ceiling remains; no reset or paid activity is authorized.

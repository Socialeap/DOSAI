# P3 historical guard repair: v43 review evidence

Recorded 2026-09-20. Contributor: unclassified assistant; no specialized role.
Status: implemented pending owner review. **Real execution remains NO-GO.**

## Scope and authority

The owner directed a bounded repair of seven stale P3 guard postimages, with
exact lineage and allowed-file checks before implementation. This record does
not accept P3, amend an accepted ADR, authorize physical proof, or activate a
runtime capability. V43 is a test-only successor record; it deliberately rejects
an `ACCEPTED` status or any runtime authority.

The source baseline is local HEAD
`43ab61000a35ec642373bd097c0dc32102519f7a` plus the owner's existing uncommitted
P3 work. All 435 original source files were inventoried before this mission.
The repair was developed and tested in an isolated copy. The fixture execution
increment from PR #2 at `0284f74d146f23581ab1833f817ac31883bcb96a` was also
present for the full combined test run.

## Exact lineage and bounded change

The following remain byte-identical:

- Accepted v41: `eab6cd2acd9b729a42760237a82a8536d897d3471a3629d70b5ed27c7abe2d42`.
- Proposed v42: `c39b65583c9bb7786bcdc342054d2ad8a7a211d90180b22fe3c41e0b09be5e4b`.
- The v41-accepted v20 guard: `91f4e30d01f03bd19d203341107cded4c5cccb4f0512453e58de826f6f8721f7`.

V43 records the exact before/after hashes of ten architecture guards:
v22, v24, v26, v27, v28, v29, v30, v36, v37 and v42. The original seven are
v22/v24/v26/v28/v30/v36/v37. Updating only their v20 expectation caused six
sibling-postimage failures. The first complete-suite run then exposed v27 and
v29 pinning the changed v26/v28 guards. V42's test also needs to recognize the
new postimages while preserving its proposal document and preimages. These are
the complete dependent set demonstrated by validation, not a blanket hash bypass.

The new shared test helper verifies accepted v41, preserved v42, their governed
baselines, the accepted v20 postimage, exact allowed paths, exact preimages and
all ten new postimages. It checks every unaffected v37 governance-maintenance
hash directly. Each new support file is also hash-bound. All 425 original files
outside the ten guards remain byte-identical. Historical manifests and runtime
source are unchanged.

## Validation

Use the pinned Node 24.18.0 runtime and existing locked dependencies. No
dependency or compiler timeout was changed.

```sh
node --test tests/architecture/process-ownership-v43.test.mjs
node --test tests/architecture/process-ownership-v{22,24,26,27,28,29,30,36,37,42,43}.test.mjs
node --test --test-concurrency=2 tests/*/*.test.mjs
```

- Original baseline: 497/504 tests passed; seven stale guards failed.
- V43 negative/lineage tests: 5/5 passed.
- Impacted architecture tests: 55/55 passed.
- Full combined suite with two test processes: 532/532 passed in 139.58 seconds.
  No tests were skipped or cancelled.

The v43 tests reject unknown/missing/duplicate/traversal paths, altered lineage,
incorrect preimages or postimages, unaffected-file drift, support-file drift,
malformed/duplicate-key/oversized records, authority expansion and false owner
acceptance. Forbidden-path tests verify that those paths were never opened.

An unconstrained combined run passed governance but timed out eight existing
Swift compiler invocations at their unchanged 60-second limits. The bounded
rerun limits test scheduling to two processes; it does not skip tests, alter
assertions or increase deadlines. The bounded run passed all 532 tests; the failed unbounded run remains a
scheduling limitation in the evidence, not a correctness pass.

## Review and delivery

V43 is a candidate engineering repair, not a formal phase-acceptance result.
Owner review of its exact postimages is still required. The associated patch
contains only the ten modified guards, the new helper and acceptance test, the
v43 record, and this evidence document. Before applying, require all ten
preimages to match and all four new paths to be absent, then use
`git apply --check` on the exact patch. Stop on any mismatch. The local delivery
already includes the patch; do not apply it twice.

The underlying P3 baseline has not been published and is absent from remote PR
bases. This repair cannot be presented as a standalone integrated source PR
until that baseline has an owner-approved publication path. Publishing unrelated
uncommitted P3 files is outside this repair. PR #2 remains the separately scoped
fixture increment; its source and review base are unchanged by v43.

## Next physical gate and release classification

The narrow next physical proof is the existing v37 one-shot signed-app Service
Management status proof. Read-only preflight matched all six retained package
hashes and an unsandboxed `codesign --verify --deep --strict` succeeded. This
does not prove that the addon loads or that any service/VM can execute.

The [accepted source-only proof record](p3-service-management-status-signed-app-proof-proposal.md)
requires separate owner authorization naming selector `UMXN25Z493`, team
`3RD3TADLRY`, app `com.socialeap.dosai`, and addon
`com.socialeap.dosai.service-management-status-addon`, explicitly authorizing
the exact proof-package build/signing, one app launch, one module load and one
zero-argument status call. Any authorized attempt must use an isolated output
directory, preserve the retained package, and stop if exact cached inputs or
signing prerequisites are unavailable. No such attempt was made for v43.

The accepted guest supply chain additionally needs two independent native amd64
Linux builders and accepted guest artifacts. Neither those environments nor
ready guest artifacts have been established here. Do not provision them, launch
a VM, register a service, deploy, or run external work under this repair.

**No Lovable action is required.** This changes only local test guards and
review evidence. There is no migration, secret/configuration change, backend
deployment or frontend Publish step. Owner record review, fixture QA, physical
proof authorization and private-beta acceptance remain separate gates.

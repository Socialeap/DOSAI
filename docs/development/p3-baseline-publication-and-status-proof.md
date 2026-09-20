# P3 baseline publication and one-shot status-proof result

Recorded 2026-09-20. Contributor: unclassified assistant; no specialized role.
**Physical proof failed; real execution and private-beta release remain NO-GO.**

## Owner-authorized publication

The owner authorized publication of the exact current P3 baseline and the
validated v43 guard repair on a review branch, without merge or release.
[Draft PR #3](https://github.com/Socialeap/DOSAI/pull/3) uses the unchanged
committed P2 review base `43ab61000a35ec642373bd097c0dc32102519f7a`.

- Baseline commit: `d7e8c38b97bf60b9212bcf77a96dae22fefe9b51` (241 changed paths).
- V43 repair commit: `abff065900f17a4f474d8a82622ad1edd77968dd` (14 paths,
  including ten guards already present in the baseline).
- Aggregate implementation scope: 245 changed paths; this publication/failure
  summary is one additional documentation path.
- Four unrelated local files are excluded and preserved: `.gemini/rules.md`,
  `docs/development/agent-memory-workflow-evaluation.md`,
  `docs/development/antigravity-gemini-review-brief.md`, and
  `docs/development/specs/inkwell-factory-integration-spec.md`.

All 431 included original baseline files matched their inventory before the
repair. The ten authorized guard postimages match v43; all 425 original files
outside those guards remain unchanged in the owner's checkout. Accepted v41 and
proposed v42 remain byte-identical. V43 remains pending owner review and grants
no runtime authority. The fixture implementation in PR #2 remains separate.

This publication resolves the earlier publication prerequisite described in
the [v43 evidence](p3-guard-successor-v43-evidence.md); its engineering validation
does not constitute owner phase acceptance.

## Validation of the exact review source

On Node 24.18.0 with existing locked dependencies:

- `node --test --test-concurrency=2 tests/*/*.test.mjs`: **509/509 passed**,
  no skipped or cancelled cases, 127.76 seconds.
- All eight TypeScript project checks passed.
- Normal Main, preload and renderer builds passed.
- The 14-file v43 increment passed `git diff --check`. Existing intentional
  Markdown line breaks and patch-context whitespace were preserved in the
  baseline instead of changing historical hashes.
- A high-confidence scan of the 431 baseline source files found no credential
  pattern matches. This is a bounded scan, not a claim of comprehensive audit.

The earlier 532/532 result includes the separate fixture increment's 23 tests;
it is not the test count of this standalone PR. All validation artifacts remain
ignored locally, and retained-package tests used the unchanged owner artifact.

## Exact physical authorization and preflight

The owner authorized only the existing proof-package build/signing with selector
`UMXN25Z493`, team `3RD3TADLRY`, app `com.socialeap.dosai` and addon
`com.socialeap.dosai.service-management-status-addon`, followed by one app launch,
one module load and one zero-argument status read in isolated output.

Preflight stopped when the Electron archive cache was absent. A separate owner
authorization then permitted retrieval of only the public pinned
`electron-v43.2.0-darwin-arm64.zip` from the official Electron GitHub release.
The 122,090,802-byte archive matched the unchanged pinned dependency's checksum
manifest: `ad4a0ae3c37ee05aa06c7e2ed0627608389790f0505a2b0d20319efbe33ffe28`.
All four Node header hashes also matched the accepted source. No other download,
version change, paid service or builder provisioning occurred.

The isolated proof checkout was built from
`abff065900f17a4f474d8a82622ad1edd77968dd` using only
`--signed-app-service-management-status-proof-fixture`. Package build/signing
completed once with exit 0 in 57.94 seconds. The existing package mode includes
the inert named-service fixture; it was signed but never launched or registered.

Strict signature requirements passed for all three exact identifiers and team:

| Artifact | CDHash |
| --- | --- |
| Outer app | `9bb1580bb3a18bb896c05fdd40931971f50220b8` |
| Status addon | `f5d3e392883615fcd5ad08e9dbb4fd72661773be` |
| Inert named-service fixture | `de1f2ceef98546944a7162b6b39a4b65a2ff291e` |

The packaged ASAR entry matched the dedicated proof build exactly, SHA-256
`bad50b915dedfdbaafd521a678b62cfe92ac23d434be983e08dad6f568ef3688`.
All six retained-package hashes were checked before and after the attempt and
remained unchanged. The proof package also remained unchanged after its attempt.

## Physical result and inert diagnosis

The accepted fixed runner made exactly **one app-launch attempt**. The app
returned no stdout or stderr and reached the existing 15,000 ms deadline. The
runner reported `killed: true`, `signal: SIGKILL`, and exited 1 after 15.05
seconds. **No status observation was returned. Native loading and the status
call are unverified. No retry was performed.**

The build log contains `EMPTY_IMPORT_META`: the proof entry uses
`createRequire(import.meta.url)` while its output format is CommonJS. The exact
packaged entry contains `createRequire({}.url)`. An inert evaluation of those
packaged bytes, with Electron replaced by a stub and no native loading, raises
`ERR_INVALID_ARG_VALUE` before `app.whenReady()` is called. This establishes a
bundle initialization defect. The physical timeout contains no internal trace,
so this diagnostic is not presented as proof of every step taken by the app.

The existing source-only test asserts the problematic spelling and does not
evaluate the built entry. Passing its static assertions therefore did not
establish CommonJS startup correctness. The one-shot timeout successfully kept
the unsuccessful physical attempt bounded.

## Narrow next increment and operator handoff

The next proposed source repair should bind CommonJS `createRequire` to the
actual bundle filename, and replace the source-spelling assertion with a
regression that builds the dedicated entry and evaluates it using inert Electron
and native-addon stubs. It should prove startup, one fixed native-load request,
one zero-argument observation, one bounded output and fail-closed behavior.
Preserve the exact package mode, identity, runner deadline and no-retry rule.

Before implementation, record the exact affected source/test postimages and
necessary historical guard successors under the repository's owner-controlled
process. Do not rewrite accepted v37 or widen normal Main authority. The current
authorization does not permit another build/signing/launch sequence after a
source repair; obtain an explicit bounded follow-on authorization for that
physical attempt. Do not retry the preserved failed package.

Sanitized receipts, package log, empty-output result and inert diagnostic are
retained in ignored local directory
`evidence/p3-status-proof-2026-09-20-abff065/`, including a SHA-256 file manifest.
The isolated proof package remains in `/private/tmp/dosai-p3-status-proof/out/`;
it is evidence only and must not be distributed. Review the receipt before
making any claim about this physical gate.

## Owner-authorized CommonJS source repair

The owner subsequently authorized process ownership v44 and the additional v42
guard path exposed by full regression. The bounded source repair now uses
`createRequire(__filename)` in the CommonJS proof entry and replaces the former
source-spelling assertion with a build-and-inert-evaluation regression. V44
hash-binds the exact implementation, test, and successor-guard postimages while
leaving every runtime, package, signing, launch, load, status-call, registration,
service, connection, VM, filesystem, network, journal, and production authority
false.

The focused repair suite passes 22 of 22, the full repository suite passes 513
of 513 with no skips or cancellations, all eight TypeScript projects pass, and
both the dedicated proof build and normal Main/preload/renderer builds pass.
See the
[v44 repair evidence](p3-service-management-status-commonjs-repair-evidence.md).

This validation does not rewrite or supersede the failed physical result above.
The owner later authorized one isolated follow-on attempt at commit `86ff428`.
That exact test package built and signed once, and its one app launch returned
the admitted result `DOSAI_SERVICE_MANAGEMENT_STATUS_PROOF_V1:NOT_FOUND` in 3.60
seconds with runner exit 0. No retry occurred. See the
[v44 physical evidence](p3-v44-signed-app-status-proof-evidence.md).

The follow-on result proves corrected CommonJS startup, Electron readiness,
one fixed load attempt, one zero-argument adapter observation, bounded output
and bounded exit. It does not independently prove successful native-addon load
or execution of `SMAppService.status`, because all load, call and legitimate
native `NOT_FOUND` outcomes collapse to the same result. Registration, service
launch, connection and execution were not performed. Real execution and
private-beta release remain **NO-GO**, and the single-use authorization is
exhausted.

Independent native amd64 Linux builders, accepted guest artifacts and the
remaining isolation/approval proofs are still required for useful execution.
The 3–4-day target has not been demonstrated by fixture or packaging success.

## Release classification

**No Lovable action is required.** This publishes desktop-native source,
build/test tooling and governance records; there is no backend migration,
secret/configuration change or deployment. No frontend Publish is required.
Nothing was merged, distributed, registered or deployed, and no production
execution or paid/external builder provisioning occurred. The source repair
and bounded startup proof are complete; a separately governed source proposal
is required to make native-load and native-call success observable before any
further physical attempt. Owner QA and beta acceptance remain separate gates.

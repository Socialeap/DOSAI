# Supervised private-beta operator runbook

Status: **NO_GO for full functionality testing**. Source validation is distinct
from runtime acceptance. This runbook does not authorize external effects.

## Current baseline

PR #4 merged as `1afb5f989a6faeed91bcc08a27c32013f6d8fd13` after the
12 focused readiness/host-observation tests passed on pinned Node `24.18.0`.
The digest repair is commit `29f470f1a2eb36e29f2e56e4442b4319d5338e1f`.
Readiness now computes SHA-256 over the actual workflow bytes, rejects drift,
and fails closed when the workflow is missing. Regression tests first reproduced
both failures against the old implementation. These are local source results;
no workflow dispatch or builder receipt is claimed.

All nine TypeScript projects also passed on Node `24.18.0`, including
`tools/supervised-execution/tsconfig.json`. The fresh-checkout artifact checks initially failed because ignored signed
files were absent under `out/DOSAI-darwin-arm64/DOSAI.app`. The retained owner
package matched the recorded addon, service, outer-executable and ASAR hashes.
It was copied into the isolated checkout without launch or signing; all 22
architecture v28/v35/v37 and status-addon package checks then passed. No guard
was weakened and no replacement package was built or signed. The packaging
argument-admission test also requires an existing `out` directory; preserve this
fixture prerequisite when reproducing the full suite.

The broad serial pinned-Node run completed 645 tests: 640 passed, 5 failed
with `ENOENT` for the absent retained package or `out` directory. After restoring
those fixture prerequisites, the four affected artifact checks passed within a
22/22 focused run and packaging admission passed within a 5/5 focused run.
Thus all five observed failures were resolved on rerun; this is not a claim that
one full-suite invocation returned 645/645. No native workflow dispatch,
registration, package rebuild, or provider spend was performed.

## Local preflight

Use a clean isolated checkout. Preserve the owner checkout and other agents'
branches. Verify `node --version` is exactly `v24.18.0` and dependencies match
the committed lockfile before interpreting validation results.

```sh
node --test --test-concurrency=1 tests/governance/private-beta-critical-path-status.test.mjs tests/governance/p3-native-builder-host-observability-repair.test.mjs tests/governance/p3-native-builder-host-observation-verifier.test.mjs
node scripts/report-private-beta-readiness.mjs
```

The first command must pass. The second currently returns exit code 2 with
`NO_GO` and blockers `BETA-CP-004`, `BETA-CP-005`, `BETA-CP-006`. An evidence
rejection is a separate failure, not an ordinary NO_GO. Never edit a recorded
hash or status merely to make the check pass.

## Sequential release gates

1. **Native host observation — explicit owner authorization required.** PR #4
   is merged, but its source record still requires separate exact authorization
   before a new dispatch. Pin the selected merged SHA and workflow SHA-256
   `6d04426acf2f30e406a4d948861951813146c20f80196e315feec070cf101d63`.
   Recheck repository visibility, current runner billing, fixed standard
   `ubuntu-24.04` runner labels, and zero-charge eligibility. Stop if cost cannot
   be established as zero. Only after authorization, permit one manual dispatch
   of the existing two-job workflow, no retries/reruns, secrets, checkout,
   artifacts, cache, container builds, guest execution, or provider spend.
   Collect minimized output privately and verify it using
   `scripts/verify-p3-native-builder-host-observation.mjs`. A failure stops this
   attempt; obtain fresh authorization before another external attempt.
2. **Independent builders — separate bounded approval required.** Successful
   host observations qualify only candidate hosts. They produce zero builder
   receipts. Complete the accepted ADR 0018 and builder-v2 requirements for two
   distinct native-amd64 builds; review exact inputs, digests, outputs, isolation,
   cleanup, and receipt provenance before accepting execution-eligible artifacts.
3. **P3 acceptance preparation.** After prerequisite evidence exists, select one
   exact clean candidate and accepted guest artifacts. Obtain owner acceptance
   of the exact schema, manifests, and handler plan named in
   `docs/architecture/p3-acceptance-handler-implementation-proposal.json`.
   Implement and independently review the prerequisite/handler modules before
   runner activation. Source unit tests cannot replace physical acceptance.
4. **P3 acceptance execution — bounded approval required.** Run the three suites
   on the same signed candidate only after all prerequisites and activation
   approvals pass. Require admission, useful execution, cancellation, watchdog,
   crash recovery, unrelated-resource survival, and cleanup evidence. Missing,
   malformed, contradictory, or uncertain results remain NO_GO; never blindly
   retry an unknown effect.
5. **Representative beta workflow and owner QA.** Advance BETA-CP-006 only after
   BETA-CP-004/005 are accepted. Verify the full supervised request, policy,
   approval, execution, receipt, denial, recovery, and cleanup path. Keep owner
   acceptance separate from merge, packaging, signing, installation, and runtime
   activation. No public production release is implied.

## Known limitations and handoffs

- Local typed fixtures and source tests do not prove real agent connectivity,
  native execution, independent builders, or full application integration.
- The v50 lifecycle result proves its recorded registration and cleanup; it does
  not authorize another registration, launch, or execution attempt.
- Retained package evidence may be unavailable after temporary directories are
  removed. Report missing artifacts; do not recreate or resign them implicitly.
- No backend migration, secret, provider configuration, server deployment,
  Lovable activation, or frontend Publish is required by this documentation and
  digest repair. Native packaging/activation and owner QA remain separate gates.
- The 120-credit mission ceiling remains. No account reset, paid service,
  upgrade, auto-recharge, or provider spend is authorized.

## Supplemental runner observation (2026-10-27)

The separately authorized [run 40544343024](https://github.com/Socialeap/DOSAI/actions/runs/40544343024)
executed once at `1afb5f989a6faeed91bcc08a27c32013f6d8fd13`. Both jobs failed
`BINFMT_MISC_INTERPRETER_ACTIVE`; no candidate-host or builder receipts resulted.
No retry was performed. See the [source-only suitability analysis](p3-native-runner-suitability-analysis.md)
for the evidence limit and bounded diagnostic proposal. The prior one-dispatch
authorization is consumed; another dispatch or host mutation requires fresh
exact approval. The existing admission checks and NO_GO status remain in force.

## Prepared diagnostic activation successor

The [separate activation increment](p3-binfmt-workflow-activation-evidence.md)
promotes the reviewed diagnostic candidate and adds checkpoint v2 without
changing historical records or runtime gate results. Merge and a new exact
one-dispatch authorization remain separate owner gates. The reporter still
returns NO_GO; any registrations continue to trigger the original rejection.

## Proposed exact-registration preparation

The [source-only removal plan](p3-exact-binfmt-removal-plan.md) pins the four
LLVM/Python registrations observed in run 40552566410 and models fail-closed
removal followed by every original predicate. It supplies no executor or new
workflow. All actual host mutation and dispatch remain separately gated.

## Kernel and writer-boundary review

The [source-only kernel review](p3-binfmt-kernel-single-writer-review.md)
finds that successful byte counts are not removal-causality proof and the current
plan has not established a single-writer boundary. It recommends a versioned
source-contract revision before an effectful executor. No executor, dispatch,
writer exclusion or new runtime authority is supplied by that review.

## Proposed v2 removal contract

The [v2 source contract and inert race fixtures](p3-binfmt-removal-contract-v2.md)
preserve v1 history and separate request acceptance, observed absence and
unproven causality. Real trusted writer-boundary evidence remains absent;
effectful executor work is still NO_GO. No workflow or runtime authority changes.

## Prepared kernel and writer observations

The [inactive kernel/writer diagnostic](p3-kernel-writer-diagnostic-source-evidence.md)
collects bounded kernel/package, own namespace/mount and four-unit state
projections. It cannot authenticate a deployed kernel or establish single-writer
exclusion. No workflow activation, dispatch or executor authority is supplied.

## Prepared separate kernel/writer workflow

The [separate manual activation increment](p3-kernel-writer-workflow-activation-evidence.md)
adds `p3-kernel-writer-diagnostics.yml` without altering the existing host workflow
or checkpoint history. Owner-approved merge and a fresh exact zero-cost dispatch
authorization are separate gates. No executor or runtime trust proof is added.

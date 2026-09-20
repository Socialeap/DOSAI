# Supervised execution increment: local evidence and feasibility

Recorded 2026-09-20. Contributor: unclassified assistant; no specialized role.
Scope: the owner's bounded, first-principles execution-layer request. This is a
development fixture increment, not acceptance of a later phase or a private-beta
release. The canonical live plan and existing proposed/accepted records remain
unchanged.

## Baseline

- Working repository: `Socialeap/DOSAI`, branch `codex/phase-0-bootstrap`, committed
  HEAD `43ab61000a35ec642373bd097c0dc32102519f7a`, 16 local commits ahead of its
  tracked remote at inspection. Substantial P3 and planning work was uncommitted.
- Remote inspection: `main` was `cd04075e838a12723244bbd0df86d357960c29dd`;
  `codex/phase-0-bootstrap` was `fb045c3d46f1fcd3ba6ae95dbb363279b1bb9c98`.
- A local SHA-256 inventory captured all 435 existing tracked/untracked source
  files before implementation. Existing file bytes were preserved. Only the
  new tool directory, its security test and this evidence document were added.
- The shell initially had Node 26.5.1 and pnpm 9.15.4. The exact Node 24.18.0
  macOS arm64 archive was fetched from the official Node distribution and checked
  against its HTTPS checksum manifest:
  `e1a97e14c99c803e96c7339403282ea05a499c32f8d83defe9ef5ec66f979ed1`.
  This is HTTPS/checksum provenance, not an independently verified release signature.
- Cached pnpm reports 11.18.0, but its `run` command attempts a dependency-status
  install via the shell's pnpm 9.15.4 and fails engine enforcement. No pins were
  relaxed. Validation invoked the exact script bodies directly with Node 24.18.0
  and existing installed dependencies; no new dependency installation was needed.

## Reproduced checks

| Subject | Result |
| --- | --- |
| Supplied dirty-worktree baseline, full tests | 497/504 pass; seven pre-existing historical guard failures |
| Existing eight TypeScript projects | Pass on the pinned Node runtime |
| Normal Main, preload and renderer builds | Pass; no package/signing/service/VM proof invoked |
| New focused security tests | 20/20 pass |
| Isolated committed P2 baseline plus this increment | 181/181 full tests pass |
| New tool's separate TypeScript project | Pass |
| Interactive terminal denial | `OWNER_DENIED`, durable receipt, exit 1; no fixture execution |

The dirty baseline failures are precisely the v22, v24, v26, v28, v30, v36 and
v37 successor guards already named in the v42 proposal. They are not hidden by
the clean P2 review result. The scoped review uses a separate branch based on
the committed P2 baseline, so unrelated uncommitted P3 work is neither staged
nor published as part of this change.

Reproduce from the review checkout using Node 24.18.0:

```sh
node --test tests/security/supervised-execution.test.mjs
node --test tests/*/*.test.mjs
node node_modules/typescript/bin/tsc -p tools/supervised-execution/tsconfig.json --noEmit
node scripts/build.mjs
```

Existing typechecks use `node node_modules/typescript/bin/tsc --noEmit -p
tsconfig.<project>.json` for tooling, audit, grants, main, policy, preload,
renderer and workers. No acceptance-report `PASS` or canonical phase promotion
is inferred from these engineering tests.

Focused coverage includes closed action admission, hidden/accessor fields,
immutable requests, deterministic route identity, configuration outage,
actor/session/resource/generation binding, actor/owner/policy capability
intersection, exact approval, forgery/replay, one pending request, preflight
revocation before and after authorization, wall/monotonic expiry, audit
unavailability/corruption/deletion, unknown outcome, stop, restart, sanitized
exceptions, bounded receipt retention and application import exclusion.

## Local timing observation

Ten automated synthetic samples on darwin/arm64, Node 24.18.0, all succeeded with
durable outcomes. Observed setup p50/p95: 10.70/23.50 ms; governed path:
349.79/383.66 ms; total: 366.70/403.48 ms. Security tests ran concurrently, so
these numbers include that local contention. Human approval latency is excluded.
There is no provider baseline or measured improvement. The ten samples do not
establish reliability, a warm/cold service SLA, calibration, or a production
performance claim. The reproducible runner preserves every timing observation
in ignored local evidence.

## Early feasibility decision and budget

GO: build and review the local synthetic path above without Jev, provider access
or paid services. NO-GO: claim useful repository execution or distribute a
working private beta while isolation, independent builders, packaged watchdog
proofs and native approval remain unproven. The narrow alternative is this
operator-run fixture increment; it is explicitly partial.

The 3–4-day target remains September 23–24 if September 20 is the sprint start.
The next critical input is availability of the two independent native Linux
builders required by ADR 0018. Obtain that evidence and resolve the accepted
execution gates before investing in new adapters or UI. Preserve the final
validation window; a fixture success cannot replace a useful isolated job.

Budget checks observed an account credit balance of 234.593382 both initially
and after implementation. The account-wide usage window moved from roughly
6–7% to 8%. These values do not expose exact per-task credits or guarantee that
deferred billing has settled. No account reset, model/provider call, paid search
or service purchase was made by this increment. The owner-set 120-credit mission
ceiling remains controlling; this bounded feasibility checkpoint does not
authorize unattended follow-on work or more spending.

## Release and operator handoff

See the [operator runbook](../../tools/supervised-execution/README.md). Review,
owner fixture QA, live execution acceptance and release acceptance are separate.
No existing accepted contract was edited and no new runtime trust boundary was
activated. **No Lovable action is required.** There is no backend migration,
secret/configuration change, deployment or frontend Publish step. The next
ordinary action is local operator QA; real execution remains blocked on the
listed prerequisites.

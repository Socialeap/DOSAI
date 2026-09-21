# DOSAI: 72–96-Hour Private Beta Delivery Plan

**Recorded:** 2026-09-20 15:10 EDT  
**Owner-confirmed target:** Working private beta for supervised testing  
**Engineering plan:** Proposed sequencing and acceptance criteria  
**Author:** Codex, unclassified assistant; no specialized repository role adopted  
**Baseline:** `43ab61000a35ec642373bd097c0dc32102519f7a` plus the existing uncommitted working set

## Deadline and Outcome

Target a supervised beta within 72–96 hours of sprint start. If work starts on
September 20, the delivery window is September 23–24, 2026. Record the actual
start and final cutoff before execution; this document does not assume 96 hours
of uninterrupted model, machine, account, or reviewer availability.

The owner selected a private beta, not a change to accepted security contracts.
The [live development plan](live-development-plan.md) remains authoritative for
phase status and runtime enablement. This proposal neither completes a phase nor
authorizes a new integration, paid service, native service registration, or
production effect. Changes to accepted sequencing or architecture need an
explicit, bounded successor decision; routine work inside accepted scope does
not need repeated approval.

The full roadmap has 43 of 62 listed work items incomplete. That count is not a
weighted effort estimate. The earlier conversational estimate of 75–85% effort
remaining was not calibrated to measured throughput and must not be used to
forecast this sprint. Forecast against demonstrated workflows and blockers.

## What Counts as Core

Keep every core workflow visible in the release checklist. Narrow its initial
platforms, inputs, and supported operations instead of quietly deleting it.
The following are proposed beta slices, not claims that implementation exists.

| Core capability | Minimum working beta slice | Acceptance evidence |
| --- | --- | --- |
| Agent coordination and HUD | One task, one approved Codex adapter and one approved Claude Code adapter, explicit planning/running/blocked/completed states, acknowledged handoff | Real client round trip on a dedicated test project; disconnect, duplicate, stale-session, and failed-delivery cases |
| Governance and approvals | Typed operations, deterministic tier floors, exact-plan approval, single-use grant, deny by default | Packaged UI approval/denial plus proof that stale or malformed requests cannot cause effects |
| Owned execution and emergency stop | A small allowlist of useful operations in the accepted isolation boundary; one owned job at a time initially | Actual useful test job, cancellation, output flood, coordinator/service crash, orphan reconciliation, unrelated-process survival |
| Workspace ownership and Git | One disposable test repository, one lease/worktree, exact diff review; draft PR only after the remote broker proves its contract | Concurrent lease rejection, path escape rejection, manifest-to-commit equality, protected-ref denial, reconciled push/PR |
| Browser inspection and evidence | One approved synthetic origin and dedicated ephemeral profile; bounded DOM and sanitized image capture | Secret canaries rejected before storage/display; origin, navigation, teardown, and missing-capture tests |
| Timeline, search, and replay | Local admitted events/artifacts, bounded search, exact source retrieval, restart recovery, explicit gaps, retention/deletion | Restart, corruption, full-disk, deletion/restore, and replay-gap cases; no fabricated historical state |
| Shared skills | Small curated bundle set, inert review, digest-bound activation/load/revocation, compact approved index | Unapproved or changed bytes never load; revoked bundles unavailable on both supported clients |
| Context efficiency | Exact duplicate grouping and bounded canonical chunks first; one pinned code grammar and visual derivation if validated | Measured input reduction with exact retrieval and critical-event preservation; parser uncertainty falls back to chunks |
| Typed Decision Plane | Closed routing/relevance contracts, deterministic baseline, explicit `ABSTAIN`; model evaluator only in shadow after its prerequisites and separate decision | Held-out corpus, provenance, timeout/invalidation tests; no authority escalation; measured quality, latency, tokens, and cost |

A manual handoff can keep testing useful, but it does not pass automated agent
coordination. A print sentinel does not pass useful repository execution. Exact
chunking does not pass AST pruning. A deterministic rule engine does not prove
Jev-like calibration or model performance. If an automatic core workflow is
missing, call the result a partial beta and identify the gap.

## First-Day Critical Path

1. Preserve and inventory the dirty worktree before creating a reproducible
   integration baseline. A fresh checkout of HEAD alone would omit substantial
   P3 implementation. Do not bulk-stage unrelated changes or discard them.
2. Restore the exact Node `24.18.0` / pnpm `11.18.0` toolchain, retaining existing
   lock and dependency evidence. Verify downloaded tooling before use. Do not
   upgrade pins or disable engine enforcement to manufacture a passing result.
3. Resolve the proposed v42 historical-guard repair through its exact acceptance
   process, retaining immutable evidence and all runtime restrictions. Run the
   full regression on the pinned toolchain and distinguish new failures from
   recorded failures. Do not delete integrity assertions to reduce test noise.
4. Establish access and a time estimate for both independent native Linux build
   environments required by ADR 0018, the accepted guest artifacts, signing
   prerequisites, and physical packaged tests required by ADR 0014.
5. Prove the smallest useful owned execution/cancellation path before building
   UI claims around it. Linux guest execution does not establish support for
   native macOS/iOS builds or host GUI automation.

The independent Linux builders, guest supply chain, service/watchdog packaging,
and physical isolation proofs are the dominant uncertainty. Their availability
has not been established in this session. Ordinary coding progress cannot be
substituted for this evidence.

At hour 8, report whether the execution prerequisites and adapter route are
available, with a concrete completion forecast. At hour 24, if useful isolated
execution and a credible adapter path are still unproven, report that the
all-core target is at risk. Continue permitted work, but present any proposed
scope reduction explicitly. Retain disabled effects and offer an observation/
handoff prototype only as a partial deliverable.

## Four-Day Delivery Schedule

These are target windows conditional on prerequisites and accepted sequencing,
not a promise to finish nine remaining phase gates in four days.

| Window | Engineering outcome | Demonstration / decision |
| --- | --- | --- |
| Hours 0–24 | Reproducible baseline, regression repair, execution feasibility, contract inventory, minimal end-to-end skeleton | Start, observe, and cancel a real approved job; hour-8 and hour-24 feasibility checks |
| Hours 24–48 | Governed operation path, task HUD, durable timeline, evidence capture, workspace ownership, packet/acknowledgement flow | Complete one task with policy, evidence, restart recovery, and exact handoff; reject malicious inputs |
| Hours 48–72 | Prove both selected agent adapters, skills, exact retrieval/replay, deterministic optimization; evaluate decision layer in shadow if eligible | Full workflow on a test project; measure quality, latency, tokens, and missing capabilities; freeze features by hour 72 |
| Hours 72–96 | Fix defects, run packaged abuse/recovery tests, clean install, onboarding, accessibility, and beta acceptance | Repeatable candidate, support matrix, known issues, test script, rollback/removal instructions, owner go/no-go |

For a 72-hour cutoff, reserve hours 48–72 for validation and reduce feature
breadth accordingly. Never remove the validation window to preserve a feature
count. A missed required workflow remains an explicit incomplete capability.

## How to Streamline the Work

### Decision-Layer Priority Following the Architecture Review

The owner requested incorporation of the reviewed TypeSafe architecture insights
on September 20. The [Typed Decision Plane specifications](jev-pattern-decision-layer-plan.md#strategic-component-specifications)
now define seven components and their required proofs. Follow this order within
the existing prerequisite gates:

1. Strict contracts, minimal admitted evidence projection, and an offline
   evaluation harness with frozen splits.
2. Deterministic advisory routing, exact duplicate grouping, source-bound cache
   invalidation, explicit abstention, and failure fixtures.
3. Bounded batching when measured beneficial; one optional approved local
   classifier in shadow mode after the baseline passes.
4. Thin client adapters after the existing integration and activation gates.

Model confidence cannot authorize effects or establish successful completion.
Raw scores and calibrated probabilities remain distinct. Evaluate full-workflow
quality, abstention coverage, p50/p95 latency, resource contention, and total
token/cost changes; do not inherit vendor performance claims. Access to Jev,
custom model training, and model-performance parity are not beta dependencies.
If model-assisted functionality remains disabled, disclose that limitation.
Protect the final validation window and the execution-safety critical path.

The September 20 Laya review does not change this priority. Adopt its closed
typed-decision, explicit-routing, abstention, calibration, and robustness-test
patterns in the future contracts and evaluation harness. Do not add Python,
Torch, checkpoint downloads, model residency, a new sidecar, or Laya presets to
the 72–96-hour critical path. A pinned, network-disabled, authority-free Laya
sidecar is a post-baseline TDP-2 bakeoff candidate only; it remains shadow-only
until the exact DOSAI-held-out and resource gates pass.

### Delivery Practices

- **One integration owner:** Codex maintains the working contract map, assembles
  changes, and keeps the candidate coherent. Independent research and diagnostic
  checks can run concurrently. Additional implementation agents require explicit
  delegation and disjoint ownership; they are not assumed by this plan.
- **Build complete workflow slices:** Connect intent, policy, execution,
  evidence, handoff, and UI incrementally. Keep the reference test task runnable
  after each accepted slice. Avoid completing disconnected subsystems first.
- **Prepare safely across dependencies:** Use fixtures and unreachable modules
  only where preparation is already authorized. If broader parallel preparation
  is needed, propose one bounded amendment specifying files, interfaces, denied
  effects, tests, and activation gates. Preserve the current phase dependency
  rule until that amendment is accepted.
- **Reuse the accepted foundation:** Keep Electron, typed IPC, policy, audit,
  cancellation state machines, schemas, and pinned dependencies. Limit the first
  supported host profile and test data without silently changing the declared
  platform minimum or claiming coverage of untested machines.
- **Batch consequential decisions:** Present a complete diff, authority map,
  proposed successor records, test evidence, and rollback in one milestone
  packet. Seek decisions only for actual new authority, architecture, spending,
  external publication, or acceptance; do routine repairs and implementation
  within established scope autonomously.
- **Reduce historical document churn:** Prepare one synchronized successor
  generation for each meaningful boundary change. Retain existing history and
  its checks. Any reusable successor-validation mechanism must itself receive
  review and tests before replacing individual historical guards.
- **Test proportionately:** Run focused tests while implementing, then the
  required full regression on the integrated candidate. Repeat broad tests for
  meaningful changes or new failures, not unchanged prose. Track packaging and
  physical runtime evidence separately from unit-test counts.
- **Keep one short scoreboard:** Record each core row as unavailable,
  implemented/unverified, tested, or beta accepted, with exact evidence and its
  next blocker. Keep engineering status separate from the canonical support
  matrix, whose transitions remain owner controlled.

## Adapter Shortcut and Its Limits

Use one small DOSAI interface with thin client adapters where the accepted
contracts permit it. Codex and Claude Code both document local MCP clients;
this makes an outward-facing DOSAI tool service a plausible common surface.
It does not automatically let DOSAI control either complete agent session.
Sources: [Codex MCP](https://developers.openai.com/codex/mcp),
[Claude Code MCP](https://code.claude.com/docs/en/mcp).

Agent-initiated MCP access and DOSAI-initiated agent orchestration are separate
proofs. The Codex app-server documentation currently labels that command
experimental and unsupported for production workloads. Its JSON-RPC protocol
is not MCP. It may be evaluated for the private beta after an exact adapter
decision, with the limitation visible. Claude Code documents programmatic
structured and streaming output, which also requires a pinned, tested adapter.
Sources: [Codex app-server status](https://learn.chatgpt.com/docs/mcp-server#use-the-codex-app-server),
[Claude Code programmatic use](https://code.claude.com/docs/en/headless).

MCP and SDK availability do not enforce DOSAI governance over agents' other
tools. Managed sessions must constrain and prove all effect paths. Independent
sessions may consume admitted evidence/advice, but DOSAI cannot claim to govern
their filesystem, shell, network, skills, or cancellation. Provider stdout and
streamed JSON remain untrusted observations under ADR 0006; they are not the
authenticated DOSAI control channel and cannot convey grants or approvals.

Keep the initial plugin local. A ChatGPT web-facing service is a separate remote
hosting/authentication boundary and is outside this local beta target. The
[Typed Decision Plane plan](jev-pattern-decision-layer-plan.md) remains the
source for its prerequisites, closed tool families, and calibration gates.

## Beta Validation and Stop Conditions

Every enabled capability needs evidence on the exact candidate, supported host,
adapter versions, approved test repository/accounts, and admitted data profiles.

- Complete and record one representative workflow repeatedly, including a clean
  restart, failed agent delivery, denied operation, and cancelled operation.
- Exercise cross-session forgery, stale approvals, path escapes, secret canaries,
  queue pressure, disk exhaustion, and component crashes. Emergency stop must
  remain independent and preserve unrelated user resources.
- Demonstrate retention/deletion, source retrieval, missing-evidence disclosure,
  skill revocation, installer/removal behavior, and readable errors.
- Measure startup, p50/p95 task latency, peak memory, output/queue bounds, useful
  task success, and actual token/cost changes against the same baseline corpus.
  Establish thresholds before optimizing; label unavailable usage as unknown.
- Reserve a sustained workload run during the final day and repeat failed
  recovery scenarios. Passing unit tests alone never passes these gates.
- Block external beta distribution for an unresolved Critical/High issue in an
  enabled path, failed cleanup, secret exposure, incomplete prerequisite proof,
  or missing required packaging/signing evidence. Review can continue with
  effects disabled; that is a different, limited deliverable.

The owner must accept an exact private-beta release profile before distributing
a build. It must define testers, machines, accounts, operations, known limits,
required signing/notarization, and feedback handling. The existing P11 public
release gate remains unchanged. Unproven Secure Enclave persistence, external
anchoring, or minimum-macOS coverage must remain explicitly unclaimed; features
requiring that assurance stay unavailable. Supervision alone waives no control.

## Autonomous Work and Remaining Human Inputs

Codex can own scoped code changes, tests, integration, documentation, fault
reproduction, packaging preparation, and concrete review artifacts. No new
specialized role record is required to perform this ordinary assistant work.
Progress can continue through authorized local tasks without a question at
every step.

Account login, identity enrollment, signing/service consent when required,
access to independent build hosts, explicit spending limits, consequential
architecture changes, and release acceptance still need the relevant authority
or environment. Code authorship and self-review cannot satisfy the independent
review requirement. Request these inputs early and continue unaffected work.

Unattended continuation requires an active execution session or a separately
configured scheduled continuation; this document creates neither an automation
nor an unlimited execution commitment. Checkpoint at useful milestones so work
can resume without rediscovery.

## This Planning Update

Owner selection of the supervised private beta is recorded above. No application
code, adapter, service, runtime support, or canonical phase state was changed by
this document. The cached pnpm package reports the required `11.18.0`; an exact
Node `24.18.0` executable was not found in the bounded locations checked. The
prior `pnpm test` attempt was blocked by the shell's engine mismatch, so no fresh
full-suite PASS is claimed. The seven guard failures remain the latest recorded
baseline until the pinned regression is actually rerun.

**Release classification:** Documentation only. No Lovable action is required.
Next action: establish the reproducible sprint baseline and produce the first
execution/integration feasibility evidence.

## Current Critical-Path Checkpoint — 2026-09-21

The original snapshot above is retained as planning history. Its final baseline
paragraph is no longer current: PR #3 now contains the source-only P3 successor
work through commit `be65853e4f55e9563cd2e983909f21b1e3c43224`; its complete
regression passes 555 tests, all eight existing TypeScript projects, and the
three normal application builds. This does not authorize or prove physical
execution.

PR #2's exact two-commit fixture slice was separately overlaid onto that PR #3
head without conflicts. The disposable combined tree passed all 578 tests with
bounded test concurrency, all nine applicable TypeScript projects, the three
normal builds, and ten of ten local synthetic benchmark samples with zero
external calls, model calls, or provider spend. The overlay is validation only:
PR #2 is not integrated into PR #3 and no merge is authorized.

The machine-checked [critical-path status](private-beta-critical-path-status.json)
is now the short operational scoreboard required by this plan. Reproduce its
fail-closed assessment with:

```sh
node scripts/report-private-beta-readiness.mjs
```

It must continue returning `NO_GO` while the exact fixture integration, one
bounded v49 signed-app lifecycle proof, Debian trust-root observation, two
independent native Linux builder receipts, and all three formal P3 acceptance
suites remain open. Source tests, a local emulated Linux builder, or synthetic
fixtures cannot satisfy those gates. The owner-set 120-credit ceiling remains
controlling, and no paid activity is authorized by this checkpoint.

Read-only repository and official-platform inspection identified two standard
GitHub-hosted `ubuntu-24.04` jobs as a credible candidate for the required fresh
native-x64 hosts. The public repository currently has Actions enabled and
standard public-repository runners currently carry no runner-minute charge.
This is not builder evidence: the proposal remains owner-gated, no workflow
exists, and a future zero-cost host observation must prove two distinct DMI
identities, native x64 execution, exact image versions, and no emulation before
builder preparation can rely on that route.

Formal P3 acceptance preparation also exposed and closed a representation gap:
accepted fixture schema v3 and runner 0.2 support only P1/P2. A non-activating
schema v4 proposal and all three catalog-referenced P3 manifests now express the
six accepted scenarios, exact artifact classes, deadlines, prerequisites and
cleanup claims. They remain `PROPOSED`; runner 0.2 still rejects P3 with exit 2,
and no handler exists. Physical prerequisites, owner acceptance, a registry and
catalog successor, runner 0.3, and separately bounded handlers remain required.

**Release classification:** Local read-only reporting, governance tests, and
documentation only. No Lovable action is required. No frontend Publish is
required. No signing, app launch, Service Management operation, key retrieval,
builder provisioning, VM/guest execution, provider call, or production action
is performed by this checkpoint.

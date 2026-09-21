# Jev-Pattern Typed Decision Layer Plan

**Status:** `PROPOSED_PLANNING_INPUT`  
**Recorded:** `2026-09-20T14:15:47-04:00`  
**Planning revision:** `2026-09-20T15:47:23-04:00` — incorporated the owner's requested architecture-review findings.  
**Candidate review:** `2026-09-20T18:12:00-04:00` — classified Laya as a future quarantined evaluator candidate, not an execution or safety dependency.
**Owner intent:** Preserve and phase a fast, typed, confidence-bearing decision
layer for DOSAI without changing the current P3 delivery authority.  
**Primary delivery phases:** P7, P9, P10, and P11  
**Current implementation authority:** None

## Name and Provenance

"Jev-pattern" is internal shorthand for a product pattern observed in TypeSafe
AI's public description of Jev: atomic typed questions, structured decisions,
probability distributions, calibrated confidence, and confidence-gated routing.
DOSAI is not affiliated with TypeSafe AI, does not depend on Jev, and must not
market this subsystem as Jev or claim Jev's model architecture, training method,
latency, cost, determinism, accuracy, or other performance characteristics.

The DOSAI subsystem name is **Typed Decision Plane**. It is provider-neutral and
may use deterministic rules, an owner-approved local model, or a separately
approved remote provider adapter. Its outputs are always non-authoritative
decision proposals.

## Executive Decision

Add the Typed Decision Plane to the future DOSAI architecture as a bounded
advisory layer for routing, relevance ranking, compression, deduplication, and
escalation. Do not put a model inside the policy kernel, grant service, approval
path, audit authority, evidence-admission boundary, execution broker, watchdog,
or emergency-stop path.

The layer begins in shadow mode after P7's admission and lifecycle controls and
P9's canonical evidence foundation exist. Only an accepted, calibrated decision
profile may later influence non-critical forwarding or display density. Every
effect still passes through the deterministic P2 policy and approval system.

## Intended Product Improvement

The Typed Decision Plane should improve DOSAI by:

1. avoiding unnecessary full Claude or Codex reasoning calls for narrow,
   repetitive judgments;
2. forwarding smaller, more relevant evidence packets while preserving exact
   canonical retrieval;
3. routing work to the agent, reviewed skill, deterministic handler, or owner
   best suited to the task;
4. making uncertainty visible and actionable through an explicit `ABSTAIN`
   outcome;
5. measuring accuracy, calibration, latency, token avoidance, and cost rather
   than inferring quality from fluent text;
6. retaining one shared provider-neutral decision contract across the DOSAI app,
   Codex plugin, and Claude Code plugin; and
7. improving over time through versioned evaluation corpora and calibration
   profiles without silently changing policy or authority.

This layer complements DOSAI's deterministic strengths. Schema validation,
secret rejection, capability intersection, tier floors, grant validation,
critical-event retention, and emergency stop remain rule-based because they are
security invariants, not prediction problems.

## Non-Goals

The Typed Decision Plane does not:

- clone or reverse-engineer Jev;
- become a general chat model, autonomous agent, or arbitrary prompt proxy;
- receive complete agent traffic, raw conversations, credentials, browser
  authentication state, or unrestricted repository contents;
- assign or lower an autonomy tier;
- approve an action, mint or validate a grant, satisfy an acceptance gate, or
  declare evidence authoritative;
- decide that an operation, file, event, screenshot, or log is safe to discard;
- train automatically from operator behavior or promote outputs into memory or
  skills;
- make a "zero hallucinations" claim; or
- claim performance parity with Jev or another system without a reproducible
  like-for-like benchmark.

## Governing Boundaries

The implementation remains subordinate to `SECURITY.md`, accepted ADRs, the
live development plan, and the capability matrix.

1. **Admission before inference.** Only P6/P7-admitted, sanitized, allowlisted
   canonical evidence or synthetic fixtures may enter a decision request.
   Probabilistic classification must never decide whether data contains a
   secret or is permitted to cross a boundary.
2. **Canonical source before derivation.** Every request binds exact source
   manifest digests and byte or event ranges. Missing, stale, partial, or
   unavailable required sources force `ABSTAIN`.
3. **No authority.** The worker has no network, credential, policy, approval,
   grant, filesystem, process, VM, Git, database-write, deployment, or effect
   authority. It cannot import an effect broker or policy implementation.
4. **Derived and untrusted.** Requests, model responses, probabilities,
   confidence values, explanations, and summaries are untrusted derived
   artifacts governed by ADR 0010.
5. **Deterministic safety floor.** Critical events and rule-known cases bypass
   model suppression and continue through deterministic policy. A model may
   escalate but may never downgrade the deterministic route or minimum tier.
6. **Fail closed and degrade usefully.** Invalid input, timeout, cancellation,
   overload, unavailable model, calibration mismatch, distribution shift, or
   malformed output returns `ABSTAIN` and preserves the existing manual or
   full-agent path.
7. **Separate remote-provider boundary.** P9 permits only an isolated local
   worker. Any network-backed evaluator is a P10 integration with a separate
   provider identity, minimal disclosed fields, explicit owner approval,
   delivery acknowledgement, and failure reconciliation.

## Placement in the Delivery Plan

| Phase | Responsibility | Typed Decision Plane consequence |
| --- | --- | --- |
| P3 | Execution capsules and watchdog | No decision-layer runtime, model, provider, or new service work. |
| P6 | Secret-safe capture | Produce bounded sanitized canonical inputs; inference is not an admission control. |
| P7 | Persistence and lifecycle | Admit versioned decision records, calibration profiles, retention, deletion, and access generations. |
| P8 | Reviewed skills | Bind only reviewed decision templates and plugin skills by exact active digest. |
| P9 | Evidence and derivations | Implement the local shadow worker, provenance, calibration evaluation, caching, and non-critical advisory use. |
| P10 | Agent integrations | Expose narrowly typed read-only tools to approved Codex and Claude adapters and optionally add a separately approved remote evaluator. |
| P11 | Release hardening | Prove security, drift response, performance, accessibility, clean installation, and honest support claims. |

## Target Architecture

```text
Canonical sanitized evidence manifests
                 |
                 v
       deterministic eligibility gate
       | known rule/cache | ambiguous bounded case
       |                  v
       |        isolated local decision worker
       |                  |
       |          typed result or ABSTAIN
       |                  v
       +------> advisory routing controller
                          |
          +---------------+----------------+
          |               |                |
   reviewed skill    Claude/Codex      owner review
          |               |                |
          +---------------+----------------+
                          |
                 deterministic P2 policy
                          |
                 approval/grant/effect path
```

The advisory routing controller may choose which non-authoritative consumer
receives a proposal. It never bypasses deterministic policy and cannot convert a
proposal into an effect.

## Permitted Decision Families

Decision families are closed, versioned contracts rather than arbitrary user
prompts.

| Family | Example labels | Permitted use |
| --- | --- | --- |
| `TASK_ROUTE` | `CODEX`, `CLAUDE`, `REVIEWED_SKILL`, `OWNER`, `ABSTAIN` | Recommend the next reasoning or review surface. |
| `REASONING_DEPTH` | `DETERMINISTIC`, `LOCAL_DECISION`, `FULL_AGENT`, `OWNER`, `ABSTAIN` | Avoid expensive agent calls for narrow cases. |
| `EVIDENCE_RELEVANCE` | `PRIMARY`, `SUPPORTING`, `LOW_RELEVANCE`, `ABSTAIN` | Rank display and forwarding; never delete canonical evidence. |
| `DUPLICATE_GROUP` | `SAME_EVENT`, `RELATED`, `DISTINCT`, `ABSTAIN` | Group non-critical telemetry for navigation. |
| `FINDING_PRIORITY` | `LOW`, `MEDIUM`, `HIGH`, `OWNER_REVIEW`, `ABSTAIN` | Sort advisory findings; deterministic critical classes override it. |
| `HANDOFF_READINESS` | `READY_TO_PROPOSE`, `MORE_EVIDENCE`, `OWNER_DECISION`, `ABSTAIN` | Recommend whether to draft a handoff, never accept it. |

Prohibited families include `ALLOW_EFFECT`, `APPROVE`, `GRANT`, `SAFE_TO_DELETE`,
`SECRET_FREE`, `EVIDENCE_VALID`, `ACCEPTANCE_COMPLETE`, and any label that can be
interpreted as execution authority.

## Reviewed Research and Design Consequences

The owner supplied `TypeSafe AI Plugin Architecture.md` and requested that its
reviewed insights be incorporated here. That document is research input, not an
implementation contract. Preserve its useful atomic-question, shared-context,
composite-scoring, and uncertainty-routing patterns with these corrections:

- **Confidence is not permission or success evidence.** No probability threshold
  authorizes a migration, rollback, grant, or other effect. Completion requires
  the operation's actual postconditions and evidence, not a classifier verdict.
- **Local evaluation is feasible, with unproven parity.** A plugin can call an
  isolated classification worker that returns typed values without generating
  JSON tokens. GLiClass demonstrates runtime-supplied classification labels;
  ModernBERT demonstrates an encoder context beyond 4,096 tokens. Neither proves
  DOSAI latency, calibration, supported hardware, or equivalence to Jev.
- **Calibration is empirical.** Raw logits, generated confidence, distribution
  concentration, and calibrated probabilities are different quantities.
  Post-processing calibration is possible, but must be validated for each exact
  evaluator, template, label set, and supported input distribution. Do not label
  a returned number a Bayesian posterior without that justification.
- **Types do not establish truth.** A structurally valid answer can be wrong.
  Treat malformed, incomplete, refused, or unsupported outputs as abstentions;
  validate every boundary even when a provider advertises schema guarantees.
- **Batching is an optimization to measure.** TypeSafe describes additional
  questions as usually having little latency impact, not zero cost or a fixed
  response-time guarantee. Shared context and concurrent calls do not imply
  statistical independence; never multiply scores as if they did.
- **Vendor figures are not release evidence.** The reviewed document's latency,
  price ratios, and detailed model-internal explanations are not independently
  established DOSAI evidence. Use dated primary references and measure total
  workflow cost, including projection, queueing, retries, fallbacks, and review.

The research references verified during the September 20 review are listed
below. Custom model training, reproducing Jev's architecture, and gaining access
to its service are not beta prerequisites.

## Laya Candidate Strategy

The owner supplied the Apache-2.0 Laya repository as a possible open-source
analogue to Jev. The review baseline is upstream `main` commit
`42626c348753fbb17572a813127df2278a1ec527`. Laya is a local encoder-based typed
classifier for closed `choice`, binary (`noul`), and ordinal `score` questions.
It is not an execution broker, sandbox, policy engine, approval service, grant
authority, watchdog, audit journal, plugin runtime, or evidence-admission layer.

Adopt its useful methodology without adding it to the private-beta runtime:

| Decision | DOSAI treatment | Earliest stage |
| --- | --- | --- |
| Closed typed question/result shapes | Reproduce provider-neutrally in DOSAI contracts with explicit `ABSTAIN`; do not expose arbitrary prompts or labels. | TDP-1 |
| Explicit model/task/language routing metadata | Record the selected route, reason, model digest, language result, and fallback; undecided language abstains or uses the reviewed multilingual route. | TDP-1A/TDP-2 |
| Calibration and robustness methodology | Add held-out ECE, Brier, log loss, selective risk, option-order permutation, language routing, class balance, and out-of-distribution tests. | TDP-1A/TDP-3 |
| Laya Python runtime and weights | Consider only as one bakeoff candidate in an isolated local sidecar after the deterministic baseline passes. | TDP-2 |
| Laya confidence, moderation, guardrail, or routing presets | Never use as authorization, safety enforcement, evidence validity, completion proof, or a reason to lower deterministic policy. | Prohibited |
| Direct Electron/Main embedding or automatic model download | Reject. The renderer and Main process do not load Python, Torch, model weights, or runtime-downloaded artifacts. | Prohibited |

The candidate currently has material limitations that must become explicit test
cases rather than inherited assumptions:

- its published Jev comparisons are not a controlled head-to-head run;
- the base checkpoints provide weak zero-shot typed-decision performance, so
  fine-tuning and dataset fit are part of the claimed value;
- high-cardinality choices degrade because option descriptions share a bounded
  token budget; the initial DOSAI candidate profile therefore permits only 2–10
  semantic choices and requires hierarchical routing above that bound;
- confidence is not accepted until fitted and validated on a frozen DOSAI
  calibration split; entropy concentration is never relabeled as correctness
  probability; and
- the September 20 upstream review found an open correction for Latin-language
  misrouting and a pathological low-temperature bucket that could sharply
  overstate confidence. An upstream version, commit, or checkpoint with either
  behavior is ineligible for activation.

### Quarantined Laya Bakeoff

If TDP-1A exits successfully and the owner separately accepts TDP-2, evaluate
Laya through a replaceable `LOCAL_CLASSIFIER` adapter with all of these controls:

1. Pin the source commit, Python runtime, every dependency, tokenizer, config,
   checkpoint revision, license/provenance record, and SHA-256 digest before the
   candidate enters the build. The repository license does not establish the
   license or redistribution rights of model weights or training datasets.
2. Provision artifacts through the reviewed supply chain. Disable network after
   provisioning; prohibit Hugging Face downloads, update checks, telemetry,
   secrets, arbitrary paths, caller-selected models, and caller-supplied code.
3. Run outside Electron Main and the renderer in a bounded worker/capsule with
   fixed CPU, memory, queue, concurrency, input, output, and deadline limits.
   The worker receives sanitized projected fields and can return only a strict
   non-authoritative decision result or reason-coded `ABSTAIN`.
4. Give the worker no policy, approval, grant, filesystem-write, process, Git,
   browser, network, journal, deployment, or effect authority. A crash, timeout,
   invalid distribution, routing uncertainty, calibration mismatch, or resource
   breach falls back to the deterministic/full-agent/owner path.
5. Compare identical frozen DOSAI tasks against deterministic rules and the
   approved full-agent baseline. Measure warm and cold end-to-end latency,
   throughput, peak resident memory, application responsiveness, battery and
   thermal impact, model-load churn, quality, calibration, abstention coverage,
   agent calls, tokens, and cost.
6. Keep the candidate in `SHADOW` until the exact evaluator/template/calibration
   triple meets the accepted gates. Promotion never grants effect authority and
   any model, dependency, template, label, routing, or calibration change
   automatically returns it to shadow.

This is a candidate evaluation plan, not a dependency selection. If Laya fails
the gates, DOSAI retains the same contracts and substitutes deterministic rules,
another reviewed local classifier, or the full-agent fallback without changing
the policy or execution architecture.

## Strategic Component Specifications

These are proposed build responsibilities. Reserve their exact paths and
interfaces through the existing prerequisites before implementation.

| Component | Input and output | Required behavior and proof |
| --- | --- | --- |
| Decision contracts | Reviewed family/template plus admitted sources → typed request/result | Closed choices, rubric scores, or proposition estimates; explicit abstention; separate raw scores, distribution statistics, and calibrated probabilities; reject unknown fields and non-finite/out-of-range values. |
| Evidence projector | Admitted canonical manifests and template allowlist → bounded snapshot | Verify access, freshness, exact ranges, and required coverage; disclose omissions; missing required context abstains rather than silently truncating. No raw repository or conversation ingestion. |
| Deterministic fast path and exact cache | Validated snapshot and active profiles → known advisory result, cached result, or miss | Enforce critical-event and policy floors before lookup; bind source/access generations, evaluator, template, calibration, and configuration; revalidate access and availability on hits. Never reuse approvals or grants. |
| Bounded decision batcher | Compatible atomic requests → separately identified results over one snapshot | Batch only matching admitted identity/scope and compatible evaluators; fix queue, concurrency, byte, and deadline limits; cancel stale work; correlate each response. Batch questions, never speculative effects. |
| Evaluator adapters | Strict request → typed result or reason-coded abstention | Rules and fixtures establish the baseline; an approved local classifier is optional; remote evaluation stays P10-only. No policy/effect authority or caller-selected endpoints. |
| Evaluation harness | Frozen labeled splits, baseline, candidate → reproducible report | Build before selecting a model; separate fitting from final testing; measure selective error, coverage, class metrics, calibration, end-to-end latency, resource use, and actual/estimated/unknown cost. |
| Thin MCP adapters | Authenticated scoped agent request → admitted advisory result | Share contracts across supported clients with stale-session/replay checks and bounded responses. Tool access cannot govern the agent's other tools or prove full-session cancellation. |

Composite scores may rank non-critical findings or evidence. Keep component
scores and versioned weights visible; missing dimensions produce an explicit
incomplete result. A weighted average cannot suppress a deterministic critical
finding or reduce a policy tier. Rubric levels need not be equally spaced in
real-world meaning; declare and test any arithmetic interpretation.

## Contract Set

Before implementation, add strict JSON Schemas and runtime admission for these
contracts through a new owner-reviewed schema-registry successor:

### `decision-request-v1`

- `schema_id`, `version`, `request_id`, and `created_at`;
- closed `decision_family` and `template_id`;
- a closed result kind: `CHOICE`, `RUBRIC_SCORE`, or `PROPOSITION`, with the
  family's exact label/rubric contract;
- exact `template_digest`, semantic `allowed_labels` where applicable, and a
  required explicit `ABSTAIN` outcome separate from those labels;
- ordered canonical `source_manifest_digests` and exact admitted ranges;
- source lifecycle and access generations;
- `criticality` and deterministic override reason codes;
- fixed size, time, concurrency, memory, and output limits;
- requested evaluator profile and calibration-profile identity; and
- an immutable request digest over every decision-relevant field.

The request contains no arbitrary system prompt, executable instruction,
credential, authorization token, grant, or caller-selected model endpoint.

### `decision-result-v1`

- the exact request digest and source bindings;
- a discriminated outcome: `DECISION` or `ABSTAIN`, with a reason for abstention;
- for `DECISION`, the declared kind's payload: one allowed label for `CHOICE`,
  a bounded rubric value for `RUBRIC_SCORE`, or a bounded proposition estimate
  for `PROPOSITION`;
- a complete finite normalized distribution over semantic options/levels when
  supported by the evaluator; otherwise an explicit unavailable value;
- separate raw score, optional distribution-concentration statistic, calibration
  status (`CALIBRATED`, `UNCALIBRATED`, or `UNAVAILABLE`), and nullable calibrated
  probability/confidence with its method and exact profile digest;
- in-distribution status and reason-coded abstention or warnings;
- evaluator, model artifact, runtime, template, sampling, and dependency digests;
- start/completion sequence, latency, resource usage, cache status, and retry
  count;
- deterministic/nondeterministic classification;
- output digest, loss class, coverage, omissions, and source availability; and
- `authority: "NONE"` and `effect_permitted: false` constants.

Free-form rationale is omitted by default. If a reviewed decision family needs a
rationale, it is a bounded untrusted field and cannot affect policy.

`ABSTAIN` is a control outcome, not a semantic class whose probability is guessed
or mixed into a class distribution. A deterministic result needs no invented
probability of 1. An uncalibrated score must never populate a calibrated field.
Validate exact option keys and a schema-defined normalization tolerance for
choices; validate rubric bounds and the declared aggregation rule for scores.
Unavailable calibration prevents confidence-based activation but does not
prevent labeled shadow measurements or a separately tested deterministic rule.

### `calibration-profile-v1`

- decision family, evaluator/model and template digests;
- labeled-corpus manifest and immutable train/calibration/test split digests;
- calibration method and fitted parameters;
- per-class counts, support bounds, validity interval, and distribution
  fingerprint;
- Brier score, log loss, expected calibration error, accuracy, per-class
  precision/recall, coverage-risk curve, and abstention curve;
- approved thresholds and the owner acceptance record; and
- expiry and drift invalidation conditions.

Confidence is reported as `UNAVAILABLE` when the result does not match an active
calibration profile exactly or when support is insufficient.

### `decision-benchmark-result-v1`

- frozen corpus, baseline, candidate, hardware, OS, runtime, and dependency
  identities;
- cold/warm latency distributions and throughput;
- agent calls, input/output tokens, remote requests, and estimated cost;
- quality and calibration metrics with confidence intervals;
- fallback, timeout, overload, malformed-output, and abstention counts;
- secret-canary and critical-event preservation results; and
- a clear `MEASURED`, `ESTIMATED`, or `UNAVAILABLE` label for every metric.

## Decision Templates

Each template is an immutable reviewed asset with:

- one atomic question;
- a closed label set and explicit `ABSTAIN`;
- positive, negative, ambiguous, adversarial, and out-of-distribution examples;
- exact input-field allowlists and maximum lengths;
- deterministic overrides and critical-event exclusions;
- expected failure and escalation behavior;
- owning decision family and semantic version; and
- corpus, calibration, and compatibility requirements.

Templates follow the P8 skill-supply-chain pattern: proposal, inert review,
owner approval, separate activation, exact-digest invocation, revocation, and
stale-session rejection. Model-written templates never activate automatically.

The family table's `ABSTAIN` entries indicate the available control outcome;
they are not extra classes in a learned probability distribution.

## Evaluation and Calibration Method

1. Build a sanitized synthetic and owner-reviewed labeled corpus for one narrow
   decision family. Do not mine raw conversations or production activity.
2. Freeze disjoint training, calibration, and final test manifests before model
   selection. Never tune against the final test set.
3. Compare deterministic rules, compact local models, and the existing full-agent
   path on identical canonical inputs.
4. Fit temperature, isotonic, or another separately reviewed calibration method
   only on the calibration split.
5. Report Brier score, log loss, expected calibration error, per-class metrics,
   and selective risk at each abstention threshold. Accuracy alone is
   insufficient.
6. Test prompt injection, label manipulation, malformed structures, extreme
   class imbalance, novel repositories, provider drift, model replacement,
   stale sources, and missing evidence.
7. Activate only an exact evaluator/template/calibration triple. Any component
   change returns the profile to shadow mode.
8. Continuously compare predictions to later owner-reviewed outcomes without
   automatically treating those outcomes as training labels.

Repeated samples from one model and template are correlated evidence, not
independent judges. An ensemble may be used only when its members and aggregation
rule are declared and evaluated as one versioned system.

## Efficiency Strategy

First enforce admission, current source access and availability, deterministic
critical-event bypass, and the applicable policy floor. These checks run on
every request, including cache hits. None is delegated to an evaluator.

Use the least expensive reliable stage first:

1. **Exact result cache:** Keyed by request, source, template, evaluator,
   calibration, and configuration digests. Any generation change invalidates the
   entry.
2. **Deterministic rules:** Handle known advisory routing and exact duplicate
   cases without inference. They do not replace the admission and policy checks
   above.
3. **Compact local evaluator:** Keep the reviewed model warm in a bounded worker;
   batch compatible atomic questions and use fixed deadlines and backpressure.
4. **Full agent fallback:** Send only the necessary admitted canonical ranges to
   Codex or Claude when the local result abstains or the task requires reasoning.
5. **Owner escalation:** Preserve owner review for consequential ambiguity.

The renderer and Electron Main process never load the model. Inference runs off
the UI thread, cannot write canonical storage, and may publish only a validated
result through a narrow typed adapter. No remote call exists in the P9 local
worker.

## Candidate Performance Gates

These are proposal targets, not current capability claims. P9 must establish a
baseline and may revise a target only through owner-reviewed evidence.

| Measure | Initial candidate gate |
| --- | --- |
| Accepted-prediction selective error | At most 1% on the frozen final test corpus for each activated family. |
| Per-class recall | At least 90%; deterministic critical-event recall remains 100% by bypass, not prediction. |
| Expected calibration error | At most 0.05 with declared bins and confidence intervals. |
| Calibration improvement | Brier score improves at least 20% relative to the same evaluator's uncalibrated scores. |
| Warm local latency | p95 at or below 250 ms on the supported Apple Silicon baseline. |
| Cold local latency | p95 at or below 1,000 ms, with startup outside the UI event loop. |
| Exact-cache latency | p95 at or below 10 ms excluding canonical-source retrieval. |
| Agent-call avoidance | At least 50% for the activated narrow workflow without increasing selective error above its gate. |
| Forwarded-token reduction | At least 40% on the representative corpus with exact canonical retrieval preserved. |
| Secret canary transmission | Zero. |
| Critical-event suppression | Zero. |
| Unauthorized effect paths | Zero structurally reachable paths from the decision worker. |

Latency and cost comparisons must use identical tasks, hardware state, source
material, and acceptance definitions. Vendor demonstrations or marketing figures
are not DOSAI baselines.

Report both accepted-prediction error and coverage so a classifier cannot meet
its error target merely by abstaining on nearly everything. Include sample
counts and confidence intervals; insufficient evidence remains inconclusive.
Measure the entire path separately from model-only latency and cache lookup:
projection, source retrieval, queueing, inference, validation, retry, and fallback.
Include peak memory and contention with a representative test/build workload.
Unavailable usage data stays `UNAVAILABLE`, not zero. Proposed numeric targets
above are not promises of vendor parity or conditions to bypass safety gates.

## Shadow and Activation Modes

### `DISABLED`

No model is loaded and callers use existing deterministic/manual paths.

### `SHADOW`

The worker evaluates admitted fixtures or live non-production requests, but its
result cannot change routing, forwarding, display, or execution. DOSAI records a
bounded derived benchmark artifact for later review.

### `ADVISORY`

An accepted profile may rank or recommend a route in the HUD. The operator or
calling agent sees the label, calibrated confidence, abstention state, source
coverage, model/template/profile identities, and deterministic overrides.

### `BOUNDED_ACTIVE`

An accepted profile may automatically select a non-critical consumer or reduce
forwarded display density within an owner-approved envelope. Canonical evidence
remains intact and retrievable; critical events bypass the decision; policy and
effect authority remain unchanged.

There is no autonomous-authority mode.

## Codex and Claude Integration

P10 may expose the decision plane through one provider-neutral local interface
and thin platform-specific packaging:

- a DOSAI MCP server with narrowly typed read-only tools;
- a Codex/ChatGPT plugin containing the MCP connection plus skills that define
  when each tool is appropriate; and
- a Claude Code plugin or MCP configuration using the same tool contracts.

Initial tools are closed operations such as:

- `propose_task_route`;
- `classify_reasoning_depth`;
- `rank_evidence_relevance`;
- `classify_duplicate_group`; and
- `assess_handoff_readiness`.

Do not expose `evaluate_arbitrary_prompt`, caller-selected endpoints, arbitrary
labels, general repository upload, shell execution, policy evaluation, approval,
or grant tools. Every caller has a separate authenticated identity and receives
only the result permitted for its session and source generations. Plugin output
is untrusted data and cannot grant permission back to DOSAI.

## HUD and Operator Experience

The HUD presents the decision plane as advisory telemetry, not a safety badge.
For each proposal display:

- decision family, result, and `ABSTAIN` availability;
- calibrated confidence and the active threshold;
- source coverage, omissions, gaps, and exact-source retrieval;
- model, template, calibration, and result versions;
- deterministic override or fallback reason;
- observed latency, cache use, agent calls avoided, and tokens avoided; and
- a comparison against the baseline for the same workflow.

Use neutral advisory styling. Green, "safe", "approved", "verified", or
"complete" labels are reserved for their existing governed meanings and cannot
be inferred from model confidence.

## Threats and Required Tests

| Threat | Required control |
| --- | --- |
| Prompt injection in evidence | Structured allowlisted fields; external text remains quoted untrusted data; no instructions are executed. |
| Secret leakage | Deterministic pre-inference rejection; secret canaries; no environment or credential access; no remote P9 worker. |
| Confidence spoofing | DOSAI computes/validates result structure and binds an accepted calibration profile; provider text cannot supply authority. |
| Distribution shift | Input fingerprinting, drift alarms, expiry, `ABSTAIN`, and automatic reversion to shadow mode. |
| Stale cache | Complete digest key over sources, generations, template, model, calibration, and configuration. |
| Model substitution | Exact model/runtime/dependency identities and signed or content-addressed artifacts where applicable. |
| Suppression of critical evidence | Deterministic critical classes bypass inference and suppression; adversarial corpus proves preservation. |
| Resource exhaustion | Fixed queue, input, output, memory, concurrency, deadline, and cancellation limits with backpressure. |
| Worker compromise | Isolated process/capsule, no authority-bearing imports, narrow typed transport, crash quarantine, and fail-closed fallback. |
| Remote-provider failure | P10-only adapter, minimal disclosure, acknowledgement, timeout, reconciliation, circuit breaker, and local/manual fallback. |
| Misleading UI | Provenance, calibration status, loss, uncertainty, and authority-none labels remain outside content-controlled regions. |

## Work Packages

### `TDP-0` — Planning and Governance

- Record this proposal without changing P3 authority.
- Require a new ADR before implementing the decision worker or any provider
  boundary.
- Add future P9 and P10 work items to the live plan.

**Exit:** Owner accepts, revises, or rejects the future architecture proposal.

### `TDP-1` — Contracts and Corpus Preparation

- Complete P6 capture and P7 admission/lifecycle prerequisites.
- Propose the four contracts, registry successor, ownership successor, and
  adversarial schema corpus.
- Create one narrow synthetic labeled decision family and frozen splits.

**Exit:** Runtime admission, provenance, retention/deletion, and corpus integrity
pass with no evaluator or authority path reachable from the application.

### `TDP-1A` — Deterministic Baseline and Evaluation Harness

- After TDP-1 prerequisites and acceptance, build strict contracts, the evidence
  projector, and an offline fixture runner before choosing a model.
- Implement known-case advisory routing, exact duplicate grouping, generation-
  bound caching, bounded batching, and reason-coded abstention for unknown cases.
- Use mock evaluator failures to test timeout, malformed output, cancellation,
  stale generations, missing sources, and overload without a model download or
  provider account.
- Freeze labeled calibration/test splits and record the deterministic baseline;
  defer paid full-agent comparisons until their adapter and budget are approved.
- Keep input, output, timing, resources, and provenance identical across the
  baseline and later candidate adapters wherever the comparison requires it.

**Exit:** The permitted fixture workflow and adversarial cases pass; report
coverage, quality, latency, and unsupported cases. No calibration or model
capability is inferred from deterministic success. Runtime remains disabled
until its separate activation gate is satisfied.

### `TDP-2` — Local Shadow Worker

The `TDP-1A` deterministic baseline above must pass before model selection.

- Select the local runtime and model through a separately accepted ADR and
  reproducible bakeoff.
- Implement the isolated bounded worker and evaluator adapter, reusing the
  tested projection, exact cache, deterministic bypass, batching, cancellation,
  backpressure, and typed result admission from the baseline.
- Run only in `SHADOW` mode.

**Exit:** Security/adversarial suites pass; malformed, stale, timed-out,
out-of-distribution, or unavailable evaluations return `ABSTAIN`; no decision can
affect routing or an effect.

### `TDP-3` — Calibration and Performance Acceptance

- Fit and freeze calibration on the calibration split.
- Run the final holdout and end-to-end workflow benchmark once.
- Compare against deterministic-only and full-agent baselines.
- Review every candidate gate and record measured limitations.

**Exit:** Owner accepts an exact evaluator/template/calibration triple for
`ADVISORY`, or the layer remains shadow-only.

### `TDP-4` — Bounded Advisory and Compression Use

- Add HUD telemetry and exact-source navigation.
- Enable one accepted family in `ADVISORY`.
- Consider `BOUNDED_ACTIVE` only after a second owner gate and a zero-critical-
  suppression evidence suite.

**Exit:** The accepted workflow reduces measured agent calls or tokens without
exceeding its selective-risk gate or changing canonical evidence, policy, grants,
or effects.

### `TDP-5` — Agent Plugins and Optional Remote Evaluation

- Complete P8 reviewed-skill prerequisites and P10 provider adapters.
- Expose the narrow local MCP tool set to Codex and Claude with separate
  identities and failure reconciliation.
- Evaluate a remote provider only through a separate owner-approved integration
  plan; local inference remains the default privacy-preserving path.

**Exit:** Both agents produce equivalent contract-valid calls and fallbacks;
disconnects, replay, malformed output, provider failure, and stale generations
cannot authorize an effect or lose canonical evidence.

### `TDP-6` — Release Hardening

- Run drift, accessibility, performance, upgrade, rollback, clean-install,
  deletion, backup/restore, and independent-review suites.
- Publish only measured support ranges and limitations.

**Exit:** P11 acceptance and an explicit owner release decision.

## Proposed File Ownership

### Private Beta Implementation Order

Within the [72–96-hour beta plan](private-beta-96-hour-delivery-plan.md), prioritize
TDP-1 and TDP-1A: contracts, admitted minimal inputs, deterministic routing and
duplicate grouping, exact caching, and the evaluation harness. These deliver
measurable value without making proprietary model access a dependency.

Add bounded batching only where measurement demonstrates a benefit. Evaluate
one compact local classifier in TDP-2 shadow mode only if prerequisites, artifact
review, hardware availability, and the final validation window permit it. Keep
custom training, provider expansion, and broad rubric support outside the beta
critical path. Thin MCP packaging follows TDP-5 prerequisites; preparing a
contract is not proof that either live agent integration works.

Leaving a model disabled preserves the deterministic baseline but must be
reported as incomplete model-assisted functionality. This ordering neither
advances P3 nor relaxes the P6/P7/P8 and P9/P10 activation dependencies.

### Candidate Paths

Implementation paths are candidates only; an accepted ADR, schema-registry
successor, and process-ownership successor must reserve the exact files first.

| Candidate path | Responsibility |
| --- | --- |
| `docs/architecture/schemas/v1/decision-request.schema.json` | Strict request contract. |
| `docs/architecture/schemas/v1/decision-result.schema.json` | Strict non-authoritative result contract. |
| `docs/architecture/schemas/v1/calibration-profile.schema.json` | Calibration identity, metrics, thresholds, and expiry. |
| `docs/architecture/schemas/v1/decision-benchmark-result.schema.json` | Reproducible quality and performance evidence. |
| `src/contracts/p9/decision-contracts.ts` | Pure bounded runtime admission. |
| `src/workers/decision/` | Evidence projection, deterministic rules, exact cache, bounded batching, evaluator adapters, and calibration application; no effect authority. |
| `src/main/decision-status-adapter.ts` | Injection-only status/result adapter with no model or effect authority. |
| `src/preload/decision-status-bridge.ts` | Narrow typed read-only bridge. |
| `src/renderer/decision/` | Advisory HUD and exact-source navigation. |
| `tools/dosai-acceptance/` | Corpus runner, calibration evaluation, and benchmark verification. |
| `plugins/dosai-decision-plane/` | Future Codex/ChatGPT and Claude packaging after P10 approval. |

No candidate path is authorized by this document.

## Success Definition

The Typed Decision Plane is successful only if DOSAI demonstrates, on a frozen
representative corpus and complete end-to-end workflows, that it:

- makes narrow accepted decisions with measured calibration and explicit
  abstention;
- reduces agent calls, forwarded tokens, latency, or cost without hiding
  critical information;
- improves routing and operator comprehension without creating a competing
  source of truth;
- preserves canonical evidence and exact-source retrieval;
- exposes no new authority, secret, or effect path;
- degrades to deterministic, full-agent, or owner workflows on uncertainty; and
- reports honest measured limits rather than inheriting Jev's claims.

Until those gates pass, the capability remains `UNVERIFIED` and the subsystem
remains disabled or shadow-only.

## External References

These external sources explain the inspiration and possible agent packaging.
They are untrusted research inputs, not DOSAI authority, implementation
dependencies, performance evidence, or permission to cross a trust boundary.

- TypeSafe AI, Jev overview: <https://typesafe.ai/>
- TypeSafe AI, public API shape: <https://docs.typesafe.ai/api>
- TypeSafe AI, atomic questions and composition: <https://docs.typesafe.ai/introduction>
- TypeSafe AI, confidence versus probability: <https://docs.typesafe.ai/confidence>
- TypeSafe AI, qualified fan-out latency guidance: <https://docs.typesafe.ai/patterns/fan-out>
- Laya source and Apache-2.0 repository: <https://github.com/NandhaKishorM/laya>
- Laya benchmark disclosures and limitations: <https://github.com/NandhaKishorM/laya/blob/main/BENCHMARKS.md>
- Laya open language-routing and confidence correction: <https://github.com/NandhaKishorM/laya/pull/42>
- Knowledgator, GLiClass runtime-label classification:
  <https://github.com/Knowledgator/GLiClass>
- Warner et al., ModernBERT encoder context and inference research:
  <https://arxiv.org/abs/2412.13663>
- Guo et al., post-processing calibration and temperature scaling:
  <https://proceedings.mlr.press/v70/guo17a.html>
- OpenAI, schema adherence, semantic mistakes, and refusal/incomplete handling:
  <https://developers.openai.com/api/docs/guides/structured-outputs>
- TypeSafe AI, public agent-skill guidance:
  <https://docs.typesafe.ai/agent-skill>
- OpenAI, plugin architecture:
  <https://developers.openai.com/plugins/concepts/plugins>
- Anthropic, Model Context Protocol:
  <https://docs.anthropic.com/en/docs/mcp>

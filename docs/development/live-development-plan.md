# DOSAI Live Development Plan

**Plan status:** `[~] ACTIVE_DRAFT`<br>
**Current delivery phase:** `P2 - Safety kernel and audit journal`<br>
**Last status update:** `2026-07-31T22:43:00-04:00`<br>
**Status owner:** Repository owner<br>
**Execution rule:** No later phase begins before its dependencies and exit gate
are complete.

This is the canonical delivery-status document for DOSAI. It transforms the
product vision, Phase 0 discovery requirements, capability matrix, security
policy, and twelve accepted audit controls into an evidence-gated implementation
sequence.

The plan tracks delivery work. It does not prove capability support. Capability
status remains `UNVERIFIED` until reproducible evidence changes the capability
matrix through owner review.

## Document Roles

1. `SECURITY.md` defines mandatory safety boundaries and stop-work rules.
2. Accepted ADRs define implementation decisions and may supersede proposals.
3. This plan defines implementation order, status, dependencies, and gates.
4. The product specification defines the intended experience and architecture.
5. The capability matrix records demonstrated support and fallback paths.
6. The audit remediation register defines required controls F01 through F12.

If these sources conflict, work stops until the owner resolves the conflict in an
ADR. Implementation convenience never weakens `SECURITY.md`.

## Status Protocol

| Symbol | Status | Meaning |
| --- | --- | --- |
| `[ ]` | `NOT_STARTED` | No implementation work has begun. |
| `[~]` | `IN_PROGRESS` | Work is active but its gate is not satisfied. |
| `[?]` | `EVIDENCE_PENDING` | Code exists, but required proof or review is incomplete. |
| `[x]` | `COMPLETE` | Acceptance gate passed with linked evidence. |
| `[!]` | `BLOCKED` | Work cannot safely proceed; blocker is recorded. |
| `[-]` | `DEFERRED` | Owner intentionally moved the work out of the active plan. |

Every status change must update its ISO-8601 timestamp with an explicit UTC
offset. `COMPLETE` requires evidence paths, commands and results, and reviewer or
owner approval. Reopened work receives a new status entry; prior completion
evidence is not erased.

## Delivery Rules

- Only one delivery phase is normally `IN_PROGRESS`; approved preparation for a
  later phase must not expose unavailable runtime capability.
- Every new trust boundary or consequential choice receives an ADR before code
  crosses that boundary.
- Tests are written with or before the enforcement mechanism they prove.
- A denied or failed safety check produces no external effect.
- Production credentials, production endpoints, Stripe Live, deployment, and
  direct default-branch mutation remain prohibited unless policy is explicitly
  changed by the owner in a later release plan.
- Manual fallbacks remain available until the corresponding automated capability
  is proven and accepted.
- Phase completion updates the capability matrix only for capabilities directly
  supported by reproducible evidence.

## Phase Rollup

| Phase | Status | Status updated | Objective | Depends on |
| --- | --- | --- | --- | --- |
| P0 | `[x] COMPLETE` | `2026-07-31T14:48:38-04:00` | Governance and architecture baseline | None |
| P1 | `[x] COMPLETE` | `2026-07-31T18:23:38-04:00` | Hardened Electron shell | P0 |
| P2 | `[~] IN_PROGRESS` | `2026-07-31T21:09:59-04:00` | Safety kernel and audit journal | P1 |
| P3 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Execution capsules, cancellation, and watchdog | P2 |
| P4 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Workspace lease and Git broker | P3 |
| P5 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Authenticated packet bridge | P3 |
| P6 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Secret-safe inspector and evidence capture | P3, P5 |
| P7 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Persistence, search, retention, and deletion | P2, P6 |
| P8 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Reviewed skill supply chain | P2, P4, P7 |
| P9 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Canonical evidence, compression, and replay | P6, P7 |
| P10 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Approved integrations and end-to-end workflows | P4, P5, P8, P9 |
| P11 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Release hardening and independent review | P10 |

## P0: Governance and Architecture Baseline

**Phase status:** `[x] COMPLETE`<br>
**Status updated:** `2026-07-31T14:48:38-04:00`

| ID | Status | Status updated | Sequential work item | Evidence |
| --- | --- | --- | --- | --- |
| P0.1 | `[x] COMPLETE` | `2026-07-31T01:52:46-04:00` | Record the twelve owner-confirmed audit controls. | `docs/security/audit-remediation-register.md` |
| P0.2 | `[x] COMPLETE` | `2026-07-31T02:01:37-04:00` | Reconcile the provenance and authoritative status of Specification v2 and `AACP.md`. | Owner confirmed Specification v2 is authoritative and `AACP.md` is conceptual guidance; recorded in the specification and `README.md`. |
| P0.3 | `[x] COMPLETE` | `2026-07-31T02:01:37-04:00` | Create the trust-boundary diagram and threat register covering renderer, preload, main process, native helpers, workers, execution capsules, browser, SQLite, GitHub, and agent surfaces. | `docs/architecture/trust-boundary-and-threat-model.md` |
| P0.4 | `[x] COMPLETE` | `2026-07-31T14:12:44-04:00` | Approve ADRs for runtime boundaries, typed operations, isolation, audit keys and anchoring, browser evidence, persistence and deletion, workspace leases, packets, skills, and compression. | Owner accepted ADRs 0001-0010; the synchronized decision register is `docs/decisions/README.md`. |
| P0.5 | `[x] COMPLETE` | `2026-07-31T14:25:05-04:00` | Define versioned schemas, error taxonomy, capability vocabulary, data classes, retention periods, minimum macOS version, and approved integration surfaces. | Owner accepted `docs/architecture/baseline-contracts-v1.md` and `docs/architecture/schema-registry-v1.json`; foundational v1 schemas and capability mapping validated. |
| P0.6 | `[x] COMPLETE` | `2026-07-31T14:48:38-04:00` | Convert every phase gate into executable acceptance-test specifications and define the evidence-report format. | Owner accepted the contract, 36-suite catalog, registry v2, catalog schema, and evidence-report schema after static cross-reference and PASS-safety validation. |

**Exit gate (`P0.EXIT`):** Owner accepts the governing documents and ADR set; every Critical
and High control has an implementation phase and proof; unresolved conflicts are
zero; production access remains absent.

## P1: Hardened Electron Shell

**Phase status:** `[x] COMPLETE`<br>
**Status updated:** `2026-07-31T18:23:38-04:00`

| ID | Status | Status updated | Sequential work item | Evidence |
| --- | --- | --- | --- | --- |
| P1.1 | `[x] COMPLETE` | `2026-07-31T16:17:50-04:00` | Scaffold Electron, Vite, React, and TypeScript with reproducible dependency locks and supported Node/Electron versions. | Owner accepted `docs/development/p1-runtime-baseline.md` after package and runtime inspection. |
| P1.2 | `[x] COMPLETE` | `2026-07-31T16:37:16-04:00` | Separate renderer, preload, main, workers, and future native helpers into explicit ownership boundaries. | Owner accepted `docs/development/p1-process-ownership-evidence.md` after source-graph and runtime inspection. |
| P1.3 | `[x] COMPLETE` | `2026-07-31T16:54:55-04:00` | Enforce sandboxing, context isolation, disabled renderer Node integration, CSP, navigation restrictions, sender validation, and typed allowlisted IPC. | Owner accepted `docs/development/p1-renderer-security-evidence.md` after packaged configuration and adversarial runtime inspection. |
| P1.4 | `[x] COMPLETE` | `2026-07-31T17:04:44-04:00` | Add architecture checks forbidding raw process, filesystem, database, credential, and arbitrary IPC access from the renderer. | Owner accepted `docs/development/p1-renderer-authority-evidence.md` after AST enforcement, malicious fixtures, package, launch, and scanner fault review. |
| P1.5 | `[x] COMPLETE` | `2026-07-31T17:28:39-04:00` | Repair the acceptance-gate phase conflict through immutable catalog lineage and complete requirement relocation. | Owner accepted ADR 0011, catalog v2, relocation manifest, schemas v2, registry v3, and the no-weakening evidence as one synchronized decision. |
| P1.EXIT | `[x] COMPLETE` | `2026-07-31T18:23:38-04:00` | Exercise packaged security, recovery, malformed-request, navigation, restart, and bounded-load behavior without enabling execution authority. | Owner accepted all three formal v4 PASS reports on clean commit `80e2fc656025e38e26e7cb857b7b140b63ae8f33` after independent validation of 39 assertions, 17 artifacts, cleanup, empty gaps, and secret scans. |

**Exit gate (`P1.EXIT`):** A packaged local shell passes security configuration, sender
validation, IPC rejection, navigation, crash, and renderer-compromise tests. It
contains no process execution capability.

**Gate decision:** Owner accepted
`docs/development/p1-formal-acceptance-evidence.md`; P1 is complete and P2.1 is
active without process execution authority.

## P2: Safety Kernel and Audit Journal

**Phase status:** `[~] IN_PROGRESS`<br>
**Status updated:** `2026-07-31T22:43:00-04:00`<br>
**Controls:** F01, F07, F12

| ID | Status | Status updated | Sequential work item | Evidence |
| --- | --- | --- | --- | --- |
| P2.1 | `[x] COMPLETE` | `2026-07-31T18:37:14-04:00` | Implement immutable operation requests, action plans, resource preconditions, policy decisions, grants, and lifecycle states. | Owner accepted registry v6, six strict schemas, pure bounded immutable admission, exact tier/effect/approval bindings, lifecycle matrix, five-minute windows, and adversarial tests; no execution path exists. |
| P2.2 | `[x] COMPLETE` | `2026-07-31T18:46:28-04:00` | Implement a deny-by-default policy engine with no spawn path and minimum-tier rules that unknown inputs cannot lower. | Owner accepted process ownership v2, the pure isolated classifier, strict runtime admission, exact identity and capability intersection, four-tier floors, envelope semantics, immutable output, adversarial corpus, and all four remediations; `policy.preflight` remains `UNVERIFIED`. |
| P2.3 | `[x] COMPLETE` | `2026-07-31T19:13:53-04:00` | Implement the single-writer sanitized journal with atomic durable acknowledgement, versioned canonical encoding, sequence and epoch continuity, hash chaining, fixed provenance, and startup verification. | Owner accepted registry v7, process ownership v3, three audit contracts, the isolated SQLite writer, strongest configured local durability, authenticated fixed provenance, canonical chain and acknowledgement binding, restart verification, honest rollback limits, and all six remediations. |
| P2.4 | `[-] DEFERRED_EXTERNAL` | `2026-07-31T21:09:59-04:00` | Implement constrained protected checkpoint signing, explicit key lifecycle and assurance states, then select and prove the independent anti-fork anchor contract. | Owner accepted partial completion and deferred the two unavailable production proofs. Existing gates remain exact: persistent Keychain proof still requires an Apple application signing identity, and public Rekor v2 proof still requires a TUF-authorized writer. No hardware, anchored, or completion claim is inferred. |
| P2.5 | `[x] COMPLETE` | `2026-07-31T21:45:31-04:00` | Prove that policy, schema, journal durability, verification, required assurance, key, or grant failure cannot authorize an effect while emergency stop remains available. | Owner accepted registry v9, ownership v6, the D1 approval contract, app-unreachable proof service, exact acknowledged-head signing, and service-local single-use grant state after 153 tests, eight typechecks, three builds, and four remediations. Formal P2 acceptance remains separate; no effect path exists. |
| P2.EXIT | `[?] EVIDENCE_PENDING` | `2026-07-31T22:43:00-04:00` | Execute and independently verify the three governed P2 suites without adding effect authority. | Exact Node 24.18/pnpm 11.18 validation passes eight typechecks, 161 tests, and three builds. All three formal suites pass on clean subject `878abad` with 25 assertions, six scenarios, 19 digest-verified artifacts, cleanup, empty gaps, no effects, and secret scans. Local formal acceptance is complete; P2.4 external proofs remain deferred and prevent phase completion. |

**Exit gate (`P2.EXIT`):** The safety kernel can approve or deny synthetic intents and produce
independently verifiable journal evidence, while executable process imports are
still structurally unavailable.

## P3: Execution Capsules, Cancellation, and Watchdog

**Phase status:** `[ ] NOT_STARTED`<br>
**Status updated:** `2026-07-31T01:52:46-04:00`<br>
**Controls:** F02, F05, F06

| ID | Status | Status updated | Sequential work item | Evidence |
| --- | --- | --- | --- | --- |
| P3.1 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Implement the sole execution broker with typed handlers, trusted executables, sanitized environments, fixed limits, and single-use grants. | Pending |
| P3.2 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Implement generation-bound execution capsules, crash-recoverable ownership records, output backpressure, timeouts, and resource limits. | Pending |
| P3.3 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Select and prove the isolation backend contract, then implement idempotent whole-capsule cancellation and uncertain-cleanup quarantine. | Pending |
| P3.4 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Implement the authenticated reduce-only watchdog and priority emergency-stop path, including orphan reconciliation after coordinator failure. | Pending |
| P3.5 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Validate only fixed harmless operations before considering broader read-only schemas. | Pending |

**Exit gate (`P3.EXIT`):** Adversarial command, environment, mount, network, credential, load,
process-tree, PID-reuse, crash, orphan, timeout, cancellation, and cleanup tests
pass without touching unrelated processes or resources. Arbitrary repository code
remains unavailable until the isolation backend passes in the packaged app.

## P4: Workspace Lease and Git Broker

**Phase status:** `[ ] NOT_STARTED`<br>
**Status updated:** `2026-07-31T01:52:46-04:00`<br>
**Controls:** F07, F08

| ID | Status | Status updated | Sequential work item | Evidence |
| --- | --- | --- | --- | --- |
| P4.1 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Implement generation-fenced owner leases bound to canonical local and remote repository identities, exact refs and commits, actor session, capabilities, path scopes, credential scope, policy, expiry, and cleanup. | Pending |
| P4.2 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Create one contained managed worktree per lease, exclude shared Git metadata from agents, enforce descriptor-based path scope, immutable change manifests, and crash-safe quarantine. | Pending |
| P4.3 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Implement fixed Git plumbing operations with configuration and executable-feature denial, policy scanning, exact-parent commit construction, full-ref compare-and-swap, fixed push destinations, and ambiguous-outcome reconciliation. | Pending |
| P4.4 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Configure and verify immutable remote identity, pull-request and review rules, required checks, stale-review dismissal, protected-ref deletion and force-push denial, no agent bypass, and least-privilege credentials. | Pending |

**Exit gate (`P4.EXIT`):** Detached and symbolic refs, lease replay, refspec substitution,
path and replacement escape, hooks, filters, helpers, aliases, direct ref writes,
concurrent owners, remote races, ambiguous pushes, and `HEAD:main` tests fail or
reconcile without overreach. Commits match approved manifests while the main
worktree, unrelated leases, and protected remote refs remain unchanged.

## P5: Authenticated Packet Bridge

**Phase status:** `[ ] NOT_STARTED`<br>
**Status updated:** `2026-07-31T01:52:46-04:00`<br>
**Control:** F03

| ID | Status | Status updated | Sequential work item | Evidence |
| --- | --- | --- | --- | --- |
| P5.1 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Implement supervisor-created process-bound channels, protected ephemeral direction keys, and a deterministic length-framed authenticated schema permanently separate from stdout and stderr. | Pending |
| P5.2 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Implement strict session generations, direction sequences, nonce and replay rules, fail-session parsing, limits, backpressure, durable acknowledgements, duplicate identity, and reconnect reconciliation. | Pending |
| P5.3 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Assign provenance from endpoints, keep payload claims and external text structurally untrusted, reject prohibited data and embedded authority, and route operation proposals back through policy. | Pending |
| P5.4 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Preserve a sanitized manifested and quarantined manual handoff until an exact Claude adapter receives a separate decision and P10 proof. | Pending |

**Exit gate (`P5.EXIT`):** Valid durable round trips and reconnect reconciliation are
reproducible; forged, reflected, replayed, reordered, malformed, truncated,
oversized, cross-session, child-inherited, and authority-bearing messages fail
closed under load. Emergency stop remains independent and no undocumented direct
Codex-to-Claude IPC or exactly-once claim is made.

## P6: Secret-Safe Inspector and Evidence Capture

**Phase status:** `[ ] NOT_STARTED`<br>
**Status updated:** `2026-07-31T01:52:46-04:00`<br>
**Control:** F04

| ID | Status | Status updated | Sequential work item | Evidence |
| --- | --- | --- | --- | --- |
| P6.1 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Implement one-operation sandboxed `WebContentsView` instances with unique verified non-persistent sessions, no preload or app bridge, dedicated synthetic test accounts, trusted visual chrome, and generation-bound lifecycle. | Pending |
| P6.2 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Implement typed navigation and request policy, deny-by-default permissions and host capabilities, and a version-pinned CDP broker with exact observational method, target, parameter, and response allowlists. | Pending |
| P6.3 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Implement origin-specific extraction profiles and a memory-bounded evidence boundary that excludes secrets, free-form console data, storage and network bodies, unsafe text and attributes, and uncertain images before any HUD, prompt, packet, audit, file, or database access. | Pending |
| P6.4 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Validate adversarial navigation, origins, private networks, permissions, debugger scope, capture races, load limits, secret canaries, crashes, teardown and orphan recovery while proving unrelated profiles remain untouched. | Pending |

**Exit gate (`P6.EXIT`):** An exact approved non-production inspection plan produces bounded
canonical sanitized evidence with demonstrable absence of prohibited data. No
general read-only, arbitrary CDP, personal-profile, interactive automation, or
erasure claim is made; uncertain capture or teardown emits no artifact.

## P7: Persistence, Search, Retention, and Deletion

**Phase status:** `[ ] NOT_STARTED`<br>
**Status updated:** `2026-07-31T01:52:46-04:00`<br>
**Controls:** F10, F12

| ID | Status | Status updated | Sequential work item | Evidence |
| --- | --- | --- | --- | --- |
| P7.1 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Implement fail-closed pre-boundary classification, versioned field allowlists, opaque object identity, immutable retention metadata, and a typed single-authority persistence service with inventoried local storage. | Pending |
| P7.2 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Implement authoritative lifecycle and access generations plus a narrower bounded FTS5 derivative whose every result rejoins current visibility, with pinned runtime, tokenizer, core and FTS secure-delete verification. | Pending |
| P7.3 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Implement continuous retention and an idempotent deletion state machine covering immediate hide, reader and cache invalidation, transactional source and FTS removal, verified WAL and journal maintenance, artifacts, migrations, crash recovery, and backlog backpressure. | Pending |
| P7.4 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Select encryption and key hierarchy in a subordinate ADR; implement inventoried backup and export lifecycle, restore-time deletion replay, per-location verification, precise receipts, and explicit unmanaged-copy limitations. | Pending |
| P7.5 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Implement a read-only independent verifier and minimal export format that reports exact assurance ranges, provenance, gaps, key transitions, anchor receipts, and missing retained evidence without exporting private keys or prohibited payloads. | Pending |

**Exit gate (`P7.EXIT`):** Admission, persistence, bounded search, authoritative visibility,
retention clocks, reader races, crash recovery, SQLite and FTS secure deletion,
WAL and journal maintenance, migration, encryption, managed export and backup
restore canaries, precise receipts, and independent journal verification pass
under bounded load. No physical-erasure or unmanaged-copy claim is made.

## P8: Reviewed Skill Supply Chain

**Phase status:** `[ ] NOT_STARTED`<br>
**Status updated:** `2026-07-31T01:52:46-04:00`<br>
**Control:** F09

| ID | Status | Status updated | Sequential work item | Evidence |
| --- | --- | --- | --- | --- |
| P8.1 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Implement a non-discoverable proposal inbox, broker-owned read-only active roots and dedicated agent skill homes, full startup and periodic reconciliation, and explicit unsupported state when ambient discovery cannot be isolated. | Pending |
| P8.2 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Implement memory-only pre-admission snapshot and secret rejection, descriptor-safe traversal, strict platform schemas and parsers, complete file and dependency manifests, bounded active-format scanning, and deterministic validation. | Pending |
| P8.3 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Implement inert complete-bundle review, tiered owner approval, separate scoped activation, immutable content-addressed broker storage, exact target adapters, and active-only metadata publication. | Pending |
| P8.4 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Invoke only exact active digests with progressive disclosure and capability intersection; run scripts in execution capsules; route effects through policy; implement transitive revocation, stale-session handling, rollback, and reviewed cross-agent publication. | Pending |

**Exit gate (`P8.EXIT`):** Native-discovery bypass, malicious metadata and active formats,
filesystem and snapshot races, parser abuse, secret canaries, dependency drift,
draft propagation, digest substitution, context flooding, direct execution,
capability escalation, stale activation, and cross-agent drift remain blocked.
Only exact active broker bytes load or execute; revocation blocks every controllable
future path and already-delivered context is disclosed as non-recallable.

## P9: Canonical Evidence, Compression, and Replay

**Phase status:** `[ ] NOT_STARTED`<br>
**Status updated:** `2026-07-31T01:52:46-04:00`<br>
**Control:** F11

| ID | Status | Status updated | Sequential work item | Evidence |
| --- | --- | --- | --- | --- |
| P9.1 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Define versioned source and operation capture schemas, deterministic pre-persistence admission, typed gaps and bounds, critical-event classes, reserved evidence capacity, and fail-closed behavior when required evidence is unavailable. | Pending |
| P9.2 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Implement immutable canonical manifests, versioned exact-byte digests, deterministic ordered chunks, verified reconstruction, corruption and partial-range handling, and ADR 0008 retention, deletion, backup, restore, and export lifecycle. | Pending |
| P9.3 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Implement isolated bounded derivation workers, complete source and transformer provenance, loss and coverage records, source-availability checks, and auditable non-authoritative suppression decisions. | Pending |
| P9.4 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Pin Tree-sitter core, bindings, grammars, and queries; detect `ERROR` and `MISSING` recovery; fall back to deterministic canonical chunks for every uncertain code case; preserve exact retrieval for log compaction and stream ordering. | Pending |
| P9.5 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Select and pin a separate perceptual-hash implementation and deterministic image normalization; use similarity only for non-critical telemetry grouping and bypass suppression for every decision-relevant event. | Pending |
| P9.6 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Implement trusted evidence views that disclose provenance, loss, coverage, omissions, gaps, and source availability, retrieve exact canonical ranges, and bind evidence-dependent approvals only to verified canonical manifests. | Pending |
| P9.7 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Implement sequence-ordered replay that stops reconstruction at gaps, distinguishes unknown outcomes from no change, and exports binary-safe manifests accepted by an independent verifier only when their stated evidence is intact. | Pending |

**Exit gate (`P9.EXIT`):** The visual, DOM, code, terminal, chunk, truncation, capture-gap,
capacity, retention, deletion, restore, replay, export, retrieval, and transformer
version corpus proves exact permitted evidence remains retrievable for its stated
lifecycle; critical evidence is never silently suppressed; lossy, orphaned, or
unavailable artifacts cannot satisfy safety decisions; and replay never invents
unobserved state.

## P10: Approved Integrations and End-to-End Workflows

**Phase status:** `[ ] NOT_STARTED`<br>
**Status updated:** `2026-07-31T01:52:46-04:00`

| ID | Status | Status updated | Sequential work item | Evidence |
| --- | --- | --- | --- | --- |
| P10.1 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Prove the GitHub leased topic-branch, immutable-manifest commit, reconciled push, and exact-base draft-PR workflow with verified least privilege, protected default ref, and no agent merge or bypass authority. | Pending |
| P10.2 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Decide and implement only an exact owner-approved Claude adapter with separate provider identity, delivery acknowledgement, failure reconciliation, and provenance evidence; retain manifested sanitized manual handoff as fallback. | Pending |
| P10.3 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Exercise multi-agent planning, execution, evidence, approval, cancellation, handoff, and recovery end to end in non-production fixtures. | Pending |
| P10.4 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Consider Stripe Sandbox only after a separate owner-approved ADR, dedicated test account, mock-first suite, and verified production-endpoint denial. | Pending |

**Exit gate (`P10.EXIT`):** Supported integrations complete reproducible end-to-end workflows
without secrets, undocumented interfaces, production mutation, self-approval, or
default-branch writes. Unsupported integrations retain explicit fallbacks.

## P11: Release Hardening and Independent Review

**Phase status:** `[ ] NOT_STARTED`<br>
**Status updated:** `2026-07-31T01:52:46-04:00`<br>
**Control:** F12 final assurance

| ID | Status | Status updated | Sequential work item | Evidence |
| --- | --- | --- | --- | --- |
| P11.1 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Complete abuse, fault-injection, performance, accessibility, migration, recovery, and clean-install suites on supported macOS hardware. | Pending |
| P11.2 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Define code-signing, hardened-runtime, notarization, entitlement, dependency, update-signing, and rollback controls. | Pending |
| P11.3 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Export a binary-safe review package, control matrix, validation results, known limitations, signed checkpoints, independently retained anchor receipts, exact assurance ranges, and clean-environment verifier results. | Pending |
| P11.4 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Obtain independent security review and owner go, conditional-go, or stop decision; resolve all Critical and High findings before release. | Pending |
| P11.5 | `[ ] NOT_STARTED` | `2026-07-31T01:52:46-04:00` | Update the capability matrix to final evidence-backed states and publish the release support and limitation statement. | Pending |

**Exit gate (`P11.EXIT`):** A signed and notarized candidate passes all required tests and
independent review, has no unresolved Critical or High finding, and receives an
explicit owner release decision.

## Audit-Control Coverage

| Control | Planned work | Required proof phase |
| --- | --- | --- |
| F01 | P2.1, P2.2, P2.5 | P2 |
| F02 | P3.1, P3.3, P3.5 | P3 |
| F03 | P5.1-P5.4 | P5 |
| F04 | P6.1-P6.4 | P6 |
| F05 | P3.2, P3.4 | P3 |
| F06 | P3.2, P3.3 | P3 |
| F07 | P2.1, P2.5, P4.1, P4.3 | P4 |
| F08 | P4.1-P4.4 | P4 |
| F09 | P8.1-P8.4 | P8 |
| F10 | P7.1-P7.4 | P7 |
| F11 | P9.1-P9.7 | P9 |
| F12 | P2.3, P2.4, P7.5, P11.3 | P11 |

## Status Update Procedure

1. Update the affected work item symbol and timestamp.
2. Update its phase rollup status and timestamp.
3. Add exact evidence links, validation commands, observed results, and known
   limitations before marking it complete.
4. Update affected capability-matrix rows only after proof review.
5. Append one status-history entry below.
6. Commit the status update with the implementation or evidence it describes.

## Status History

| Timestamp | Change | Evidence or decision |
| --- | --- | --- |
| `2026-07-31T01:52:46-04:00` | Initialized the live development plan; recorded P0 in progress and P0.1 complete. | Twelve audit resolutions confirmed by the owner and preserved in `docs/security/audit-remediation-register.md`. |
| `2026-07-31T02:01:37-04:00` | Completed P0.2 and P0.3; started P0.4. | Owner authority decision recorded; trust-boundary diagram, invariants, data classes, residual risks, and 28-threat register added in `docs/architecture/trust-boundary-and-threat-model.md`. |
| `2026-07-31T02:04:53-04:00` | Drafted the complete P0.4 decision set and moved P0.4 to evidence pending. | ADRs 0001-0010 are indexed in `docs/decisions/README.md` and remain Proposed until owner review. |
| `2026-07-31T02:19:15-04:00` | Accepted ADR 0001 and advanced P0.4 review to ADR 0002. | Owner reviewed and approved runtime and privilege boundaries; ADRs 0002-0010 remain Proposed. |
| `2026-07-31T02:20:08-04:00` | Completed engineering review of ADR 0002 and retained Proposed status for owner decision. | Clarified automatic versus human authorization, tier floors, capability intersection, canonical grants, typed handlers, and the emergency-stop exception. |
| `2026-07-31T02:52:33-04:00` | Accepted ADR 0002 and advanced P0.4 review to ADR 0003. | Owner approved typed operations, policy, and grant semantics; ADRs 0003-0010 remain Proposed. |
| `2026-07-31T02:53:17-04:00` | Completed engineering review of ADR 0003 and retained Proposed status for owner decision. | Added a mandatory isolation contract, generation-bound ownership, idempotent whole-capsule stop, cleanup quarantine, crash reconciliation, and a reduce-only watchdog API. |
| `2026-07-31T02:56:41-04:00` | Accepted ADR 0003 and advanced P0.4 review to ADR 0004. | Owner approved execution isolation, cancellation, and watchdog semantics; ADRs 0004-0010 remain Proposed. |
| `2026-07-31T02:58:06-04:00` | Completed engineering review of ADR 0004 and retained Proposed status for owner decision. | Added atomic durability, epoch continuity, constrained key use and rotation, anti-fork anchoring, exact assurance ranges, privacy limits, and fail-closed recovery. |
| `2026-07-31T03:01:36-04:00` | Accepted ADR 0004 and advanced P0.4 review to ADR 0005. | Owner approved audit journal, key, and anchoring semantics; ADRs 0005-0010 remain Proposed. |
| `2026-07-31T03:03:33-04:00` | Completed engineering review of ADR 0005 and retained Proposed status for owner decision. | Added generation-fenced leases, worktree and metadata containment, immutable commit manifests, fixed Git plumbing, exact remote identity, CAS updates, push reconciliation, and explicit external-bypass limits. |
| `2026-07-31T03:08:45-04:00` | Accepted ADR 0005 and advanced P0.4 review to ADR 0006. | Owner approved workspace lease and Git broker semantics; ADRs 0006-0010 remain Proposed. |
| `2026-07-31T03:09:53-04:00` | Completed engineering review of ADR 0006 and retained Proposed status for owner decision. | Added protected process-bound channels, authenticated fail-session framing, session generations, structural non-authority, durable acknowledgements, reconnect reconciliation, remote-adapter boundaries, and quarantined manual fallback. |
| `2026-07-31T03:13:40-04:00` | Accepted ADR 0006 and advanced P0.4 review to ADR 0007. | Owner approved authenticated packet transport semantics; ADRs 0007-0010 remain Proposed. |
| `2026-07-31T03:15:29-04:00` | Completed engineering review of ADR 0007 and retained Proposed status for owner decision. | Added one-operation browser sessions, deny-by-default navigation and permissions, a version-pinned observational CDP allowlist, origin-specific evidence profiles, secret-safe capture states, verified teardown, and honest network and erasure limits. |
| `2026-07-31T03:18:25-04:00` | Accepted ADR 0007 and advanced P0.4 review to ADR 0008. | Owner approved browser inspection and evidence-boundary semantics; ADRs 0008-0010 remain Proposed. |
| `2026-07-31T03:19:52-04:00` | Completed engineering review of ADR 0008 and retained Proposed status for owner decision. | Added fail-closed admission, authoritative visibility generations, separately hardened FTS, clock-safe retention, resumable per-copy deletion, verified SQLite maintenance, backup and restore controls, encryption prerequisites, and precise non-erasure receipts. |
| `2026-07-31T12:04:27-04:00` | Accepted ADR 0008 and advanced P0.4 review to ADR 0009. | Owner approved persistence, search, retention, and deletion semantics; ADRs 0009-0010 remain Proposed. |
| `2026-07-31T12:06:13-04:00` | Completed engineering review of ADR 0009 and retained Proposed status for owner decision. | Replaced watcher-race trust with isolated proposal and active roots; added pre-persistence admission, atomic memory snapshots, complete dependency manifests, inert review, scoped activation, exact invocation, transitive revocation, and target-specific cross-agent publication. |
| `2026-07-31T12:11:32-04:00` | Accepted ADR 0009 and advanced P0.4 review to ADR 0010. | Owner approved the reviewed skill-bundle supply chain; ADR 0010 remains Proposed. |
| `2026-07-31T12:12:13-04:00` | Completed engineering review of ADR 0010 and retained Proposed status for owner decision. | Defined exact permitted canonical bytes, typed capture gaps, reserved critical capacity, complete derivation provenance, parser and image fallbacks, non-authoritative suppression, canonical approval binding, honest replay, and binary-safe verification. |
| `2026-07-31T14:12:44-04:00` | Accepted ADR 0010, completed P0.4, and started P0.5. | Owner approved canonical evidence and lossy derivation semantics; ADRs 0001-0010 are Accepted and baseline vocabulary and schema definition is now active. |
| `2026-07-31T14:14:55-04:00` | Drafted the P0.5 baseline and moved it to evidence pending. | Added schema and error contracts, capability vocabulary, data classes, retention profiles, `MACOS_ARM64_V1`, integration states, foundational machine schemas, live-phase capability mapping, and historical discovery-plan reconciliation; owner review remains required. |
| `2026-07-31T14:25:05-04:00` | Accepted the Baseline Contracts v1, completed P0.5, and started P0.6. | Owner approved the synchronized schema, error, capability, data, retention, platform, and integration baseline; all runtime capabilities remain `UNVERIFIED`. |
| `2026-07-31T14:33:46-04:00` | Drafted P0.6 acceptance and evidence contracts and moved P0.6 to evidence pending. | Added stable phase-gate IDs, schema registry v2, a 36-suite catalog with three suites per phase, and fail-closed evidence-report semantics; all suites remain `NOT_IMPLEMENTED` and owner review remains required. |
| `2026-07-31T14:48:38-04:00` | Accepted P0.6, completed Phase 0, and started P1.1. | Owner approved the acceptance-test JSON and contract; schema registry v2 and the 36-suite catalog are Accepted, while every suite remains `NOT_IMPLEMENTED` and every runtime capability remains `UNVERIFIED`. |
| `2026-07-31T15:15:03-04:00` | Implemented and independently audited P1.1; moved it to evidence pending. | Exact Node, pnpm, Electron, Vite, React, and TypeScript pins; locked supply-chain policy; separated Electron source roots; a zero-IPC sandboxed shell; package fuse, ASAR, plist, signature, architecture, minimum-macOS, accessibility, and runtime checks all pass. Six packaging and reproducibility faults were remediated; owner review remains required. |
| `2026-07-31T16:17:50-04:00` | Owner accepted P1.1; completed it and started P1.2. | The packaged local shell was opened for owner inspection. P1.2 now makes process ownership and import direction executable without enabling any runtime capability. |
| `2026-07-31T16:25:02-04:00` | Implemented and independently audited P1.2; moved it to evidence pending. | Five explicit source owners, three reserved native-helper owners, directional import enforcement, non-literal module-load rejection, five isolated typecheck surfaces, nine architecture tests, and packaged plus development launch checks pass. Four boundary faults were remediated; owner review remains required. |
| `2026-07-31T16:37:16-04:00` | Owner accepted P1.2; completed it and started P1.3. | The ownership boundaries and evidence were approved. P1.3 now hardens the local resource, navigation, and IPC surfaces without activating an agent capability. |
| `2026-07-31T16:48:20-04:00` | Implemented and independently audited P1.3; moved it to evidence pending. | The packaged shell now uses `dosai://app/`, restrictive CSP and request policy, exact navigation checks, a one-method typed IPC bridge, main-frame and owner sender validation, and disabled file-protocol privileges. Fifteen tests, package checks, clean packaged and development launches, live response headers, and compromised-renderer probes pass; one canonicalization fault was remediated and owner review remains required. |
| `2026-07-31T16:54:55-04:00` | Owner accepted P1.3; completed it and started P1.4. | The custom protocol, CSP, navigation, request, renderer isolation, and typed IPC evidence was approved. P1.4 now makes the renderer's no-authority rule independently machine-enforced. |
| `2026-07-31T17:00:02-04:00` | Implemented and independently audited P1.4; moved it to evidence pending. | A versioned AST policy now rejects raw process, filesystem, database, credential, arbitrary IPC, debugger, protected-root bypass, and typed-bridge misuse from every renderer source file. Twenty tests, all typechecks and builds, package checks, and a clean launch pass; two scanner faults were remediated and owner review remains required. |
| `2026-07-31T17:04:44-04:00` | Owner accepted P1.4 and started the P1 exit audit. | The renderer no-authority policy and its remediated scanner corpus were approved. Packaged crash recovery, unclean restart, malformed boundary, navigation, and bounded-load evidence are now active. |
| `2026-07-31T17:12:46-04:00` | Packaged P1 engineering audit passed; marked the formal exit gate blocked. | Twenty-nine packaged assertions prove the current shell's security, load, crash recovery, unclean restart, cleanup, and secret scan. The accepted P1 load scenario depends on prohibited later-phase workers and stop UI; catalog v2, the governed runner, fixture manifests, and minimum-macOS evidence are required before formal completion. |
| `2026-07-31T17:24:39-04:00` | Proposed the complete catalog v2 phase repair and moved P1.5 to evidence pending. | ADR 0011 and a nine-item machine relocation preserve current-host P1 proof, move worker recovery and trusted stop to P3, database-worker load to P7, derivation-worker load to P9, and physical minimum/current release proof to P11. V1 digests remain fixed and 34 tests pass; synchronized owner acceptance is pending. |
| `2026-07-31T17:28:39-04:00` | Owner accepted the synchronized catalog repair; completed P1.5 and resumed P1 exit work. | ADR 0011, catalog v2, relocation manifest, schemas v2, and registry v3 are Accepted. Catalog v2 remains immutable with all suites `NOT_IMPLEMENTED`; the runner implementation will create a later generation for the three P1 suites. |
| `2026-07-31T17:48:59-04:00` | Implemented and independently simulated the governed P1 acceptance generation; kept P1 exit in progress. | Catalog v3 marks only the three P1 suites implemented; exact fixtures, strict schemas, registry v4, a fixed-command runner, canonical evidence store, PASS/FAIL simulations, malformed-input tests, and symbolic-link containment pass 44 tests and all builds. Eight faults were remediated; synchronized owner acceptance is pending before digest pinning, commit, and formal packaged runs. |
| `2026-07-31T17:59:33-04:00` | Owner accepted the synchronized P1 runner generation. | Catalog v3, all three P1 fixtures, report schema v3, implementation lineage, and registry v4 are Accepted. Exact accepted digests are pinned in the runner and manifest; the clean baseline commit now precedes formal packaged execution. |
| `2026-07-31T18:03:05-04:00` | Preserved the first formal P1 acceptance failure and kept P1 exit in progress. | `P1-AT-001` built and launched the package, then runner 0.1.0 reached `BOUNDARY_PROBES` before document readiness and returned FAIL. The report, artifacts, cleanup PASS, secret-scan PASS, and clean subject `eca82bf7abaf1eac3b6b38e10c9e0cf322da6823` remain intact. |
| `2026-07-31T18:06:47-04:00` | Proposed an immutable runner remediation generation. | Diagnosis isolated `document.head` readiness in the harness, while a corrected non-formal audit passed all 29 application assertions. Catalog v4, fixture v2, runner 0.1.1, report schema v4, registry v5, and remediation lineage preserve every v3 byte and every test assertion. |
| `2026-07-31T18:12:47-04:00` | Owner accepted the synchronized v4 runner remediation. | Exact accepted catalog and fixture digests are pinned into runner 0.1.1; v2/v3 immutability, strict schemas, fixture equivalence, obsolete-runner rejection, and safe exception handling are enforced before clean-subject formal reruns. |
| `2026-07-31T18:16:59-04:00` | Completed the remediated formal P1 suite set and moved Phase 1 to evidence pending. | `P1-AT-001`, `P1-AT-002`, and `P1-AT-003` pass on clean commit `80e2fc656025e38e26e7cb857b7b140b63ae8f33`. Independent review validates six scenarios, 39 assertions, 17 artifacts, shared package identity, cleanup, empty gaps, and no secret patterns; owner gate approval remains required. |
| `2026-07-31T18:23:38-04:00` | Owner accepted `P1.EXIT`, completed Phase 1, and started P2.1. | The formal v4 report set is accepted. `electron.typed_bridge` advances to `SUPPORTED_WITH_CONSTRAINTS` for the exact current-host package; every effectful capability remains `UNVERIFIED`, and P2 begins at immutable no-spawn contracts. |
| `2026-07-31T18:32:20-04:00` | Implemented and independently audited P2.1; moved it to evidence pending. | Proposed registry v6 defines six synchronized contracts for synthetic operations, resource preconditions, plans, decisions, grant envelopes, and lifecycle transitions. Strict schemas, bounded immutable admission, 53 tests, all typechecks, all builds, and no-execution architecture checks pass after five contract faults were remediated; owner review remains required. |
| `2026-07-31T18:37:14-04:00` | Owner accepted P2.1 and started P2.2. | Registry v6 and all six contract schemas are Accepted without changing their reviewed bytes. All P2 capabilities remain `UNVERIFIED`; deny-by-default synthetic policy work begins with no process execution path. |
| `2026-07-31T18:44:56-04:00` | Implemented and independently audited P2.2; moved it to evidence pending. | Proposed process ownership v2 isolates a pure policy library from every application boundary. Four-tier classification, monotonic floors, capability intersection, policy outage, identity drift, malformed operations, context accessors, deterministic immutable output, 62 tests, all typechecks, and builds pass after four faults were remediated; owner review remains required. |
| `2026-07-31T18:46:28-04:00` | Owner accepted P2.2 and its remediations; started P2.3. | Process ownership v2 and the pure policy classifier are accepted for their isolated non-authoritative scope. `policy.preflight` remains `UNVERIFIED`; durable single-writer sanitized journal work begins with no process execution path. |
| `2026-07-31T19:06:46-04:00` | Implemented and independently audited P2.3; moved it to evidence pending. | Proposed registry v7, process ownership v3, three audit contracts, and an isolated SQLite writer provide exclusive sequence allocation, atomic durable acknowledgement, canonical hash chaining, authenticated fixed provenance, restart verification, and explicit unsigned, unanchored, and valid-prefix rollback limitations. Seven typechecks, 83 tests, and builds pass after six faults were remediated; owner review remains required. |
| `2026-07-31T19:13:53-04:00` | Owner accepted P2.3 and its remediations; started P2.4. | Registry v7, process ownership v3, three audit contracts, and the isolated single-writer journal are accepted without broadening assurance. Every runtime capability remains `UNVERIFIED`; protected checkpoint and independent anti-fork anchor work begins with no process execution path. |
| `2026-07-31T19:35:39-04:00` | Completed the local P2.4 protocol proof and moved it to evidence pending without claiming phase completion. | Proposed ADR 0012 selects Secure Enclave P-256 and Sigstore Rekor v2. Registry v8, ownership v4, strict checkpoint and receipt contracts, generation-fenced software signing, exact journal-fork binding, offline C2SP and RFC 6962 verification, deterministic receipts, and exact assurance ranges pass 103 tests, seven typechecks, and three builds after five faults were remediated. Owner review, packaged Secure Enclave proof, TUF trust bootstrap, and one non-secret public-log proof remain required. |
| `2026-07-31T19:41:14-04:00` | Owner accepted ADR 0012 and the local P2.4 protocol baseline; resumed P2.4 implementation. | Registry v8, ownership v4, strict checkpoint and receipt contracts, and all five remediations are accepted without broadening runtime assurance. P2.4 remains incomplete while packaged Secure Enclave lifecycle proof, TUF trust bootstrap, and one separately authorized non-secret public-log proof remain gated. No Keychain item was created and no network request or publication was authorized. |
| `2026-07-31T19:56:41-04:00` | Built and independently audited the packaged P2.4 Secure Enclave proof helper; moved P2.4 to evidence pending. | Proposed ownership v5 isolates an app-unreachable Swift helper with exact describe, lifecycle, and recovery-cleanup operations. Arm64/macOS 15 packaging, deterministic builds, 12 packaged assertions, 107 repository tests, malformed and unauthorized protocol rejection, exact Electron archive verification, and secret scans pass after three faults were remediated. No valid lifecycle command, Keychain operation, network request, or public write occurred; owner review and a separately authorized test-key lifecycle remain required. |
| `2026-07-31T20:04:03-04:00` | Owner accepted ownership v5 and the packaged proof-only helper; resumed P2.4 completion work. | The accepted helper remains unreachable from Electron and has no production checkpoint or network authority. The owner authorized the remaining P2.4 proof sequence; hardware lifecycle and independently verified public-log evidence are captured in a later generation before any completion claim. |
| `2026-07-31T20:18:00-04:00` | Completed the clean packaged Secure Enclave hardware proof. | Run `2241ab67-4beb-435a-9fa6-dcfaf9a5dbac` passed 13 assertions on commit `5deb09d4779acbda32619a221bb80c91837657a0`: Secure Enclave token, P-256 signing, private-key non-exportability, independent fixed-challenge verification, process-scoped lifetime, no Keychain item, recovery cleanup, and secret scan. Permanent Keychain creation remains blocked by missing application-signing entitlement and identity; no residue exists. |
| `2026-07-31T20:31:06-04:00` | Remediated the live TUF compatibility findings and committed a clean audit generation. | Production TrustedRoot contains a v2 Ed25519 shard while SigningConfig still authorizes only v1. Commit `537675e5433c72b6733a5ca7ac9fdc38f348aea4` adds exact P-256/Ed25519 C2SP profiles, strict TUF target selection, a separately locked official client, public-write authorization, retained evidence, and fail-closed tests without changing the accepted application lock. |
| `2026-07-31T20:33:46-04:00` | Completed every locally controllable P2.4 check and marked the gate externally blocked. | Formal TUF run `6ce3dae4-f5c6-4eba-8822-2e0979fc1827` verified current root v15, timestamp v743, snapshot v165, and targets v14, then stopped before publication because no v2 service is authorized. Evidence `6c7edb...` and secret scan pass; publication is false. The rebuilt packaged GUI also passes all 29 assertions. P2.4 cannot complete until Sigstore distributes a v2 writer through SigningConfig; no capability state changes. |
| `2026-07-31T21:09:59-04:00` | Deferred P2.4's unavailable external proofs and completed the P2.5 engineering generation for owner review. | P2.4's Keychain and Rekor contracts remain unmet and unchanged. Proposed registry v9 and ownership v6 add one strict D1 approval contract and an app-unreachable no-effect authorization proof. Internal journal ownership and exact acknowledgement-to-checkpoint binding remediate two trust faults; all 153 tests, eight typechecks, three builds, architecture scans, and diff checks pass. Formal P2 acceptance remains pending and every effectful capability remains `UNVERIFIED`. |
| `2026-07-31T21:45:31-04:00` | Owner accepted P2.5 and started the formal P2 acceptance generation. | Registry v9, ownership v6, the D1 approval contract, no-effect authorization proof, and all four remediations are accepted. P2 remains in progress: formal P2 suites are not yet implemented, P2.4 external proofs remain deferred, and every effectful capability remains `UNVERIFIED`. |
| `2026-07-31T22:03:36-04:00` | Proposed the governed P2 formal-acceptance generation and moved P2.EXIT to evidence pending. | Catalog v5 implements only the three P2 suites; runner 0.2.0 binds exact corpus digests, actual runtimes, operation timeouts, local-durable journal metadata, honest verifier ranges, cleanup, and secret scans. Six audit findings were remediated. Exact pinned-toolchain validation, owner acceptance, and formal clean-commit runs remain pending, and P2.4 external proofs remain deferred. |
| `2026-07-31T22:34:50-04:00` | Owner accepted the synchronized P2 formal-acceptance generation. | Catalog v5, registry v10, implementation manifest v2, all six v3 fixtures, and runner 0.2.0 advanced together with final identity digests pinned. P2.EXIT remains evidence pending until exact-toolchain clean-commit runs are independently verified; P2.4 external proofs remain deferred. |
| `2026-07-31T22:43:00-04:00` | Completed and independently verified all local formal P2 suites. | Exact pinned-toolchain validation and `P2-AT-001` through `P2-AT-003` pass on clean subject `878abad`: 25 assertions, six scenarios, 19 artifacts, cleanup, empty gaps, no effects, and secret scans all verify. P2.EXIT remains evidence pending solely because the owner-deferred P2.4 hardware-Keychain and public-Rekor proofs are still unavailable. |

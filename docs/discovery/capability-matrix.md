# DOSAI Capability Matrix

**Vocabulary source:**
[`baseline-contracts-v1.md`](../architecture/baseline-contracts-v1.md)<br>
**Platform profile:** `MACOS_ARM64_V1`<br>
**Last structural update:** `2026-07-31T14:14:55-04:00`

## Status Rules

All capability support starts as `UNVERIFIED`. A capability may change support
state only after owner review of reproducible proof recording the exact actor or
adapter, platform and dependency versions, environment, steps, expected and
observed results, constraints, sanitized evidence, fallback, and validity
conditions. Tool availability or documentation alone is not proof.

The support states are `UNVERIFIED`, `SUPPORTED`,
`SUPPORTED_WITH_CONSTRAINTS`, and `UNSUPPORTED`. Runtime availability is a
separate health axis and cannot upgrade support. `BLOCKED`, `DEGRADED`, and
`UNAVAILABLE` describe current availability, not permanent support. Evidence
that becomes stale or invalid returns support to `UNVERIFIED` until re-proven.

Capability status never authorizes an effect. Policy, approval, grant, lease,
data, integration, and operation requirements still apply.

| Capability ID | Capability | Proof phase | Scope | Support state | Evidence needed | Fallback |
| --- | --- | --- | --- | --- | --- | --- |
| `repository.read` | Read repository files and Git metadata | P4 | DOSAI Git broker and approved adapters | `UNVERIFIED` | Clean-room read test with exact repository, worktree, ref, path, actor, and bounded output record | Human-provided archive or reviewed patch |
| `workspace.lease_enforce` | Enforce branch, worktree, and file ownership | P4 | DOSAI workspace and Git brokers | `UNVERIFIED` | Conflict, replacement, link, nested-repository, restart, and compare-and-swap tests that block writes without changing another owner's state | Manual owner checkpoint and separate worktrees |
| `process.command_readonly` | Run an allowlisted local read-only operation | P3 | DOSAI execution broker | `UNVERIFIED` | Typed operation, exact executable and arguments, tier, capsule, exit code, bounded output, timeout, and cancellation evidence | Human runs command and supplies sanitized output |
| `process.owned_child` | Launch and terminate an owned child process tree | P3 | DOSAI execution broker and watchdog | `UNVERIFIED` | Process-tree, generation, descendant, timeout, crash, and scoped termination proof | Manual terminal execution outside DOSAI |
| `electron.typed_bridge` | Expose a typed Electron context bridge | P1 | DOSAI renderer, preload, and main | `UNVERIFIED` | Packaged test proving context isolation, sender validation, schema rejection, and forbidden import boundaries | No renderer execution; main-process-only test harness |
| `browser.evidence_capture` | Capture read-only sanitized browser evidence | P6 | DOSAI browser and evidence brokers | `UNVERIFIED` | Dedicated ephemeral profile, exact origin and capture plan, secret canaries, navigation and teardown tests, and canonical artifact proof | User-provided sanitized screenshot and DOM excerpt |
| `macos.app_observe` | Inspect a local macOS application read-only | P10 or later ADR | Deferred macOS adapter | `UNVERIFIED` | Exact public API, entitlement and target identity, non-mutation proof, and owner-approved ADR | User observation with a written evidence checklist |
| `packet.assemble` | Produce authenticated structured packet output | P5 | DOSAI packet endpoints | `UNVERIFIED` | Framing, authentication, sequence, provenance, valid, malformed, forged, replayed, reordered, and oversized fixtures | Reviewed manifested Markdown handoff |
| `content.untrusted_boundary` | Treat external content as untrusted data | P5-P9 | Every adapter, worker, renderer, and packet path | `UNVERIFIED` | Prompt-injection, rendering, quoting, authority-confusion, secret, and cross-boundary fixtures | Human redaction and review before handoff |
| `agent.claude_relay` | Relay a packet to an approved Claude-facing surface | P10 | Deferred Claude adapter | `UNVERIFIED` | Owner-approved documented interface, dedicated identity, exact payload manifest, acknowledgement, and failure reconciliation | Manual transfer of a sanitized manifested packet |
| `agent.direct_ipc` | Direct Codex-to-Claude IPC | P10 or later ADR | Deferred Codex and Claude adapters | `UNVERIFIED` | Documented supported endpoints, authenticated transport, dedicated identities, and end-to-end non-production proof | File or GitHub-mediated reviewed handoff |
| `persistence.timeline` | Persist a sanitized local event timeline | P7 | DOSAI persistence service | `UNVERIFIED` | Schema, admission, deterministic insert/query, lifecycle, retention, deletion, backup, restore, and sanitized database evidence | Append-only sanitized local JSON Lines file |
| `search.fts5` | Search allowlisted fields with SQLite FTS5 | P7 | DOSAI persistence service | `UNVERIFIED` | Packaged SQLite and FTS versions, tokenizer, bounded adversarial queries, visibility races, and secure deletion proof | Exact-match indexed fields or bounded in-memory search |
| `policy.preflight` | Classify typed operations into autonomy tiers | P2 | DOSAI policy service | `UNVERIFIED` | Table-driven Green, Yellow, Red, Black, unknown, target, environment, capability, and downgrade-resistance tests | Deny all effects pending owner review |
| `approval.local` | Obtain fresh local approval for an exact Red plan | P2 | DOSAI approval service | `UNVERIFIED` | Trusted UI proof with exact digest, approve, deny, timeout, stale-plan, restart, and single-use outcomes | Block action and require a separate manual workflow |
| `safety.emergency_stop` | Stop all and only DOSAI-owned effects | P3 | Independent DOSAI watchdog | `UNVERIFIED` | Saturation, renderer/main/audit failure, process-tree, browser, remote request, and unrelated-process survival tests | Quit DOSAI and terminate owned test processes manually |
| `skill.reviewed_publish` | Discover, review, activate, and revoke skills | P8 | DOSAI skill broker and target adapters | `UNVERIFIED` | Discovery isolation, admission, parser, manifest, dependency, approval, activation, invocation, revocation, and stale-context tests | Static reviewed skill manifest with no automatic publication |
| `compression.ast` | Produce source-bound Tree-sitter summaries | P9 | DOSAI derivation worker | `UNVERIFIED` | Pinned grammar corpus, `ERROR` and `MISSING` recovery, semantic-risk fixtures, exact source retrieval, and deterministic fallback | Canonical line or byte chunks with strict limits |
| `compression.visual` | Group non-critical screenshots by perceptual similarity | P9 | DOSAI image derivation worker | `UNVERIFIED` | Pinned normalization and hash corpus, critical-event bypass, false-negative review, and exact canonical frame retention | Owner-selected sanitized canonical frames |
| `timeline.replay` | Display sequence-ordered evidence replay | P9 | DOSAI timeline view | `UNVERIFIED` | Complete-chain, gap, clock uncertainty, unavailable source, unknown outcome, and no-interpolation tests | Read-only chronological observed-event list |
| `github.draft_pr` | Create a leased topic branch and draft PR | P10 | DOSAI Git and GitHub brokers | `UNVERIFIED` | Dedicated test repository, immutable manifest, commit, reconciled push, exact base/head, draft PR, least privilege, and protected default ref | Export a reviewed binary-safe patch without remote mutation |
| `stripe.mock` | Exercise synthetic Stripe-shaped workflows offline | P10 | Test fixtures only | `UNVERIFIED` | Deterministic local mock corpus proving no network, credential, or production-derived data access | Static fixture review |
| `stripe.sandbox` | Interact with Stripe Sandbox | P10 after separate ADR | Deferred Stripe adapter | `UNVERIFIED` | Dedicated test account, sandbox-only endpoint and identity proof, typed operations, audit, reconciliation, and production denial | Offline mocks with no Stripe connection |
| `stripe.production` | Access Stripe Live or another production system | Prohibited | No adapter | `UNVERIFIED` | No proof is authorized under this baseline | No fallback; prohibited |

## Review Cadence

Update this matrix only when evidence is accepted, expires, or is invalidated.
Every change records the previous state, new state, actor and platform scope,
evidence report, reviewer, timestamp, constraints, and fallback. Ambiguous or
partial results remain `UNVERIFIED`. Phase exit reviews include every status and
evidence change.

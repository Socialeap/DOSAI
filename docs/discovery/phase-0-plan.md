# DOSAI Phase 0 Discovery Plan

**Document status:** `HISTORICAL_DISCOVERY_RATIONALE`<br>
**Delivery sequence authority:**
[`docs/development/live-development-plan.md`](../development/live-development-plan.md)<br>
**Status updated:** `2026-07-31T14:14:55-04:00`

This document preserves the questions and initial vertical-slice criteria that
shaped the threat model and accepted ADRs. It no longer defines phase order or a
gate before P1. The owner-approved live development plan redistributes these
proofs across P1-P11 after the P0 governance baseline is complete.

## Original Objective

The original objective was to establish a safe, evidence-based foundation before
application implementation and determine whether the proposed local-first,
asymmetric agent workflow could be demonstrated through a read-only vertical
slice without production access, secret handling, or unsupported claims.

The original phase allowed documentation and bounded proofs only. It did not
authorize production automation or the complete Electron application.

## Original Questions to Prove

1. Can a macOS Electron main process launch and stop a bounded local child
   process while exposing only typed, allowlisted IPC to its renderer?
2. Can Codex execution output be identified and transformed into a structured
   `[CODEX PACKET]` without treating external content as instructions?
3. Can a Claude-facing handoff be demonstrated through an approved interface
   without claiming undocumented direct IPC?
4. Can read-only browser and desktop evidence be captured with a dedicated
   profile, redacted, and represented without exposing credentials or session
   material?
5. Can SQLite store a deterministic local event timeline and support bounded
   retrieval without becoming a source of prompt injection or secret retention?
6. Can command classification reliably distinguish read-only observation from
   mutation, escalation, and prohibited behavior before execution?
7. Can branch and file ownership be checked without overwriting or rebasing work
   owned by another agent?
8. What minimum evidence is required before any capability moves from
   `UNVERIFIED` to `SUPPORTED`, `UNSUPPORTED`, or
   `SUPPORTED_WITH_CONSTRAINTS`?

## Capability Matrix

The working inventory and proof requirements are maintained in the
[DOSAI capability matrix](capability-matrix.md). Every capability starts as
`UNVERIFIED`; documentation, assumptions, and tool availability are not proof
of working behavior.

## Original Threat-Model Deliverables

The original plan required the following before its go decision:

- An asset and data-flow inventory covering prompts, commands, repository data,
  screenshots, browser state, logs, packets, approvals, and local databases.
- A trust-boundary diagram for the Electron renderer, preload bridge, main
  process, child processes, local database, browser profile, GitHub, Codex, and
  Claude-facing interface.
- A threat register covering prompt injection, command injection, confused
  deputy behavior, renderer compromise, path traversal, symlink abuse, secret
  leakage, malicious repository content, forged packets, replay, and denial of
  service.
- A data classification, redaction, retention, and deletion policy for local
  telemetry and evidence exports.
- A command-tier ruleset with deny-first handling for unknown commands and
  explicit stop-work behavior for Red and Black conditions.
- An evidence-integrity design specifying timestamps, agent identity, source,
  tier, hash strategy, and the limits of any integrity claim.
- Abuse and failure tests for untrusted browser text, terminal output, malformed
  packets, oversized input, interrupted processes, and unavailable integrations.

## Historical Read-Only Vertical-Slice Criteria

The original discovery slice proposed the following criteria. They remain useful
acceptance-test inputs, but their implementation is governed by the mapped live
plan phases rather than by this historical Phase 0 sequence:

- Start from a clean, non-default development branch with no production
  credentials or endpoints configured.
- Observe one allowlisted, read-only local command and one allowlisted browser
  page using a dedicated test profile.
- Display the proposed command, source, target, and assigned autonomy tier before
  execution; unknown behavior must fail closed.
- Capture bounded stdout, stderr, and browser evidence without cookies, tokens,
  passwords, environment values, personal data, or session storage.
- Wrap all external text as untrusted data and assemble a deterministic sample
  `[CODEX PACKET]` with provenance and redaction metadata.
- Persist a scrubbed local event record and retrieve it by session and timestamp.
- Demonstrate cancellation that terminates only the owned test process and leaves
  unrelated applications and repository work untouched.
- Produce a validation report containing exact steps, versions, expected output,
  observed output, limitations, and evidence paths.
- Complete without remote mutation, deployment, Stripe access, production API
  calls, or a claim of direct Codex-to-Claude IPC.

## Historical Stop/Go Criteria

The current P0 exit gate is defined only in the live development plan. The
following original criteria remain release-safety constraints and inputs to later
phase gates; they do not independently block P1 after current P0 completion.

Stop if any proof requires secrets, a production mutation, an authenticated
Claude UI automation flow, destructive Git behavior, weakened Electron
isolation, or an exception to the security policy. A stopped proof must be logged
as `BLOCKED` or `UNSUPPORTED`; it must not be relabeled as successful.

The original plan required the owner to record the final go, conditional-go, or
stop decision. Silence and partial evidence were not approval.

## Decision Disposition

| Original decision | Status | Governing source |
| --- | --- | --- |
| Authoritative Specification v2 | Resolved | Owner authority note in the specification and repository `README.md`. |
| Claude-facing integration | Manual only; automated adapter deferred | Baseline integration register and ADR 0006. |
| Green, Yellow, Red, and Black semantics | Resolved | ADR 0002 and Baseline Contracts v1. |
| Evidence retention and deletion | Baseline proposed; implementation deferred | Baseline retention profiles, ADRs 0008 and 0010, P7 and P9. |
| Browser profile and test identities | Resolved for architecture | ADR 0007; capability remains `UNVERIFIED`. |
| Agent identity, packet authenticity, and audit integrity | Resolved for architecture | ADRs 0004 and 0006; capabilities remain `UNVERIFIED`. |
| Minimum macOS and architecture | Baseline proposed | `MACOS_ARM64_V1` in Baseline Contracts v1. |
| SQLite encryption and keys | Deferred | Subordinate P7 ADR required before persistent user data. |
| Approval and emergency stop semantics | Resolved for architecture | ADRs 0002 and 0003; capabilities remain `UNVERIFIED`. |
| P1 scope and start | Pending P0 completion | Live development plan P0 exit gate and owner decision. |

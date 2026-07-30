# DOSAI Phase 0 Discovery Plan

## Objective

Establish a safe, evidence-based foundation for DOSAI before application
implementation begins. Phase 0 must determine whether the proposed local-first,
asymmetric agent workflow can be demonstrated through a read-only vertical slice
without production access, secret handling, or unsupported capability claims.

This phase creates documentation and bounded proofs only. It does not authorize
production automation or the complete Electron application.

## Questions to Prove

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
   `Unverified` to `Supported`, `Unsupported`, or `Supported with constraints`?

## Capability Matrix

The working inventory and proof requirements are maintained in the
[Phase 0 capability matrix](capability-matrix.md). Every agent capability starts
as `Unverified`; documentation, assumptions, and tool availability are not proof
of working behavior.

## Threat-Model Deliverables

Phase 0 must produce the following before a go decision:

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

## Read-Only Vertical-Slice Acceptance Criteria

The Phase 0 slice is accepted only when a reproducible local demonstration can:

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

## Stop/Go Exit Gate

Proceed to Phase 1 only when every Phase 0 acceptance criterion has evidence, the
threat-model deliverables have owner review, no unresolved critical or high-risk
finding remains, and required capabilities have explicit fallback paths.

Stop if any proof requires secrets, a production mutation, an authenticated
Claude UI automation flow, destructive Git behavior, weakened Electron
isolation, or an exception to the security policy. A stopped proof must be logged
as `Blocked` or `Unsupported`; it must not be relabeled as successful.

The owner records the final go, conditional-go, or stop decision. Silence and
partial evidence are not approval.

## Owner Decisions Still Required

- Confirm the authoritative source and approval status of Specification v2.
- Approve the exact Claude-facing integration surface to test in later work.
- Define canonical Green, Yellow, Red, and Black command rules and who may amend
  them.
- Decide the evidence retention period, deletion behavior, and export format.
- Approve the dedicated browser-profile lifecycle and allowed test accounts.
- Define agent identity, packet authenticity, and audit-integrity requirements.
- Select the minimum supported macOS and Apple Silicon versions.
- Decide whether SQLite encryption is required and how keys would be managed.
- Define the human approval UX and emergency-stop semantics for later phases.
- Approve Phase 1 scope only after reviewing the Phase 0 exit evidence.

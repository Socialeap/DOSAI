# ADR 0022 — One-run existing-account coordination review

- **Status** — Accepted by the repository owner on 2026-11-19. Execution held.
- **Related decisions** — ADRs 0002, 0003, 0006 and 0018.
- **Source baseline** — `9c7772333e112332a0a65c37cfa02f02ded8e0dc`.

## Decision

The owner approved a single exception to the dedicated test account requirement
in [SECURITY.md](../../SECURITY.md). It covers the owner's existing ChatGPT
subscription for Codex with Terra and existing Claude subscription for Claude
Code on the local M4. It applies to one supervised
`synthetic-empty-input-review` using a fresh local checklist. Terra assigns the
review, Claude Code returns a bounded finding, and Terra acknowledges it. The
window permits up to two Terra turns and one Claude Code turn within two
minutes. The first provider dispatch consumes the exception, including on
failure or interruption. A replay, retry or provider fallback requires a
separate decision. The general dedicated-account rule continues to apply to
every other DOSAI proof.

Use fresh, isolated client sessions with empty working directories and only
approved provider egress. The owner authenticates directly through the stock
vendor clients. DOSAI accepts only the fixed synthetic packet and validated
review fields. Model workers receive no repository or general home directory
access, historical conversations, browser state, shell, external tools, or
authority over production workspaces. DOSAI must not collect, copy or relay
credentials or personal account identifiers.

## Prerequisites for launch

1. Review the exact protected launcher and provider terms for the intended
   subscription mode. Verify executable and process identity, effective
   configuration and tool access, declared egress, credential confinement,
   cancellation, and rejection of late updates after Stop. Empty-profile
   fixtures do not establish signed-in equivalence.
2. Verify the billing basis on the exact accounts immediately before launch,
   including allowance, possible credit draw, auto-reload and reset behavior.
   Keep billing settings as configured. Claude must be included-only and have
   zero incremental spend. Any paid Codex usage requires a separately approved
   limit for existing credits consumed and new cash charges, including reload.
   Unknown or unenforceable exposure, a reset path or a metered fallback holds
   launch. This exception grants no spend authority.
3. Bind the fresh local owner approval and single-use grant to the reviewed
   candidate, exact client identities, model IDs, project, fixture, expiry,
   and verified cost basis under ADR 0002. The account exception is distinct
   from this launch approval. Stop or any failed check revokes the session.
   Record a sanitized outcome and the observed billing readback.

## Effect on release gates

This coordination proof has no builder, guest, dispatch, or deployment
authority. Native builder admission and private-beta release gates still apply.
PRs #52 and #53 remain in draft. This decision adds no live route or launcher
configuration.

# Phase 0 Capability Matrix

## Status Rules

All capability support starts as `Unverified`. A capability may change status
only after a reproducible proof records the environment, exact steps, observed
result, constraints, and sanitized evidence. Tool availability or documentation
alone is not proof.

| Capability | Required for which phase | Codex support | Claude support | Evidence needed | Fallback |
| --- | --- | --- | --- | --- | --- |
| Read repository files and Git metadata | Phase 0 | Unverified | Unverified | Clean-room read test with branch, path, and output record | Human-provided archive or reviewed patch |
| Enforce branch and file ownership | Phase 0-1 | Unverified | Unverified | Conflicting-owner test that blocks a write without changing the worktree | Manual owner checkpoint and separate worktrees |
| Run allowlisted local read-only commands | Phase 0-1 | Unverified | Unverified | Command, arguments, tier, exit code, bounded output, and cancellation evidence | Human runs command and supplies sanitized output |
| Launch and terminate an owned child process | Phase 0-1 | Unverified | Unverified | Process-tree test proving scoped launch, timeout, and termination | Manual terminal execution outside DOSAI |
| Typed Electron context bridge | Phase 0-1 | Unverified | Unverified | Test showing context isolation and rejection of non-allowlisted IPC channels | No renderer execution; main-process-only prototype |
| Capture read-only browser evidence | Phase 0 | Unverified | Unverified | Dedicated-profile test with URL, redaction review, and no storage or cookie capture | User-provided sanitized screenshot and DOM excerpt |
| Inspect a local macOS application read-only | Phase 0 | Unverified | Unverified | Named test app, visible action log, and proof that no mutation occurred | User observation with a written evidence checklist |
| Produce structured `[CODEX PACKET]` output | Phase 0-2 | Unverified | Unverified | Parser fixtures for valid, malformed, forged, and oversized packets | Reviewed Markdown handoff template |
| Treat external content as untrusted data | Phase 0-2 | Unverified | Unverified | Prompt-injection fixtures proving quoting and instruction separation | Human redaction and review before handoff |
| Relay a packet to an approved Claude surface | Phase 0-2 | Unverified | Unverified | Approved interface, round-trip trace, and recipient confirmation | Manual copy of a sanitized packet |
| Direct Codex-to-Claude IPC | Phase 2 or later | Unverified | Unverified | Documented supported transport and end-to-end local proof | File or GitHub-mediated reviewed handoff |
| Local SQLite event persistence | Phase 0-1 | Unverified | Unverified | Schema, deterministic insert/query test, retention test, and sanitized database | Append-only local JSON Lines file |
| SQLite FTS5 packet search | Phase 1-3 | Unverified | Unverified | Extension availability and bounded query tests with adversarial text | Exact-match indexed fields or in-memory search |
| Pre-flight autonomy-tier classification | Phase 0-2 | Unverified | Unverified | Table-driven tests for Green, Yellow, Red, Black, and unknown inputs | Deny all non-read-only actions pending human review |
| Native macOS approval sheet | Phase 2 | Unverified | Unverified | UI proof with explicit approve, deny, timeout, and immutable log outcomes | Block action and require manual terminal workflow |
| Global scoped circuit breaker | Phase 2-4 | Unverified | Unverified | Test proving only DOSAI-owned processes and sessions are stopped | Quit DOSAI and terminate owned test process manually |
| Shared skill discovery and indexing | Phase 3 | Unverified | Unverified | Watcher, parser, atomic update, and malformed-skill tests | Static reviewed skill manifest |
| Tree-sitter AST compression | Phase 3 | Unverified | Unverified | Language fixtures measuring semantic retention and token reduction | Line-based diff with strict size limits |
| Perceptual screenshot deduplication | Phase 3-4 | Unverified | Unverified | Deterministic image corpus with threshold and false-negative review | Store only manually selected sanitized frames |
| Timeline replay | Phase 4 | Unverified | Unverified | Deterministic event ordering and frame reconstruction test | Read-only chronological event list |
| GitHub branch and draft PR workflow | Phase 0-1 | Unverified | Unverified | Authenticated test repository flow with branch, commit, push, and draft PR evidence | Export a reviewed patch without remote mutation |
| Stripe Sandbox interaction | Phase 2 or later | Unverified | Unverified | Approved test account, sandbox-only endpoint proof, and audit record | Mock fixtures with no Stripe connection |
| Stripe Live or production mutation | Not authorized | Unverified | Unverified | Not applicable during Phase 0 | No fallback; prohibited |

## Review Cadence

Update this matrix only when evidence is added or invalidated. Record ambiguous
results as `Unverified` or `Blocked`, not `Supported`. Phase exit reviews must
include every status change and its evidence location.

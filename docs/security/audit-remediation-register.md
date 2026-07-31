# DOSAI Audit Remediation Register

**Register status:** `[x] ACCEPTED_CONTROL_BASELINE`<br>
**Status recorded:** `2026-07-31T01:52:46-04:00`<br>
**Scope:** Architecture and development requirements; no capability is proven by
this document.

This register preserves the twelve owner-confirmed design-audit resolutions as
implementation constraints. The live development plan maps every control to a
delivery phase and evidence gate. A control remains unverified until its proof
is recorded in the capability matrix.

## Status Legend

- `[ ] NOT_STARTED`
- `[~] IN_PROGRESS`
- `[x] ACCEPTED` or `COMPLETE`
- `[?] EVIDENCE_PENDING`
- `[!] BLOCKED`
- `[-] DEFERRED`

## Control Summary

| ID | Severity | Accepted finding | Primary delivery phase |
| --- | --- | --- | --- |
| F01 | Critical | Governance arrives after execution | P2 |
| F02 | Critical | Pattern matching cannot safely classify shell behavior | P3 |
| F03 | Critical | The packet protocol is forgeable | P5 |
| F04 | High | The embedded inspector conflicts with the secret policy | P6 |
| F05 | High | Load can disable the emergency stop | P3 |
| F06 | High | Cancellation is overbroad and incomplete | P3 |
| F07 | High | Approval has a time-of-check/time-of-use gap | P2, P4 |
| F08 | High | Branch-name ownership is bypassable | P4 |
| F09 | High | Skill indexing creates a prompt supply-chain path | P8 |
| F10 | High | Deleted indexed data may remain recoverable | P7 |
| F11 | Medium | Compression can hide safety-critical evidence | P9 |
| F12 | Medium | Audit integrity is overstated | P2, P7, P11 |

## Accepted Controls

### F01: Governance Before Execution

**Status:** `[x] ACCEPTED`<br>
**Status recorded:** `2026-07-31T01:52:46-04:00`

- **Failure:** A renderer, agent, test helper, or developer path can spawn a
  process before policy and audit controls exist.
- **Required control:** All execution passes through one deny-by-default broker.
  A normalized intent must receive a short-lived, single-use grant bound to its
  digest and policy version. Authorization is durably recorded before spawn.
- **Proof gate:** Policy, audit, or grant-store failure starts no process;
  direct process-spawn imports outside the broker fail architecture checks.

### F02: Typed Operations and Execution Containment

**Status:** `[x] ACCEPTED`<br>
**Status recorded:** `2026-07-31T01:52:46-04:00`

- **Failure:** Harmless-looking commands can invoke repository-controlled
  scripts, shells, interpreters, hooks, environment overrides, or network
  behavior that pattern matching cannot predict.
- **Required control:** Use versioned typed operations, exact executable and
  argument schemas, canonical working directories, sanitized environments,
  declared capabilities, executable identity checks, and `shell: false`.
  Arbitrary repository code runs only in the approved isolation backend.
- **Proof gate:** Wrapper, interpreter, hook, environment, endpoint, and
  executable-substitution attacks fail without side effects.

### F03: Authenticated Out-of-Band Packet Transport

**Status:** `[x] ACCEPTED`<br>
**Status recorded:** `2026-07-31T01:52:46-04:00`

- **Failure:** Untrusted stdout can print a `[CODEX PACKET]` marker and be
  mistaken for a control message.
- **Required control:** Separate control messages from logs with framed,
  versioned, size-bounded messages carrying session identity, sequence,
  provenance, nonce, and authentication. Stdout and stderr remain data.
- **Proof gate:** Marker injection, malformed lengths, replay, reordering,
  oversized payloads, and invalid authentication never produce a packet.

### F04: Secret-Safe Inspector Isolation

**Status:** `[x] ACCEPTED`<br>
**Status recorded:** `2026-07-31T01:52:46-04:00`

- **Failure:** Browser inspection naturally encounters cookies, authorization
  headers, storage, personal data, and hostile remote content.
- **Required control:** Use a dedicated test profile and isolated browser
  partition, sandboxed `WebContentsView`, restricted navigation, sender
  validation, and a CDP broker that emits only allowlisted, redacted evidence.
  Raw secrets never reach the HUD renderer, prompt, packet, log, or database.
- **Proof gate:** Secret canaries in headers, cookies, storage, bodies, and DOM
  never cross the evidence boundary; renderer compromise cannot access them.

### F05: Independent Emergency Stop

**Status:** `[x] ACCEPTED`<br>
**Status recorded:** `2026-07-31T01:52:46-04:00`

- **Failure:** Synchronous persistence, output floods, parsing, or image work can
  block the event loop responsible for the emergency stop.
- **Required control:** Move heavy work to bounded workers, enforce stream
  backpressure, reserve a priority control path, and operate an independent
  watchdog capable of stopping owned execution capsules.
- **Proof gate:** CPU, database, worker, renderer, and stdout saturation cannot
  prevent bounded stop acknowledgement and termination.

### F06: Scoped Resource-Ownership Cancellation

**Status:** `[x] ACCEPTED`<br>
**Status recorded:** `2026-07-31T01:52:46-04:00`

- **Failure:** Killing one PID misses detached descendants, while broad process
  matching can terminate user-owned applications; PID reuse can target the
  wrong process.
- **Required control:** Register immutable execution capsules and process
  identities, use scoped groups or disposable isolation units, deny detachment,
  and apply TERM-to-KILL escalation with post-stop verification.
- **Proof gate:** Grandchildren, double-fork attempts, PID reuse, crashes, and
  repeated cancellation leave no owned process and affect no unrelated process.

### F07: Approval Bound to Immutable State

**Status:** `[x] ACCEPTED`<br>
**Status recorded:** `2026-07-31T01:52:46-04:00`

- **Failure:** Files, refs, symlinks, executables, accounts, endpoints, or policy
  can change between display and execution.
- **Required control:** Approve one canonical action-plan digest containing exact
  target identities, capabilities, preconditions, expected versions, and expiry.
  Revalidate using stable handles or compare-and-swap before a one-use grant.
- **Proof gate:** Any post-approval mutation, replay, timeout, restart, account
  change, or policy change makes the plan stale and prevents execution.

### F08: Workspace Leases and Brokered Git

**Status:** `[x] ACCEPTED`<br>
**Status recorded:** `2026-07-31T01:52:46-04:00`

- **Failure:** Branch prefixes do not prevent detached HEAD, cross-worktree
  writes, Git environment overrides, direct ref changes, path escape, or a push
  from a topic branch directly to `main`.
- **Required control:** Issue owner-controlled workspace leases bound to exact
  repository, worktree, branch, base SHA, and writable paths. Use isolated
  worktrees, a sanitized Git broker, expected-old-SHA updates, and remote rules.
- **Proof gate:** Branch spoofing, refspec substitution, hooks, aliases, symlinks,
  nested repositories, direct ref writes, and concurrent-owner conflicts fail.

### F09: Quarantined and Pinned Skill Supply Chain

**Status:** `[x] ACCEPTED`<br>
**Status recorded:** `2026-07-31T01:52:46-04:00`

- **Failure:** Repository-controlled skill descriptions, instructions, scripts,
  or references can become cross-agent guidance merely by appearing in a watched
  directory and can change after indexing.
- **Required control:** Treat watch events only as rescan hints. Quarantine,
  validate, secret-scan, review, and content-address complete skill bundles.
  Invoke only approved digests; skill authority can only narrow capabilities.
- **Proof gate:** Malicious metadata, path escape, replacement, dependency drift,
  name collision, parser abuse, draft propagation, and capability escalation fail.

### F10: Preventive Data Minimization and Verified Deletion

**Status:** `[x] ACCEPTED`<br>
**Status recorded:** `2026-07-31T01:52:46-04:00`

- **Failure:** SQL deletion can leave terms in FTS structures, old pages in WAL
  or journals, and copies in caches, artifacts, exports, or backups.
- **Required control:** Reject prohibited data before persistence. Index only
  sanitized allowlisted fields. Use immediate query exclusion, transactional
  source and FTS removal, secure-delete settings, verified WAL truncation,
  retention sweeps, managed-copy cleanup, and honest deletion receipts.
- **Proof gate:** Synthetic canaries disappear from every managed store across
  blocked readers, crashes, restarts, backup failure, and retention expiry.

### F11: Canonical Evidence Before Lossy Summaries

**Status:** `[x] ACCEPTED`<br>
**Status recorded:** `2026-07-31T01:52:46-04:00`

- **Failure:** pHash can hide a small critical visual change; AST or log pruning
  can omit side effects, parser errors, configuration, or causal context.
- **Required control:** Capture bounded canonical sanitized evidence first.
  Derived summaries identify their source digest, transformer, parameters,
  coverage, and omissions. Lossy artifacts cannot authorize safety decisions.
- **Proof gate:** Critical visual and code fixtures retain exact evidence;
  unsupported or erroneous parsing falls back to lossless deterministic chunks.

### F12: Tamper-Evident Audit Journal

**Status:** `[x] ACCEPTED`<br>
**Status recorded:** `2026-07-31T01:52:46-04:00`

- **Failure:** Timestamps and signed labels do not detect deletion, reordering,
  suffix truncation, rollback, forked histories, false claims, or crash gaps.
- **Required control:** Serialize sanitized events through one writer with
  monotonic sequence numbers, deterministic encoding, hash chaining, explicit
  provenance classes, hardware-protected signed checkpoints, and external head
  receipts. Describe the result as tamper-evident within its threat model.
- **Proof gate:** Independent verification detects mutation, deletion, reorder,
  truncation covered by an anchor, rollback, fork, key substitution, and crash
  gaps while reporting the unanchored limitation window.

## Change Rule

An accepted control is not silently rewritten. A material change requires an
owner-approved ADR and a new register entry stating whether the earlier control
is amended, superseded, or rejected.

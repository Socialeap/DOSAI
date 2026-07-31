# ADR 0003: Execution Isolation, Cancellation, and Watchdog

- **Status:** Accepted
- **Date:** 2026-07-31
- **Status updated:** 2026-07-31T02:56:41-04:00
- **Decision owner:** Repository owner
- **Related controls:** F02, F05, F06
- **Related plan phase:** P3

## Context

Repository-controlled scripts may perform arbitrary computation, detach
descendants, exhaust resources, or inherit ambient authority. A PID or process
group alone is not a complete ownership boundary. `shell: false` prevents shell
parsing but does not make an interpreter, package manager, build tool, compiler,
test runner, hook, plugin, or repository configuration trustworthy.

## Decision

### Execution Classes

- Permit host execution only through fixed typed handlers using executables whose
  identity is pinned in the action plan and revalidated immediately before use.
  Host handlers use `shell: false`, fixed argument schemas, sanitized
  environments, canonical directories, and declared limits.
- A host handler must not load or execute repository-controlled scripts,
  configuration, startup files, aliases, plugins, hooks, dynamic libraries, or
  executable search paths. If it can, classify the operation as arbitrary
  repository code even when its label is `test`, `build`, or `read`.
- Run arbitrary repository code only in an approved disposable isolation backend.
  Select that backend in a subordinate ADR and prove its enforcement contract
  before enabling this operation class. A process group, child-process tree, or
  container label alone does not satisfy this requirement.
- Do not treat a shared user terminal or browser session as an execution capsule.

### Isolation Contract

The selected backend must provide all of the following or the operation remains
unavailable:

- A fresh execution identity and a clean, attested configuration for each capsule.
- No access to the user home, other repositories, host credentials, browser or
  application session state, signing keys, credential agents, host sockets,
  clipboard, unapproved devices, or ambient host services.
- Only declared mounts, including the exact leased worktree and approved caches,
  each with an explicit read-only or read-write mode.
- Network denied by default. A granted network capability is restricted to the
  declared destinations and lifetime and does not convey ambient credentials.
- Enforced CPU, memory, process, file, output-byte, disk, wall-time, and queue
  limits that cannot be raised by code inside the capsule.
- Atomic termination or destruction of the complete isolation unit, followed by
  verification or an explicit uncertain-cleanup state.

General-purpose credentials are never injected into arbitrary repository code.
Any future credentialed workflow requires a separately approved broker design
that exposes only its typed operation, not the credential value.

### Capsule Ownership

- Persist an immutable capsule record before launch. Bind it to a random capsule
  identifier, supervisor instance and generation, operation and grant digests,
  executable identity, isolation-unit identity, process start identity, declared
  mounts, network capability, resource limits, and cleanup deadline.
- Use a finite state machine such as `REGISTERED`, `STARTING`, `RUNNING`,
  `STOPPING`, `STOPPED`, `FAILED`, and `QUARANTINED`. Only the supervisor and
  watchdog may advance ownership state.
- Track output and resource handles as capsule-owned resources. OS PIDs are only
  observations and are never sufficient ownership proof because they can be
  reused.
- Deny unregistered child authority and detachment. Host handlers that cannot
  prove this property are moved to the isolation backend.
- Reconcile nonterminal records and orphaned isolation units at application
  startup before authorizing any new effect.

### Cancellation Protocol

1. Atomically move the capsule to `STOPPING` and revoke its ability to start
   children, extend capabilities, or obtain new brokered effects.
2. Close or block new input and network access where the backend supports it.
3. Request graceful termination of the complete owned unit and wait only for a
   fixed grace period.
4. Force termination or destroy the complete isolation unit after that period.
5. Verify that no owned process, mount, socket, temporary file, lease, or brokered
   resource remains.
6. Record `STOPPED` only after verification. Record `QUARANTINED` when cleanup is
   uncertain, block reuse of affected resources, and require reconciliation.

Cancellation is idempotent. Concurrent or repeated requests converge on the same
terminal result. A stop request names an authenticated capsule record, never a
process name, repository path, caller-supplied process tree, or unverified PID.

### Independent Watchdog

- Run a minimal watchdog and reserved priority control path outside the renderer,
  Electron main event loop, general persistence and audit paths, and
  heavy-computation or output workers.
- Expose only a narrow authenticated reduce-authority API: inspect registered
  capsule state, stop one exact capsule, or stop all DOSAI-owned capsules. The
  watchdog cannot launch work or target arbitrary user processes.
- Keep enough ownership and generation data outside the main coordinator to stop
  or reconcile capsules after a renderer, main-process, or persistence crash.
- Start emergency cancellation without waiting for audit or persistence. Record
  the event or an explicit evidence gap during later reconciliation; this
  exception cannot authorize a new effect.
- Isolate the stop queue and acknowledgement path from normal output flow. Apply
  bounded buffering and explicit loss markers so output floods cannot block
  cancellation.

## Consequences

Some developer commands will remain unavailable until a suitable isolation
backend is selected and independently proven. Startup, packaging, signing, and
crash recovery become more complex, but process ownership and emergency behavior
become testable. A capsule with uncertain cleanup blocks affected resources
rather than reporting false success.

A local administrator, a failed operating-system kernel, or total machine
resource starvation can still defeat a local watchdog. DOSAI must report this as
a local assurance limit and must not claim availability beyond the tested bound.

## Alternatives Rejected

- Direct `child_process` use throughout main-process code bypasses governance.
- Killing all child processes is both overbroad and incomplete.
- Process groups alone do not contain double-forked or hostile repository code.
- A timeout without ownership verification can leave descendants and resources.
- A renderer hotkey alone is unavailable when the UI or main loop stalls.
- A watchdog that accepts caller-supplied PIDs can terminate unrelated software.

## Evidence Required

P3 must test wrappers, interpreters, hooks, plugins, configuration loading,
executable substitution, environment poisoning, mount and path escape, credential
and host-socket access, denied and allowed network behavior, descendants,
double-fork attempts, PID reuse, output floods, CPU and memory load, stop during
spawn, main and persistence crashes, stale registry records, orphan recovery,
repeated cancellation, spoofed watchdog requests, and cleanup uncertainty.

Evidence must show bounded stop acknowledgement and complete owned-unit teardown
while preserving unrelated user processes and while audit, persistence, normal
output handling, or the Electron main loop is unavailable. Arbitrary repository
execution remains `UNVERIFIED` until the selected isolation backend passes this
suite in the packaged macOS application.

## Revisit Conditions

Revisit when macOS exposes a stronger native containment primitive or the chosen
virtualization backend cannot meet performance, signing, network-control, or
cleanup requirements. Changing the isolation backend requires a new or
superseding ADR and renewed adversarial evidence.

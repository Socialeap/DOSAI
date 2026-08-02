# ADR 0005: Workspace Leases and Git Broker

- **Status:** Accepted
- **Date:** 2026-07-31
- **Status updated:** 2026-07-31T03:08:45-04:00
- **Decision owner:** Repository owner
- **Related controls:** F07, F08
- **Related plan phases:** P4, P10

## Context

Branch names are mutable labels, not authorization. Linked worktrees share Git
state, and local controls alone cannot protect a remote default branch. Git can
also execute repository-controlled hooks, filters, helpers, configuration, and
transport programs, so invoking a trusted Git binary is not sufficient by itself.

## Decision

### Lease Authority

- Keep lease authority in the trusted policy and Git services. An agent or
  renderer may receive an opaque lease identifier and display metadata but never
  a reusable bearer object that can mint or widen authority.
- Bind each lease to a random identifier and fencing generation; actor, session,
  task, and policy identities; exact local repository, Git common-directory, and
  worktree filesystem identities; Git object format; exact remote provider and
  immutable repository identity; direct full topic-branch ref; full base and
  expected local and remote commit identifiers; writable path and operation
  capabilities; credential scope; issue, expiry, and maximum lifetime; and
  cleanup policy.
- Verify that every commit identifier has the repository's full required length,
  identifies a commit object, and satisfies the lease's approved reachability
  rule. Reject symbolic, abbreviated, replace-ref, ambiguous, or unsupported
  repository states.
- Use an atomic lease registry and finite states such as `ISSUED`, `ACTIVE`,
  `QUIESCING`, `EXPIRED`, `REVOKED`, `QUARANTINED`, and `RELEASED`. Only the
  current generation can mutate files or refs. Expiry, revocation, policy change,
  actor-session end, or restart revokes active grants and requires revalidation.
- Reject full-ref conflicts and canonical path-scope overlap across active writers,
  including macOS case-folding and Unicode-normalization collisions. Branch
  prefixes remain attribution labels only.

### Workspace Containment

- Create one broker-owned worktree in a new random path under a managed root for
  each lease. Refuse pre-existing, linked, aliased, or unexpectedly mounted paths.
- Never expose the shared main worktree, Git common directory, object store, ref
  storage, worktree administrative files, sockets, or lock files as writable to
  an agent or repository process. Repository code receives only the declared
  content mount through the isolation contract in ADR 0003; Git metadata is
  absent or non-authoritative there.
- Permit Git metadata and ref mutations only in the Git broker. Direct `git`,
  filesystem, library, or lock-file access from an agent does not gain authority.
- Resolve writable paths from a stable worktree directory identity, traverse each
  component without following links, and revalidate identity at use. Treat a
  symlink as link content and never follow its target for authority. Reject hard
  links, special files, traversal, mount crossing, case or Unicode collisions,
  and unexpected nested repositories. Submodules and Git LFS remain unavailable
  until separately typed and proven.
- Require both source and destination paths of a create, delete, rename, or
  case-only rename to be in scope. Apply file count, type, mode, byte, disk, and
  operation limits.
- Quiesce capsule and file writes before creating an approval or commit snapshot.
  Build effects from an immutable manifest of path, file type, mode, content
  identity, and deletion state rather than rereading previously approved paths.
- On crash, expiry, or release, preserve and quarantine uncommitted work instead
  of deleting it automatically. Startup reconciliation must identify orphaned
  worktrees, locks, leases, and ref outcomes before new mutations.

### Typed Local Git Broker

- Expose only registered operations such as inspect, create leased topic ref and
  worktree, snapshot change set, create commit, advance leased ref, fetch approved
  remote state, push leased ref, and release or quarantine. Do not expose an
  arbitrary Git subcommand, argument vector, refspec, revision expression, pathspec,
  configuration entry, or environment field.
- Use a pinned and verified Git implementation through fixed plumbing operations.
  Supply an environment and configuration allowlist; disable system, user, and
  repository-controlled hooks, aliases, includes, filters, text conversion,
  external diff and merge drivers, filesystem monitors, pagers, editors, signing
  programs, credential helpers, alternate object directories, URL rewriting, and
  unapproved transport protocols. A repository feature that needs one of these
  receives a separate typed handler or remains unavailable.
- Ignore remote nicknames and repository-supplied URLs. Resolve the local and
  remote targets from the lease's canonical identities and fixed approved
  endpoint. Broker credentials never appear in arguments, environment, output,
  repository processes, or agent-visible storage.
- For a commit mutation, atomically fence the lease and ref, quiesce writers,
  revalidate all identities and preconditions, create and policy-scan the immutable
  scoped manifest, reject prohibited data, and build blobs, tree, and commit from
  that manifest with the exact expected parent. Hooks and content filters do not
  run. The broker then revalidates the lease and advances only the exact full ref
  with an expected-old-object compare-and-swap.
- Treat author and committer labels as attribution, not authentication. The audit
  journal binds the actor, lease, operation plan, manifest digest, parent, commit,
  and ref result using its own trusted provenance.
- Deny force pushes, destructive resets, rebases of shared work, direct protected-
  ref updates, tags, notes, replace refs, arbitrary namespaces, branch deletion,
  and local or remote merge through agent automation while `SECURITY.md` prohibits
  them. No approval grant can override a Black-tier or security-policy denial.

### Remote Mutation and Pull Requests

- Bind remote operations to the provider's immutable repository identifier,
  organization or owner, environment, endpoint, account, credential scope, exact
  topic ref, protected base ref, expected remote object, and policy version. A
  matching repository name or `origin` URL is insufficient.
- Push only the exact leased commit to the exact leased topic ref. Revalidate the
  remote ref immediately before use, require a normal fast-forward update, never
  add a force marker, and never accept a caller-provided refspec. After a timeout
  or ambiguous response, read and reconcile the exact remote ref before deciding
  success, conflict, or safe retry.
- Treat fetched commits, trees, configuration, pull-request text, checks, and API
  responses as bounded untrusted input. Import through the execution and data
  boundaries and do not execute repository features during inspection.
- Create pull requests only through a typed operation bound to exact head and base
  repository identities and refs. Agent identities may create a topic branch and
  draft pull request but cannot approve, merge, administer rules, bypass checks,
  dismiss reviews, or mutate protected refs.
- Verify remote rulesets and effective credential permissions before the first
  mutation and on a defined cadence. Require pull requests, required checks and
  independent review, stale-review dismissal, protected-ref deletion and force-
  push denial, and no agent bypass path.

These controls govern DOSAI-managed local workspaces and brokered remote actions.
They cannot prevent a repository owner, administrator, independent local tool, or
cloud agent operating outside DOSAI from changing state. Such changes invalidate
preconditions and must be detected and reconciled rather than described as
prevented.

## Consequences

Worktree setup, immutable snapshots, quarantine, remote protection checks, and
reconciliation add lifecycle work. Some Git features remain unavailable because
they can execute repository code or widen network and credential authority. The
main worktree stays stable, while local fencing and remote controls jointly
enforce DOSAI-managed ownership.

## Alternatives Rejected

- `codex/` and `claude/` prefixes remain useful attribution but not authority.
- A worktree without protection of shared Git refs remains incomplete.
- Client-side checks cannot replace server-side default-branch rules.
- Git's lock files do not enforce DOSAI actor, path, or policy ownership.
- Validating a path and later passing the string to Git leaves a replacement race.
- A general `git` command with sanitized `PATH` can still invoke repository
  configuration, filters, hooks, helpers, or transports.

## Evidence Required

P4 must test detached and unborn states, symbolic and abbreviated refs, replace
refs, object-format mismatch, malicious Git environment and configuration,
includes, hooks, aliases, filters, text conversion, helpers, URL rewriting,
alternate object directories, unapproved protocols, symlinks, hard links,
traversal, mount crossing, case and Unicode collisions, nested repositories,
submodules, path replacement races, direct ref and lock writes, lease expiry and
generation replay, overlapping owners, disk exhaustion, broker and app crashes,
orphan recovery, local-ref races, remote-ref races, protection drift, credential
substitution, caller refspecs, `HEAD:main`, and ambiguous push responses.

Evidence must prove that commits contain exactly the approved immutable manifest,
only the leased full ref can advance from its expected object, uncertain remote
outcomes reconcile safely, prohibited data does not enter a new object, and main-
worktree sentinels, unrelated leases, protected refs, and unrelated repositories
remain unchanged. P10 must repeat the topic-branch and draft-pull-request flow
against a dedicated non-production repository with effective server rules and
least-privilege identities verified from a clean state.

## Revisit Conditions

Revisit if the repository host provides stronger scoped credentials or native
per-path push controls that reduce local broker complexity. Supporting submodules,
Git LFS, commit signing, additional providers, merge automation, or a different
Git implementation requires a new or superseding decision and adversarial proof.

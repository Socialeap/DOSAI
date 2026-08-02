# ADR 0009: Reviewed Skill-Bundle Supply Chain

- **Status:** Accepted
- **Date:** 2026-07-31
- **Status updated:** 2026-07-31T12:11:32-04:00
- **Decision owner:** Repository owner
- **Related control:** F09
- **Related plan phase:** P8

## Context

Skill names and descriptions influence agent selection, bodies provide procedural
instructions, and bundles may contain executable scripts. Repository write access
must not automatically publish cross-agent authority. A filesystem watcher is an
observation mechanism, not an enforcement boundary, if the agent platform can
discover the same candidate directory before DOSAI validates it.

## Decision

### Discovery Isolation

- Use a dedicated proposal inbox that is not a native Codex, Claude, or other
  agent skill-discovery root. Agent workspaces may submit candidates only there.
  Native platform skill roots exposed to DOSAI-managed sessions are broker-owned,
  read-only active views containing approved bundles only.
- Launch DOSAI-managed agent sessions with dedicated skill homes and explicit
  discovery configuration that excludes personal, repository, global, plugin,
  and other ambient roots unless those roots are separately approved. Deny agent
  writes to the active views through workspace leases and execution mounts.
- If an agent platform cannot disable or isolate ambient discovery, mark managed
  skill publication unsupported for that platform. Do not claim that a watcher
  can race or override native ingestion.
- Treat filesystem watch events only as untrusted hints. Reconcile complete
  configured inbox roots at startup, periodically, after event bursts, and before
  review. Bound and debounce event processing outside the Electron main loop;
  dropped, coalesced, reordered, or repeated events cannot publish content.
- Open each configured root by stable filesystem identity and reject root
  replacement, links, mount changes, traversal, and unowned paths. The broker's
  quarantine and active stores are outside all watched proposal roots to prevent
  recursive ingestion.

These controls govern DOSAI-managed sessions. They cannot prevent an independent
agent, editor, plugin, or cloud workspace operating outside DOSAI from reading an
unapproved repository or personal skill directory.

### Pre-Admission Snapshot

- Use states such as `DISCOVERED`, `SCANNING`, `QUARANTINED`, `VALIDATING`,
  `REVIEW_PENDING`, `APPROVED`, `ACTIVE`, `REVOKED`, `REJECTED`, and
  `QUARANTINED_FAILURE`. State and generation changes are atomic and only the
  broker may publish or revoke.
- Before creating any broker-owned persistent copy, enumerate and read a strictly
  bounded candidate into memory through descriptor-relative, no-follow traversal.
  Reject unknown or changing roots, links, hard links, mount crossing, special or
  sparse files, unexpected extended attributes or resource forks, unsupported
  binary or archive formats, path depth, file count, and byte-limit violations.
- Run prohibited-data and secret admission checks before hashing, indexing,
  previewing, logging, or copying candidate bytes. A suspected secret stops the
  scan and records only a sanitized reason and safe source identity; DOSAI does
  not persist, hash, display, or duplicate the suspected value.
- Bind the in-memory snapshot to file path, type, mode, size, and source identity
  observations before and after reading. Any concurrent change discards the
  complete snapshot and retries only within a fixed bound.
- After admission succeeds, copy the exact memory snapshot into a new owner-only
  quarantine object, then rehash and compare it. Never review or publish bytes by
  reopening the mutable proposal source.

### Validation and Complete Manifest

- Define versioned platform-adapter schemas. For the Codex adapter, validate the
  required `SKILL.md`, strict YAML frontmatter, folder and skill naming, body, and
  optional `agents/openai.yaml`, `scripts/`, `references/`, and `assets/` content.
  Other platforms receive separate schemas rather than guessed compatibility.
- Parse YAML and metadata with a strict bounded parser that rejects duplicate keys,
  aliases, anchors, merge keys, custom tags, unknown fields, invalid UTF-8,
  control and bidirectional characters in identifiers, ambiguous normalization,
  case-fold collisions, and parser fallback. Folder, declared, display, and
  internal names must resolve without collision in an explicit namespace.
- Treat Markdown, HTML, images, fonts, documents, templates, source code, scripts,
  configuration, and UI metadata as active or adversarial formats according to
  their parsers. Render review previews inertly with no scripts, macros, external
  fetches, embedded objects, custom fonts, or privileged URL handling.
- Build a deterministic manifest that covers every relative path, file type, mode,
  byte length, content digest, role, parser and validator version, bundle schema,
  platform adapter, source provenance, declared capability and operation maxima,
  supported environments, and complete dependency graph. Unexpected files are a
  validation error, not silently ignored content.
- Resolve skill and runtime dependencies as an acyclic closure of exact immutable
  digests and versions. Reject unpinned packages, mutable URLs, undeclared tools,
  dynamic downloads, implicit host modules, package installation at invocation,
  and references outside the bundle. A remote resource is either vendored and
  digested or fetched later as separately governed untrusted data; approval of a
  URL does not approve its future bytes.
- Validate scripts and active assets with pinned scanners and parsers, but do not
  represent static analysis or a successful test as proof of safety. Unknown file
  types, parser failures, decompression, resource exhaustion, or incomplete
  dependency closure fail closed.

### Review, Approval, and Publication

- Show the owner an inert canonical review containing the complete manifest,
  source provenance, all metadata and instructions, exact file and dependency
  diffs, declared capabilities and operations, validation versions and findings,
  risk tier, target platforms, activation scope, expiry, and known limitations.
- Skill activation is never Green. Yellow may cover an owner-scoped bundle with
  no scripts, active assets, external dependencies, network, credentials, or
  cross-agent publication. Scripts, external resources, broad or cross-agent
  scope, or any sensitive capability require fresh Red approval. Prohibited data,
  self-approval, policy bypass, or capability expansion is Black and cannot be
  approved.
- Bind approval to the complete bundle and dependency digests, manifest and
  adapter schemas, validator and policy versions, owner and source identities,
  declared capability ceiling, exact agents, repositories, tasks and environments,
  activation generation, issue time, expiry, and review evidence. Any change or
  policy mismatch creates a new `QUARANTINED` version.
- Separate approval from activation. Publish only the exact approved quarantine
  object into immutable content-addressed broker storage using atomic creation,
  verify it after publication, and expose target-specific metadata only through
  broker-generated read-only active views.
- Build the agent-visible index exclusively from `ACTIVE` broker objects. Draft,
  rejected, revoked, source, and quarantine names and descriptions never enter an
  agent prompt, search result, manifest, recommendation, or trigger list.
- Record lifecycle transitions and digests in the audit journal without copying
  skill instructions or prohibited content into audit payloads.

### Invocation and Authority

- Resolve a name or trigger to one scoped active immutable ID and digest, then bind
  the invocation to that digest, activation generation, actor and task, workspace
  lease, platform adapter, policy version, dependency closure, and expiry. Recheck
  all bindings immediately before metadata load, body load, resource access,
  script launch, and each requested effect.
- Treat approved skill prose as reviewed procedural guidance, not system policy,
  owner approval, a grant, trusted observation, or permission to override higher
  instruction and safety boundaries. External text embedded in a skill remains
  labeled data.
- Use progressive disclosure: inject only bounded approved metadata initially,
  load the exact body only when selected, and provide only explicitly requested
  manifested resources. Apply context and token limits so an approved bundle
  cannot crowd out policy or trusted instructions.
- Compute effective capability as the intersection of actor, task, workspace,
  operation, owner activation, dependency, and policy allowances. A skill and all
  of its dependencies can only narrow this set.
- Never execute a script from the mutable proposal or active-view path. Copy the
  exact manifested bytes into an ADR 0003 execution capsule with a pinned runtime,
  fixed argument schema, sanitized environment, no ambient credentials or network,
  and the approved resource mounts and limits. Script output remains untrusted.
- Route every file, process, Git, browser, packet, persistence, or external effect
  requested by skill prose or code through its normal ADR 0002 typed operation,
  approval, grant, broker, audit, and reconciliation path. Skill invocation alone
  is never an effect grant.

### Update, Revocation, and Cross-Agent Publication

- Do not update an active bundle in place. A source change creates a new candidate
  and leaves the old immutable version active only while its approval remains
  valid. Rollback selects a previously approved, unexpired and unrevoked digest.
- Revocation atomically increments the activation generation, removes metadata
  from active views and caches, denies queued and future loads and grants, revokes
  dependent bundles transitively, and cancels running scripts through their owned
  capsules. Startup reconciles active storage, indexes, dependency state, and
  revocations before exposing metadata.
- Skill text already loaded into an agent context and bytes already delivered to
  a remote agent cannot be recalled. Revocation marks those sessions stale,
  removes all further skill-derived authority, and requires restart or explicit
  owner disposition before new effects. Completed effects are not undone.
- Cross-agent publication is a separate typed effect. Generate a target-specific
  adapter artifact from the canonical approved bundle, digest and validate the
  transformation, review any semantic difference, and publish only to the exact
  broker-owned target root or approved remote interface. Copying a source bundle
  directly between native platform directories is prohibited.

## Consequences

Agent-generated skills are proposals until reviewed, so cross-agent learning is
slower but cannot silently become a prompt or executable supply-chain path in a
DOSAI-managed session. Broker-owned homes, complete snapshots, dependency closure,
target adapters, and revocation add storage and lifecycle complexity. Some native
platform convenience and ambient personal skills remain unavailable.

## Alternatives Rejected

- Directory location, branch name, Git author, or watch event does not prove trust.
- Static analysis alone cannot prove prose or scripts safe.
- Approval of `SKILL.md` alone does not cover referenced or executable resources.
- Watching a native auto-discovery directory after a file appears cannot prevent
  the agent from loading it first.
- Hashing files directly from a mutable source does not create an atomic bundle
  snapshot and can approve a mixture of versions.
- Secret scanning after disk quarantine has already created a prohibited copy.
- A digest of the top-level bundle without exact dependency closure permits drift.
- Removing a revoked name from an index cannot erase instructions already loaded
  into an active or remote agent context.

## Evidence Required

P8 must test native discovery bypass, ambient personal and repository roots,
proposal writes to active views, missed, coalesced, reordered and flooded watcher
events, root and file replacement, symlinks, hard links, mounts, sparse and special
files, extended attributes and resource forks, path depth, file and byte limits,
case and Unicode normalization collisions, invalid UTF-8 and bidirectional text,
duplicate YAML keys, aliases, custom tags and parser bombs, Markdown and HTML
active content, macro and font assets, archives, malformed binaries, changing
files during snapshot, pre-admission secret canaries, unknown types, unexpected
files, mutable URLs, hidden imports and tools, package installation, dependency
cycles and drift, digest substitution, approval replay, expired scope, stale
policy and validator versions, draft metadata propagation, cross-platform schema
confusion, active-store corruption, context flooding, direct script execution,
runtime downloads, network and credential access, capability expansion, revocation
during load and execution, transitive revocation, stale agent sessions, app crash,
startup reconciliation, rollback, and cross-agent transformation drift.

Evidence must prove that no candidate byte or metadata becomes agent-visible or
broker-persistent before admission, only exact active digests can load, execution
uses those exact bytes in isolation, all effects re-enter policy, source changes
cannot alter active content, and revocation blocks every controllable future path.
Tests must also demonstrate and disclose the non-recall limitation for already
loaded local and remote context.

## Revisit Conditions

Revisit if agent platforms define a signed skill-package standard with equivalent
complete-bundle provenance and invocation constraints. A new platform adapter,
schema, parser, file type, dependency mechanism, runtime, discovery root, remote
publisher, approval scope, or recall claim requires a versioned transition and
renewed bypass, parser, dependency, invocation, and revocation evidence.

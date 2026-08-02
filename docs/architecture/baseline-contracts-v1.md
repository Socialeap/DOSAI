# DOSAI Baseline Contracts v1

- **Status:** Accepted
- **Baseline version:** 1
- **Status updated:** 2026-07-31T14:25:05-04:00
- **Decision owner:** Repository owner
- **Related plan item:** P0.5

## Scope and Authority

This baseline defines the vocabulary and cross-component contracts that all
later DOSAI implementation phases use. It does not prove a capability, authorize
an effect, select a production credential, or activate an integration.

Accepted ADRs and `SECURITY.md` override this document. The authoritative product
specification defines intended behavior; this baseline defines the safe meanings
of shared machine fields and status claims. The live development plan remains the
authority for implementation order.

`MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, and `MAY` are normative. Unknown values,
versions, states, fields, or identities fail closed at authority boundaries.

## Schema Baseline

### Format and Versioning

- Use JSON Schema Draft 2020-12 for persisted, IPC, packet, audit, approval,
  grant, broker, and evidence contracts. The initial registry is
  `schema-registry-v1.json`; foundational machine schemas live under
  `schemas/v1/`.
- Every object crossing a trust boundary carries an exact `schema_id` and integer
  `schema_version`. Consumers accept only explicitly registered pairs. There is
  no closest-version fallback, implicit downgrade, or permissive unknown-field
  mode.
- Any validation change receives a new integer schema version. Old versions stay
  immutable while retained objects reference them. Compatibility adapters are
  explicit transforms with source and destination versions, bounded input, and
  tests; they cannot reinterpret an object in place.
- Parse UTF-8 with duplicate-key detection before constructing the application
  object. Reject duplicate keys, invalid encodings, forbidden control or
  bidirectional characters, excessive depth, size or collection counts, unknown
  properties, non-finite numbers, and negative zero.
- Use lower `snake_case` ASCII property names and uppercase ASCII enum values.
  Decision-relevant integers remain inside the JavaScript safe-integer range.
  Exact decimal, monetary, and larger integer values use normalized strings, not
  binary floating point.
- Use RFC 3339 UTC timestamps ending in `Z` for interchange. Timestamps do not
  establish order; journal, session, capture, and transport sequences do. Use
  integer milliseconds for durations and integer bytes for sizes.
- Generate opaque identifiers as CSPRNG-backed UUIDv4 values. Identifiers do not
  embed paths, users, content, host identifiers, or secrets and do not prove
  authorization or provenance.
- When a digest or signature requires canonical JSON, validate first and then
  apply RFC 8785 JCS, including verified errata behavior. The initial content
  digest is `SHA-256`; the algorithm is always encoded alongside the value. A
  digest identifies bytes and supports integrity checking but does not establish
  origin or truth.
- Derive TypeScript types and fixtures from the registered schemas. Handwritten
  duplicate interfaces cannot become a second wire contract. Boundary validators
  return typed safe errors and never pass partially validated objects onward.

### Common Envelope v1

Boundary objects include these fields unless a narrower accepted ADR explicitly
defines an authenticated binary frame outside this envelope:

| Field | Rule |
| --- | --- |
| `schema_id` | Exact registered URN such as `urn:dosai:schema:error-envelope:1`. |
| `schema_version` | Exact positive integer; version 1 for this baseline. |
| `message_id` | Opaque UUIDv4 unique to this immutable object. |
| `created_at` | RFC 3339 UTC observation or creation time; not ordering authority. |
| `producer` | Registered service or adapter identity, never display text supplied by content. |
| `producer_generation` | Decimal sequence string binding the producer lifecycle. |
| `trace_id` | Opaque UUIDv4 correlating one bounded workflow without granting authority. |
| `data_class` | One of `D1` through `D5`; `D0` cannot cross an admitted boundary. |

Authority-bearing schemas add exact actor, target, policy, operation, grant,
sequence, expiry, and provenance fields required by their accepted ADR. The
common envelope alone is never an authorization token.

### Schema Registry

| Schema ID stem | Owner phase | Purpose | Activation rule |
| --- | --- | --- | --- |
| `common` | P0 | Shared constrained types and envelope fields. | Defined in `schemas/v1/common.schema.json`. |
| `error-envelope` | P0-P1 | Safe failure and outcome reporting across boundaries. | Defined in `schemas/v1/error-envelope.schema.json`. |
| `capability-record` | P0-P11 | Evidence-backed support status for one actor and environment. | Defined in `schemas/v1/capability-record.schema.json`. |
| `operation` | P2 | Normalized typed intent before policy. | Exact operation subtype must exist before handler code. |
| `action-plan` | P2 | Immutable decision-relevant plan and predicted effects. | Must bind the complete operation and evidence requirements. |
| `policy-decision` | P2 | Tier, policy result, constraints, and reason codes. | Only the policy service may produce it. |
| `execution-grant` | P2 | Short-lived single-use effect authorization. | Only the grant service may produce it after durable prerequisites. |
| `audit-event` | P2 | Minimal ordered durable control record. | Only the audit service assigns sequence and acknowledgement. |
| `audit-checkpoint` | P2, P11 | Signed and externally anchorable journal head. | Requires selected algorithms, protected key, and verifier. |
| `workspace-lease` | P4 | Generation-fenced workspace and mutation scope. | Only the lease service may issue or revoke it. |
| `git-object-manifest` | P4 | Exact repository, worktree, ref, object, and path identities. | Produced by the typed Git broker from verified state. |
| `packet-frame` | P5 | Authenticated, sequenced, bounded control transport. | Used only on the protected ADR 0006 channel. |
| `browser-capture-plan` | P6 | Exact origin, frame, fields, masks, limits, and capture state. | Requires an approved origin-specific profile. |
| `persistence-record` | P7 | Admitted allowlisted record with lifecycle and expiry. | Only the persistence service may admit it. |
| `deletion-job` | P7 | Resumable per-copy deletion scope and checkpoints. | Must inventory all managed copies before completion. |
| `skill-bundle-manifest` | P8 | Complete immutable bundle and dependency closure. | Only admitted reviewed broker bytes may become active. |
| `evidence-manifest` | P9 | Exact canonical permitted bytes, chunks, provenance, and gaps. | Must precede every lossy derivation. |
| `derivation-record` | P9 | Source-bound transformer, coverage, loss, and output record. | Never carries approval or policy authority. |
| `evidence-report` | P0.6, P11 | Reproducible validation inputs, results, limitations, and artifacts. | Format and verifier are defined in P0.6. |

Reserved schema families have no runtime meaning until their owner phase adds an
exact registered schema, positive and negative fixtures, size limits, validator,
and import-boundary tests. A reserved name is not a capability claim.

## Error Taxonomy v1

### Categories and Codes

Error codes are stable uppercase identifiers in the form
`DOSAI_<CATEGORY>_<FOUR_DIGITS>`. A code is never reused with a different meaning.
Safe user text may improve without changing the code; behavior changes require a
new code.

`safe_message` is selected by trusted code from a versioned static catalog bound
to the error code. It contains no dynamic interpolation, caller text, target
value, path, URL, provider response, or exception message. Variable context is
represented only by separately allowlisted typed fields in a future versioned
error schema.

| Category | Meaning | Default retry disposition |
| --- | --- | --- |
| `SCHEMA` | Malformed, oversized, unknown, or unsupported contract. | `NEVER` until input or implementation changes. |
| `POLICY` | Policy denied the normalized plan. | `REPLAN_REQUIRED`. |
| `AUTHORIZATION` | Approval, capability envelope, or grant absent, stale, forged, or consumed. | `OWNER_ACTION` or `REPLAN_REQUIRED`. |
| `PRECONDITION` | Exact target, generation, version, or environment changed. | `REPLAN_REQUIRED`. |
| `IDENTITY` | Actor, process, resource, peer, origin, repository, or account identity failed. | `OWNER_ACTION`. |
| `CONFLICT` | Lease, writer, compare-and-swap, or ownership conflict. | `RECONCILE`. |
| `RESOURCE` | Bounded CPU, memory, disk, queue, descriptor, or size capacity unavailable. | `SAFE_SAME_PLAN` only after the recorded condition clears. |
| `TIMEOUT` | A bounded step exceeded its deadline. | `RECONCILE`; external outcome may be unknown. |
| `CANCELLED` | Owner, supervisor, or policy cancelled the operation. | `NEVER` without a new plan. |
| `INTEGRATION` | Approved external or platform interface failed or drifted. | `RECONCILE` or `OWNER_ACTION`. |
| `INTEGRITY` | Digest, signature, sequence, manifest, journal, or artifact verification failed. | `NEVER`; quarantine and reconcile. |
| `PERSISTENCE` | Durable admission, transaction, retention, backup, restore, or deletion failed. | `RECONCILE`. |
| `UNAVAILABLE` | Required trusted service or capability is unavailable. | `SAFE_SAME_PLAN` only when no decision-relevant state changed. |
| `INTERNAL` | Bounded unexpected implementation failure with no safe narrower category. | `RECONCILE`; new effects remain denied. |
| `UNKNOWN_OUTCOME` | An effect may have occurred but cannot yet be established. | `RECONCILE`; never blind retry. |

Every error envelope records a safe code and message, retry disposition,
`effect_state`, trace identity, producer generation, and time. `effect_state` is
one of `NO_EFFECT`, `COMMITTED`, `PARTIAL`, or `UNKNOWN`. An error does not claim
`NO_EFFECT` unless the responsible broker established that postcondition.

A retry disposition is guidance, not authorization. Every retry re-enters
normalization, policy, precondition, audit, approval, and grant handling. Even
`SAFE_SAME_PLAN` requires current identities and a fresh single-use grant; it is
forbidden when an external outcome or decision-relevant state is uncertain.

Raw commands, arguments, stack traces, paths, URLs, headers, bodies, environment
values, browser content, repository text, and provider responses are not error
metadata. They remain transient or separately admitted evidence. Unknown error
codes render as an unclassified safe failure and cannot trigger retry or an
effect.

## Autonomy Tier Vocabulary

| Tier | Machine value | Meaning |
| --- | --- | --- |
| Green | `GREEN` | Proven non-mutating typed operation; automatic policy authorization may occur. |
| Yellow | `YELLOW` | Effect is within an active owner-approved capability envelope and requires notification. |
| Red | `RED` | Fresh local owner approval is required for the exact immutable action plan. |
| Black | `BLACK` | Operation is prohibited and cannot receive approval or a grant. |

Unknown operations and classification failures use `BLACK` enforcement while
recording an error; they are not silently assigned a friendly tier. A minimum
tier is computed from operation, target, environment, capabilities, data class,
and integration state. Labels, agents, skills, and callers may only raise it.

## Capability Vocabulary v1

Capability support, evidence validity, runtime availability, and authorization
are separate axes. A supported capability may be unavailable now, and an
available tool is not necessarily supported or authorized.

Capability IDs use lowercase dotted names such as `browser.evidence_capture`.
They identify one bounded behavior, not a product area or generic tool. Each
record is scoped to an actor or adapter, platform profile, implementation and
dependency versions, environment class, constraints, and evidence set.

### Support State

| State | Meaning |
| --- | --- |
| `UNVERIFIED` | Default; no current accepted proof satisfies the claim. |
| `SUPPORTED` | Current reproducible evidence satisfies the complete contract without extra constraints beyond the declared platform profile. |
| `SUPPORTED_WITH_CONSTRAINTS` | Current evidence supports only the explicit recorded constraints and fallback. |
| `UNSUPPORTED` | The selected implementation or platform cannot satisfy the required contract. |

### Evidence State

| State | Meaning |
| --- | --- |
| `ABSENT` | No accepted proof exists. |
| `CURRENT` | Evidence matches all decision-relevant versions and constraints. |
| `STALE` | A relevant dependency, policy, environment, or contract changed; support returns to `UNVERIFIED`. |
| `INVALIDATED` | Evidence was disproved, corrupt, revoked, or based on a false premise; support returns to `UNVERIFIED`. |

### Runtime Availability

| State | Meaning |
| --- | --- |
| `UNKNOWN` | Availability has not been checked in the current generation. |
| `AVAILABLE` | Current health and preconditions permit a request to enter policy evaluation. |
| `DEGRADED` | A declared subset remains available with visible limitations. |
| `BLOCKED` | Owner action, policy, conflict, or reconciliation temporarily prevents use. |
| `UNAVAILABLE` | The component or dependency cannot currently provide the capability. |

Only owner-reviewed evidence may change support state. Health checks may change
availability but never support. Neither state grants authority; ADR 0002 policy,
approval, and single-use grant requirements still apply.

## Data Classes and Retention v1

### Data Classes

| Class | Definition | Admission and authority rule |
| --- | --- | --- |
| `D0` Prohibited | Secrets, credentials, cookies, tokens, private keys, auth/session material, production customer data, and unredacted sensitive personal data. | May be transiently encountered only by a boundary classifier to reject it. Never extract, display, hash, log, prompt, packet, persist, export, or derive. |
| `D1` Trusted control | Policy, grants, approvals, leases, key references, audit control envelopes, and trusted service state. | Only the owning trusted service creates or consumes it. Renderer and agents receive bounded display projections, never authority objects. |
| `D2` Canonical sanitized evidence | Exact permitted bounded code, terminal, browser, Git, or operation evidence after admission. | Immutable manifest, exact digest, provenance, purpose-bound access, and an explicit retention profile. |
| `D3` Derived evidence | AST, DOM delta, pHash, thumbnail, search index, compacted log, summary, or replay view. | Non-authoritative; complete source chain required. Retention and visibility cannot exceed canonical source authority. |
| `D4` Untrusted content | Repository, browser, terminal, packet payload, model output, skill draft, or provider response before admission. | Bound, quote, and classify. Memory-only by default; persist only an allowlisted sanitized object reclassified as D2 or D3. |
| `D5` Public operational metadata | Public app and schema versions, public keys, and non-sensitive support statements. | Integrity-protect and version; public does not mean caller-controlled or authoritative. |

### Retention Profiles

| Profile | Maximum retention | Initial uses |
| --- | --- | --- |
| `R0_NONE` | No persistence. | D0, rejected D4, raw browser/CDP/process bytes, credential-entry intervals. |
| `R1_TRANSIENT` | Operation lifetime, capped at 15 minutes. | Bounded worker buffers and unadmitted D4. References are released promptly; no memory-erasure claim is made. |
| `R2_EVIDENCE_SHORT` | 7 days. | Sanitized browser frames, DOM/accessibility captures, and managed review exports. |
| `R3_EVIDENCE_STANDARD` | 30 days. | Sanitized code patches, bounded terminal evidence, packet payloads, and timeline payloads. |
| `R4_QUARANTINE` | 7 days unless approved sooner. | Sanitized skill candidates and failed managed-copy migrations. Suspected D0 receives `R0_NONE`. |
| `R5_CONTROL_ACTIVE` | Active lifetime plus 30 days. | Leases, activation state, operation state, and non-secret grant state. Secret grant material expires immediately with the grant. |
| `R6_VERSIONED_CONFIG` | Active lifetime plus 365 days, or longer while referenced by a retained audit envelope. | Policies, schemas, approved capture profiles, adapters, and public verification metadata. |
| `R7_AUDIT_MINIMAL` | Indefinite until explicit owner trust-epoch reset or application removal. | Minimal content-free audit chain, decision, lifecycle tombstone, and checkpoint envelopes required for verification. |
| `R8_MANAGED_BACKUP` | 30 days maximum after creation. | Disabled until P7 defines encryption, inventory, restore deletion replay, and verification. |

D3 uses the shorter of its applicable profile and every source artifact's expiry.
Search indexes, thumbnails, caches, retry artifacts, and restored copies do not
receive independent extensions. Managed exports use `R2_EVIDENCE_SHORT` unless
the owner explicitly creates an unmanaged copy after a clear limitation notice.

Expiry is computed at admission from a durable time high-water mark. Expired
objects become immediately hidden and enter purge. Initial deletion objectives
are 15 minutes for cache and renderer eviction, 24 hours for active managed
stores, and the stated backup expiry for verified backup removal. Missing an
objective is a visible failure that reduces or stops new retention-bearing
ingestion. Retention can be shortened; an extension creates a new owner-approved
policy object and never revives deleted bytes.

## Platform Profile v1

The initial release profile is `MACOS_ARM64_V1`:

- Apple Silicon `arm64` only.
- macOS 15.0 or later, with the latest security update for that major version.
- No Intel, Rosetta, universal binary, Windows, Linux, or Mac App Store support
  claim in the initial profile.
- P1 selects an exact stable Electron release from an upstream-supported major,
  pins its full dependency lock and packaged runtime, and records Chromium, Node,
  V8, native module, and CDP versions. Development tooling uses an exact supported
  Node LTS version; the system Node installation is not a runtime dependency.
- Release proof covers the minimum OS and the current macOS major on physical
  Apple Silicon hardware. A higher upstream Electron minimum raises this floor;
  lowering or broadening it requires a new profile, ADR, packaged proof, and all
  security, native-module, helper, signing, entitlement, and recovery tests.

This floor is intentionally stricter than Electron v44's documented macOS 13
minimum. It limits the initial security and packaging matrix while covering the
current and immediately previous Apple macOS generations at baseline creation.

## Integration Surface Register v1

### States

- `APPROVED_FOR_LOCAL_PROOF`: may be tested locally under current security and
  phase controls; still `UNVERIFIED` until evidence passes.
- `APPROVED_FOR_IMPLEMENTATION`: may be implemented only in its planned phase and
  through its accepted broker boundary.
- `MANUAL_ONLY`: only the documented human-mediated fallback is approved.
- `DEFERRED`: no implementation or proof until the named prerequisite and owner
  decision.
- `PROHIBITED`: no approval path in this baseline.

### Register

| Surface | State | Approved boundary and purpose | Explicit exclusions |
| --- | --- | --- | --- |
| Local repository filesystem | `APPROVED_FOR_IMPLEMENTATION` | Packaged resources and owner-selected workspaces through component-specific descriptor-safe brokers in P1 and P4-P9. | No renderer, agent, arbitrary path, symlink-following, or ambient write authority. |
| Local process execution | `APPROVED_FOR_IMPLEMENTATION` | Typed handlers and owned P3 capsules with sanitized environment and exact executable identity. | No generic shell operation, inherited credentials, or unmanaged descendants. |
| Local Git | `APPROVED_FOR_IMPLEMENTATION` | Fixed typed Git plumbing through the P4 lease and Git broker. | No hooks, aliases, arbitrary refspecs, default-branch mutation, force push, or merge. |
| GitHub | `DEFERRED` | P10 may use documented Git protocol and official GitHub APIs with a dedicated least-privilege test identity and exact repository. | No owner impersonation, merge, production repository, default-branch mutation, undocumented API, or ambient desktop session. Patch export remains the fallback. |
| Local Codex adapter | `DEFERRED` | P5 and P10 may propose a documented process or API adapter using ADR 0006 transport and a dedicated session. | No parsing stdout as control, attaching to ambient Codex state, UI automation, or inherited personal credentials. Sanitized files and patches are the current fallback. |
| Claude-facing adapter | `MANUAL_ONLY` | Manifested sanitized file or reviewed GitHub handoff performed by the owner. | No authenticated UI automation, undocumented direct IPC, session reuse, or automatic model delivery. A documented API requires a later ADR and dedicated credential scope. |
| Browser inspection | `APPROVED_FOR_IMPLEMENTATION` | P6 dedicated ephemeral Electron `WebContentsView`, synthetic fixture or approved test origin, and origin-specific capture plan. | No personal profile, generic automation, arbitrary CDP, console/network bodies, downloads, or production account. |
| Local SQLite and FTS5 | `APPROVED_FOR_IMPLEMENTATION` | P7 persistence service with admitted fields, controlled queries, lifecycle, retention, and deletion. | No renderer/agent database handles, arbitrary SQL, raw packet/log indexing, or extensions. |
| macOS desktop observation or control | `DEFERRED` | A later ADR may define one narrow public API and entitlement set. User observation with a written checklist is the current fallback. | No Accessibility, Screen Recording, Apple Events, input synthesis, or control of unrelated applications in this baseline. |
| Independent audit anchor | `DEFERRED` | P2/P11 must select a separately administered append-only target and credential scope in a subordinate ADR. | No local-only service presented as independent and no event payload upload. |
| Stripe mocks | `APPROVED_FOR_LOCAL_PROOF` | Offline synthetic fixtures only. | No Stripe network or credential use. |
| Stripe Sandbox | `DEFERRED` | P10 requires a separate ADR, dedicated test account, endpoint denial proof, and owner approval. | No production-derived data or credentials. |
| Stripe Live and production systems | `PROHIBITED` | None. | No read, write, credential, deployment, financial, database, or infrastructure operation. |
| Telemetry, crash upload, and auto-update | `PROHIBITED` | None in the initial baseline. Local safe diagnostics remain bounded and retention-controlled. | No background upload, third-party analytics, remote crash body, update feed, or updater credential. |
| External URL opening and protocol handlers | `PROHIBITED` | Approved URLs may be shown as inert text. | No caller-controlled `shell.openExternal`, custom protocol execution, or remote-content launch authority. |

Network access is denied by default. Each future remote operation requires an
exact typed target, environment, endpoint class, account scope, data classes,
effect model, idempotency and reconciliation behavior, and owner-approved ADR.
An approved surface is not proof of support and never bypasses policy.

## Change and Completion Rules

- The repository owner accepts, rejects, or requests changes to this baseline.
  Acceptance changes the document and machine registry status together.
- Any schema, error, capability, data-class, retention, platform, or integration
  change that weakens a boundary requires an ADR. Additive domain schemas still
  require owner review through their implementation phase.
- P0.5 completes only when this baseline is accepted, the capability matrix uses
  its vocabulary and live-plan phase mapping, the discovery plan is marked as
  historical rationale, internal references validate, and no unresolved
  governing-document conflict remains.
- Encryption and key hierarchy, independent anchor provider, exact Electron and
  Node versions, domain schema bodies, integration credentials, and release
  distribution remain owned by their later phases. Their deferral is explicit
  and grants no runtime permission.

## References

- JSON Schema Draft 2020-12: <https://json-schema.org/draft/2020-12>
- JSON Canonicalization Scheme, RFC 8785:
  <https://www.rfc-editor.org/rfc/rfc8785.html>
- RFC 8785 verified errata: <https://www.rfc-editor.org/errata/rfc8785>
- Internet timestamps, RFC 3339: <https://www.rfc-editor.org/info/rfc3339/>
- UUIDs, RFC 9562: <https://www.rfc-editor.org/info/rfc9562/>
- Electron release support policy:
  <https://www.electronjs.org/docs/latest/tutorial/electron-timelines>
- Electron breaking changes and macOS support:
  <https://www.electronjs.org/docs/latest/breaking-changes/>
- Apple macOS update and compatibility guidance:
  <https://support.apple.com/en-la/108382>

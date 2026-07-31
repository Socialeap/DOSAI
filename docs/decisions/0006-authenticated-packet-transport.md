# ADR 0006: Authenticated Packet Transport

- **Status:** Accepted
- **Date:** 2026-07-31
- **Status updated:** 2026-07-31T03:13:40-04:00
- **Decision owner:** Repository owner
- **Related controls:** F03, F12
- **Related plan phase:** P5

## Context

The `[CODEX PACKET]` marker can appear in untrusted browser, repository, terminal,
or model text. In-band control framing over stdout is therefore forgeable. Even a
cryptographically valid packet proves control of one endpoint, not that its
payload is truthful, authorized, safe, or suitable for execution.

## Decision

### Channel Boundary

- Keep stdout and stderr permanently classified as untrusted data. A marker that
  looks like `[CODEX PACKET]` may be displayed as text but is never parsed as a
  packet, approval, provenance assertion, or operation request.
- Create a fresh local channel from the trusted supervisor for each integration
  process. Prefer anonymous unidirectional pipes or a socket pair without a
  filesystem name. If a named Unix socket is required, place it in a private
  owner-only runtime directory, create it without following links, verify peer
  credentials, and remove only the exact owned socket identity.
- Bind the endpoint to the supervisor generation and exact peer process start
  identity. Give the endpoint only to the intended integration process. Mark
  unrelated descriptors close-on-exec and explicitly omit the packet endpoint
  from every repository process, execution capsule, helper, renderer, and worker
  that does not implement the protocol.
- Generate session key material with the operating-system CSPRNG. Deliver it only
  through the inherited protected channel or handle, never through arguments,
  environment variables, stdout, files, logs, packets, or agent-visible storage.
  Derive separate direction keys with a standard library and destroy them when
  the session closes.

### Framing and Authentication

- Define one versioned deterministic binary envelope with a fixed-size preamble,
  protocol and schema versions, message type, header and payload lengths, session
  and endpoint identities, direction, sequence, nonce, message and correlation
  identities, payload digest, and authentication tag.
- Authenticate the complete domain-separated envelope, including lengths,
  versions, direction, and payload, with a standard reviewed MAC construction.
  Compare tags in constant time. Do not invent a custom cryptographic primitive.
- Parse only the fixed preamble before enforcing per-field, per-message, session,
  queue, and cumulative byte limits. Allocate no declared payload buffer and
  perform no decompression, decoding, persistence, acknowledgement, or dispatch
  until framing and authentication succeed. Compression and out-of-band
  attachments are unsupported initially.
- Correctly assemble fragmented frames and separate coalesced frames. An invalid
  tag, impossible length, unknown or unsupported version or type, duplicate,
  replay, reorder, direction mismatch, incomplete-frame deadline, or unexpected
  end-of-stream fails the complete frame without partial processing.
- Close and quarantine the session after an authentication or framing violation.
  Do not scan attacker-controlled bytes for a new magic prefix to recover framing.
  A clean reconnect creates a new identity and key.

### Session and Replay Semantics

- Use a finite session lifecycle such as `NEGOTIATING`, `ACTIVE`, `DRAINING`,
  `CLOSED`, and `FAILED`. Bind it to supervisor and peer generations, actor and
  task identities, integration type, policy version, issue time, and fixed idle,
  frame, and maximum lifetime limits.
- Maintain an independent strictly increasing sequence in each direction and a
  fresh nonce domain for every session. A process restart, PID reuse, reconnect,
  key change, or supervisor generation change invalidates all prior frames. Do
  not resume a sequence or silently negotiate a lower version.
- Authenticate protocol negotiation before activation. Use only an exact mutually
  supported version and algorithm suite; no untrusted compatibility fallback may
  weaken authentication, limits, or schema validation.

### Authority and Provenance

- Assign transport provenance from the authenticated endpoint and session record,
  never from a payload field. Preserve separately any identity the sender merely
  claims.
- Treat agent packet payloads as bounded untrusted proposals, claims, status, or
  handoff data. Authentication does not convert them into supervisor observations,
  owner approvals, policy decisions, grants, trusted instructions, or evidence of
  truth.
- Permit only registered packet kinds with strict schemas. A packet cannot carry
  raw approval or execution-grant authority. Any operation proposal re-enters the
  ADR 0002 policy and immutable-plan flow as new untrusted intent.
- Keep trusted internal service protocols separate from agent handoff channels.
  Routing text to another agent remains a data handoff and cannot change its
  instruction hierarchy or trust class.
- Reject prohibited data before packet creation or acceptance. External text is
  represented in a distinct bounded data field with source, trust class, and
  truncation metadata; quoting or Markdown decoration alone is not a security
  boundary.

### Delivery, Backpressure, and Recovery

- Apply bounded parser work, queues, in-flight messages, acknowledgement windows,
  per-session rates, and timeouts outside the Electron main loop and independent
  watchdog path. A saturated receiver applies backpressure or fails the session;
  it never silently drops an authenticated packet or blocks emergency stop.
- A transport acknowledgement means only that a complete authenticated packet
  was accepted by the receiving application. Send it after schema, data-policy,
  and durable journal acceptance, and never represent it as approval, execution,
  remote delivery, or task success.
- Persist accepted immutable message identity and payload digest for duplicate
  detection across reconnects. Reuse of an identity with different bytes is a
  protocol conflict. Disconnect before acknowledgement leaves delivery `UNKNOWN`;
  the sender reconciles before a bounded retry.
- Do not claim exactly-once delivery. Application operations use their own
  idempotency, preconditions, grants, and outcome reconciliation. A packet replay
  or transport retry can never repeat an effect by itself.
- Audit accepted and rejected packet metadata with sanitized reason codes,
  provenance, and digests. Do not echo rejected payloads, authentication material,
  or prohibited data into logs or evidence.

### Remote Adapters and Manual Fallback

- A future approved remote adapter terminates the local session and establishes
  a separately authenticated provider session bound to exact account, endpoint,
  task, and policy identities. It does not forward the local MAC as proof to a
  remote party or claim end-to-end authentication without a separately reviewed
  protocol.
- Preserve a reviewed Markdown or file-mediated handoff while no approved Claude
  interface has been documented and proven. Export only sanitized bounded data
  with a manifest containing source, destination, message identity, digest,
  provenance, and review state.
- Quarantine inbound manual handoff files and treat their content as untrusted
  even after owner review. Review attests to the handoff decision, not the truth
  or authority of embedded instructions. No marker in a file triggers dispatch.
- Do not claim direct Codex-to-Claude IPC, authenticated remote delivery, or an
  automated Claude integration until its exact adapter passes a separate decision
  and the P10 evidence gate.

## Consequences

The packet bridge requires protected endpoint launch, key derivation, strict
framing, durable duplicate records, backpressure, reconnect reconciliation, and
compatibility tests. It removes ambiguity between authenticated envelopes and
observed text but deliberately does not make agent content authoritative.

Compromise of an authenticated integration process permits it to send valid
untrusted claims until the session is revoked. Policy, grants, data boundaries,
audit provenance, and execution isolation remain required defenses.

## Alternatives Rejected

- Escaping or quoting an in-band marker does not protect the framing protocol.
- JSON lines on stdout remain forgeable by the process producing stdout.
- Transport authentication does not make payload claims truthful, so provenance
  remains explicit.
- A shared bidirectional key permits reflection and direction confusion.
- Resynchronizing by searching malformed input for a magic marker lets attackers
  influence parser state.
- A successful socket write is not durable application receipt or remote delivery.

## Evidence Required

P5 must fuzz the stateful parser and test marker injection, every frame boundary,
fragmented and coalesced frames, empty and maximum payloads, integer overflow,
malformed and contradictory lengths, oversized and cumulative payloads, partial
EOF and timeout, bit changes, invalid tags, reflection, direction confusion,
duplicate, replay, reorder, nonce reuse, key and peer substitution, descriptor
leakage to children, socket-path replacement, PID reuse, process and supervisor
restart, session expiry, version downgrade, unsupported versions and types,
queue saturation, crash before and after durable acknowledgement, reconnect
duplicates, message-identity conflict, prohibited-data canaries, false provenance,
embedded approval or grant attempts, and emergency stop under packet load.

Tests must prove no unauthenticated or invalid frame allocates beyond its bound,
persists payload, advances sequence, receives acknowledgement, reaches dispatch,
or changes authority. P10 must separately prove any remote adapter's identity,
delivery and reconciliation claims; until then, the sanitized manual handoff is
the only supported cross-agent path.

## Revisit Conditions

Revisit transport details when an agent platform provides a documented native
authenticated control channel with equivalent properties. A new transport,
protocol version, cryptographic suite, attachment mechanism, resume feature, or
remote adapter requires a versioned transition and renewed parser, replay,
identity, and failure-recovery evidence.

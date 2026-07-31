# ADR 0004: Audit Journal, Keys, and Anchoring

- **Status:** Accepted
- **Date:** 2026-07-31
- **Status updated:** 2026-07-31T03:01:36-04:00
- **Decision owner:** Repository owner
- **Related control:** F12
- **Related plan phases:** P2, P7, P11

## Context

Mutable SQLite rows, wall-clock timestamps, and signed actor labels do not detect
deletion, reordering, suffix truncation, rollback, forked histories, or false
claims. Signing also does not prove an observation is true. A protected key does
not establish continuity if an attacker can substitute the public key, request
signatures over arbitrary bytes, or replace all locally stored expected heads.

## Decision

### Canonical Journal and Durability

- Serialize events through one minimal writer reached over an authenticated,
  bounded local protocol. The writer accepts only versioned, sanitized event
  schemas and rejects prohibited data. Callers cannot choose sequence numbers,
  provenance classes, journal state, chain heads, or assurance labels.
- Assign a stable random journal identifier and explicit journal, boot, and writer
  epochs. Every event envelope includes the schema and algorithm-suite versions,
  journal and epoch identities, sequence number, source identity and provenance,
  operation and lifecycle identities when applicable, wall-clock observation with
  uncertainty, monotonic time within the boot, previous event hash, and sanitized
  payload or approved evidence reference.
- Use a specified deterministic encoding and domain-separated hash construction.
  The sequence and hash chain, not wall-clock time, establish journal order.
- Commit each event, sequence allocation, and new chain head atomically using the
  selected storage engine's strongest supported durability mode. Return a durable
  acknowledgement only after the commit and required flush complete. An error or
  unknown commit result produces no new effect and enters recovery.
- Treat the canonical journal as append-only through its API. SQLite, FTS, caches,
  dashboards, and summaries are derived projections and have no audit authority.
- Durably acknowledge an authorization or intent event before any new effect.
  Emergency cancellation may proceed without that acknowledgement and is later
  represented by a recovered event or explicit gap. After a crash, an effect with
  a durable intent but no verified outcome remains `UNKNOWN` until reconciled.

### Continuity and Recovery

- Link every new boot and writer epoch to the previously verified chain head. A
  new genesis is allowed only for first installation or an explicit owner-approved
  recovery that starts a new journal epoch and preserves the continuity gap.
- Checkpoint payloads bind the journal and epoch identities, exact sequence and
  chain head, preceding checkpoint digest, algorithm suite, signing-key identity,
  and checkpoint policy version.
- Before enabling new effects at startup, verify canonical encoding, sequence
  continuity, epoch links, hashes, checkpoints, key transitions, and the latest
  independently available anchor receipt. Corruption, rollback, an unexplained
  fork, or an uncertain durable state enters `BROKEN` assurance and fails closed.
  Emergency stop and read-only diagnosis remain available.
- Never silently repair, renumber, discard, or overwrite a conflicting history.
  Recovery preserves the original artifacts, records what is known and unknown,
  and requires an owner-visible decision before starting a new epoch.

### Provenance and Truth Claims

- Assign provenance from the authenticated source boundary, not a caller-supplied
  label. Distinguish at least agent claims, supervisor observations, owner
  approvals, remote-provider receipts, deterministic derivations, and recovery
  inferences.
- A signature proves that the journal preserved a statement under a key. It does
  not prove that an agent claim, remote response, timestamp, or inferred outcome
  is true. Verification reports provenance and uncertainty without upgrading it.

### Signing Keys

- Sign effect-critical and periodic chain-head checkpoints with a versioned P-256
  signature suite and a non-exportable key backed by the Secure Enclave where the
  supported macOS hardware and packaging configuration permit it.
- Keep signing authority outside the renderer, agents, Electron main coordinator,
  general persistence workers, and repository execution environment. The signing
  helper accepts only a validated current checkpoint structure for its registered
  journal and never provides a general arbitrary-message signing API.
- Pin the initial public-key identity in the installation record and external
  receipts. Rotation records bind old and new keys and are signed by both when the
  old key remains available. Loss, revocation, hardware migration, or unavailable
  Secure Enclave support starts an explicit recovery transition with reduced
  assurance; it never appears as seamless continuity.
- Publish verifier-compatible public keys and key status without exporting private
  keys. Report software-backed signing accurately when hardware protection is not
  available; never display it as hardware-backed assurance.

### Independent Anchoring

- Select the anchor backend in a subordinate ADR and prove this contract before
  claiming externally anchored evidence.
- Send only a minimal checkpoint containing journal and epoch identities, exact
  sequence and head hash, previous checkpoint identity, signing-key identity,
  algorithm versions, and signature. Event payloads and secrets never leave the
  journal through anchoring.
- Use an anchor account and administration boundary independent of the local Mac
  and DOSAI runtime. DOSAI's credential may append but cannot update or delete
  accepted receipts. Verification uses a separately scoped read path.
- Require the target to preserve receipt order, reject or permanently expose
  conflicting successors, and return a target-signed receipt bound to the accepted
  checkpoint and prior receipt. Replayed, stale, substituted, or forked receipts
  do not advance assurance.
- Configure an explicit maximum anchor lag and, where liveness is claimed, an
  independently delivered missed-checkpoint alert. Planned shutdown and offline
  operation are represented explicitly rather than fabricating continuity.

### Assurance and Privacy

- Report assurance through an exact sequence using states such as
  `LOCAL_DURABLE`, `SIGNED_LOCAL`, `ANCHORED`, `DEGRADED`, and `BROKEN`. Do not
  apply one undifferentiated integrity badge to the entire timeline.
- Policy defines maximum uncheckpointed and unanchored event counts and durations
  by operation tier. Exceeding the applicable bound denies new effects until
  assurance recovers. Emergency stop remains available.
- Use `tamper-evident` only through the latest independently retained and verified
  receipt. Signed but unanchored history has explicit tail-truncation, rollback,
  key-use, local-administrator, truthfulness, and availability limitations.
- Keep permanently chained event fields minimal and allowlisted. Store expiring
  content separately under its retention policy and reference it with an opaque
  identifier or policy-approved digest. Never hash prohibited or low-entropy
  secret content as a substitute for rejecting or redacting it. Record deletion
  lifecycle and evidence unavailability without retaining the deleted content.

## Consequences

The journal requires strict schemas, durable storage, key lifecycle, rotation,
independent verification, anchoring, recovery, and privacy designs. External
anchoring adds a separate trust dependency but is necessary to detect local
rollback or tail deletion through a known receipt. New effects stop when required
local durability is uncertain or assurance is `BROKEN`; anchor outages permit
only the explicitly bounded degraded window.

Hardware, operating-system, Secure Enclave, and anchor compromise remain outside
the strongest local claim. An independently retained receipt proves that a chain
head was presented; it does not prove every event's real-world truth.

## Alternatives Rejected

- SQLite structural integrity checks are not cryptographic history verification.
- Per-row signatures without ordering or an external expected head miss deletion.
- A key accessible to agent or renderer code cannot establish useful separation.
- A locally stored signed head alone can be rolled back with the journal.
- An anchor credential that can rewrite receipts is not an independent anchor.
- Deleting sensitive payloads from inside the canonical chain destroys either
  verification or honest deletion; retained audit envelopes must be minimized.

## Evidence Required

P2 and P7 must test concurrent sequence allocation, mutation, deletion, reorder,
duplicate events, partial writes, suffix truncation inside and beyond the anchored
range, rollback, fork, boot and epoch reset, key substitution and loss, invalid
rotation, arbitrary signing requests, clock changes, crash points before and after
durable acknowledgement, disk-full and flush failure, derived-index tampering,
prohibited-data canaries, anchor outage, receipt replay and substitution, and
recovery with an unknown external-effect outcome.

The independent verifier must run without DOSAI write authority and report exact
verified, signed, and anchored-through sequences, provenance, gaps, missing
evidence, key transitions, forks, and limitations. P11 must validate the exported
format and receipts in a clean environment and obtain independent review of every
user-facing assurance claim.

## Revisit Conditions

Revisit the signature or anchor mechanism when platform support, retention law,
or an approved transparency service changes. Changing the canonical encoding,
algorithm suite, signing-key lineage, or anchor backend requires a versioned
transition and renewed interoperability and adversarial evidence.

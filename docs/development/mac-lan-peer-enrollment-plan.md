# Two-Mac LAN peer enrollment and key lifecycle plan

- **Status** — Source-only proposal for owner review.
- **Baseline** — [PR #31](https://github.com/Socialeap/DOSAI/pull/31), merged as
  `be4e39cca318b188b87a4d00cb44d4e034205aa8`.
- **Development role** — Unclassified assistant.

The [manual handoff and offline receiver evidence](mac-fixture-handoff-result.md)
establish a local approval path and deterministic fixture admission from injected
bytes. The offline HMAC fixture is a test seam. Live transport needs its own
versioned contract, implementation evidence, and owner authorization under
[ADR 0006](../decisions/0006-authenticated-packet-transport.md).

## Scope and trust boundary

The first candidate is one owner-operated run between the M1 sender and M4
receiver on the private LAN. The only admissible request is the synthetic
`SUMMARIZE_FIXTURE` proposal. Assume a LAN participant can observe or modify
traffic and that an enrolled sender can submit hostile content. The enrollment
ceremony assumes the operator can identify both physical Macs and trust their
local prompts. A compromised trusted process or host is outside this proof.

The trusted transport process on each Mac owns its ephemeral credential and
peer pin. Agent processes, renderers, repository code, and guests receive only
the data they need for their existing roles. The M4 derives sender provenance
from the mutually authenticated session and marks the proposal untrusted.
Peer enrollment gives the M1 permission to submit one proposal for local review.
Any evaluation still needs a fresh M4 plan, preflight, and explicit local
approval under [ADR 0002](../decisions/0002-typed-operations-policy-and-grants.md).
Pause, denial, or expiry prevents evaluation.

## Manual enrollment for one run

1. After separate runtime authorization, the owner opens the trusted local
   pairing prompt on each Mac. Each trusted process creates a fresh,
   process-scoped key and short-lived endpoint certificate using the reviewed
   crypto library and OS CSPRNG. The keys stay in process memory for this proof.
2. Exchange only the two public certificates out of band. On both trusted
   prompts, compare the full SHA-256 fingerprints of the exact DER certificates,
   with M1 labeled sender, M4 labeled receiver, protocol version and the one
   allowed action. Each prompt displays its own fingerprint from its locally
   generated certificate. Require explicit local confirmation of the exact
   pairing on both Macs. Address, hostname and discovery data serve only as
   routing hints. A mismatch, missing confirmation, changed scope, or expired
   prompt aborts the ceremony. No discovery or first-connection auto-enrollment.
3. Each process retains only the confirmed pairing for that run. During a full
   mutually authenticated TLS 1.3 handshake, verify certificate validity and
   role, exact enrolled peer pin, and proof of possession on both sides.
   Constrain trust to the explicitly enrolled certificate for this connection.
   Require an exact supported application protocol with early data, session
   resumption, and fallback disabled. Halt if the chosen library cannot
   enforce those checks. [TLS 1.3, RFC 8446](https://www.rfc-editor.org/rfc/rfc8446.html#section-4).
4. Bind the application envelope to the authenticated session and the protocol,
   endpoint roles, direction and sequence. Follow ADR 0006 for bounded framing,
   full-envelope authentication before payload decoding, and deny-on-error
   semantics. Evaluate a standard TLS exporter for separate direction keys in the
   versioned design. Define an authenticated end-of-request boundary for the
   one-frame exchange. Accept only after the complete frame, boundary, and
   current scope validate. The one-run proof sends no application acknowledgement
   and makes no durable-delivery claim. A later adapter must separately prove
   durable acceptance, duplicate tracking, and reconnect reconciliation.
   [TLS exporter, RFC 8446 §7.5](https://www.rfc-editor.org/rfc/rfc8446.html#section-7.5).

## Expiry, rotation, and revocation

- **Expiry.** Set finite pairing, handshake, frame, and review deadlines in the
  reviewed protocol profile. Use monotonic time for run deadlines and verified
  certificate validity for the handshake. Clock ambiguity, suspension beyond a
  deadline, disconnect before admission, or either process restarting fails the
  run. No automatic reconnect or reuse of a previous pin or session.
- **Rotation.** End the active run before replacing credentials. The trusted
  process releases its private and session key material and clears the peer pin.
  Generate fresh keys on both Macs and repeat manual comparison and confirmation.
  There is no overlap window and the old peer cannot authorize its replacement.
- **Revocation.** Either local operator can stop their endpoint immediately. The
  M4 serializes its local stop or revocation with proposal admission and checks
  the current run again at local approval. Cancel pending review for the revoked
  run and close the connection. Admission permits one handoff to review, with
  no further frames accepted. Report only fixed decisions and sanitized
  metadata. Keep keys, raw packets, and session identifiers out of audit exports.
  M4 revocation is authoritative for M4 admission and review. A stop on M1
  prevents future sends from that process and cannot recall bytes already sent.
  A revoked sender cannot be admitted again without a new local pairing on M4.
- **Recovery.** Pairing state starts empty after a restart. Keys and trust are
  never backed up, synced, or restored in this proof. A later persistent design
  requires separate approval and proof of protected key storage, atomic trust
  updates, rollback detection, durable revocation, and explicit recovery.

## Verification and gates

| Increment | Required evidence |
| --- | --- |
| Source-only lifecycle tests after plan review | A synthetic state machine with injected time, identities, and events. A matching pair can admit one proposal for local review. Reject missing consent, wrong peer or role, mismatched version, expired or replayed enrollment, stale session, repeat proposal, and attempts to carry authority. Exercise stop and timeout before admission and before local approval, rotation without overlapping trust, and empty trust after restart. Assert no plan, grant, execution, or network effect from the receiver. |
| Offline protocol validation after design acceptance | In-memory handshakes using synthetic credentials, including mutual proof of possession, wrong or substituted pins, version/fallback rejection, early-data and resumption rejection, cross-session and direction mismatch, and bounded malformed frames. Keep work app-unreachable and listener-free. A missing library feature or unresolved failure blocks progression. |
| Bounded device proof after required phase and owner approvals | Review the exact source and dependencies, local key handling, bind scope, deadline, limits, and teardown. Separately authorize an exact M1-to-M4 test. Demonstrate proposal-only admission and distinct local approval and denial cases using fresh ceremonies. Verify revocation and cleanup. Make claims only for the evidence collected. |

P5 remains gated on P3. BETA-CP-004, BETA-CP-005 and BETA-CP-006 remain open,
including two independent native AMD64 builder receipts, the single-mount and
writer-exclusion predicates, and formal P3 acceptance. Neither Mac is a
replacement for a qualifying native builder. The existing manual handoff is
available within its approved scope while authenticated LAN transport remains
unverified.

This increment adds documentation only. A listener, credential creation, host
configuration, workflow dispatch, deployment, and device QA require separate
authorization. There is no backend migration, secret, runtime configuration,
Lovable handoff, or frontend publish for this PR.

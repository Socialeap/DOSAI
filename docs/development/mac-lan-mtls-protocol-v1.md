# Two-Mac fixture protocol v1

- **Status** — Proposed for source review and offline validation.
- **Baseline** — [PR #33](https://github.com/Socialeap/DOSAI/pull/33), merged as
  `a6b87741febc148725221357f49910c56c541c46`.
- **Development role** — Unclassified assistant.

This profile applies to a single synthetic `SUMMARIZE_FIXTURE` proposal from
the M1 to the M4. The receiver can expose the proposal for local review.
[ADR 0006](../decisions/0006-authenticated-packet-transport.md) governs framing
and provenance. The [enrollment plan](mac-lan-peer-enrollment-plan.md) governs
operator confirmation, ephemeral credentials and revocation.
[ADR 0002](../decisions/0002-typed-operations-policy-and-grants.md) governs any
later local plan, preflight and approval. This profile gives the peer no
execution authority.

```text
M1 local confirmation                           M4 local confirmation
          |                                               |
   M1 TLS client  <--- full mutual TLS handshake --->  M4 TLS server
          |                                               |
          +--- one authenticated proposal + close ------>+--> local review
```

## Handshake and peer identity

- Allow one handshake attempt per fresh pairing. Both endpoints arm only after
  the exact local fingerprint, peer fingerprint, roles, profile and fixture
  action have been confirmed on their own trusted prompts. Each side pins the
  other side's SHA-256 digest of its complete, canonical DER leaf certificate
  from the out-of-band exchange. Network addresses, certificate display names
  and payload fields convey no identity or authority.
- Require TLS 1.3 only, ALPN exactly `dosai-fixture-lan/1` (19 ASCII bytes),
  `TLS_AES_128_GCM_SHA256`, X25519 key exchange and
  `ecdsa_secp256r1_sha256` for CertificateVerify. Both sides complete the full
  handshake and verify the exact negotiated profile before application
  processing. An absent or different ALPN fails, including an otherwise valid
  TLS channel. Disable external PSKs, resumption, tickets, early data and
  post-handshake client authentication. A resumed handshake fails even if a
  provider misconfiguration allows it. [TLS 1.3, RFC 8446](https://www.rfc-editor.org/rfc/rfc8446.html#section-4),
  [ALPN, RFC 7301](https://www.rfc-editor.org/rfc/rfc7301.html#section-3.2).
- Require a single self-signed P-256 signing leaf from each side, at most 4,096
  DER bytes and with a validity interval of at most ten minutes. Require
  `CA:FALSE`, `digitalSignature` key usage only, and exactly `clientAuth` for
  the M1 or `serverAuth` for the M4 as its extended key usage. Generate a
  fresh key and certificate on each endpoint for each pairing. Use a private
  per-run trust store containing only the expected peer leaf. Require library
  verification including the certificate's self-signature, the exact pin and
  role, a currently valid certificate and TLS proof of possession on both sides.
  Never override library verification on pin match or fall back to system trust.
  An ambiguous clock fails the run.
  [OpenSSL verification options](https://docs.openssl.org/3.5/man1/openssl-verification-options/).
- Trusted endpoint processes hold keys and pins in memory for one attempt.
  Discard them on failure, completion, stop, expiry or restart. A new run
  requires both fresh credentials and both local confirmations. No retries,
  discovery, persisted trust, key logging, or certificate fetches.

## Session binding and frame

Use the standard TLS 1.3 exporter only after successful mutual authentication
and the negotiated-profile checks. Define the exporter context as the raw
concatenation of ASCII `dosai-fixture-lan/1`, a single zero byte, the 32-byte
M1 certificate digest, the 32-byte M4 certificate digest, and ASCII
`SUMMARIZE_FIXTURE`, in that order. The context commits to both identities in
role order. Derive exactly these values with ASCII labels and no trailing NUL.

| Exporter label | Bytes | Purpose |
| --- | ---: | --- |
| `EXPERIMENTAL DOSAI Fixture LAN v1 Session` | 16 | Session binding |
| `EXPERIMENTAL DOSAI Fixture LAN v1 M1 to M4` | 32 | Request MAC key |

V1 defines no M4-to-M1 application frame or MAC key. TLS provides its own
separate traffic keys. The request key is unique to the authenticated session
and permitted direction. Never transmit the request key or log either exporter
output. The session binding appears only inside the protected binary envelope
and is never part of the application payload, audit export, or approval display.
[TLS exporter, RFC 8446 §7.5](https://www.rfc-editor.org/rfc/rfc8446.html#section-7.5),
[Private-use labels, RFC 5705 §4](https://www.rfc-editor.org/rfc/rfc5705.html#section-4).

All multi-byte integers are unsigned big-endian. The first 12 bytes are the
fixed preamble. The header has 176 bytes including the preamble. A valid
request has exactly 238 bytes including payload and tag.

| Offset | Bytes | Field and required value |
| ---: | ---: | --- |
| 0 | 4 | ASCII magic `DSF1` |
| 4 | 1 | Protocol version `1` |
| 5 | 1 | Payload schema version `1` |
| 6 | 1 | Message type `1` (proposal) |
| 7 | 1 | Direction `1` (M1 to M4) |
| 8 | 2 | Header length `176` |
| 10 | 2 | Payload length `30` |
| 12 | 4 | Sequence `1` |
| 16 | 16 | Exporter session binding |
| 32 | 32 | M1 certificate digest |
| 64 | 32 | M4 certificate digest |
| 96 | 16 | OS CSPRNG message ID, nonzero |
| 112 | 16 | All zeros for an uncorrelated initial request |
| 128 | 16 | OS CSPRNG nonce, independent of message ID, nonzero and distinct |
| 144 | 32 | SHA-256 of the exact payload bytes |
| 176 | 30 | Exact ASCII `{"action":"SUMMARIZE_FIXTURE"}` |
| 206 | 32 | HMAC-SHA-256 tag |

Compute the full tag over ASCII `DOSAI Fixture LAN v1 Request` followed by a
single zero byte and the exact header and payload bytes, using the exported
request key and a reviewed HMAC library. Keep a fixed-size frame buffer. Check
the fixed preamble against the exact supported values before collecting the
remaining frame. Never size an allocation from a declared length. Compare the
tag in constant time before interpreting the remaining fields or decoding,
persisting, or passing the payload onward. Verify all header values against
the active session and the confirmed roles. Verify the payload digest and
compare the exact payload bytes. Alternate JSON encodings, fields or actions
fail. Derive provenance from the authenticated connection state.

## Completion and limits

1. The M1 sends one frame and TLS `close_notify`. The M4 consumes authenticated
   plaintext through the peer's `close_notify` and emits its own TLS closure
   alert on a clean close. Bare EOF, premature closure, trailing plaintext
   before the peer's alert, a second frame, or a deadline breach rejects the
   run. The TLS closure alert is the end-of-request boundary. Treat
   post-closure bytes as outside the session. Never admit a proposal merely
   because a valid frame prefix arrived. [TLS closure alerts, RFC 8446 §6.1](https://www.rfc-editor.org/rfc/rfc8446.html#section-6.1).
2. Serialize admission with M4 stop and revocation. At the commit to local
   review, verify the current pairing, policy generation, pause state and
   deadlines. Consume the receive window and release transport state. Keep
   only a local binding for one pending review. Stop, revoke, policy change,
   restart or expiry invalidates that binding before any hypothetical approval.
   Any later evaluation requires a fresh M4 plan and explicit local owner
   approval. The offline harness ends at the proposal and has no execution
   path.
3. Use one attempt, one buffered frame, and at most one pending review.
   Proposed profile limits are 120 seconds to pair, 5 seconds to handshake,
   5 seconds to complete the authenticated request, 60 seconds for local
   review, and 200 seconds total from pairing start. Enforce monotonic
   deadlines and a cap of 65,536 encrypted bytes per direction through TLS
   closure, including handshake. Disable retries and resynchronization. The
   offline driver uses bounded buffers and a total budget of 262,144 TLS or
   memory BIO I/O calls per attempt. Stop before exceeding either budget.
   These are validation limits and provide no performance claim.
4. Return only fixed, local dispositions. Emit no application response,
   acknowledgement, approval, result, or durable-delivery assertion. Keep
   keys, session bindings, raw frames, and certificate material out of
   evidence. Durable duplicate tracking and reconnect reconciliation remain
   mandatory for a later adapter under ADR 0006. V1 provides neither reconnect
   nor automatic resend.

## Offline implementation and acceptance

Proposed test backend: a reviewed, exactly pinned OpenSSL 3.x implementation
with bounded memory BIOs between two TLS state machines. The fixture drives
the encrypted bytes, both endpoints, synthetic in-memory certificates, and
time. It has no OS sockets, listener, app path, persistent keys, or runtime
effect. Pin the chosen library build and confirm its exact verification,
exporter, ALPN, ticket, early-data and closure behavior before accepting an
implementation. If a control cannot be demonstrated, block the profile.
In particular, disable `SSL_OP_IGNORE_UNEXPECTED_EOF` and quiet shutdown.
Use no session lookup or ticket issuance. [OpenSSL memory BIOs](https://docs.openssl.org/3.0/man3/BIO_s_bio/),
[exporter API](https://docs.openssl.org/3.5/man3/SSL_export_keying_material/),
[session tickets](https://docs.openssl.org/3.5/man3/SSL_CTX_set_num_tickets/),
[shutdown behavior](https://docs.openssl.org/3.5/man3/SSL_shutdown/).

| Check | Required offline result |
| --- | --- |
| Real mutual TLS, exact profile, both confirmations, one valid frame and authenticated closure | Exactly one untrusted local-review proposal, with zero plans, grants, evaluation, acknowledgements or external effects |
| Wrong pin in either direction, including the same key with a different leaf, wrong role, missing certificate or proof, an invalid self-signature, expired or not-yet-valid leaf, unrelated trust anchor, invalid confirmation | Fail before application admission. A good pin cannot waive certificate verification |
| Missing or wrong ALPN, older TLS, wrong suite or group, early data or resumption attempts | No downgrade, resumed session or early-data admission. Unsupported exact profile fails |
| Valid frame with split and coalesced input, then authenticated closure | Same one-proposal outcome at every split. No proposal before the closure boundary |
| Invalid preamble or length, byte changes, unknown version or type, malformed payload, extra fields, incorrect digest or MAC, truncation or trailing plaintext | Fail closed with fixed diagnostics, bounded work and zero partial proposal |
| Old session or substituted direction, sequence, identities or exported key, second frame, reflected proposal, valid frame followed by bare EOF | No proposal. A fresh authorized ceremony uses independent session binding and credentials |
| Revocation, pause, expiry or policy change before admission or during review | No admission or review eligibility after the corresponding M4 transition. A clean TLS teardown alone grants no eligibility |
| Stalled transport, certificate cap, encrypted byte limits and incomplete close | Bounded buffers and termination without persistence or review |
| Source and runtime isolation of the offline fixture | No networking, listener, secrets on disk, live certificate access, host mutation, child dispatch, or reachable application import |

Use generated synthetic certificates only inside the later test process.
Record test counts, exact dependency and source identity, fixed reason codes,
and the offline isolation checks. Existing receiver and lifecycle tests are
regression inputs. They do not establish real mTLS or validate these new
wire bytes. A later device proof requires design acceptance, offline evidence
and separate authorization for the exact devices, code, and listener scope.

## Release status

P5 remains gated on P3. BETA-CP-004/005/006 remain open. The native-only,
single-mount and writer-exclusion requirements remain in force, including two
independent qualifying native AMD64 builder receipts. This documentation
change adds no runtime configuration, migration, secrets, deployment, Lovable
handoff or frontend publish.

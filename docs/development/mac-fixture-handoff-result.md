# Two-Mac fixture handoff result

Verified on November 17, 2026 at merged revision
`314b633c524d35a988f80f0cd7b9c3806eb93124` (PR #29). Role: unclassified
assistant. The M1 emitted the fixed `SUMMARIZE_FIXTURE` selector using pinned
Node 24.18.0 and checksum-verified temporary source and runtime. The M4
received the selector through the local terminal approval CLI.

| Actual order | M4 receipt sequence | Verified outcome |
| --- | --- | --- |
| 1. Deny | `PREPARED → DENIED` | `OWNER_DENIED`, durable receipt, null authorization and result |
| 2. Approve | `PREPARED → INTENT → SUCCEEDED` | `FIXTURE_EVALUATED`, durable receipt, 3 suites, 18 passed and 1 failed in the fixed fixture |

The reviewer compared the saved exports to expected fields and checked that the
plans and sessions were distinct. Both outcomes were synthetic and reported
`effects: NONE`. The recorded order reversed the planned approval-then-denial
sequence. That sequence remains untested. Shell exit codes were not captured.
Raw evidence stays in the ignored local directories. This establishes manual
handoff and local approval and denial only. Authenticated LAN delivery remains
unproven. BETA-CP-004/005/006 remain open.

## Proposed first increment toward authenticated LAN transport

Prepare a standalone, offline receiver test seam for one fixed
`SUMMARIZE_FIXTURE` proposal. Use synthetic peers and injected bytes. The
implementation subject to review is a test-only admission path. Its only
successful output is a typed, untrusted fixture proposal for explicit local
review. The receiver's local terminal remains the authority for creating and
approving a fresh execution plan. No frame or acknowledgement may carry an
approval, grant, local plan, command, or path. Stop before app integration,
socket code, or device testing.

The accepted [packet transport ADR](../decisions/0006-authenticated-packet-transport.md)
requires bounded framing and session-bound authentication before decoding or
admitting payloads. The offline increment should use these checks:

| Test input | Required outcome |
| --- | --- |
| Valid bounded frame in the test session, including split input | Admit one untrusted fixture proposal and perform zero effects |
| Truncation, oversized length, unknown version, or illegal trailing bytes | Deny, close the test session, and emit a fixed reason without echoing payload |
| Invalid authentication, wrong peer, session or direction | Deny before decoding or invoking the proposal handler |
| Duplicate sequence, reorder, or replay after a session reset | Deny without issuing a proposal or reusing the earlier session |
| Payload containing an approval, grant, command, path, or unexpected field | Deny through the closed fixture schema |
| Valid proposal with no local confirmation | Expose only the proposal for review, with no grant, execution, or result |

A future LAN adapter needs a separate reviewed decision for peer enrollment,
protected transport, key lifecycle, revocation and authorization to listen.
Reuse the ADR's channel boundaries and standard cryptographic libraries.
P5 remains gated on P3. The proposal supplies no new phase acceptance or
production authority and leaves the native-only, single-mount and writer
exclusion requirements in force.

## Offline receiver fixture

Run the isolated fixture tests with pinned Node 24.18.0:

```sh
node --test tests/security/offline-fixture-receiver.test.mjs
```

The fixture accepts injected bytes for one frame per synthetic session. The
40-byte header contains version, direction, 16-byte peer and session IDs, a
big-endian sequence number and a big-endian payload length. A 32-byte HMAC
covers the domain label, header and payload. The payload cap is 128 bytes.
After end-of-input, the receiver checks authentication and session context
before comparing the exact allowed payload bytes. Its output is an untrusted
proposal for review. Errors close the fixture session and return fixed reasons.

Tests cover every two-chunk split boundary, malformed and truncated input,
authenticator and context mismatch, replay in a closed or different session,
and authority-bearing payloads. Synthetic callers provide session IDs and keys.
This fixture leaves live enrollment, fresh session creation, persistence,
cross-process replay protection, and LAN integration to the gated transport work.

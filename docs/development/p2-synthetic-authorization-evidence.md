# P2.5 Synthetic Authorization Failure-Path Evidence

**Status:** `[?] EVIDENCE_PENDING`<br>
**Evidence captured:** `2026-07-31T21:09:59-04:00`<br>
**Engineering result:** `PASS`<br>
**Review decision:** Pending owner review

This generation proves a no-effect Red authorization workflow across strict
schema admission, current deny-by-default policy, exact plan and precondition
binding, fresh service-local test approval, durable journal acknowledgement,
exact acknowledged-head checkpoint signing, required assurance, and one-use
grant consumption. No application, effect broker, process execution path, or
production authority is added.

## Proposed Generation

| Artifact | State | SHA-256 |
| --- | --- | --- |
| Schema registry v9 | Proposed, additive | `6341266b82a4bee6d010f40e68fb37878bd77ee7da07bdb3d05bdce6fc819e0b` |
| Local owner approval schema v1 | Proposed D1 control contract | `029fb61083ba2774ef7506e4c996db2e80c37c13194e1cb7f66d849cfca44d9e` |
| Process ownership v6 | Proposed proof boundary | `6fe97992693cda1ac4543e6ac64e3659e3c9a176323f5d0cbc8043f3fcd01778` |
| P2 contract admission | Additive approval family | `824342e6b46c31b6f0676346a84bc3fede9bde159d2048d99bab5c2b5073b46a` |
| Synthetic authorization proof service | Implemented, app-unreachable | `bb0844cc1e84b850581319d802fe9b22e754101d7a63e2b9699ccd39200bdee2` |
| Exact acknowledged-head checkpoint constraint | Implemented | `81c1bf69049ee03481c10d5468728a4fe86704d7a0cb5e8cfeb37e1f5d47ccad` |
| Authorization contract corpus | Implemented | `ffade71a1900c2e3edbfc7cf6d53c96d4b7a0b8480fb16e930ac3d3eb1acd3cc` |
| Authorization security corpus | Implemented | `e143d14ec78b6ba944bbdac7bd30a072152bb0d0600333299aaf249ee9f4899d` |
| Checkpoint security corpus | Extended | `be620d6e89562b92a24b79bcba7e4da223b77ebcca9b196429491b8c9ccc9011` |
| Ownership and import corpus | Extended | `50a366aa3674368db7fd093a28d0190358b17da251c9a53dc33b5623814c9f67` |

Accepted schema registry v8 remains byte-identical at SHA-256
`d98a4b0fe1739ae4924c67f7549134235c2bc28144849eaed89799c091ba8fcf`.
Accepted process ownership v5 remains byte-identical at SHA-256
`6417976e00bd8ea6db597f5020b8558ccb32244cb19e08469652d51469d53d87`.

## Authorization Protocol

- The only supported path is the existing typed `SYNTHETIC_POLICY_PROBE`.
  Complete operation, target, generation precondition, actor, session,
  capability, predicted-effect, evidence, policy-version, and expiry fields are
  admitted and rebound by domain-separated canonical SHA-256 digests.
- The pure policy engine must independently return exact Red classification,
  current policy, complete capability intersection, and fresh local approval.
  Policy outage, Black classification, malformed input, or capability loss
  denies before journal or grant creation.
- Local approval is strict D1 control data, valid for at most 60 seconds, and
  bound to the exact plan, operation, actor, session, owner, and service-local
  opaque authority state. Self-approval, cloning, staleness, and reuse deny.
- The proof service owns its random journal source token and opens the real
  isolated writer itself. A structural caller object cannot invent an
  acknowledgement. The writer must report the accepted SQLite durability
  profile and return an acknowledgement for the exact policy-decision digest.
- Checkpoint creation verifies the acknowledgement sequence and event hash
  inside the same journal read that produces the signed head. A copied sibling
  chain cannot substitute an unrelated valid head between audit and signing.
- The current positive proof requires `SIGNED_LOCAL_SOFTWARE`; hardware or
  anchored requirements fail closed while P2.4 external evidence is deferred.
  Grant v1 remains a D5 envelope and gains no authority from its bytes.
- A random 32-byte token and module-private `WeakMap` state make the test lease
  service-local and one-use. A valid lease is consumed before revalidation, so
  changed state, expiry, stop, or any later denial cannot be retried.
- Successful consumption returns only `PROOF_ACCEPTED`, `NO_EFFECT`, and
  `executionPermitted: false`. Emergency stop is idempotent, audit-independent,
  invalidates outstanding grants, and cannot start an effect.

## Faults Found and Remediated

1. The first integration accepted a structurally shaped journal writer. A fake
   object could have paired an invented acknowledgement with an unrelated valid
   database. Journal opening and source authentication now live inside the proof
   service under a private random token.
2. Signing a valid current head did not by itself prove that the acknowledged
   decision event was on that head's chain. Checkpoint creation now accepts an
   exact required journal head and verifies the acknowledgement sequence and
   event hash during its own canonical journal read.
3. The first token fixture was 31 bytes and was correctly rejected by journal
   admission. The fixture now uses an explicit 32-byte nonzero value.
4. Node `randomBytes` returns a `Buffer`, while consumption intentionally admits
   only a plain `Uint8Array`. Issuance now copies random bytes into that exact
   representation before hashing and returning the opaque lease token.

## Validation

| Command or inspection | Result |
| --- | --- |
| Eight strict TypeScript surfaces under Electron Node 24.18.0 | PASS, including new isolated grants surface |
| Full repository test corpus | PASS; 153 tests |
| P2.5 adversarial authorization corpus | PASS; 30 tests |
| Exact acknowledged-head checkpoint test | PASS; correct event accepted, wrong event hash rejected |
| Approval and grant replay, clone, token mutation, expiry, cross-service use | PASS; denied with no effect |
| Target, precondition, evidence, session, and capability drift | PASS; grant or approval burned before retry |
| Schema, policy, audit path, key, forged authority, and anchor outage | PASS; no grant returned |
| Emergency stop before approval and after grant issue | PASS; audit-independent, idempotent, no effect |
| Architecture imports and export surfaces | PASS; application cannot reach helper and helper exposes no execution method |
| Three Vite production builds | PASS; main, preload, renderer |
| `git diff --check` | PASS |

## Limitations

- The local approval authority is an ephemeral test fixture, not macOS owner
  authentication, LocalAuthentication, an entitlement, or a production service.
- The positive checkpoint uses the accepted ephemeral software test key. It does
  not claim Secure Enclave persistence, hardware assurance, anchoring, trusted
  time, rollback resistance, or independent administration.
- Grant and approval authority is process-local and intentionally disappears on
  restart. Production issuance, transport, protected state, crash recovery, and
  effect-broker consumption do not exist.
- The caller selects among the proof-only required assurance levels. A future
  production policy contract must derive that requirement from operation and
  environment rather than accepting caller choice.
- Formal `P2-AT-001`, `P2-AT-002`, and `P2-AT-003` catalog generations, fixture
  manifests, runner evidence, and owner review remain pending. This engineering
  corpus does not change their current `NOT_IMPLEMENTED` state.
- Every effectful runtime capability remains `UNVERIFIED`; P3 is still the
  earliest phase allowed to introduce an execution broker.

## Decision Request

Review schema registry v9, process ownership v6, the D1 approval contract, and
the synthetic authorization proof. Acceptance may complete P2.5 engineering
without completing P2, changing any capability state, or satisfying the
deferred P2.4 hardware and public-anchor contracts.

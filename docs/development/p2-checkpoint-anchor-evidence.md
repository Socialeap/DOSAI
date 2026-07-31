# P2.4 Checkpoint and Anchor Protocol Evidence

**Status:** `[~] IN_PROGRESS`<br>
**Evidence captured:** `2026-07-31T19:35:39-04:00`<br>
**Engineering result:** `PASS_LOCAL_PROTOCOL_PROOF`<br>
**Review decision:** `ACCEPTED_LOCAL_BASELINE` at `2026-07-31T19:41:14-04:00`<br>
**Phase completion:** Not claimed

This record covers a synthetic, offline checkpoint-signing and Rekor v2 receipt
verification proof inside the isolated Z6 audit library. It sends no network
request, creates no Keychain item, uses no production credential, contacts no
anchor, and is not connected to Electron. Every runtime capability remains
`UNVERIFIED`.

## Accepted Local Baseline

| Artifact | State | SHA-256 |
| --- | --- | --- |
| ADR 0012 | Accepted | `e7f5b66655afc2f357bb6d1a8bde4aa90a939e10694b18d7b3baf2861b5ee518` |
| Process ownership v4 | Accepted | `0d86608f3b71ce4b5af317d05978fb4d33c83c13df6ddb3f56e409fa967ea992` |
| Schema registry v8 | Accepted | `d98a4b0fe1739ae4924c67f7549134235c2bc28144849eaed89799c091ba8fcf` |
| Audit checkpoint schema v1 | Accepted definition | `8206f94868d9275c6eddaa1d113cbea949a08f5eba80232f85771a926e6a47a8` |
| Rekor receipt schema v1 | Accepted definition | `7dfcf0389a395f2baf072fbb1216fdf971b9a47945f13f7da75da0b16e62d53c` |
| Checkpoint and receipt contracts | Implemented local proof | `cb6483af2e857bed50a9b6500543bbca52934bdba93554117094f5e57f472588` |
| Constrained checkpoint signer and assurance evaluator | Implemented local proof | `1d2fab873c49a97463797640392b2e68512bf2ac0b4406ffd686e4edc7dfe4c1` |
| Journal exact-ancestor verification | Implemented additive control | `c919fa5fab6b6e85f716af5708b254978502520be3b3c0e62473620e87192d6f` |
| Offline Rekor v2 verifier | Implemented local proof | `ecfa362195b2032f6377ab01bbd497e4de5a2de8627d22f0f34caa7bcbf41b58` |
| Ownership and import tests | Updated | `c120c9c128ac00fe930244ec0f7649e6b32b52bc92ac6b32b299ae8cba5b0656` |
| Checkpoint governance corpus | Implemented | `04385b2d2702ee03fa93e6eb92572373f3ab22f8e6e8788954f557cd673b9cf2` |
| Checkpoint security corpus | Implemented | `748a9660c83758d3ceb798ff9c951f501833756214157278641640928c86904f` |
| Rekor adversarial corpus | Implemented | `c91cf7a75e1affccf7bd7e8f3cd81e9b7b2e1300ce9b19d9868724b93c388bcf` |
| Synthetic cryptographic fixtures | Implemented | `0afedcb77917e6f28a78a485c1f02c58cb122a9fd5d3a98af246c04dae753ac2` |

Accepted process ownership v3 remains byte-identical at SHA-256
`403707ec24c938f0012891bccbef848db3bc87a3088d593953b5ff5a965cc4bf`.
Accepted schema registry v7 remains byte-identical at SHA-256
`6a41d62c2f22683573f211d4c6012ac17bad6fe08ba9a1443792e0adcb0e6ff7`.

## Architecture Selection

- Production checkpoint signing targets Apple's Security framework with a
  permanent, non-exportable Secure Enclave P-256 key. The local proof exposes
  only an opaque ephemeral software authority permanently labeled
  `SOFTWARE_BACKED_TEST_ONLY`; there is no Secure Enclave factory or hardware
  assurance path in the current code.
- Sigstore's public-good Rekor v2 transparency log is the selected independent
  anchor. Active shards and log keys must come from TUF SigningConfig and
  TrustedRoot material. No shard URL is hardcoded.
- Rekor receives only the checkpoint signing-input SHA-256 digest, active P-256
  signature, and public SPKI key through `hashedrekord` v0.0.2. Journal and event
  payloads are absent from the request.
- The verifier accepts one fixed ECDSA P-256 log-checkpoint profile, reconstructs
  the exact canonical Rekor body, verifies the RFC 6962 inclusion path, and
  verifies the signed C2SP checkpoint under pinned trust material.
- Rekor v2 `integratedTime` is required to be zero and grants no time claim.
  Trusted duration policy requires a later RFC 3161 or witnessed-checkpoint proof.

## Checkpoint and Assurance Protocol

- `DOSAI-CHECKPOINT-ECDSA-P256-SHA256-JCS-V1` signs a domain-separated canonical
  payload binding journal and epoch identities, exact sequence and event hash,
  prior checkpoint, prior receipt, policy and algorithm versions, transition,
  active key, and all participating public keys.
- Checkpoint identity is the payload digest, not the nondeterministic ECDSA
  envelope. P-256 SPKI bytes determine key identity; signatures are strict
  canonical-base64 ASN.1 DER and verify before use.
- `GENESIS`, `CONTINUITY`, `ROTATION`, and `RECOVERY` have disjoint exact rules.
  Rotation requires old and new signatures. Recovery lacks the old signature,
  records a reason, and remains reduced assurance.
- The signer independently verifies the full journal and requires the prior
  checkpoint's exact event hash at its sequence in the current database. A
  sibling fork with copied journal identity cannot become an ancestor.
- The opaque software authority tracks one journal lineage, rejects a second
  successor from an already consumed predecessor, and retires the old authority
  after rotation. No arbitrary-message signing method is exported.
- Receipt identity is deterministic over independently verifiable anchor evidence
  and lineage. Repeating one response yields one receipt identity; local verifier
  time and generation cannot change the prior-receipt link.
- Assurance reports separate local-durable, signed, and anchored-through ranges.
  A receipt is reverified under pinned trust before `ANCHORED`; a schema-valid
  receipt alone is insufficient. Missing trusted time, excessive event lag,
  recovery, unavailable hardware proof, or journal failure degrades or breaks
  assurance without affecting emergency-stop design.

## Faults Found and Remediated

1. The first assurance evaluator accepted any schema-valid receipt as anchored.
   It now requires a complete offline Rekor proof reverified under pinned trust.
2. Journal ID, epoch, and a later sequence did not prove that a prior signed head
   was an ancestor. Journal verification now binds the exact event hash at the
   checkpoint sequence; a copied sibling fork is rejected.
3. The first software signer was stateless and could sign two successors from one
   predecessor. Opaque authority state now consumes predecessor generations and
   retires the old key after rotation.
4. Receipt normalization initially assigned random UUIDs, so one remote bundle
   could have multiple local lineage identities. Receipt identity is now a
   deterministic digest of target-verifiable evidence only.
5. A caller-provided boolean could have upgraded a parsed key label to hardware
   assurance. No current input can produce hardware assurance; Secure Enclave
   state remains degraded until a packaged native proof exists.

## Validation

| Command or inspection | Result |
| --- | --- |
| Strict Draft 2020-12 compilation and synchronized runtime admission | PASS; checkpoint and receipt v1 |
| P-256 SPKI identity, DER signature, canonical payload, and mutation checks | PASS |
| Fresh journal head, stale head, wrong digest, sibling fork, and false genesis | PASS; rejected fail-closed |
| Continuity, duplicate successor, dual-signed rotation, old-key retirement, and recovery | PASS |
| Forged, cloned, relabeled, and arbitrary-message signer access | PASS; rejected |
| Rekor v2 request minimization | PASS; digest, active signature, and public key only |
| Canonical body, version, log identity, response shape, and trusted-time spoofing | PASS; rejected |
| Merkle index, path, root, tree size, signed checkpoint, and selected-key signature mutation | PASS; rejected |
| Unknown C2SP signature handling and selected known-key failure | PASS |
| Receipt replay, trust substitution, deterministic reconciliation, and offline revalidation | PASS |
| Architecture import and no-network checks | PASS; no fetch, HTTP, socket, or process execution path |
| `pnpm run check` under Node 24.18.0 and pnpm 11.18.0 | PASS; seven typechecks, 103 tests, three production builds |
| Runtime capability matrix | Unchanged; all effectful capabilities remain `UNVERIFIED` |

## Remaining Gates and Limitations

- ADR 0012, process ownership v4, schema registry v8, and both schemas are the
  accepted local baseline. Acceptance does not prove or authorize their pending
  hardware and public-log operations.
- The production Security-framework helper does not exist. No Keychain or Secure
  Enclave key was created, no private-key non-exportability was tested, and no
  package entitlement or supported-hardware matrix was exercised.
- The software fixture protects a private `KeyObject` only from its JavaScript
  API. It is not hardware-backed, restart-persistent, administrator-resistant, or
  approved for product use.
- TUF retrieval and verification are not implemented. The offline verifier
  assumes its exact pinned trust-material input came from a future trusted
  bootstrap; arbitrary local input cannot support a product `ANCHORED` claim.
- No Rekor request was transmitted and no public entry exists. The synthetic log
  key and tree prove protocol behavior, not independent administration,
  availability, consistency monitoring, or anti-fork discovery in production.
- Rekor v2 does not provide online search. Receipt retention is mandatory, and
  P7/P11 still need tile monitoring, an independent monitor, or witnessed
  checkpoints before claiming automatic discovery of hidden log equivocation.
- No RFC 3161 timestamp or witness signature is verified. The receipt proves log
  inclusion and order only; it makes no trusted wall-clock statement.
- Checkpoints, receipts, protected lineage state, transport, retries, anchor lag
  persistence, startup reconciliation, and read-only export are not connected to
  an OS service, Electron, or P7's independent verifier.
- The Sigstore public log publishes checkpoint digest, signature, and public key.
  Owner acceptance of this architecture is not authorization to publish even a
  synthetic entry; that action receives its own explicit gate.

## Gate Decision

The owner accepted ADR 0012 and the local protocol artifacts as the design
baseline while keeping P2.4 incomplete and every capability unchanged. The next
sequential gate is a packaged Security-framework helper and local Secure Enclave
lifecycle proof. Only after that proof may the owner separately authorize one
non-secret synthetic Rekor entry using TUF-derived trust material and a clean
offline verifier.

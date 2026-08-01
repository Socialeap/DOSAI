# P2.4 Checkpoint and Anchor Protocol Evidence

**Status:** `[!] BLOCKED_EXTERNAL`<br>
**Evidence captured:** `2026-07-31T20:33:46-04:00`<br>
**Engineering result:** `PASS_LOCAL_AND_TUF_FAIL_CLOSED`<br>
**Review decision:** `OWNER_AUTHORIZED_COMPLETION_RUN`<br>
**Phase completion:** Blocked on a TUF-authorized Rekor v2 writer

**Current scheduling:** `[-] DEFERRED_EXTERNAL` as of
`2026-07-31T21:09:59-04:00`. The owner accepted partial completion so P2.5 could
proceed. Deferral does not satisfy, remove, or weaken either the persistent
Keychain proof or the TUF-authorized Rekor v2 publication proof.

This record began as the accepted synthetic offline protocol proof. The
completion generation adds an official Sigstore TUF client, strict v2 service
selection, algorithm-explicit P-256 and Ed25519 C2SP verification, and a clean
read-only production TUF audit. Production SigningConfig authorized only Rekor
v1, so the runner failed closed before any public write. Every runtime capability
remains `UNVERIFIED`.

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

## Completion Generation

| Artifact | State | SHA-256 |
| --- | --- | --- |
| Subject commit | Clean audit subject | `537675e5433c72b6733a5ca7ac9fdc38f348aea4` |
| ADR 0012 amended compatibility decision | Accepted implementation boundary | `ff86171b1deb0f6ae0200e364bf54c33d37045b568f4953723ff99b74ed9b590` |
| TUF target resolver | Implemented, pure, fail-closed | `1f04c3d5f65b5094a67b5b7dae87ea11e9eeb73980617fdb5cebf46731edfc9c` |
| Rekor verifier | P-256 and Ed25519 | `995b25028451b3ea6835334f6515dffacc3d44f3ba54c9ead2fd11b16a9b4b5b` |
| Isolated official TUF client manifest | Exact `@sigstore/tuf@5.0.0` | `019589c9ffe4dcd66dcd201537cadd588ae09ec8ffb08b51935ae4a1986b1bd3` |
| Isolated dependency lock | 11 integrity-locked packages | `ba82e29115dabfacb5954a00eed1cd8c2fe27a1b99f51ab3f31e5109be0ec55f` |
| Formal TUF evidence | Secret scan PASS; no publication | `6c7edbfde0e65b2b23390c5247ee789f203a9cd1fc5c6cba4cbefa4507b531b2` |

## Architecture Selection

- Production checkpoint signing still targets a permanent, non-exportable Secure
  Enclave P-256 key. A separate packaged proof now demonstrates process-scoped
  Secure Enclave signing and non-exportability; the TypeScript signer remains an
  isolated `SOFTWARE_BACKED_TEST_ONLY` fixture.
- Sigstore's public-good Rekor v2 transparency log is the selected independent
  anchor. Active shards and log keys must come from TUF SigningConfig and
  TrustedRoot material. No shard URL is hardcoded.
- Rekor receives only the checkpoint signing-input SHA-256 digest, active P-256
  signature, and public SPKI key through `hashedrekord` v0.0.2. Journal and event
  payloads are absent from the request.
- The verifier accepts only TUF-selected ECDSA P-256 or Ed25519 log-checkpoint
  profiles, reconstructs the exact canonical Rekor body, verifies the RFC 6962
  inclusion path, and verifies the signed C2SP checkpoint under pinned trust.
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
6. The accepted verifier assumed a P-256 log checkpoint, but production
   TrustedRoot advertises the v2 shard with Ed25519. Verification now binds an
   exact TUF-selected profile and validates each C2SP key-ID construction.
7. Adding TUF to the application lock would invalidate accepted supply-chain
   evidence. The official client now has a separate exact, integrity-locked audit
   dependency closure; the application lock remains byte-identical.
8. Current production SigningConfig contains no Rekor v2 service. The live runner
   records `BLOCKED_EXTERNAL_TUF_NO_REKOR_V2_SERVICE` and cannot substitute the
   URL found in TrustedRoot or documentation.

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
| TUF service, window, operator, URL, key, key-ID, algorithm, and substitution corpus | PASS; fail-closed |
| P-256 and Ed25519 signed C2SP checkpoints | PASS; independently verified |
| `pnpm run audit:p2:rekor-live --run-id 6ce3dae4-f5c6-4eba-8822-2e0979fc1827 --mode trust-only` | PASS_FAIL_CLOSED; metadata current, no v2 writer, no publication, secret scan PASS |
| Production TUF metadata | Root v15, timestamp v743, snapshot v165, targets v14; all current at audit |
| `pnpm run check` under Node 24.18.0 and pnpm 11.18.0 | PASS; seven typechecks, 117 tests, three production builds |
| Packaged GUI audit | PASS; 29 assertions, secret scan PASS, cleanup PASS |
| Runtime capability matrix | Unchanged; all effectful capabilities remain `UNVERIFIED` |

## Remaining Gates and Limitations

- ADR 0012, process ownership v4, schema registry v8, and both schemas are the
  accepted local baseline. Acceptance does not prove or authorize their pending
  hardware and public-log operations.
- A packaged process-scoped Secure Enclave proof passed on this Mac. Persistent
  Keychain creation remains unavailable to the ad hoc helper because the host has
  no Apple application signing identity; production checkpoint signing is not
  implemented or connected to Electron.
- The software fixture protects a private `KeyObject` only from its JavaScript
  API. It is not hardware-backed, restart-persistent, administrator-resistant, or
  approved for product use.
- TUF retrieval and strict target resolution are implemented for the isolated
  audit. Production SigningConfig currently authorizes only Rekor v1, while
  TrustedRoot lists a v2 Ed25519 shard; no safe v2 submission is presently
  possible under the accepted contract.
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
- No public entry was created. The live runner requires an exact publication
  authorization phrase in addition to a TUF-authorized v2 service.

## Gate Decision

All locally controllable P2.4 completion work is green, including the packaged
hardware proof, TUF bootstrap, current-key compatibility, complete regression,
and packaged GUI audit. P2.4 remains blocked rather than complete because the
required real Rekor v2 proof cannot be submitted until Sigstore distributes an
active v2 writer through production SigningConfig. No capability state changes.

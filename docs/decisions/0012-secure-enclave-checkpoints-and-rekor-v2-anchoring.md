# ADR 0012: Secure Enclave Checkpoints and Rekor v2 Anchoring

- **Status:** Accepted
- **Date:** 2026-07-31
- **Status updated:** 2026-07-31T19:41:14-04:00
- **Decision owner:** Repository owner
- **Related controls:** F01, F05, F12
- **Related plan phases:** P2, P7, P11
- **Supersedes:** The independent-anchor deferral in Baseline Contracts v1

## Context

ADR 0004 requires P-256 checkpoint signatures, honest key-protection claims,
and a separately administered append-only anchor. P2.3 proves only a local
hash-chained journal. A valid earlier database prefix can still replace the
current journal without local detection.

Apple documents that Secure Enclave keys are created on supported hardware,
remain non-exportable, and are restricted to NIST P-256 operations. General
macOS applications do not receive a portable Apple attestation that lets a
remote verifier independently prove that an arbitrary public key is
Secure-Enclave-backed. DOSAI must therefore distinguish local platform evidence
from remotely verifiable key identity.

Sigstore Rekor v2 accepts a SHA-256 artifact digest, P-256 signature, and public
key as a `hashedrekord` entry. Its response contains the canonical entry, Merkle
inclusion proof, and signed C2SP log checkpoint. Rekor v2 deliberately returns
no trusted integrated time and no online search API. Clients must retain the
verification bundle, obtain active shard endpoints and keys through Sigstore's
TUF SigningConfig and TrustedRoot, and fail closed on unknown versions.

## Decision

### Checkpoint Identity and Signing

- Use `DOSAI-CHECKPOINT-ECDSA-P256-SHA256-JCS-V1`. The signing input is the ASCII
  domain separator, a zero byte, and the RFC 8785-compatible canonical checkpoint
  payload. The checkpoint identity is the SHA-256 digest of that signing input;
  signatures are evidence for that stable identity and are not recursively part
  of it.
- Bind journal and epoch identities, exact sequence and event head, preceding
  checkpoint identity, preceding anchor-receipt digest, journal algorithm suite,
  checkpoint policy version, transition kind, active signing-key identity, and
  all participating public-key records into the payload.
- Compute each key identity as SHA-256 of its canonical SubjectPublicKeyInfo DER.
  Admit only P-256 SPKI keys and ASN.1 DER ECDSA signatures.
- Permit `GENESIS`, `CONTINUITY`, `ROTATION`, and `RECOVERY` transitions. Rotation
  requires valid signatures by both old and new keys. Recovery explicitly lacks
  the old-key signature and cannot inherit uninterrupted assurance.
- The production Z6 signer will use Apple's Security framework and a permanent,
  non-exportable Secure Enclave P-256 key when platform and package evidence
  permit it. Its API accepts only a freshly verified current journal head plus
  pinned lineage state; it exposes no arbitrary-message signing operation.
- A software-backed signer exists only as an isolated local proof fixture. It is
  permanently labeled `SOFTWARE_BACKED_TEST_ONLY`, cannot claim hardware
  protection, and cannot advance a production capability state.

### Rekor v2 Anchor

- Select the Sigstore public-good Rekor v2 transparency log as DOSAI's initial
  independent anchor candidate. It is independently administered and its public
  write API cannot update or delete accepted entries. DOSAI uploads only the
  checkpoint signing-input digest, active P-256 signature, and public key through
  `hashedrekord` v0.0.2. Journal events and payloads never leave the Mac.
- Resolve active Rekor shards from a TUF-verified SigningConfig and resolve log
  keys from a TUF-verified TrustedRoot. Never hardcode a shard URL or trust a key,
  origin, validity window, or log identifier returned by the write response.
- Persist a self-contained normalized receipt containing the exact canonicalized
  body, log index, inclusion path, signed C2SP checkpoint, log identity, and
  digests of the trusted configuration used for verification.
- The v1 verifier admits only the TUF-selected ECDSA P-256 checkpoint-key profile.
  A Rekor shard using another signed-note algorithm requires a versioned verifier
  update rather than runtime algorithm negotiation.
- Verify the canonicalized body against the DOSAI checkpoint, reconstruct the
  RFC 6962 leaf and inclusion root, verify the signed-note checkpoint under the
  selected trusted log key, and require exact tree size, root, origin, key ID,
  kind, and version agreement. Unknown signatures are ignored; any invalid
  signature from the selected known key rejects the receipt.
- Rekor v2 inclusion establishes that the checkpoint was incorporated at an
  exact log index under a signed tree head. DOSAI makes no trusted-time claim from
  `integratedTime`, which Rekor v2 fixes at zero. Time-bounded assurance requires
  a separately verified RFC 3161 timestamp or later witnessed checkpoint.
- Because Rekor v2 has no online search API, DOSAI retains every response bundle.
  P7's independent verifier will also support tile monitoring or a selected
  independent monitor before DOSAI claims automatic discovery of a hidden fork.

### Assurance

- Report exact ranges: locally durable through sequence N, signed through M, and
  independently anchored through K. `ANCHORED` applies only through K after an
  offline-verifiable receipt passes under independently obtained trust material.
- Distinguish `SIGNED_LOCAL_SOFTWARE`, `SIGNED_LOCAL_HARDWARE`, `ANCHORED`,
  `DEGRADED`, and `BROKEN`. Software proof never displays as hardware assurance.
- An anchor outage may use only the policy's explicit event-count lag. A duration
  limit with no trusted time evidence fails closed rather than using local wall
  time as independent evidence.
- Local journal rollback behind a retained verified receipt, conflicting
  checkpoint successors, stale or replayed receipts, key substitution, invalid
  rotation, unavailable required key, or uncertain lineage enters `BROKEN` or an
  explicit owner-visible recovery path. Emergency stop remains independent.

## Security and Operational Consequences

The public Rekor entry reveals a random journal identifier only indirectly
through the digest, plus a public P-256 key and signature. The checkpoint itself
must still be retained locally for verification. Rekor availability is an
external dependency, but an outage cannot erase previously retained proofs.

Secure Enclave use ties the private key to one supported Mac. Migration, key
loss, Keychain reset, hardware failure, or package entitlement change requires
an explicit reduced-assurance recovery. The public key and verification material
remain exportable; the private key does not.

This proposal authorizes no network call, public-log write, Keychain mutation,
or capability-state change. Those require owner acceptance, packaged native
helper evidence, TUF verification, a synthetic non-secret live anchor proof, and
retained independent verification artifacts.

## Alternatives Considered

- A local receipt file does not survive local rollback and is not independent.
- Git commits or GitHub API responses do not provide the required target-signed,
  append-only inclusion proof under an append-only credential.
- Generic object storage retention can prevent deletion but does not itself
  provide a portable signed inclusion and consistency proof.
- Rekor v1 is in maintenance mode and does not match the selected forward
  contract. Hardcoding either v1 or one v2 shard would fail rotation safety.
- Treating a software key as protected would create a false assurance claim.
- Uploading full events, labels, action text, or owner identity would violate the
  minimal public-metadata boundary.

## Evidence Required

P2.4 must prove strict schemas; checkpoint canonicalization; P-256 key and
signature admission; arbitrary-signing denial; old/new dual rotation; explicit
recovery; stale head and lineage rejection; software/hardware label separation;
Rekor request reconstruction; C2SP signature and RFC 6962 inclusion verification;
unknown version, key, origin, log index, tree size, root, body, proof, receipt,
replay, substitution, rollback, and fork rejection; outage and lag behavior; and
absence of journal payloads, secrets, and private keys from anchor material.

Before `ANCHORED` is shown in a packaged app, a clean verifier must validate a
real non-secret synthetic entry using TUF-derived trust material without DOSAI
write authority. Secure Enclave evidence must verify non-exportability on each
supported package and Mac profile without claiming unavailable remote hardware
attestation.

## Revisit Conditions

Revisit when Sigstore changes the v2 entry or trust-distribution contract,
witnessing becomes required or generally available, a privacy-preserving
separately administered anchor is selected, Apple offers general Secure Enclave
key attestation on macOS, or policy requires trusted time. Any algorithm, payload,
anchor, trust-root, or key-lineage change requires a versioned transition and
renewed adversarial evidence.

## References

- Apple, Protecting Keys with the Secure Enclave:
  <https://developer.apple.com/documentation/security/protecting-keys-with-the-secure-enclave>
- Sigstore Rekor v2 client contract:
  <https://github.com/sigstore/rekor-tiles/blob/main/CLIENTS.md>
- Sigstore Rekor v2 service and sharding guidance:
  <https://github.com/sigstore/rekor-tiles>
- C2SP signed notes: <https://c2sp.org/signed-note>
- C2SP transparency-log checkpoints: <https://c2sp.org/tlog-checkpoint>
- RFC 6962 Merkle audit paths: <https://www.rfc-editor.org/rfc/rfc6962>
- RFC 8785 JSON Canonicalization Scheme:
  <https://www.rfc-editor.org/rfc/rfc8785>

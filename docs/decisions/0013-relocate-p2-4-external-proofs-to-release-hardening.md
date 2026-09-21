# ADR 0013: Relocate P2.4 External Proofs to Release Hardening

- **Status:** Accepted
- **Date:** 2026-07-31
- **Status updated:** 2026-07-31T23:54:35-04:00
- **Decision owner:** Repository owner
- **Related controls:** F12
- **Related plan phases:** P2, P11
- **Supersedes:** The P2.4 external-proof timing only; it does not supersede ADR 0012's technical contracts.

## Context

P2.4 has a complete local protocol implementation and formal no-effect
acceptance evidence. Two proofs require external conditions that are not
available in the current development environment:

1. Persistent Secure Enclave-backed Keychain storage using a signed application
   identity and supported release packaging.
2. A public Rekor v2 publication using a TUF-authorized writer, followed by
   independently retained and verified inclusion evidence.

The local P2 suites correctly report these assurance ranges as deferred. Treating
those unavailable proofs as a P2 blocker prevents implementation of later
phases, while treating them as complete would overstate DOSAI's assurance.

## Decision

Adopt **Option B**. Relocate the two external proofs from the P2 exit gate to
Phase 11, Release Hardening and Independent Review.

P2 may exit when its local, bounded contracts and formal no-effect suites pass,
provided that:

- the local journal and checkpoint protocol remain explicitly unanchored;
- software-backed test keys remain labeled test-only;
- missing Secure Enclave and public-anchor evidence remains visible as a
  limitation; and
- no component may request stronger assurance, publish to Rekor, or claim
  release-grade key protection before the relevant P11 proof passes.

P11 owns the following release-hardening work:

- prove persistent Secure Enclave key protection and Keychain lifecycle behavior
  in the signed, packaged release profile on supported Apple hardware; and
- prove TUF-authorized public Rekor v2 publication, response retention,
  inclusion verification, and independent evidence integrity without exposing
  secrets or granting DOSAI an unreviewed production write path.

The P11 exit gate remains a hard release condition. Relocation changes sequencing,
not the required assurance or the technical contracts selected in ADR 0012.

## Consequences

P2 can be marked complete with an explicit local-assurance limitation, allowing
P3 through P10 implementation to proceed under their own gates. All capabilities
that require hardware-backed or externally anchored assurance remain
`UNVERIFIED` or unavailable until P11 evidence is accepted.

The release process carries additional proof obligations and must retain the
exact P2 limitations in its final support statement. A local passing test cannot
be promoted to a hardware-backed or publicly anchored claim by documentation,
configuration, or runtime availability alone.

## Alternatives Considered

- **Keep the proofs in P2:** rejected because external signing identity and
  TUF-authorized publication are release-environment dependencies, not required
  to implement the local safety kernel.
- **Declare the proofs complete from local simulations:** rejected because it
  would create a false Secure Enclave or public-anchor assurance claim.
- **Remove the proofs:** rejected because release-grade key protection and
  independently verifiable anchoring remain required for the intended assurance
  posture.

## Required P11 Evidence

P11 must link exact commands, platform and package identities, signed helper and
application bytes, entitlements, Keychain cleanup, TUF metadata and target
selection, authorized Rekor response bundles, inclusion verification, secret
scan results, and an independent evidence report. Publication must be explicitly
authorized for that release-hardening run; no development or acceptance fixture
may silently contact a public log.

## Revisit Conditions

Revisit this decision if the release profile cannot satisfy the Secure Enclave
or Rekor contracts, if Sigstore changes the v2 authorization model, or if a
separate owner-approved ADR changes the final release assurance requirements.

# P3 Watchdog XPC Transport Preflight

**Status:** `OWNER_ACCEPTED`<br>
**Recorded:** `2026-08-02T18:19:01-04:00`<br>
**Validated:** `2026-08-02T18:21:43-04:00`<br>
**Accepted:** `2026-08-02T18:31:25-04:00`<br>
**Decision:** Accepted ADR 0020<br>
**Accepted baseline:** Process ownership v10 and schema registry v18<br>
**Ownership:** Accepted process ownership v11 over accepted v10

## Objective

Define the narrowest authenticated XPC transport and typed client fixture that
can follow the accepted inert watchdog core without adding service registration,
application composition, VM, process-launch, filesystem, network, journal,
reconciliation, or production authority.

## Platform Correction

The macOS 26 SDK's Swift `XPCPeerRequirement` wrapper is available only on
macOS 26 and cannot support DOSAI's accepted macOS 15 floor. The public C XPC
API `xpc_connection_set_peer_code_signing_requirement` is available from
macOS 12 and enforces a code-signing requirement on every message received by
the configured connection. DOSAI can therefore preserve macOS 15 by using that
API directly from Swift through the XPC module.

Manual PID checks, audit-token parsing, private APIs, and a macOS 26 baseline
increase are unnecessary and are rejected.

## Physical Preflight

An arm64 macOS 15 scratch probe established that:

- an anonymous XPC listener and endpoint exchange a real dictionary and reply;
- the C peer-requirement API compiles at the macOS 15 deployment target;
- setting a peer code-signing requirement on either endpoint causes the
  ad-hoc-signed probe to fail closed rather than pass as authenticated; and
- this Mac currently has no valid code-signing identity.

A one-day self-signed identity was generated and imported into an isolated
temporary keychain to evaluate a non-production fallback. macOS required a
separate trust decision before accepting it as a valid signing identity. The
trust operation was stopped, the keychain was deleted, and the temporary
certificate, private key, source, binary, and caches were removed. No trust
setting, signing identity, credential, or temporary artifact remains.

This result is useful: an ad-hoc signature cannot be mislabeled as XPC peer
authentication, and DOSAI will not install or silently trust a synthetic root
to make a test pass.

## Proposed Boundary

Process ownership v11 is hash-bound to accepted v10. It changes only the Main
client declaration, execution-service transport declaration, and their
invariants.

The proposed native fixture may:

- create one anonymous in-process XPC listener and endpoint;
- apply exact code-signing requirements to both endpoint connections;
- admit only the accepted watchdog v1 dictionaries within the 4,096-byte
  ceiling; and
- route accepted requests to the existing embedded inert control core.

The proposed Main-side client may only build typed requests, validate typed
responses, enforce session sequencing and timeout behavior, and call an
injected test transport. It cannot import native-helper source, open an XPC
connection, set peer requirements, discover, configure, register, or launch a
service.

The proposal reserves four exact implementation files but adds none before
owner acceptance. It adds no schema generation because accepted registry v18
already governs the session, request, and response envelopes.

## Identity Gate

Authenticated runtime evidence requires an existing owner-authorized Apple
Development signing identity in the user's Keychain. The test harness may
select that identity only after explicit owner authorization. It may not export
the certificate or private key, change Keychain trust, create a synthetic root,
alter the default keychain search list, or persist identity material in the
repository.

Ad-hoc signing remains valid for the accepted inert core build proof but is
ineligible for authenticated XPC evidence. If no suitable development identity
is available, implementation can be prepared and statically validated but the
transport slice cannot be accepted as authenticated.

## Required Adversarial Proof

After v11 and identity use are accepted, the implementation must prove:

- correct requirements permit the signed fixture while wrong identifiers,
  wrong certificate identity, and ad-hoc peers fail closed;
- malformed types, unknown keys, oversized frames, stale identity, sequence
  gaps, changed request-ID reuse, and cross-session replay are rejected;
- disconnect closes admission and schedules the reserved stop-all path;
- stop-all retains precedence under bounded queue pressure;
- transport code never calls the core's deterministic request fingerprint a
  signature, MAC, authentication tag, or credential;
- `FAILED` and `QUARANTINED` remain distinct in inspection and future
  production reporting, while uncertain cleanup stays fail-closed; and
- source, binary imports, and package inspection show no registration,
  ServiceManagement, VM, process-launch, filesystem, network, or generic
  payload authority.

## Validation

The exact governed toolchain was Node `24.18.0` and pnpm `11.18.0`.

```text
Focused ownership and watchdog contract checks
29 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run typecheck
8 TypeScript project checks passed

pnpm --config.verify-deps-before-run=warn test
280 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run build
main, preload, and renderer production builds passed
```

JSON parsing, accepted v10 and registry v18 digests, accepted Swift core source
digests, proposed-source absence, temporary-material cleanup, patch, whitespace,
authority, and high-confidence secret checks pass. The existing pnpm stale
`node_modules` workspace-state warning and benign Git fsmonitor IPC warning
remain environmental; no dependency or lockfile changed.

## Known Limitations

- Anonymous in-process XPC proves framing and OS code-requirement enforcement,
  not named Mach service registration or separate-process lifecycle.
- A development identity proves only the test identity. Production Team ID,
  exact app/service identifiers, hardened runtime, entitlements, LaunchAgent,
  SMAppService approval states, and packaged mutual identity remain later gates.
- The accepted core remains inert and application-unreachable; no actual
  capsule, VM, process, registry, or audit integration is added.
- Physical macOS 15 execution remains a Phase 11 proof; this host is macOS
  26.5.2 and only the deployment target is validated locally.

## Owner Decision

The repository owner accepted process ownership v11 and this transport boundary
and authorized test-only use of an existing Apple Development signing identity
after one becomes available. No valid identity currently exists on this Mac,
so successful authenticated-peer evidence remains pending while implementation
and fail-closed ad-hoc rejection may proceed.

No transport source, client source, service registration, application wiring,
schema, signing identity, trust setting, VM operation, process launch, commit,
push, deployment, or publication is added by this preflight.

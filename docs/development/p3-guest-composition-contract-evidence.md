# P3 Guest Composition Contract Evidence

**Status:** `ACCEPTED`  
**Prepared:** `2026-08-01T15:59:36-04:00`  
**Accepted:** `2026-08-01T17:05:03-04:00`  
**Governing decisions:** `docs/decisions/0014-linux-microvm-isolation-backend.md`, `docs/decisions/0015-reproducible-linux-guest-supply-chain.md`

## Scope

Accepted schema registry v13 replaces only the guest-artifact manifest entry
from v1 to v2. Accepted v12 and its v1 manifest remain immutable. V2 describes
the exact composition evidence that a future guest build must produce without
claiming that any evidence has been generated or verified.

This slice adds no Buildroot source, Linux source, guest agent, compiler,
toolchain, filesystem image, executable helper, VM lifecycle operation, host
path, or runtime eligibility.

## Composition Binding

The v2 candidate binds by SHA-256 and unique package path:

- the four ordered kernel, initramfs, immutable SquashFS, and guest-agent
  artifacts;
- exact kernel-command-line bytes and the exact kernel configuration, with
  fixed text media types and byte ceilings;
- canonical initramfs and root-filesystem inventories with fixed JSON media
  type, bounded byte sizes, and bounded entry counts;
- one fixed `/init` to read-only `/dev/vda` SquashFS to
  `/sbin/dosai-guest-agent` boot chain; and
- the root-filesystem guest-agent digest to the separately inspectable
  `GUEST_AGENT` artifact digest.

The kernel declaration fixes loadable modules, module loading, debug interfaces,
the network stack, and interactive console support absent. Alternate init,
rescue shell, and login paths are fixed absent.

## Fail-Closed State

The only admissible release state is `COMPOSITION_DECLARED_UNVERIFIED` with
`runtime_eligible: false`. Supply-chain assurance remains not proven, signatures
remain unverified, vulnerability review remains unperformed, and every
composition verification flag remains false.

The v2 contract therefore records what must later be inspected without allowing
a declaration to impersonate completed evidence. A future runtime-eligible
version requires separate schemas, verification code, accepted artifacts, and
all ADR 0014-0015 gates.

## Admission Properties

JSON Schema rejects unknown fields and authority expansion. The pure runtime
admission layer additionally enforces ordered roles, role/media agreement,
ordered inventories, cross-evidence path uniqueness, and exact embedded-agent
digest equality. It rejects hidden, symbolic, inherited, sparse, accessor-backed,
or incorrectly shaped values without invoking getters, then clones and freezes
accepted data.

The module imports no Node, Electron, Virtualization, process, filesystem, or
network API and exposes no effect operation.

## Validation

| Check | Result |
| --- | --- |
| Accepted registry v12 SHA-256 | PASS; `2638a165277fe93a8cdd02aa0d321cb93301708907e2f28fb15733410752ea42` |
| Accepted registry v13 changes only guest manifest v1 to v2 | PASS; SHA-256 `b57a67eadec3245d96cb21d765b3a728788a1c3f3c59917e26cd121fadf0e642` |
| JSON Schema and runtime admission agreement | PASS |
| Eligibility, verification, kernel, boot, and authority expansion corpus | PASS |
| Ordering, path uniqueness, and embedded-agent digest relations | PASS |
| Accessor and hidden-property rejection | PASS; getters are not invoked |
| Focused composition tests | PASS; 5 tests |
| Exact Node 24.18.0 / pnpm 11.18.0 repository check | PASS; eight typechecks, 201 tests, production build |
| Electron package | PASS; 9 fuses, 11 ASAR entries, least-privilege Info.plist |
| Guest artifacts, execution service, and composition contract absent from package | PASS |
| Changed-file secret scan | PASS; no recognized credential or private-key pattern |

## Remaining Gates

- Selection and proof of the guest-agent language/toolchain and SPDX 2.3 tool.
- Reproducible construction and independent inspection of real artifact and
  composition evidence bytes.
- Execution-service implementation, authenticated control, package signing, VM
  lifecycle, cancellation, cleanup, and physical-host acceptance evidence.

Arbitrary repository execution remains unavailable.

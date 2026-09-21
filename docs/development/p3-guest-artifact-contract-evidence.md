# P3 Guest Artifact and MicroVM Profile Contract Evidence

**Status:** `ACCEPTED`  
**Prepared:** `2026-08-01T14:57:02-04:00`  
**Accepted:** `2026-08-01T15:37:03-04:00`  
**Governing decision:** `docs/decisions/0014-linux-microvm-isolation-backend.md`

## Scope

This slice defines the metadata required before DOSAI may evaluate a Linux guest
artifact set or a per-capsule microVM profile. It adds no guest binary, service
implementation, VM lifecycle operation, process launch, host path, or runtime
eligibility.

Accepted schema registry v12 is additive over accepted v11. It defines:

- `guest-artifact-manifest` v1 for one ordered arm64 Linux kernel, initramfs,
  immutable root filesystem, and guest agent artifact set.
- `microvm-profile` v1 for one fixed structural profile bound to an opaque guest
  manifest digest and opaque worktree lease identity.

## Fail-Closed State

The guest manifest can represent only `CANDIDATE_UNVERIFIED` with
`runtime_eligible: false`. Its supply-chain state is fixed to a not-proven clean
rebuild, no vulnerability review, and unverified signatures. This prevents a
well-shaped placeholder from being mistaken for release evidence.

The microVM profile can represent only
`STRUCTURAL_ONLY_NO_BOOT_ARTIFACTS` with `runtime_eligible: false`. It fixes:

- one CPU and 512 MiB memory;
- one GiB disposable writable storage with reuse forbidden;
- one immutable root filesystem;
- zero network devices;
- one opaque leased-worktree reference mounted at `/workspace`;
- a non-root UID/GID 1000 identity with no environment, login, or interactive
  shell;
- no audio, clipboard, graphics, keyboard, pointing, or USB integration;
- a fresh VM, destructive-stop requirement, and verified-cleanup requirement.

Neither contract contains a host filesystem path. Resolving an opaque lease to
a canonical host directory remains a future authenticated service obligation.

## Admission Properties

Runtime admission rejects unknown, hidden, symbolic, inherited, accessor-backed,
or incorrectly ordered data without invoking getters. It clones and freezes
accepted values. Schema-valid duplicate artifact paths, reordered roles, and
role/media mismatches fail the stricter relational admission layer.

The isolation contract module imports no Electron, Node, process, network, or
Virtualization API and exposes no effect operation.

## Validation

| Check | Result |
| --- | --- |
| Accepted registry v11 SHA-256 | PASS; remains `d37498eefb78604c52b288449c1bf3938cb8d8054982f332f025aa386f557b79` |
| Accepted registry v12 additive lineage | PASS |
| JSON Schema and strict runtime admission agreement | PASS |
| Role, path, media, digest, and assurance adversarial corpus | PASS |
| Resource, network, mount, identity, integration, state-reuse, and lifecycle expansion corpus | PASS |
| Accessor, hidden-property, symbolic-key, and array-shape rejection | PASS; getters are not invoked |
| Exact Node 24.18.0 / pnpm 11.18.0 repository check | PASS; eight typechecks, 195 tests, production build |
| Electron package | PASS; 9 fuses, 11 ASAR entries, least-privilege Info.plist |
| Execution-service and isolation artifacts absent from package | PASS |
| Added-file secret scan | PASS; no recognized credential or private-key pattern |

## Remaining Gates

- Selection and reproducible construction of actual guest artifacts.
- Independent digest, SBOM, license, vulnerability, signature, and clean-room
  rebuild verification before any runtime-eligible manifest version exists.
- Authenticated lease resolution, canonical path and descriptor identity proof,
  service implementation, package signing, VM lifecycle, cancellation, cleanup,
  and physical-host acceptance evidence.

Arbitrary repository execution remains unavailable.

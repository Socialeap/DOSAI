# P3 Native Linux Builder Boundary Evaluation

**Status:** `ACCEPTED`  
**Evaluated:** `2026-08-02T02:45:10-04:00`  
**Proposed:** `2026-08-02T02:46:58-04:00`  
**Validated:** `2026-08-02T02:51:33-04:00`  
**Accepted:** `2026-08-02T03:16:53-04:00`  
**Decision:** `docs/decisions/0018-native-linux-independent-builders.md`

## Local Capability Finding

Read-only inspection found Docker client/engine `29.6.1`, Docker Desktop
`4.82.0`, Buildx `0.35.0-desktop.2`, and a `linux/arm64` daemon. The cached
images are unrelated application services; none is a reviewed Buildroot builder.
No image was pulled, created, started, tagged, exported, or removed.

Buildroot `2025.02.16` permits the first Go source-bootstrap stage on x86,
x86-64, and 32-bit Arm hosts, but not AArch64 hosts. The local daemon therefore
cannot natively execute the accepted source chain. An amd64 image under
emulation would remain one-host simulation evidence only.

## Proposed Boundary

ADR 0018 proposes one digest-pinned Debian 13 amd64 OCI builder definition and
two fresh native-amd64 Linux executions. The same sealed image and input bundle
are used by both builders, while all writable state, caches, hosts, outputs, and
temporary paths remain independent.

The build stage has no network, implicit image pull, credentials, daemon socket,
host namespaces, devices, privileges, or writable input mount. Each run records
native platform evidence, isolation state, failed network probes, exact inputs,
outputs, and cleanup. A separate verifier performs exact output comparison.

## Security Interpretation

Independent executions detect nondeterminism and mutable-state contamination;
they do not make a shared builder image trustworthy. The image's digest,
Dockerfile, Debian snapshot, package closure, SBOM, provenance, signatures, and
vulnerability disposition remain distinct gates. Shared infrastructure-provider
control is also a declared common trust dependency.

Docker Desktop remains useful for policy and configuration simulations but is
excluded from release-builder identity because this Mac supplies one arm64
daemon and any x86-64 execution would be emulated.

## Validation

| Check | Result |
| --- | --- |
| Accepted provider configuration evidence | PASS; accepted without broadening authority |
| Local Docker client and daemon inspection | PASS; read-only, Linux/arm64 |
| Cached-image inspection | PASS; no eligible builder and no pull |
| ADR builder, isolation, independence, and residual-trust controls | PASS; four focused governance tests |
| Combined ownership, provider, and builder-boundary tests | PASS; 24/24 |
| Exact-toolchain repository check | PASS; eight typechecks, 220/220 tests, production build |
| Electron package and forbidden-content inspection | PASS; nine fuses, eleven ASAR entries, no builder content |
| Changed-file secret scan | PASS; no secret-like material found |
| Patch and guest-build scope inspection | PASS; clean patch, six governed guest-build files |

## Audit Remediation

The first full repository check found generated Finder metadata in the reserved
`native-helpers/` root. The architecture test correctly rejected that unexpected
file. After removing `native-helpers/.DS_Store`, the focused ownership test and
the complete repository check passed. A final guest-build inventory then found
and removed `guest-build/.DS_Store`; the directory now contains only the accepted
README, Buildroot external configuration, and patch input.

The tests and accepted ownership boundaries were not weakened. `.DS_Store` is
already ignored by Git, but local metadata is still excluded from governed
source and build-input inventories.

## Known Limitations

- No exact Debian base-image digest, snapshot timestamp, package closure,
  Dockerfile, OCI archive, SBOM, provenance, signature, or vulnerability review
  is proposed yet.
- No native-amd64 Linux environment was allocated or executed.
- Docker Desktop's daemon inspection required approved access to its local Unix
  socket; it did not mutate Docker state.
- No network-isolation, mount-isolation, cleanup, source build, reproducibility,
  or output-comparison proof has run.
- Finder may recreate ignored `.DS_Store` metadata when these directories are
  browsed; release input assembly must continue to use an exact allowlist and
  reject unexpected files.

Arbitrary repository execution remains unavailable.

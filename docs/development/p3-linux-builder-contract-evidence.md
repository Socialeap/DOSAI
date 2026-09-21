# P3 Linux Builder Input Contract Evidence

**Status:** `ACCEPTED`  
**Proposed:** `2026-08-02T03:22:39-04:00`  
**Validated:** `2026-08-02T03:25:35-04:00`  
**Accepted:** `2026-08-02T03:51:24-04:00`  
**Schema registry:** `docs/architecture/schema-registry-v15.json`  
**Runtime admission:** `src/contracts/p3/builder-input.ts`  
**Decision:** `docs/decisions/0018-native-linux-independent-builders.md`

## Purpose

Schema registry v15 proposes a declaration-only contract for the native Linux
builder selected by ADR 0018. It establishes the content-addressed builder input
boundary before any Dockerfile, base image, Debian package, OCI archive, source
bundle, compiler, or guest artifact can be acquired or executed.

The contract is additive over accepted registry v14. It cannot authorize image
preparation, guest builds, release evidence, or runtime use.

## Bound Inputs

The manifest binds:

- Debian 13 `trixie`, the registry/repository identity, the multi-platform index
  digest, selected amd64 manifest digest, image config digest, and an exact
  digest reference with tag-only references forbidden;
- one Debian snapshot timestamp, Release and sources-list digests, and a unique
  canonically ordered list of exact amd64 package versions and `.deb` digests;
- the Dockerfile, build policy, build-context inventory, and accepted guest
  source-manifest digests;
- the OCI archive, OCI manifest, SPDX 2.3 SBOM, and provenance digests; and
- the native linux/amd64, no-emulation, pull-never, network-none, immutable-root,
  capability-free, no-device, no-socket, non-root, recursively read-only input,
  fresh work/output, no-cache, no-secret, cleanup, two-independent-host, and
  exact-output-comparison requirements.

The sealed builder output must contain no usable package-manager network
configuration. Network-enabled image preparation remains a future separately
governed operation; this contract does not authorize it.

## Fail-Closed State

Only `DECLARED_UNVERIFIED` is admissible. Image preparation, guest build, and
release-evidence eligibility are false. Every base-image, snapshot, package,
recipe, OCI, SBOM, provenance, native-run, independence, reproducibility, and
completion verification flag is false.

Runtime admission rejects unknown, inherited, hidden, sparse, symbolic, and
accessor-backed data without invoking getters. It returns a detached deeply
frozen value and imports no filesystem, network, process, Electron,
Virtualization, or container API.

## Audit Corrections

Independent simulation corrected two ambiguities before proposal:

1. A digest-pinned Debian reference may resolve a multi-platform OCI index.
   The contract now separately binds the index digest, selected amd64 manifest
   digest, and image config digest instead of calling one value a generic
   manifest digest.
2. `package_manager_network_configured` did not identify whether it described
   image preparation or the sealed output. It is now
   `output_package_manager_network_configured`, fixed false, while future
   network-enabled preparation remains outside this non-authorizing contract.

Snapshot timestamp admission was also tightened to reject impossible month,
day-range, hour, minute, and second fields.

Full-suite simulation also exposed a pre-existing capsule state-store race: a
second save could claim the in-process write slot while the first save awaited
an ownership check. The store now claims that slot synchronously before its
first await and releases it on every exit. Its ten-test suite passed in four
concurrent repetitions, then passed again in the complete repository run. This
correction changes no builder or process-launch authority.

## Validation

| Check | Result |
| --- | --- |
| Accepted registry v14 SHA-256 and additive v15 relation | PASS; v14 `367d6c5dfe4114205fb096dfa9cb1978f8182aa4c7165dc06187751f30714088` |
| JSON Schema and runtime admission agreement | PASS |
| Native platform and digest-reference relations | PASS |
| Canonical package closure and isolation controls | PASS |
| Authority-expansion and assurance-spoofing corpus | PASS |
| Descriptor safety and effect absence | PASS; accessors are not invoked |
| Focused builder-contract tests | PASS; 6 tests |
| Combined ADR and builder-contract tests | PASS; 10 tests |
| Capsule state-store race regression | PASS; 10 tests in four concurrent repetitions |
| Exact-toolchain repository check | PASS; eight typechecks, 226/226 tests, production build |
| Electron package and forbidden-content inspection | PASS; nine fuses, eleven ASAR entries, no builder content |
| Changed-file secret, scope, and patch scans | PASS; no secrets, six guest-build files, clean patch |

## Known Limitations

- The test candidate uses inert placeholder digests and a minimal illustrative
  package list. It is not a proposed builder manifest or package selection.
- No exact Debian index, amd64 manifest, config, snapshot, Release file,
  package closure, Dockerfile, build policy, OCI archive, SBOM, provenance, or
  signature has been acquired or reviewed.
- No native-amd64 Linux environment was allocated and no image preparation,
  network-isolation proof, source build, independent rebuild, comparison, or
  cleanup proof has run.
- Shared builder inputs and infrastructure-provider control remain declared
  common trust dependencies even after two independent executions.

Arbitrary repository execution remains unavailable.

# P3 Guest Supply-Chain Evaluation

**Status:** `ACCEPTED`  
**Evaluated:** `2026-08-01T15:37:46-04:00`  
**Accepted:** `2026-08-01T15:56:50-04:00`  
**Decision:** `docs/decisions/0015-reproducible-linux-guest-supply-chain.md`

## Evaluation Result

Buildroot `2025.02.x` LTS is the accepted baseline for DOSAI's small arm64 Linux
guest, with initial implementation pin `2025.02.16` and the Linux 6.12 longterm
series. The recommendation is conditional: failure to prove byte-identical clean
builds, exact composition, complete licensing, or SPDX 2.3 output requires a
stop and reevaluation, with Yocto/OpenEmbedded as the first fallback.

No Buildroot source, guest source, binary, toolchain, image, VM operation, or
execution-service implementation was added during this evaluation.

## Candidate Matrix

| Candidate | Small fixed guest | Reproducibility support | SBOM and license support | Added trust surface | Result |
| --- | --- | --- | --- | --- | --- |
| Buildroot 2025.02 LTS | Strong | Must be proven by DOSAI with two offline clean builds | CycloneDX, package metadata, CVE and `legal-info`; SPDX 2.3 needs a separately proven tool | Narrow build framework and governed sources | Accepted |
| Yocto/OpenEmbedded | Capable but broad | Strong built-in tests; added layers still require proof | Built-in SPDX JSON and source archives | BitBake, OE metadata, layers, larger build/storage footprint | Fallback |
| LinuxKit | Strong | Project labels reproducible builds as work in progress | Container-image-oriented evidence | OCI images, container build tooling, registry assumptions | Rejected |
| Prebuilt distribution image | Broad | Vendor-dependent | Vendor-dependent | Distribution repositories and binary image provenance | Rejected |
| Hand-rolled image build | Strong initially | Entirely custom | Entirely custom | DOSAI owns package, license, and security machinery | Rejected |

## Key Findings

1. Buildroot's current download page identifies `2025.02.x` as an LTS line
   supported through March 2028 and publishes release signatures. The exact
   release must still be digest-pinned.
2. Buildroot can generate the toolchain, kernel, and root filesystem, operate
   offline after sources are fetched, reject covered source hash mismatches,
   expose package metadata, generate CycloneDX, report CVEs, and collect legal
   material.
3. Buildroot explicitly documents `legal-info` omissions and possible inaccurate
   declarations. Its output is not a legal-compliance verdict.
4. Yocto offers stronger native reproducibility tests and SPDX generation, but
   only its governed core carries that reproducibility claim; custom layers must
   be tested. Its documented sample build needs at least 90 GB of free space.
5. Linux 6.12 is a maintained longterm line with projected support through
   December 2028. The exact patch release must be pinned when implementation
   begins.
6. Schema v12 lists a standalone guest-agent artifact without proving that those
   bytes are in the booted root. This is harmless while v12 remains ineligible,
   but a composition-binding successor is mandatory before execution.

## Required Implementation Proofs

- Immutable source manifest, upstream signature records, SHA-256 closure, and a
  sealed source bundle.
- Network-disabled clean build on two independent Linux builders without shared
  caches, with byte-identical required outputs.
- Canonical initramfs and SquashFS inventories that bind the embedded agent to
  the separately listed agent digest and prove the one fixed boot chain.
- Complete reviewed license/source material with no unexplained warning or
  unknown license.
- Deterministic, schema-valid SPDX 2.3 JSON from a separately pinned and proven
  tool; Buildroot CycloneDX remains corroborating evidence only.
- Pinned vulnerability snapshot, scan, applicability review, and disposition.
- Signed package admission and physical macOS 15/current-host VM lifecycle,
  cancellation, cleanup, and unrelated-resource safety evidence.

## Primary References

- [Buildroot downloads and LTS releases](https://www.buildroot.org/download.html)
- [Buildroot LTS policy](https://www.buildroot.org/lts.html)
- [Buildroot user manual](https://buildroot.org/downloads/manual/manual.html)
- [Yocto SBOM generation](https://docs.yoctoproject.org/5.2.1/dev-manual/sbom.html)
- [Yocto reproducible builds](https://docs.yoctoproject.org/5.2.1/test-manual/reproducible-builds.html)
- [Yocto system requirements](https://docs.yoctoproject.org/5.2/ref-manual/system-requirements.html)
- [Linux kernel longterm releases](https://www.kernel.org/category/releases.html)
- [LinuxKit source and design summary](https://github.com/linuxkit/linuxkit)

## Proposal Validation

| Check | Result |
| --- | --- |
| Exact Node 24.18.0 / pnpm 11.18.0 repository check | PASS; eight typechecks, 196 tests, production build |
| Electron package | PASS; 9 fuses, 11 ASAR entries, least-privilege Info.plist |
| Execution-service implementation and guest artifacts absent | PASS |
| Changed-file secret scan | PASS; no recognized credential or private-key pattern |

## Known Limitations

- The selected SPDX 2.3 generator and guest-agent language/toolchain remain open
  implementation decisions because neither should be trusted without a focused
  provenance and determinism evaluation.
- No build was run, so reproducibility, artifact size, boot time, memory fit, and
  Virtualization.framework compatibility are not yet measured.
- Buildroot LTS support and Linux longterm dates do not replace DOSAI's own patch,
  vulnerability, and release maintenance obligations.

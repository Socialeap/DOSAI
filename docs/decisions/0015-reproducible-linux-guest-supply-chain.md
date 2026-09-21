# ADR 0015: Reproducible Linux Guest Supply Chain

- **Status:** Accepted
- **Date:** 2026-08-01
- **Status updated:** 2026-08-01T15:56:50-04:00
- **Decision owner:** Repository owner
- **Related controls:** F02, F05, F06
- **Related plan phase:** P3
- **Extends:** ADR 0014

## Context

ADR 0014 requires a repository-governed arm64 Linux kernel, initramfs,
immutable root filesystem, and guest agent before arbitrary repository code can
run. Accepted schema registry v12 can describe only an unverified candidate and
fixes `runtime_eligible` to `false`. It intentionally does not authorize a VM.

The guest must be small enough to audit, reproducible from governed source, and
supportable through the DOSAI release lifetime. Its build system must provide
source and license inventories without creating a runtime dependency on an
image registry, package manager, daemon, or network service.

V12 also exposes a composition gap that must be closed before runtime admission:
the standalone guest-agent digest does not prove that the identical bytes are
inside the root filesystem that actually boots. A valid-looking four-artifact
manifest therefore cannot become executable evidence by itself.

## Decision

Use the Buildroot `2025.02.x` long-term-support series as the proposed baseline
for the DOSAI guest. The first implementation candidate must pin Buildroot
`2025.02.16`; any point-release change requires a reviewed source-manifest
revision and complete rebuild evidence. Use the Linux `6.12` longterm series,
with its exact patch release, source digest, and upstream signature pinned by the
implementation manifest.

This proposal does not accept guest artifacts, select an executable SBOM tool,
or authorize the execution service. It defines the gates an implementation
candidate must pass.

### Guest Construction

- Build for `aarch64` on controlled Linux builders through a repository-owned
  Buildroot `br2-external` tree and defconfig.
- Build the cross toolchain from governed source with musl. Do not use an opaque
  external binary toolchain.
- Produce a direct-boot kernel, a minimal initramfs, an immutable SquashFS root,
  and a separately inspectable guest-agent binary.
- Keep the target free of a package manager, compiler, SSH server, login service,
  interactive shell, network configuration, and general init ecosystem.
- Use a fixed non-root workload identity. The minimal early-boot path may perform
  only the privileged mounts and setup required to enter that identity.
- Require a memory-safe, statically linked guest-agent implementation with a
  pinned compiler and complete dependency closure. Its language and toolchain
  require separate review before source or bootstrap binaries are admitted.

### Source and Build Closure

1. A network-enabled fetch stage downloads only manifest-listed immutable
   releases. It verifies every available upstream signature and a pinned SHA-256
   digest for every source, patch, toolchain input, and license file.
2. The fetch stage emits a content-addressed sealed source bundle. VCS branches,
   tags without commit-and-archive digests, generated GitHub patch URLs, mutable
   mirrors, and `latest` references are forbidden.
3. A clean build stage has no network and can read only the sealed source bundle,
   repository recipe, and pinned builder definition. A network attempt fails the
   build.
4. Two independent clean Linux builders, with no shared build cache or output
   directory, build the same input set. Kernel, initramfs, root filesystem,
   guest-agent, and required metadata digests must all agree.
5. Any mismatch fails the candidate. `diffoscope` output may diagnose a mismatch
   but cannot waive it.

The Linux-only build environment is a release-time tool. It does not change the
accepted arm64 macOS 15 runtime floor.

### Composition Binding

Before any runtime-eligible manifest can be proposed, a successor contract must
bind what boots, not merely list adjacent files. At minimum it must prove:

- the exact kernel command line and immutable root selection;
- a canonical inventory of initramfs and SquashFS paths, types, modes, owners,
  sizes, and SHA-256 digests;
- that the guest agent at its one fixed boot path has the same digest as the
  separately listed `GUEST_AGENT` artifact;
- the single early-boot chain that mounts the read-only root and enters the fixed
  agent, with no alternate shell, login, or rescue path; and
- the exact kernel configuration and the absence of unneeded device, network,
  module-loading, debug, and interactive surfaces.

This requires a versioned guest-manifest successor and additive schema-registry
generation. V12 remains useful for non-runnable candidates and must not be
silently reinterpreted.

### SBOM, License, and Vulnerability Evidence

- Run Buildroot `show-info`, dependency-graph, CycloneDX, `pkg-stats`, and
  `legal-info` outputs for each candidate.
- Treat those outputs as evidence inputs, not acceptance. Buildroot documents
  omissions and warns that `legal-info` declarations require human review.
- Produce and schema-validate the v12-required SPDX 2.3 JSON using a separately
  pinned tool whose exact version, input coverage, and deterministic behavior
  have been proven. CycloneDX output alone does not satisfy this requirement.
- Fail on an unknown package license, missing required license text, missing
  corresponding source, undisclosed binary input, or unresolved `legal-info`
  warning.
- Record a pinned vulnerability-data snapshot, scan results, applicability
  analysis, and signed disposition. An unreviewed result cannot become eligible.

### Packaging and Admission

- Package accepted artifacts inside the signed DOSAI application. Runtime
  downloads, image pulls, host package managers, and user-selected guest files
  remain unavailable.
- The execution service must verify the accepted manifest and all artifact
  digests immediately before VM configuration. Failure has no host fallback.
- No candidate may set runtime eligibility until the successor composition
  contract, supply-chain evidence, service boundary, VM lifecycle, cancellation,
  cleanup, packaging, and physical-host tests are accepted together.

## Alternatives Considered

- **Yocto/OpenEmbedded:** strongest evaluated built-in reproducibility testing
  and SPDX generation, but substantially broader metadata, layer, build-time,
  and storage surface than this fixed guest needs. Keep it as the required
  fallback if Buildroot cannot meet byte-for-byte reproducibility or SPDX 2.3
  gates without unsafe custom machinery.
- **LinuxKit:** supports minimal immutable arm64 systems, but its image flow is
  built around containers and registry/build tooling, while its own repository
  describes reproducible builds as work in progress. Rejected as the baseline.
- **Prebuilt Alpine or distribution image:** expedient, but does not prove one
  governed build closure for the exact kernel, initramfs, root, and agent.
- **Hand-written kernel, BusyBox, and filesystem scripts:** avoids a framework
  but transfers package hashes, dependency resolution, licensing, and security
  maintenance into custom DOSAI code without a compensating benefit.

## Consequences

Buildroot keeps the guest narrowly scoped and makes the complete image recipe
reviewable. DOSAI assumes the additional burden of proving deterministic output,
complete SPDX 2.3 coverage, license closure, and exact boot composition because
Buildroot does not prove those properties on DOSAI's behalf.

No execution capability changes with this ADR. Until all gates pass, the
execution-service directory remains reserved and non-runnable, schema v12
remains ineligible, and arbitrary repository execution remains unavailable.

## Revisit Conditions

Revisit if the Buildroot LTS line ends before DOSAI can support it, independent
builders cannot produce identical artifacts, complete license or SPDX 2.3
evidence cannot be produced without fragile custom interpretation, the Linux
6.12 line becomes unsuitable, or a smaller maintained system provides stronger
reproducible-build and composition guarantees. Selecting Yocto or another build
system requires a superseding ADR.

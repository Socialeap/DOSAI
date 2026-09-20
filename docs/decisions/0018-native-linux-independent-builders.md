# ADR 0018: Native Linux Independent Builders

- **Status:** Accepted
- **Date:** 2026-08-02
- **Status updated:** 2026-08-02T03:16:53-04:00
- **Decision owner:** Repository owner
- **Related controls:** F02, F05, F06
- **Related plan phase:** P3

## Context

ADRs 0015-0017 require the complete source-built guest toolchain and guest
artifacts to agree across two independent clean Linux builders. The build stage
must have no network, shared cache, mutable package source, or prebuilt cross
toolchain. A pinned builder definition is itself a transitive build input and
must be reviewed before source acquisition or compilation begins.

The local Mac cannot supply this release proof. Docker Desktop is installed,
but its daemon is `linux/arm64`. Buildroot 2025.02.16's first Go source-bootstrap
stage supports x86, x86-64, and 32-bit Arm hosts, not AArch64 hosts. Running an
amd64 container through emulation could exercise configuration and scripts, but
would not prove a native Linux/x86-64 builder or independent physical execution.
No locally cached image is an eligible governed builder.

The builder definition must also avoid a false independence claim. Two
containers on one daemon, two builds sharing a cache, or two executions in one
long-lived VM are not independent for DOSAI. Conversely, different compiler or
distribution images would introduce different build inputs and would not test
byte-for-byte reproducibility of one accepted input set.

## Decision

Use one repository-defined, digest-pinned OCI builder image targeting native
`linux/amd64`, then execute that exact image and exact input set on two separate,
fresh native-amd64 Linux environments.

### Builder Definition

1. Use Debian 13 (`trixie`) as the builder userspace baseline. The implementation
   manifest must pin an exact amd64 base-image digest, Debian snapshot identity,
   every installed package version, OCI manifest digest, Dockerfile digest,
   build-policy digest, SBOM digest, and provenance digest. A release name or tag
   alone is never admissible.
2. Build the image in a separately governed network-enabled preparation stage.
   The image build may access only declared digest-pinned or snapshot-pinned
   inputs. No guest source or artifact build occurs in that stage.
3. Export the verified builder as a content-addressed OCI archive. Release builds
   load that archive locally with implicit pulls disabled; they never resolve a
   tag or contact a registry.
4. Include only the host tools required by Buildroot, offline evidence
   generation, and deterministic inspection. The builder contains no guest
   compiler binary, guest source, credentials, signing key, Docker socket, or
   package-manager network configuration usable during the build stage.
5. Set and record the exact locale, timezone, umask, `PATH`, `HOME`,
   `SOURCE_DATE_EPOCH`, hostname policy, CPU count, memory limit, process limit,
   and build parallelism. The later full defconfig must enable Buildroot's
   reproducible-build controls.

The exact image digest and package set require a later implementation manifest
and security review. This ADR selects the boundary, not mutable bytes that have
not yet been acquired and inspected.

### Native Execution Boundary

Each release build must satisfy all of the following:

- a fresh native x86-64 Linux VM or physical host execution, with no QEMU,
  Rosetta, `binfmt_misc`, or cross-architecture emulation;
- a distinct host/instance identity and fresh writable disks for builder A and
  builder B;
- no shared daemon, VM, writable layer, package cache, Buildroot cache, compiler
  cache, output directory, temporary directory, or home directory;
- the same verified OCI image archive, sealed source bundle, repository recipe,
  full defconfig, and fixed external parameters;
- no network namespace attachment beyond isolated loopback, with a negative
  network probe that must fail before compilation;
- an immutable container root, all Linux capabilities dropped, no new
  privileges, no host PID/IPC/UTS namespace, no device passthrough, no Docker
  socket, no host package manager, and a non-root build identity;
- read-only input mounts with recursive read-only enforcement, dedicated empty
  writable work/output mounts, and explicit cleanup after evidence extraction;
  and
- no secrets in the worker. Any future provenance signing occurs in a separate
  trusted control plane after independently hashing the outputs.

The executor must use pull policy `never` and verify the loaded image's platform
and manifest digest immediately before launch. A mismatch, implicit pull,
network reachability, undeclared mount, unexpected capability, stale writable
state, or incomplete cleanup invalidates that builder run.

### Independence and Comparison

The two environments may use the same infrastructure provider, but they must be
fresh isolated instances with distinct instance identities and no shared mutable
state. Using different providers is preferred and must be recorded when used.
Provider control-plane compromise remains a common trust dependency and cannot
be disguised as toolchain diversity.

Each worker emits a canonical unsigned report containing its input digests,
verified image digest, native platform evidence, isolation settings, failed
network probe, environment projection, commands, output inventory, output
digests, and cleanup result. A separate verifier compares both reports and every
required output byte. Any difference fails the candidate; diagnostic tools may
explain but never waive a mismatch.

This establishes reproducibility evidence for one fixed builder definition. It
does not prove that the shared builder image is free of compromise. Builder
image provenance, signatures, SBOM, vulnerability review, and recursive trust
in host tools are separate acceptance gates.

### Local Docker Desktop Role

The current Mac's Linux/arm64 Docker Desktop daemon may be used only for
non-release parser, policy, and configuration simulations. An emulated amd64
container on this host cannot count as builder A or B, cannot set
`physical_linux_builder_verified`, and cannot produce an artifact candidate.

## Alternatives Considered

- **Run twice in local Docker Desktop:** one arm64 daemon and one host create
  shared state and emulation risks. Retained only for simulations.
- **Use an unpinned hosted CI runner:** convenient, but the mutable host image,
  implicit network, and incomplete host identity cannot satisfy the accepted
  builder-input boundary. Rejected for release evidence.
- **Use two different distributions or compiler images:** adds input diversity
  but does not test reproducibility of one exact build definition. Rejected for
  the required comparison; a diverse trust audit may be added separately.
- **Use Nix or Guix as the primary builder definition:** stronger declarative
  host-package modeling, but adds a second package ecosystem and bootstrap
  closure before the narrow Buildroot guest exists. Deferred unless OCI/package
  pinning cannot meet the gates.
- **Build twice in one long-lived native VM:** catches some nondeterminism but
  not stale-state, cache, or host contamination. Rejected.

## Consequences

The release build requires access to two clean native-amd64 Linux environments
and a separately reviewed OCI builder artifact. This adds preparation and
storage work, but it makes the builder input portable, hashable, inspectable,
and executable without network access.

No builder Dockerfile, OCI image, image pull, cloud runner, source archive,
compiler, guest source, guest artifact, VM launch, or execution-service authority
is added by this decision. Schema registry v14 and runtime eligibility remain
unchanged.

## Revisit Conditions

Revisit if Buildroot's accepted source bootstrap supports native arm64 builders,
Debian 13 leaves support before release, the builder image cannot be fully
pinned and inspected, the runtime cannot enforce network and mount isolation,
two clean native-amd64 environments are unavailable, or exact outputs diverge.

## Primary References

- [Debian 13 release and support information](https://www.debian.org/releases/trixie/)
- [Docker digest-pinned image pulls](https://docs.docker.com/reference/cli/docker/image/pull/)
- [Docker run isolation and pull policy](https://docs.docker.com/reference/cli/docker/container/run)
- [Docker read-only bind mounts](https://docs.docker.com/engine/storage/bind-mounts/)
- [Docker build input policies](https://docs.docker.com/build/policies/)
- [Docker reproducible-build timestamp controls](https://docs.docker.com/build/ci/github-actions/reproducible-builds/)
- [SLSA build isolation and cache threat analysis](https://slsa.dev/spec/v1.1/threats)

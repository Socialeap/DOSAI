# ADR 0016: Guest Agent Language and Toolchain

- **Status:** Accepted
- **Date:** 2026-08-01
- **Status updated:** 2026-08-01T17:44:15-04:00
- **Decision owner:** Repository owner
- **Related controls:** F02, F05, F06
- **Related plan phase:** P3
- **Extends:** ADR 0015
- **Superseded in part by:** ADR 0017 for exact toolchain versions and Buildroot integration

## Context

ADR 0015 requires a memory-safe, statically linked guest agent with a pinned
compiler and complete dependency closure. The agent will eventually mediate one
small authenticated host-to-guest protocol, launch the admitted workload as a
fixed non-root identity, stream bounded output, and participate in cancellation
and cleanup. This decision selects only the implementation language and build
toolchain candidate. It does not define that protocol or authorize any of those
effects.

The accepted Buildroot `2025.02.16` baseline creates a versioning fault. Its LTS
branch retained Go `1.23.12` after that Go release line stopped receiving
security fixes. Using Buildroot's unmodified Go package would therefore violate
ADR 0015's maintained-toolchain requirement.

Go `1.26` is not the narrow repair. Buildroot's later `2026.02.x` work needed a
new source-built stage-5 bootstrap package to support Go 1.26. Backporting that
larger chain into the accepted Buildroot baseline would expand this decision's
review and reproducibility surface.

## Decision

Use Go for the first DOSAI guest-agent implementation candidate. Pin the initial
compiler to Go `1.25.12` and its source archive
`go1.25.12.src.tar.gz`, SHA-256
`f90dcee4bd023fa376374ea0a5a6ebe553537b39c426ffd8c689469b45519932`.

Go 1.25.12 is a candidate pin, not an indefinite release pin. Before an artifact
candidate is built, the implementation must confirm that the selected version
is still supported and contains all applicable security fixes. Any version
change requires reviewed source, digest, bootstrap, dependency, and
reproducibility evidence.

### Buildroot Integration

- Add a minimal, separately reviewed `br2-external` patch that updates the
  source-built host Go provider and hashes from the accepted Buildroot baseline
  to Go 1.25.12.
- Preserve Buildroot's source bootstrap chain. Every bootstrap source and patch
  is part of ADR 0015's sealed, digest-pinned source closure.
- Select the source compiler provider. `host-go-bin`, downloaded Go toolchain
  archives, builder-installed Go packages, and any other prebuilt compiler
  provider are forbidden.
- Build the complete source toolchain independently on both governed Linux
  builders without shared caches, then compare toolchain and guest-agent
  outputs exactly.
- If Go 1.25.12 cannot be integrated through a narrow source-only patch, if the
  bootstrap closure cannot be fully explained, or if independent outputs differ,
  stop and revisit this ADR. Do not substitute a prebuilt compiler.

The initial builders may be pinned to Linux/x86-64 where the accepted source
bootstrap chain is supported. That release-time build constraint does not alter
DOSAI's arm64 macOS 15 application runtime floor or the guest's Linux/arm64
target.

### Guest-Agent Build Profile

The implementation candidate must use these fixed build inputs:

```text
CGO_ENABLED=0
GOOS=linux
GOARCH=arm64
GOTOOLCHAIN=local
GOWORK=off
GOPROXY=off
GOSUMDB=off
```

Build with vendored modules and, at minimum, `-mod=vendor`, `-trimpath`,
`-buildvcs=false`, and linker flag `-buildid=`. The recipe must clear or pin
every remaining environment input and record the exact invocation.

- The module declares the exact accepted `go` version and has no `toolchain`
  directive.
- Commit `go.mod`, `go.sum`, `vendor/modules.txt`, and every vendored dependency.
  Missing vendor content or any network, VCS, module-cache, proxy, checksum
  database, workspace, or toolchain fallback fails the build.
- Prefer the standard library. At most one direct, separately approved
  low-level syscall module may be proposed if the fixed guest protocol cannot
  be implemented safely without it. Indirect dependencies are forbidden in the
  first candidate.
- Forbid cgo, plugins, runtime code loading, generators in the release build,
  shell-based build steps, general HTTP clients, DNS, TLS clients, package
  download logic, and outbound network clients.
- Constrain the runtime to the one-vCPU profile, initially with `GOMAXPROCS=1`,
  and measure steady-state, peak, cancellation, and output-pressure behavior
  inside the accepted 512 MiB guest profile.

### Required Proofs

Before agent bytes can be proposed for composition:

1. Build Go 1.25.12 from the sealed source chain on two independent clean
   builders and prove exact toolchain output agreement.
2. Run pinned `go vet`, host race-detector tests, deterministic unit tests,
   fixed-corpus fuzz regression tests, and a pinned vulnerability scan with
   reviewed applicability and disposition.
3. Cross-build the agent twice with no shared cache and prove exact output
   agreement. Diagnose any mismatch with `diffoscope`; do not waive it.
4. Prove with `file` and `readelf` that the Linux/arm64 agent has no dynamic
   interpreter or `DT_NEEDED` entry. Inspect `go version -m` output against the
   exact approved module closure.
5. Measure binary size, startup time, steady and peak memory, goroutine count,
   cancellation latency, output-pressure behavior, and clean exit under the
   one-vCPU/512 MiB VM profile. Any unbounded growth or missed deadline fails.
6. Bind the accepted agent digest into the v2 composition manifest. Runtime
   eligibility remains false until the remaining ADR 0015 and P3 gates pass.

Language memory safety does not prove concurrency safety, resource boundedness,
protocol correctness, or lifecycle correctness. Those properties require the
separate tests above and the later protocol, service, and VM lifecycle reviews.

## Alternatives Considered

- **Rust with `aarch64-unknown-linux-musl`:** strong static-linking and
  no-garbage-collector properties, but the Rust/LLVM bootstrap and Cargo source
  closure add more provenance and reproducibility work to this small Buildroot
  guest. It is the first fallback if Go cannot meet resource or lifecycle gates.
- **C or C++:** smaller familiar system footprint, but does not satisfy the
  accepted memory-safe implementation requirement.
- **Swift:** memory-safe and familiar for the host service, but its Linux
  toolchain and runtime are disproportionate for this fixed guest agent.
- **Zig:** attractive cross-compilation model, but its language and toolchain
  stability are not yet a prudent release baseline for this security boundary.
- **Buildroot stock Go 1.23.12:** rejected because its release line no longer
  receives security fixes.
- **Go 1.26.5:** currently maintained, but rejected for the initial candidate
  because it requires a broader Buildroot stage-5 bootstrap backport.
- **Prebuilt Go toolchain:** rejected because opaque compiler binaries would
  contradict ADR 0015's source-built, independently reproducible closure.

## Consequences

Go offers a small standard-library-first implementation, direct Linux/arm64
cross-compilation, a source bootstrap path, and upstream toolchain
reproducibility properties. It also brings a garbage-collected runtime and may
produce a larger binary than Rust. The resource and cancellation measurements
are therefore hard admission gates, not optimization targets.

This ADR adds no guest source, compiler, bootstrap archive, binary, Buildroot
patch, VM operation, service implementation, process-launch path, or execution
authority. The accepted schema registry v13 remains non-runnable and every
composition verification flag remains false.

## Revisit Conditions

Revisit if Go 1.25 support ends before candidate proof, a narrow source-only
Buildroot backport is not possible, any compiler or agent output diverges across
independent builders, the complete dependency closure cannot remain suitably
small, the runtime misses memory or lifecycle limits, or a critical
vulnerability cannot be remediated without broadening the guest. Rust is the
preferred reevaluation candidate.

## Primary References

- [Go source installation and bootstrap requirements](https://go.dev/doc/install/source)
- [Go release downloads and source digests](https://go.dev/dl/)
- [Go toolchain reproducibility](https://go.dev/blog/rebuild)
- [Go toolchain selection](https://go.dev/doc/toolchain)
- [Go module and vendoring reference](https://go.dev/ref/mod)
- [Buildroot Go package and offline-build documentation](https://buildroot.org/downloads/manual/manual.html)
- [Buildroot 2025.02 Go 1.23 support finding](https://lists.buildroot.org/pipermail/buildroot/2026-March/798689.html)
- [Buildroot Go 1.26 stage-5 bootstrap change](https://lists.buildroot.org/pipermail/buildroot/2026-March/799305.html)

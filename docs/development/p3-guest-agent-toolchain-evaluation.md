# P3 Guest-Agent Toolchain Evaluation

**Status:** `ACCEPTED`  
**Evaluated:** `2026-08-01T17:07:44-04:00`  
**Validated:** `2026-08-01T17:10:53-04:00`  
**Accepted:** `2026-08-01T17:44:15-04:00`  
**Decision:** `docs/decisions/0016-guest-agent-language-and-toolchain.md`

## Evaluation Result

Go `1.25.12` is the recommended first implementation candidate for DOSAI's
small Linux/arm64 guest agent. It must be built from source through a narrow,
reviewed update to the accepted Buildroot `2025.02.16` source-toolchain path.
Buildroot's prebuilt `host-go-bin` provider is forbidden.

The recommendation is deliberately conditional. A broad Buildroot backport,
unexplained bootstrap input, non-identical compiler or agent output, excessive
memory use, or failed lifecycle deadline stops the candidate and reopens the
language decision, with Rust as the first fallback.

No guest source, dependency, source archive, compiler, Buildroot patch, binary,
VM operation, or execution-service implementation was added by this evaluation.

## Candidate Matrix

| Candidate | Memory safety | Static Linux/arm64 fit | Source/bootstrap closure | Runtime profile | Result |
| --- | --- | --- | --- | --- | --- |
| Go 1.25.12 | Memory-safe; race safety still requires proof | Native cross-compile with cgo disabled | Source bootstrap supported; narrow Buildroot update must be proven | GC and binary size require hard measurements | Recommended |
| Rust stable | Memory-safe subset; `unsafe` policy required | Tier-2 static musl target | Rust/LLVM bootstrap and Cargo closure are broader | No GC; likely smaller bounded runtime | First fallback |
| C/C++ | Manual memory safety | Strong | Mature source toolchain | Small | Rejected |
| Swift | Memory-safe language | Linux arm64 available | Large compiler/runtime integration for this guest | Broad runtime footprint | Rejected |
| Zig | Memory-safety features vary by mode | Strong cross-compile model | Toolchain stability and release provenance need more proof | Potentially small | Rejected for baseline |

## Compatibility Finding and Remediation

The accepted Buildroot baseline and a secure Go baseline are not directly
compatible:

1. Buildroot's `2025.02.x` LTS branch retained Go `1.23.12` in March 2026.
2. Go supports a major release only until two newer major releases exist; Go
   1.23 was therefore no longer receiving security fixes.
3. Using stock Buildroot Go would silently violate ADR 0015.
4. Go 1.26 requires a newer bootstrap compiler. Buildroot's later 2026.02 work
   added a stage-5 source bootstrap package for that transition, making a direct
   1.26 backport materially broader.
5. Go 1.25.12 is the narrow candidate: it remains on the prior supported release
   line and can be evaluated against the existing source-bootstrap generations.

The remediation is a separately reviewed `br2-external` patch that updates only
the source provider, source digest, and necessary compatibility details for Go
1.25.12. The implementation must prove that this description remains true by
reviewing the resulting patch and building it twice. A larger change returns to
architecture review.

## Fixed Candidate Profile

| Property | Required value |
| --- | --- |
| Source | `go1.25.12.src.tar.gz` |
| Source SHA-256 | `f90dcee4bd023fa376374ea0a5a6ebe553537b39c426ffd8c689469b45519932` |
| Compiler provider | Buildroot source provider only |
| Target | `linux/arm64` |
| C interop | `CGO_ENABLED=0` |
| Toolchain selection | `GOTOOLCHAIN=local` |
| Module network | `GOPROXY=off`, `GOSUMDB=off`; vendored closure only |
| Workspace fallback | `GOWORK=off` |
| Build identity | `-trimpath -buildvcs=false`; linker `-buildid=` |
| Initial scheduler bound | `GOMAXPROCS=1` |
| Runtime envelope | One vCPU and 512 MiB; measured hard gate |

The first source proposal should use only the standard library. If direct
AF_VSOCK access proves to need an external syscall package, at most one direct
dependency may be proposed with its own source, license, vulnerability, API,
and maintenance review. No indirect dependency is pre-approved.

## Required Next Proof

- Produce the minimal Buildroot source-toolchain patch without downloading its
  inputs into this repository.
- Review every bootstrap stage, source digest, license, patch, provider choice,
  and build-host constraint.
- Build the toolchain twice on independent no-cache, network-disabled builders
  from the sealed source bundle and compare all required outputs.
- Only after toolchain proof, propose the minimal inert guest-agent source
  skeleton and its exact protocol boundary. Do not add process launch in that
  source slice.
- Run static linkage, module-closure, reproducibility, fuzz, race, vulnerability,
  memory, output-pressure, cancellation, and exit-time proofs before composition.

## Primary References

- [Go 1.25.12 source digest](https://go.dev/dl/)
- [Go bootstrap requirements and Linux/arm64 target support](https://go.dev/doc/install/source)
- [Go reproducible toolchain design](https://go.dev/blog/rebuild)
- [Go toolchain download behavior and `GOTOOLCHAIN`](https://go.dev/doc/toolchain)
- [Go module vendoring](https://go.dev/ref/mod)
- [Rust Linux/arm64 musl platform support](https://doc.rust-lang.org/rustc/platform-support/aarch64-unknown-linux-musl.html)
- [Cargo vendoring](https://doc.rust-lang.org/cargo/commands/cargo-vendor.html)
- [Buildroot Go package infrastructure and offline builds](https://buildroot.org/downloads/manual/manual.html)
- [Buildroot 2025.02 Go 1.23 support discussion](https://lists.buildroot.org/pipermail/buildroot/2026-March/798689.html)
- [Buildroot Go 1.26 source-bootstrap expansion](https://lists.buildroot.org/pipermail/buildroot/2026-March/799305.html)

## Proposal Validation

| Check | Result |
| --- | --- |
| Exact Node 24.18.0 / pnpm 11.18.0 repository check | PASS; eight typechecks, 202 tests, production build |
| Electron package | PASS; 9 fuses, 11 ASAR entries, least-privilege Info.plist |
| Guest source, binaries, and execution service absent | PASS; no service root, image, kernel, module, Go archive, or packaged guest content |
| Changed-file secret scan | PASS; no recognized credential or private-key pattern |

## Known Limitations

- No Go or Buildroot source build has run, so the narrow-backport assumption is
  a gate to prove, not a completed result.
- Compiler and agent reproducibility, binary size, boot latency, memory fit,
  cancellation behavior, and AF_VSOCK access remain unmeasured.
- The guest protocol, dependency closure, source policy, and implementation are
  not yet proposed.
- Go 1.25.12 is current at the evaluation timestamp; release support and
  vulnerabilities must be checked again immediately before source admission.

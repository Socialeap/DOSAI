# P3 Buildroot Source-Provider Configuration Evidence

**Status:** `ACCEPTED`  
**Proposed:** `2026-08-01T20:33:32-04:00`  
**Validated:** `2026-08-01T20:34:56-04:00`  
**Accepted:** `2026-08-02T02:45:10-04:00`  
**Accepted registry:** `docs/architecture/schema-registry-v14.json`  
**Fixture:** `guest-build/buildroot-external/configs/dosai_toolchain_proof_defconfig`  
**Verifier:** `scripts/verify-buildroot-toolchain-config.mjs`

## Scope

This slice proves only that authenticated, patched Buildroot `2025.02.16`
resolves the explicitly requested Go source-provider branch for the accepted
Linux/x86-64 builder model and Linux/arm64 target. It adds no full guest recipe,
source archive, compiler, package source, guest binary, image, VM operation, or
application execution authority.

The requested fixture fixes arm64, Buildroot musl, static linking,
`BR2_PACKAGE_HOST_GO=y`, `BR2_PACKAGE_HOST_GO_SRC=y`, and
`BR2_PACKAGE_HOST_GO_BIN` unset. A proof-only marker distinguishes it from a
future guest defconfig.

## Resolved Projection

Buildroot's Kconfig engine compiled and resolved the fixture against the exact
patched source tree. The read-only verifier admitted this portable semantic
projection:

- target `BR2_ARCH="aarch64"` and normalized `arm64`;
- Buildroot musl and static linking selected;
- all five source-bootstrap architecture gates selected;
- `BR2_PACKAGE_HOST_GO_SRC=y`;
- `BR2_PACKAGE_HOST_GO_BIN` unset; and
- `BR2_PACKAGE_PROVIDES_HOST_GO="host-go-src"`.

The requested defconfig SHA-256 is
`520694904002981f79d448582cc02e8bbf19d936460c53da5ad708142e334a66`.
The canonical semantic projection SHA-256 is
`95859c3e8886d54b0b8f6cdcf98d9de791277a8ccd1f566ef5c643e2a7ae0fa7`.
The final local resolved `.config` SHA-256 is
`f552ff106695d7ceed50ab997f9562ae62440d734c5edd1b636fa0426fdc36d4`;
that full-file digest includes temporary absolute paths and is retained only as
local-run identity, not as a portable configuration identity.

## Non-Buildability

The `br2-external` Make guard is unconditional. Empty goals and every goal
outside configuration, defconfig listing, and package metadata checking fail
before package evaluation. A simulated `make source` with an explicit
`BR2_DOSAI_CONFIG_PROOF_ONLY=n` override still stopped with exit code 2 and the
fixed no-build error before any network or source operation.

The verifier itself imports no process, network, or write API. Its output fixes
physical Linux builder verification, source download, compiler build, artifact
creation, build authority, and runtime eligibility false.

## Audit Corrections

1. Direct resolution against the repository-resident external tree caused
   Buildroot's version metadata probe to attempt a Git index refresh. The
   sandbox blocked the write and the repository was unchanged. The governed
   procedure now resolves an exact temporary copy outside the Git worktree.
2. The first strict parser accepted only uppercase Kconfig symbols and rejected
   Buildroot's real `BR2_aarch64` symbol. The parser now admits Buildroot's
   alphanumeric symbol grammar while retaining duplicate rejection.
3. The first fixture could have been passed to a Buildroot build goal despite
   its documentary label. An unconditional external-tree guard now blocks
   default, source, toolchain, package, and image goals even if the proof marker
   is overridden on the command line.

## Validation

| Check | Result |
| --- | --- |
| Accepted registry v14 identity | PASS; `367d6c5dfe4114205fb096dfa9cb1978f8182aa4c7165dc06187751f30714088` |
| Exact requested fixture and external-tree files | PASS |
| Real Buildroot Kconfig resolution | PASS; configuration only on macOS with `HOSTARCH=x86_64` input |
| Source-provider semantic projection | PASS |
| Binary-provider, architecture, libc, static, bootstrap, duplicate, and context rejection | PASS |
| Build and source-fetch guard | PASS; exit 2 before fetch, including marker-override attempt |
| Focused governance tests | PASS; 6 provider tests, 13 combined provider/source-closure tests |
| Exact Node 24.18.0 / pnpm 11.18.0 repository check | PASS; eight typechecks, 216 tests, production build |
| Electron package and forbidden-content inspection | PASS; 9 fuses, 11 ASAR entries, least-privilege Info.plist, no guest or build fixture content |
| Changed-file secret scan | PASS; no recognized credential or private-key pattern |

## Known Limitations

- This is not evidence from a physical Linux/x86-64 builder. Supplying
  `HOSTARCH=x86_64` on macOS exercises the intended Kconfig branch only.
- The resolved Buildroot defaults are not an approved DOSAI guest profile. The
  unconditional guard prevents them from being built through this external
  tree.
- The full guest defconfig, package graph, exact Linux patch release, sources,
  signatures, licenses, sealed bundle, compiler builds, agent, SPDX evidence,
  reproducibility, artifacts, and runtime proofs remain absent.
- Buildroot's macOS Kconfig helper compilation emits seven upstream
  format-security warnings; it still completes successfully. These warnings do
  not compile or describe guest code.

Arbitrary repository execution remains unavailable.

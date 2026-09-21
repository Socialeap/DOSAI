# ADR 0017: Correct Buildroot Guest-Agent Go Pin

- **Status:** Accepted
- **Date:** 2026-08-01
- **Status updated:** 2026-08-01T18:35:27-04:00
- **Decision owner:** Repository owner
- **Related controls:** F02, F05, F06
- **Related plan phase:** P3
- **Supersedes:** ADR 0016 toolchain-version and Buildroot-integration details only

## Context

ADR 0016 selected Go and pinned Go 1.25.12 through what it described as a
narrow update from Buildroot 2025.02's stock Go 1.23.12. That conclusion used a
March 2026 Buildroot LTS-branch discussion. ADR 0015, however, pins the later
Buildroot `2025.02.16` point release, published July 15, 2026.

Inspection of the exact release archive found a materially newer implementation:

- `package/go/go.mk` pins the final source toolchain to Go `1.26.3`;
- `package/go/go-src/go-src.mk` builds it from source through
  `host-go-bootstrap-stage5`;
- bootstrap stages 1 through 5 are already present;
- stage 5 pins source-built Go `1.25.10`; and
- `Config.in.host` already offers the source provider and makes it the default
  when the source bootstrap architecture is supported.

The inspected archive has SHA-256
`15305e3d366eeaf4a5ecaf2ed42f685fd6af7fe5dbf1f62e1de5f46ee83225e2`,
matching Buildroot's signed checksum statement. That statement has a valid
signature from fingerprint
`18C7DF2819C1733D822D599EA500D6EE9CB0E540`; independent owner trust in that
fingerprint remains an ADR 0015 source-admission gate.

The earlier conclusion failed because a dated branch snapshot was treated as
describing a later exact point release. It must not drive implementation.

Go 1.26.4 and 1.26.5 contain security fixes after 1.26.3. Go 1.25.11 and
1.25.12 likewise contain security fixes after the stage-5 1.25.10 bootstrap.
Leaving either stock pin unchanged would knowingly start proof on superseded
security patch levels.

## Decision

Retain Go as the guest-agent language and retain ADR 0016's source-only,
offline, vendored, static, reproducibility, resource, and no-authority controls.
Correct only its exact toolchain and integration decision:

1. Pin the final source-built compiler to Go `1.26.5`, source archive
   `go1.26.5.src.tar.gz`, SHA-256
   `495be4bc87176ac567392e5b4116abd98466d33d7b49d41e764ccc6976b2dc42`.
2. Pin bootstrap stage 5 to Go `1.25.12`, source archive
   `go1.25.12.src.tar.gz`, SHA-256
   `f90dcee4bd023fa376374ea0a5a6ebe553537b39c426ffd8c689469b45519932`.
3. Preserve Buildroot 2025.02.16's existing stages 1 through 4 and its existing
   stage-5 architecture. Do not introduce a sixth stage or replace the
   bootstrap design.
4. Apply the reviewed four-file patch
   `guest-build/patches/buildroot-2025.02.16/0001-package-go-security-bump-to-go-1.26.5.patch`
   to a freshly authenticated Buildroot 2025.02.16 tree before configuration.
5. Require the governed defconfig to set `BR2_PACKAGE_HOST_GO_SRC=y` and to
   leave `BR2_PACKAGE_HOST_GO_BIN` unset. Verify the resolved configuration;
   relying only on a Kconfig default is insufficient.
6. Add `GOWORK=off` and `GOSUMDB=off` to Buildroot's common Go package
   environment, preserving its existing `GOFLAGS=-mod=vendor`, `GOPROXY=off`,
   and `GOTOOLCHAIN=local` controls.

The patch updates hashes for the complete set of Go archives represented by
Buildroot's shared hash file, even though DOSAI forbids the binary provider.
Those hashes do not authorize `host-go-bin`, do not place binary toolchains in
the sealed source bundle, and do not weaken the explicit source-provider gate.

### Patch Admission

Before this patch can enter an artifact build:

- authenticate a fresh Buildroot 2025.02.16 archive and compare its digest to
  the accepted source manifest;
- require an exact clean application with no fuzz, offset, reject, or already
  applied result;
- verify that only the two version files and two corresponding hash files
  change;
- verify every new digest against the official Go release index through a
  separately retained retrieval;
- assert the source provider in both requested and resolved Buildroot
  configuration;
- include all five bootstrap-stage sources, final Go source, their patches,
  licenses, and hashes in the sealed source closure; and
- run both independent network-disabled toolchain builds required by ADRs 0015
  and 0016.

Patch application and static review are not compiler proof. No Go toolchain is
accepted until both source builds and exact output comparisons pass.

## Alternatives Considered

- **Keep ADR 0016's Go 1.25.12 final compiler:** would require downgrading the
  actual Buildroot final toolchain and would preserve a false account of the
  accepted baseline. Rejected.
- **Keep stock Go 1.26.3 and stage 5 Go 1.25.10:** avoids a patch but omits later
  security fixes in both release lines. Rejected.
- **Move to a newer Buildroot release:** may absorb newer Go pins, but reopens
  ADR 0015's entire build-system baseline and is disproportionate to four
  version/hash updates. Rejected for this correction.
- **Use `host-go-bin`:** avoids bootstrap execution but violates the accepted
  source-only provenance decision. Rejected.
- **Rewrite ADR 0016 in place:** would hide the accepted decision's evidence
  fault. Rejected in favor of explicit supersession.

## Consequences

ADR 0017 supersedes only ADR 0016's Go 1.25.12 final-compiler
pin and its account of Buildroot 2025.02.16. Go remains selected and every
other ADR 0016 control remains active.

The correction is smaller than the previously anticipated backport because the
exact Buildroot release already has the required source bootstrap architecture.
It also creates an explicit update obligation: a new security patch release
must be reviewed before each artifact candidate, without silently changing the
accepted version.

This decision adds only review documentation, a textual Buildroot patch, and
static governance tests. It adds no Go or Buildroot source archive, compiler,
guest source, binary, image, VM operation, process launch, or execution-service
implementation. Schema registry v13 remains accepted and non-runnable.

## Revisit Conditions

Revisit if either source digest changes upstream, the patch does not apply
exactly to an authenticated Buildroot 2025.02.16 tree, the source provider does
not resolve as required, a newer security release appears before proof, any
bootstrap source cannot be admitted, or independent toolchain outputs differ.

## Primary References

- [Buildroot 2025.02.16 release listing](https://buildroot.org/download.html)
- [Buildroot release archive and signed checksums](https://buildroot.org/downloads/)
- [Go release history](https://go.dev/doc/devel/release)
- [Go 1.26.5 and 1.25.12 source digests](https://go.dev/dl/)
- [Go source bootstrap requirements](https://go.dev/doc/install/source)
- [Go toolchain reproducibility](https://go.dev/blog/rebuild)

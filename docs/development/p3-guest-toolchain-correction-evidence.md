# P3 Guest Toolchain Correction Evidence

**Status:** `ACCEPTED`  
**Audited:** `2026-08-01T17:46:54-04:00`  
**Validated:** `2026-08-01T17:49:57-04:00`  
**Accepted:** `2026-08-01T18:35:27-04:00`  
**Decision:** `docs/decisions/0017-correct-buildroot-guest-agent-go-pin.md`

## Finding

The exact Buildroot `2025.02.16` source contradicts ADR 0016's integration
premise. It already contains Go 1.26.3, stage-5 Go 1.25.10, all five source
bootstrap stages, and the source-provider Kconfig path. The March 2026 mailing
discussion used in the earlier evaluation predated the exact July point release.

This is a temporal-evidence fault. The language choice and source-only controls
remain sound; the selected final version and stated patch shape do not.

## Authenticated Inspection

| Property | Observed result |
| --- | --- |
| Archive | `buildroot-2025.02.16.tar.xz` |
| Local SHA-256 | `15305e3d366eeaf4a5ecaf2ed42f685fd6af7fe5dbf1f62e1de5f46ee83225e2` |
| Signed-statement SHA-256 | Exact match |
| Signing fingerprint | `18C7DF2819C1733D822D599EA500D6EE9CB0E540` |
| Signature math | PASS; valid signature over checksum statement |
| Independent signer trust | PENDING; required again during source admission |
| Final Go pin | `1.26.3` in `package/go/go.mk` |
| Final provider dependency | `host-go-bootstrap-stage5` in `go-src.mk` |
| Stage-5 pin | `1.25.10` from source |
| Bootstrap stages | 1, 2, 3, 4, and 5 present |
| Source-provider control | `BR2_PACKAGE_HOST_GO_SRC` present and preferred when supported |

## Security Delta

Go's official release history records security fixes in Go 1.26.4 and 1.26.5
after Buildroot's 1.26.3 final pin. It records corresponding security fixes in
Go 1.25.11 and 1.25.12 after the 1.25.10 stage-5 pin. The correction therefore
advances both executed compiler generations rather than treating bootstrap code
as exempt from patch maintenance.

## Corrective Patch

The proposed patch changes exactly four Buildroot files:

1. `package/go/go.mk`: Go 1.26.3 to 1.26.5; add `GOWORK=off` and `GOSUMDB=off`.
2. `package/go/go.hash`: replace all represented 1.26.3 archive hashes with
   official 1.26.5 hashes.
3. `package/go/go-bootstrap-stage5/go-bootstrap-stage5.mk`: Go 1.25.10 to
   1.25.12.
4. `package/go/go-bootstrap-stage5/go-bootstrap-stage5.hash`: replace the
   stage-5 source hash with the official 1.25.12 hash.

It does not add or select `host-go-bin`, alter stages 1 through 4, change target
architecture, enable cgo, add a module source, or touch a guest filesystem.

## Required Validation

| Check | Result |
| --- | --- |
| Patch applies exactly to authenticated Buildroot 2025.02.16 | PASS; `git apply --check --whitespace=error-all` and fresh-tree application |
| Patch changes only the four approved paths | PASS; symlink-aware checksum comparison after application |
| Go hashes match the official release index | PASS; Go 1.26.5 archive set and Go 1.25.12 bootstrap source |
| Repository exact-toolchain check | PASS; eight typechecks, 203 tests, production build |
| Electron package and guest-artifact absence | PASS; 9 fuses, 11 ASAR entries, no guest archive, image, module, compiler, or service implementation |
| Changed-file secret scan | PASS; no recognized credential or private-key pattern |

## Known Limitations

- No Go or Buildroot source has been added to the repository or compiled.
- The temporary release inspection proves the archive matches its signed
  checksum statement, but independent trust in the release-signing fingerprint
  has not yet been established.
- The complete bootstrap source manifest, governed defconfig, sealed source
  bundle, offline builds, and exact output comparisons remain future gates.
- ADR 0016 remains accepted history, but ADR 0017 now governs its exact
  toolchain versions and Buildroot integration details.

## Primary References

- [Buildroot 2025.02.16 download and release date](https://buildroot.org/download.html)
- [Buildroot release archive and signatures](https://buildroot.org/downloads/)
- [Go security release history](https://go.dev/doc/devel/release)
- [Go release archive hashes](https://go.dev/dl/)

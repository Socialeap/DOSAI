# P3 Linux Builder Snapshot Contract Remediation

**Status:** `PROPOSED_FOR_OWNER_REVIEW`  
**Observed:** `2026-08-02T15:35:08-04:00`  
**Proposed:** `2026-08-02T15:39:53-04:00`  
**Validated:** `2026-08-02T15:41:21-04:00`  
**Proposed registry:** `docs/architecture/schema-registry-v16.json`  
**Corrected schema:** `docs/architecture/schemas/v2/linux-builder-manifest.schema.json`  
**Runtime admission:** `src/contracts/p3/builder-input-v2.ts`  
**Decision:** `docs/decisions/0018-native-linux-independent-builders.md`

## Purpose

This slice selects the immutable Debian snapshot timestamp associated with the
accepted Debian 13 base-image candidate and corrects two builder-manifest v1
faults discovered before package resolution. It does not resolve or download a
package closure, verify a signature, prepare an image, or authorize a build.

Schema registry v16 is a narrow proposal. It preserves accepted registry v15
and builder schema v1 byte-for-byte, superseding only the current
`linux-builder-manifest` entry with a non-authorizing v2 declaration.

## Snapshot Candidate

The accepted official-image source revision is
`2b9b380c71ad8a3b6ce55c083c9ecfb901dabf71`. Its root and Trixie-specific
`debuerreotype-epoch` files both contain Unix epoch `1783900800`, which resolves
to `20260713T000000Z`. Its canonical snapshot source definition selects:

```text
http://snapshot.debian.org/archive/debian/20260713T000000Z
  suites: trixie trixie-updates
http://snapshot.debian.org/archive/debian-security/20260713T000000Z
  suite: trixie-security
```

The v2 candidate uses HTTPS for subsequent retrieval while preserving the same
archive, timestamp, suites, and content identities.

| Observed object | SHA-256 |
| --- | --- |
| Official-image `rootfs.debuerreotype-epoch` | `366fe48fa51dc80a484cb42805b479fb4f212649e5815cf7097452b5ffc0d7eb` |
| Official-image `rootfs.debian-sources-snapshot` | `eebc0e88a193ffa3695507713f8fa7a19818447f0f67b8a83d3c1507dfad9229` |
| Official-image `rootfs.manifest` | `180af5bad936ad6b9298fdd45cab7d0d49dbfe9199e52c983a8a631ed363a676` |
| Official-image Trixie `InRelease` | `98b25b5cd185c59d34aa6e4c3e9b5b8f01bbe9d104fe2dcfbcd30dc0a14a59ed` |
| Snapshot `debian/trixie/InRelease` | `98b25b5cd185c59d34aa6e4c3e9b5b8f01bbe9d104fe2dcfbcd30dc0a14a59ed` |
| Snapshot `debian/trixie-updates/InRelease` | `88044b0f14b7cb9c5379adabd766262c76d482d94c0a17c89c54f0550e5195a1` |
| Snapshot `debian-security/trixie-security/InRelease` | `23d56758baefb802b7fd7356bce1ea952b9963a800d01a4f8fd768555da20198` |

The byte-identical official-image and snapshot Trixie `InRelease` hashes are a
strong consistency cross-check for timestamp selection. They do not establish
signature validity, archive-key trust, complete index coverage, or package-byte
integrity. The snapshot candidate therefore remains `OBSERVED_UNVERIFIED`.

## Finding 1: Incomplete Release Binding

Builder manifest v1 provides one `release_file_sha256`, but the accepted source
definition consumes three signed `InRelease` files from two archives. One hash
cannot identify `trixie`, `trixie-updates`, and `trixie-security`, so v1 could
appear exact while leaving two suite metadata inputs unbound.

V2 replaces the singular field with exactly three ordered Release records. Each
binds archive, suite, canonical path, timestamp-derived HTTPS URI, byte size,
and SHA-256. It also requires the corresponding three ordered amd64
`Packages.xz` records and relationally binds each index to its Release hash.

## Finding 2: Architecture-Independent Packages Rejected

Builder manifest v1 fixes every package record to `amd64`. Debian's amd64
installation closure can include architecture-independent `all` packages;
`ca-certificates`, already in the accepted direct intent, is one concrete
example. V1 therefore cannot represent the complete intended closure.

V2 admits only `amd64` and `all`. Every package additionally binds its archive,
canonical pool path, byte size, archive digest, source-package name, and source
version. Runtime admission requires unique bytewise-sorted binary package names
and requires the pool filename architecture to match the declared architecture.

## Additional Closure Bindings

The corrected snapshot declaration also binds:

- the canonical source definition and Debian archive keyring digests;
- the accepted base package manifest and direct package-intent digests;
- the eventual package-resolution report and installed inventory digests; and
- exact snapshot, Release, index, package, source, and pool identities.

`release_signatures_verified`, `indexes_verified`, `closure_complete`, all
builder verification fields, image preparation, guest build, and release
eligibility remain fixed false. V2 cannot assert completion or grant authority.

## Preserved Inputs

| Artifact | State |
| --- | --- |
| Accepted schema registry v15 | Unchanged; `ec122a0151e109bc9f84de7eeeef9667e68cccca214d578405b48ea7190ea76c` |
| Accepted builder schema v1 | Unchanged; `15eb957513473a221cb6e80f46354f79090ea4d5e83da23fd626872b6180826e` |
| Accepted package intent | Unchanged; `b2f0935683765d0c3d1948b5b5566fda6b8ab6527ef79d6fc8021419afae1dc2` |
| Proposed builder schema v2 | `3d8a9c010cb84a62ad9668c585ba25910b2f6f64a69ea433841afa842a464da2` |
| Proposed schema registry v16 | `5fe93957da3af2eea4e1bbdd29034ab42dbe57eac747ff3f5e366eb86368144e` |

## Read-Only Method

Only small public metadata objects were streamed to SHA-256. No retrieved bytes
were persisted in the repository. No package index, `.deb`, OCI layer, image,
source archive, compiler, or guest artifact was downloaded.

## Validation

| Check | Result |
| --- | --- |
| Accepted registry v15 and builder schema v1 hashes | PASS; byte-identical |
| Focused and combined builder governance tests | PASS; 25 tests |
| Corrected schema/runtime parity and standalone loading | PASS |
| Suite, index, package, path, ordering, and accessor attacks | PASS; rejected |
| Exact-toolchain repository check | PASS; eight typechecks, 241/241 tests, production build |
| Electron package inspection | PASS; nine fuses, eleven ASAR entries, no builder content |
| Builder implementation and package artifact absence | PASS |
| Patch, governed-root metadata-residue, and changed-file secret scans | PASS |

## Primary References

- [Debian snapshot usage](https://snapshot.debian.org/)
- [Accepted official-image source revision](https://github.com/debuerreotype/docker-debian-artifacts/tree/2b9b380c71ad8a3b6ce55c083c9ecfb901dabf71)
- [Official-image Trixie metadata](https://github.com/debuerreotype/docker-debian-artifacts/tree/2b9b380c71ad8a3b6ce55c083c9ecfb901dabf71/trixie)
- [Debian 13 `ca-certificates`](https://packages.debian.org/trixie/ca-certificates)

## Known Limitations

- The three `InRelease` signatures and archive keyring have not been verified.
- Package index bytes, index-to-Release hashes, package records, dependency
  alternatives, package archive bytes, and installed closure remain unresolved.
- Exact package-index and package sizes in the contract tests are inert fixtures,
  not observed supply-chain evidence.
- The 256-package contract bound is provisional; resolution must fail closed if
  the complete installed closure exceeds it.
- No Dockerfile, builder policy, package lock, image, SBOM, provenance,
  vulnerability disposition, native Linux run, VM operation, or execution
  authority was added.

Arbitrary repository execution remains unavailable.

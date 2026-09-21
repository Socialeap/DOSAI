# P3 Linux Builder Package-Intent Evaluation

**Status:** `ACCEPTED`  
**Proposed:** `2026-08-02T13:22:39-04:00`  
**Validated:** `2026-08-02T13:24:16-04:00`  
**Accepted:** `2026-08-02T15:32:27-04:00`  
**Schema registry:** `docs/architecture/schema-registry-v15.json`  
**Base image evidence:** `docs/development/p3-linux-builder-base-image-evidence.md`  
**Decision:** `docs/decisions/0018-native-linux-independent-builders.md`

## Purpose

This slice defines the direct Debian package names intended for the future
native Linux builder. It maps Buildroot's documented host requirements onto
Debian 13 package names and adds the minimum DOSAI preparation and sealed-bundle
utilities needed by the accepted supply-chain design.

This is package intent, not a package lock or a `linux-builder-manifest`. It
does not select a Debian snapshot, resolve dependencies, pin versions, record
package archive digests, download packages, prepare an image, or authorize a
build. Those operations remain fail-closed until a later controlled resolution
gate produces the complete installed amd64 closure required by schema registry
v15.

## Direct Package Intent

The canonical set is sorted bytewise. Package names are Debian binary package
coordinates only; they make no version claim.

```text
DIRECT_PACKAGE_INTENT_BEGIN
bash
bc
binutils
build-essential
bzip2
ca-certificates
coreutils
cpio
debianutils
diffutils
file
findutils
g++
gawk
gcc
gzip
make
patch
perl
python3
rsync
sed
tar
unzip
wget
xz-utils
zstd
DIRECT_PACKAGE_INTENT_END
```

## Requirement Mapping

| Requirement | Debian intent | Reason |
| --- | --- | --- |
| Buildroot mandatory host tools | `bash`, `bc`, `binutils`, `build-essential`, `bzip2`, `cpio`, `diffutils`, `file`, `findutils`, `g++`, `gcc`, `gzip`, `make`, `patch`, `perl`, `rsync`, `sed`, `tar`, `unzip`, `wget` | Directly preserves the documented Buildroot host-tool boundary. |
| Buildroot `which` command | `debianutils` | Debian 13 supplies `which` from `debianutils`; there is no separate intended `which` package. |
| Buildroot `awk` command | `gawk` | Selects one explicit awk implementation instead of relying on an ambient alternative. |
| Standard deterministic utilities | `coreutils` | Makes expected hashing, file, and processor-count utilities explicit even though the base image may already carry this essential package. |
| Python host tooling | `python3` | Buildroot recommends Python, and DOSAI's later verification tooling may require a governed interpreter. No Python package installation is authorized. |
| Accepted source archive extraction | `xz-utils` | Supports the accepted `.tar.xz` source inputs. |
| Sealed builder-bundle extraction | `zstd` | Supports the planned `.tar.zst` transfer bundle without network access. |
| Preparation-stage TLS roots | `ca-certificates` | Supports authenticated retrieval during a separately authorized image-preparation stage. It grants no network access during a guest build. |

`build-essential` intentionally overlaps `gcc`, `g++`, and `make`. Buildroot
names those tools individually, while Debian's metapackage also declares its
own build-system dependency boundary. The future closure resolver must preserve
both the direct intent and every dependency selected by the accepted snapshot.

## Stage And Network Boundary

Package acquisition, if later authorized, belongs only to a controlled builder
image-preparation stage. The prepared builder must carry the resolved packages
and sealed input bundle before either independent native Linux build begins.
Both builds remain network-denied and credential-free under ADR 0018.

The presence of `wget` and `ca-certificates` does not authorize network use.
`wget` is a documented Buildroot host requirement, and both binaries are inert
without an allowed network path. Builder policy, environment isolation, and
native-host evidence must independently prove that build-time network access is
absent.

## Deliberate Exclusions

The direct intent excludes `curl`, `git`, `gnupg`, `jq`, `syft`, and
`diffoscope`. Source inputs are transferred as a sealed bundle, not fetched by
the build. Signer verification, SBOM production, provenance assembly, and
artifact comparison are distinct governed operations and must not silently
expand this builder's authority or package surface.

An excluded tool may be proposed later only with an explicit requirement,
stage, version, archive digest, closure impact, and policy update.

## Unresolved Closure

Debian package pages observed during this evaluation confirm package naming,
including `debianutils` for `which` and the dependency role of
`build-essential`. Any versions shown by the live Debian archive are
observations only. They are not pins and do not necessarily correspond to the
accepted base image's creation date.

The next supply-chain gate must:

1. select an immutable Debian snapshot timestamp compatible with the accepted
   base-image candidate;
2. resolve the complete Linux/amd64 dependency closure from that snapshot;
3. bind every package name, exact version, source identity, archive digest, and
   installed-file inventory required by schema registry v15;
4. define a deterministic recipe and network-denied builder policy; and
5. independently retrieve and hash all accepted OCI and package bytes before
   any builder verification flag can become true.

Until then, all builder preparation, package, closure, image, and runtime
verification flags remain false.

## Validation

| Check | Result |
| --- | --- |
| Accepted schema registry v15 hash | PASS; `ec122a0151e109bc9f84de7eeeef9667e68cccca214d578405b48ea7190ea76c` |
| Focused and combined builder governance tests | PASS; 19 tests |
| Exact-toolchain repository check | PASS; eight typechecks, 235/235 tests, production build |
| Electron package inspection | PASS; nine fuses, eleven ASAR entries, no builder content |
| Direct package-set order, uniqueness, and command mappings | PASS |
| Absent builder files, package commands, and local artifacts | PASS |
| Patch, governed-root metadata-residue, and changed-file secret scans | PASS |

## Primary References

- [Buildroot mandatory host requirements](https://buildroot.org/downloads/manual/manual.html#requirement-mandatory)
- [Debian 13 `debianutils`](https://packages.debian.org/trixie/debianutils)
- [Debian 13 `build-essential`](https://packages.debian.org/trixie/build-essential)

## Known Limitations

- The direct list has not been resolved against a Debian snapshot or tested on
  a native Linux/amd64 host.
- No transitive package, version, archive digest, source package, license,
  vulnerability, installed-file inventory, or removal set is asserted.
- No package index, package archive, OCI blob, Dockerfile, builder policy,
  builder manifest, image, SBOM, or provenance artifact was created.
- No package-manager command, network fetch, image pull, compilation, VM
  operation, or execution authority was added.

Arbitrary repository execution remains unavailable.

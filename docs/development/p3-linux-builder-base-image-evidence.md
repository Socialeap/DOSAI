# P3 Linux Builder Base-Image Candidate Evidence

**Status:** `ACCEPTED`  
**Observed:** `2026-08-02T03:53:26-04:00`  
**Validated:** `2026-08-02T03:55:02-04:00`  
**Accepted:** `2026-08-02T13:22:39-04:00`  
**Schema registry:** `docs/architecture/schema-registry-v15.json`  
**Decision:** `docs/decisions/0018-native-linux-independent-builders.md`

## Purpose

This slice selects an immutable Debian 13 amd64 base-image candidate for the
future ADR 0018 builder without pulling image layers, creating a local image,
installing packages, writing a Dockerfile, or asserting any accepted builder
verification flag.

The observation is not a `linux-builder-manifest`. It supplies only the exact
base-image fields needed by that accepted contract. Package closure, recipe,
OCI export, SBOM, provenance, signatures, vulnerability review, native Linux
execution, and independent reproducibility remain separate gates.

## Candidate Identity

| Field | Observed value |
| --- | --- |
| Registry repository | `docker.io/library/debian` |
| Mutable discovery tag | `13` |
| Dated cross-check tag | `trixie-20260713` |
| Proposed immutable reference | `docker.io/library/debian@sha256:fac46bff2e02f51425b6e33b0e1169f55dfb053d83511ca28aa50c09fd5ed7a4` |
| OCI index digest | `sha256:fac46bff2e02f51425b6e33b0e1169f55dfb053d83511ca28aa50c09fd5ed7a4` |
| Linux/amd64 manifest digest | `sha256:d63a99144861e4e460196ed93d07777490cbeab53ca660c434f2a589a6c50ea3` |
| Image config digest | `sha256:b67c8a175d84bbbf1b674f66b32ad0ad246e962ac52a80de5a4014c375683d18` |
| Root filesystem layer digest | `sha256:b890c9407285c31d25426ef154b55c72e225f19b478a59451b01a8a44f5ea4f7` |
| Root filesystem layer size | `49312572` bytes |
| OCI creation annotation | `2026-07-13T00:00:00Z` |
| Upstream artifact revision | `2b9b380c71ad8a3b6ce55c083c9ecfb901dabf71` |
| Upstream artifact source | `https://github.com/debuerreotype/docker-debian-artifacts.git` |

The `13` and `trixie-20260713` tags independently resolved to the same OCI index
and Linux/amd64 manifest during this observation. The pinned candidate reference
uses the index digest, not either tag. The index selected exactly one
`linux/amd64` non-attestation manifest. Its raw manifest selected the config and
single root-filesystem layer above. The embedded config declared `linux/amd64`
and the same creation timestamp.

## Read-Only Method

The following registry-metadata operations were executed against Docker Hub:

```text
docker buildx imagetools inspect docker.io/library/debian:13 --raw
docker buildx imagetools inspect docker.io/library/debian:13
docker buildx imagetools inspect \
  docker.io/library/debian:13@sha256:d63a99144861e4e460196ed93d07777490cbeab53ca660c434f2a589a6c50ea3 \
  --raw
docker buildx imagetools inspect docker.io/library/debian:trixie-20260713
```

These commands retrieve registry manifests only. A post-observation
`docker image ls --digests --no-trunc` inventory contained only the same seven
pre-existing GitHub MCP and Supabase application images and no Debian image.

Docker documents that multi-platform resolution requires selecting the target
platform manifest from an index and then reading the manifest's config and layer
digests. Buildroot documents that it runs on Linux, should run as a normal user,
and requires a defined host-tool set. Those host packages are intentionally not
selected in this base-only slice.

## Assurance State

The accepted candidate remains `OBSERVED_UNVERIFIED`. Acceptance selects its
immutable identity for later preparation; it does not elevate the assurance
state. Observation proves only that Docker Hub
served mutually consistent metadata at the recorded time. It does not prove:

- signature, attestation, publisher identity, or provenance validity;
- that the config or layer bytes match their digests, because blobs were not
  downloaded and hashed locally;
- package inventory, licenses, vulnerabilities, or Debian snapshot closure;
- that the image is suitable, accepted, locally present, or build-authorizing;
  or
- native Linux execution, isolation, cleanup, or reproducibility.

Schema registry v15 remains fail-closed: image preparation, guest build, release
evidence eligibility, and all verification flags remain false.

## Validation

| Check | Result |
| --- | --- |
| Accepted schema registry v15 hash | PASS; `ec122a0151e109bc9f84de7eeeef9667e68cccca214d578405b48ea7190ea76c` |
| Mutable and dated tag index agreement | PASS; same OCI index and amd64 manifest |
| Raw amd64 manifest relation | PASS; exact config and one layer identity recorded |
| Focused base-image tests | PASS; 4 tests |
| Combined builder governance tests | PASS; 14 tests |
| Exact-toolchain repository check | PASS; eight typechecks, 230/230 tests, production build |
| Electron package and forbidden-content inspection | PASS; nine fuses, eleven ASAR entries, no builder content |
| Pre/post local Docker inventory | PASS; identical seven unrelated images, no Debian image |
| Changed-file secret, metadata-residue, and patch scans | PASS |

## Primary References

- [Docker Hub registry manifest API](https://docs.docker.com/reference/api/registry/latest/)
- [Docker Buildx imagetools inspection](https://docs.docker.com/reference/cli/docker/buildx/imagetools/inspect/)
- [Official Debian image](https://hub.docker.com/_/debian)
- [Buildroot host requirements](https://buildroot.org/downloads/manual/manual.html#requirement-mandatory)

## Known Limitations

- Docker Hub tags are mutable. Only the recorded digest reference is a candidate.
- The observation used one local Docker CLI against one registry endpoint; a
  later preparation gate must independently fetch and hash the accepted OCI
  objects and verify provenance.
- No Debian layer, package index, package archive, source archive, or builder
  artifact was downloaded.
- No Dockerfile, builder policy, complete builder manifest, OCI archive, SBOM,
  provenance statement, signature, or vulnerability disposition exists.

Arbitrary repository execution remains unavailable.

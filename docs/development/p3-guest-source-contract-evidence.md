# P3 Guest Source Closure Contract Evidence

**Status:** `ACCEPTED`  
**Proposed:** `2026-08-01T18:41:36-04:00`  
**Validated:** `2026-08-01T18:45:38-04:00`  
**Accepted:** `2026-08-01T20:28:17-04:00`  
**Schema registry:** `docs/architecture/schema-registry-v14.json`  
**Runtime admission:** `src/contracts/p3/guest-source.ts`

## Purpose

Schema registry v14 proposes a declaration-only contract for every source and
patch needed to construct a DOSAI Linux guest. It establishes the immutable
input boundary required by ADRs 0015-0017 before any source archive, compiler,
guest binary, or build operation can be admitted.

The contract binds canonical HTTPS retrieval coordinates, archive names,
SHA-256 digests, byte bounds, license declarations, source roles, signature
availability, signer fingerprints, patch order, patch digest, and expected
touched paths. It also binds a sealed-bundle declaration and canonical
inventory digest for later independent verification.

## Toolchain Closure

Runtime admission fixes Buildroot `2025.02.16`, all five exact Go bootstrap
versions and digests, final Go `1.26.5`, stage-5 Go `1.25.12`, Linux arm64,
`CGO_ENABLED=0`, and the source-only Buildroot provider. The accepted ADR 0017
patch is bound by repository path and SHA-256
`038704e622a717b0eab302e6c223174d24a77e3e6798dab710f1ad9ab0f7275d`.

The patch order must be contiguous from one. Target source IDs must exist,
source IDs and archive names must be unique, sources must be canonically
ordered, and declared inventory counts must equal the admitted records.
Canonical URL admission rejects credentials, ports, query strings, fragments,
normalization differences, and non-HTTPS schemes.
Percent-encoded coordinates are rejected to prevent alternate URL spellings,
and the standard parser is captured once so later global replacement cannot
weaken admission.

## Fail-Closed State

Only `DECLARED_UNVERIFIED` is admissible. Build authority and runtime
eligibility are false. Every source, signature, signer-trust, patch, provider,
and closure verification flag is false. Network use and shared cache use are
false. A proposed manifest cannot represent a completed source closure or
authorize compilation.

The runtime layer uses descriptor-safe exact-object admission. It rejects
unknown, inherited, symbolic, hidden, sparse, and accessor-backed input without
invoking getters, then clones and deeply freezes accepted data. It imports no
filesystem, network, process, Electron, or Virtualization API.

## Audit Corrections

Independent simulation found and corrected two faults before proposal closure:

1. Bootstrap stages 1 through 4 were initially constrained only by source ID
   and role. Runtime admission now fixes every stage's exact version, archive,
   canonical URL, and digest, and fixes Buildroot's signature declaration to
   the accepted signer identity.
2. Direct use of the global `URL` type failed in the policy TypeScript target,
   whose library intentionally omits browser globals. Admission now obtains the
   runtime's standard URL constructor through a typed `globalThis` lookup,
   preserving structured parsing without broadening that target's ambient
   authority.

## Validation

| Check | Result |
| --- | --- |
| Accepted registry v13 SHA-256 and additive v14 relation | PASS; v13 `b57a67eadec3245d96cb21d765b3a728788a1c3f3c59917e26cd121fadf0e642` |
| JSON Schema and runtime admission agreement | PASS |
| Exact Buildroot and five-stage Go source relations | PASS |
| ADR 0017 patch application and four-path boundary | PASS; exact application, no whitespace error, four declared paths |
| Authority-expansion and substitution corpus | PASS |
| Descriptor safety and effect absence | PASS; accessors are not invoked |
| Focused source-closure tests | PASS; 7 tests |
| Exact Node 24.18.0 / pnpm 11.18.0 repository check | PASS; eight typechecks, 210 tests, production build |
| Electron package and forbidden-content inspection | PASS; 9 fuses, 11 ASAR entries, least-privilege Info.plist, no guest or execution-service content |
| Changed-file secret scan | PASS; no recognized credential or private-key pattern |

## Known Limitations

- The test candidate uses inert placeholder metadata for the kernel and one
  root-filesystem package; it is not a source manifest proposed for admission.
- No complete Buildroot package closure, source archive, sealed bundle,
  governed defconfig, compiler, guest source, guest artifact, or SBOM exists.
- Upstream signature mathematics and independent signer trust remain unproven
  by this contract.
- Provider resolution, network-disabled builds, independent rebuilds, exact
  output comparison, service integration, VM lifecycle, and physical-host
  acceptance remain future gates.

Arbitrary repository execution remains unavailable.

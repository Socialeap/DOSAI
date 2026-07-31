# P1 Acceptance Catalog Relocation Evidence

**Status:** `[x] COMPLETE`<br>
**Evidence captured:** `2026-07-31T17:24:39-04:00`<br>
**Decision basis:** ADR 0011 and Acceptance Testing and Evidence v1<br>
**Review decision:** Owner accepted synchronized set `2026-07-31T17:28:39-04:00`

This record covers the accepted catalog v1-to-v2 governance repair for finding
P1-GATE-001. It preserves accepted v1 bytes, relocates every impossible P1
obligation to the first phase that owns its production component, and introduces
no runtime authority. It does not pass P1.

## Accepted Artifact Set

| Artifact | Status | SHA-256 |
| --- | --- | --- |
| `docs/decisions/0011-acceptance-gate-phasing-and-coverage-preservation.md` | Accepted | Recorded by repository review diff |
| `docs/testing/acceptance-test-catalog-v2.json` | Accepted | `5fe489ee6695aa5c42c477173753bf3ef6e233f293e8925be4aebd633bc4a914` |
| `docs/testing/acceptance-catalog-v1-to-v2-relocation.json` | Accepted | `6b925c56ff61424760d18942581bd3b5680fc1f529698407c35f16caf6f05a33` |
| `docs/architecture/schemas/v2/acceptance-test-catalog.schema.json` | Defined in accepted registry | `ebe0ed80336f29d8496fbf86028bb0f6b83984b8351300fb5b55ce8f4de437b5` |
| `docs/architecture/schemas/v2/evidence-report.schema.json` | Defined in accepted registry | `e87aa3ca1e2e9c93fb2cc182ebe91df12a957617a72a282390162eb90f06f7b6` |
| `docs/architecture/schemas/v1/acceptance-catalog-relocation.schema.json` | Defined in accepted registry | `02e1c42e12c4b39d3e05f13154987398d9059d81b39c648806ecf368a3ce8654` |
| `docs/architecture/schema-registry-v3.json` | Accepted | `9ec57027a9f73bd20f776d7581eaf7f94e3bf3a22f210628aefc2f43eea5feea` |

## Coverage Disposition

- P1 retains current-host package lifecycle, renderer recovery, unclean restart,
  bounded typed-bridge load, main-loop responsiveness, and proof that worker,
  execution, and trusted-stop authority are absent.
- P3 owns generic worker crash reconciliation and independent trusted stop under
  saturation.
- P7 owns bounded database-worker saturation.
- P9 owns bounded parser, stream, and image-worker saturation.
- P11 retains the minimum/current physical Apple Silicon clean-install matrix
  already required by its release suite.

The machine relocation manifest assigns nine stable coverage IDs. Each binds a
v1 source scenario to exact v2 target scenarios and owner phases. No v1 suite,
control, capability, requirement ID, artifact class, timeout, or gate condition
was removed.

## Validation Results

| Check | Result |
| --- | --- |
| Accepted v1 catalog, catalog schema, evidence schema, and registry v2 digests | PASS; all four remain byte-identical |
| Catalog lineage | PASS; stable catalog ID, v1 predecessor digest, v2 message identity, and proposed status |
| Suite preservation | PASS; all 36 suite IDs remain in order and `NOT_IMPLEMENTED` |
| Unrelated suite preservation | PASS; only P1-AT-001, P1-AT-003, P3-AT-003, P7-AT-001, and P9-AT-002 differ |
| Changed-suite scope | PASS; controls, capabilities, requirement IDs, artifacts, timeouts, and gate flags remain unchanged |
| P1 phase safety | PASS; no P1 scenario requires future workers, trusted stop, or physical release-matrix execution |
| Relocation completeness | PASS; nine unique coverage IDs resolve from v1 sources to existing v2 owner-phase targets |
| Version isolation | PASS; v2 runner, catalog schema, evidence schema, and registry identities bind only v2/v3 paths |
| `pnpm run check` | PASS; five typecheck surfaces, 34 tests including seven relocation and lineage suites, and three production builds |

## Fault Found and Remediated

The first mechanical catalog derivation changed the newly inserted predecessor
path to v2 while leaving the runner path on v1. The version-isolation test failed
immediately. Both paths and the catalog schema were corrected, the successor
digest was regenerated, and dedicated predecessor and runner-path assertions now
prevent recurrence.

## Known Limitations

- Static tests establish lineage and semantic coverage constraints but are not
  formal evidence reports. The governed runner generation is now implemented
  separately in catalog v3 and remains Proposed pending synchronized review.
- Minimum/current physical hardware execution remains a P11 release condition.
  Catalog v2 intentionally permits no P1 claim for minimum-OS execution.

## Review Basis

The owner accepted the set as one synchronized decision. Catalog v2 remains
immutable with all suites truthfully `NOT_IMPLEMENTED`; runner implementation
must create a later catalog generation rather than rewriting v2.

# Acceptance Catalog v1 to v2 Relocation Plan

- **Status:** Accepted
- **Status updated:** 2026-07-31T17:28:39-04:00
- **Decision:** ADR 0011
- **Finding:** P1-GATE-001
- **Machine manifest:** `acceptance-catalog-v1-to-v2-relocation.json`

## Strategy

Catalog v2 removes the circular dependency without removing coverage. P1 tests
the shell that exists and proves future authority is absent. Each deferred load,
recovery, stop, or release-matrix obligation moves to the earliest phase that
owns the real production component.

| Coverage | v1 source | v2 owner | Strategic disposition |
| --- | --- | --- | --- |
| Current-host package lifecycle | P1-AT-001-S01 | P1-AT-001-S01 | Retained in P1 with exact runtime and package-minimum metadata checks. |
| Minimum/current physical clean install | P1-AT-001-S01 | P11-AT-001-S01 | Relocated to the existing release matrix; remains mandatory before release. |
| Renderer and unclean app recovery | P1-AT-001-S02 | P1-AT-001-S02 | Retained because the P1 shell implements both behaviors. |
| Worker crash recovery | P1-AT-001-S02 | P3-AT-003-S02 | Relocated to the first phase with governed workers, capsules, and reconciliation. |
| Typed bridge and main-loop load | P1-AT-003-S02 | P1-AT-003-S02 | Retained using the sole read-only production bridge. |
| Worker and execution absence | P1-AT-003-S02 | P1-AT-003-S02 | Made explicit as the positive P1 security invariant. |
| Trusted stop under saturation | P1-AT-003-S02 | P3-AT-003-S01 | Relocated to the independent watchdog suite where stop authority exists. |
| Database-worker saturation | P1-AT-003-S02 | P7-AT-001-S03 | Relocated to persistence and search ownership. |
| Parser, stream, and image-worker saturation | P1-AT-003-S02 | P9-AT-002-S03 | Relocated to canonical evidence and derivation ownership. |

## Sequencing

1. Accept ADR 0011, catalog v2, the relocation manifest, schemas v2, and schema
   registry v3 as one synchronized governance decision.
2. Implement the governed acceptance runner and the three P1 fixture manifests
   against only the accepted v2 identities.
3. Run P1 on the current registered macOS arm64 development host and review its
   immutable reports. Keep every runtime capability `UNVERIFIED` until that
   review passes.
4. Implement P2 through P10 in dependency order. Each relocated worker or stop
   scenario becomes executable only in its listed owner phase.
5. Execute the complete minimum/current physical Apple Silicon matrix in P11
   before any release decision.

## No-Weakening Rules

- Catalog v1 remains unchanged and content-addressed.
- Every relocated obligation has one stable coverage ID and one or more exact v2
  target scenarios.
- P1 cannot claim worker, execution, stop, or minimum-OS runtime support.
- P3, P7, P9, and P11 cannot pass without the relocated cases.
- `SKIPPED`, `BLOCKED`, `ERROR`, unavailable evidence, or a missing mapped case
  never satisfies a gate.

# Architecture Decision Records

DOSAI architecture decisions will be recorded here as short Architecture
Decision Records (ADRs). ADRs preserve why a consequential choice was made, the
constraints known at the time, and what would cause the decision to be revisited.

Phase 0 does not treat proposals in the product specification as settled
implementation decisions. An ADR is added only after the owner approves the
decision or explicitly delegates that authority.

## Proposed Format

Each ADR should include:

- Title and status (`Proposed`, `Accepted`, `Superseded`, or `Rejected`).
- Date, decision owner, and related issue or evidence.
- Context and constraints.
- Decision.
- Alternatives considered.
- Security and operational consequences.
- Revisit conditions.

Use sequential filenames such as `0001-electron-runtime.md`. Do not renumber or
rewrite accepted history; supersede it with a new ADR.

## Decision Register

| ADR | Status | Status updated | Decision |
| --- | --- | --- | --- |
| [0001](0001-runtime-and-privilege-boundaries.md) | Accepted | `2026-07-31T02:19:15-04:00` | Runtime and privilege boundaries |
| [0002](0002-typed-operations-policy-and-grants.md) | Accepted | `2026-07-31T02:52:33-04:00` | Typed operations, policy, and grants |
| [0003](0003-execution-isolation-cancellation-and-watchdog.md) | Accepted | `2026-07-31T02:56:41-04:00` | Execution isolation, cancellation, and watchdog |
| [0004](0004-audit-journal-keys-and-anchoring.md) | Accepted | `2026-07-31T03:01:36-04:00` | Audit journal, keys, and anchoring |
| [0005](0005-workspace-leases-and-git-broker.md) | Accepted | `2026-07-31T03:08:45-04:00` | Workspace leases and Git broker |
| [0006](0006-authenticated-packet-transport.md) | Accepted | `2026-07-31T03:13:40-04:00` | Authenticated packet transport |
| [0007](0007-browser-inspection-and-evidence-boundary.md) | Accepted | `2026-07-31T03:18:25-04:00` | Browser inspection and evidence boundary |
| [0008](0008-persistence-search-retention-and-deletion.md) | Accepted | `2026-07-31T12:04:27-04:00` | Persistence, search, retention, and deletion |
| [0009](0009-reviewed-skill-bundle-supply-chain.md) | Accepted | `2026-07-31T12:11:32-04:00` | Reviewed skill-bundle supply chain |
| [0010](0010-canonical-evidence-and-lossy-derivations.md) | Accepted | `2026-07-31T14:12:44-04:00` | Canonical evidence and lossy derivations |

The repository owner may accept, reject, or request revisions to each ADR
individually. The register and ADR file must receive the same status update and
date. P0.4 remains incomplete until the required set is accepted.

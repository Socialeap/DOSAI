# DOSAI

**Dashboard for Optimizing Seamless Agent Interaction** (pronounced "doh-sigh")
is a planned local-first macOS control panel for coordinating and observing AI
software-development agents. It is intended to make agent activity visible,
bounded, auditable, and easier for a human operator to govern.

DOSAI is a private, pre-launch working product name. This repository does not
claim formal trademark clearance or affiliation with another company.

## Development Status

Phase 0 governance is complete: ADRs 0001-0010, Baseline Contracts v1, and the
P0.6 acceptance-test and evidence contracts are accepted. P1 implementation is
in progress. The P1.1 hardened Electron shell and P1.2 ownership boundaries are
accepted; P1.3 renderer, navigation, and IPC hardening is implemented and
awaiting owner review. Every runtime capability remains `UNVERIFIED`.

**No production automation is authorized.** Current work permits documentation,
local implementation, read-only investigation, local validation, and explicitly
bounded capability proofs only. Production changes, Stripe Live actions, secret
access, deployment, and destructive mutations are out of scope.

## Project Documents

- [DOSAI Specification v2](docs/product/dosai-specification-v2.md)
- [Live development plan](docs/development/live-development-plan.md)
- [P1.1 runtime and packaging baseline](docs/development/p1-runtime-baseline.md)
- [P1.2 process ownership evidence](docs/development/p1-process-ownership-evidence.md)
- [P1.3 renderer security evidence](docs/development/p1-renderer-security-evidence.md)
- [Audit remediation register](docs/security/audit-remediation-register.md)
- [Trust-boundary and threat model](docs/architecture/trust-boundary-and-threat-model.md)
- [Baseline contracts v1](docs/architecture/baseline-contracts-v1.md)
- [Schema registry v1](docs/architecture/schema-registry-v1.json)
- [Schema registry v2](docs/architecture/schema-registry-v2.json)
- [Acceptance-testing contract v1](docs/testing/acceptance-testing-v1.md)
- [Acceptance-test catalog v1](docs/testing/acceptance-test-catalog-v1.json)
- [Phase 0 discovery plan](docs/discovery/phase-0-plan.md)
- [Capability matrix](docs/discovery/capability-matrix.md)
- [Architecture decision records](docs/decisions/README.md)
- [Security policy](SECURITY.md)

`docs/product/dosai-specification-v2.md` is the authoritative product
specification. The repository-root `AACP.md` is retained only as a conceptual
guide to possible end states and does not override governing project documents.

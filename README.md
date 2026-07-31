# DOSAI

**Dashboard for Optimizing Seamless Agent Interaction** (pronounced "doh-sigh")
is a planned local-first macOS control panel for coordinating and observing AI
software-development agents. It is intended to make agent activity visible,
bounded, auditable, and easier for a human operator to govern.

DOSAI is a private, pre-launch working product name. This repository does not
claim formal trademark clearance or affiliation with another company.

## Development Status

Phase 0 governance is complete: ADRs 0001-0010, Baseline Contracts v1, and the
P0.6 acceptance-test and evidence contracts are accepted. P1.1 through P1.5
are accepted, and the packaged P1 engineering audit passes. ADR 0011, catalog
v2, its machine-readable relocation, schemas v2, and registry v3 resolve the
former phase conflict without weakening coverage. The first formal P1 run
preserved a harness-readiness failure with successful cleanup and no secret
exposure. The owner accepted the isolated runner 0.1.1 remediation, catalog v4,
fixture manifests v2, report schema v4, and registry v5. All three remediated
formal suites pass, and the owner accepted `P1.EXIT`. Phase 1 is complete. The
owner accepted P2.1 immutable contracts and schema registry v6, then accepted
P2.2's pure deny-by-default policy engine and its remediations. P2.3's isolated
single-writer journal and six remediations are accepted. ADR 0012 and P2.4's
local checkpoint and Rekor v2 protocol baseline are accepted, while P2.4 remains
in progress. The implementation remains software-backed, offline, and test-only
until packaged Secure Enclave and TUF-verified public-log evidence pass. Only
`electron.typed_bridge` is
`SUPPORTED_WITH_CONSTRAINTS`; every effectful runtime capability remains
`UNVERIFIED`.

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
- [P1.4 renderer authority evidence](docs/development/p1-renderer-authority-evidence.md)
- [P1 exit engineering evidence](docs/development/p1-exit-evidence.md)
- [P1 catalog relocation evidence](docs/development/p1-catalog-relocation-evidence.md)
- [P1 governed acceptance runner evidence](docs/development/p1-acceptance-runner-evidence.md)
- [P1 acceptance runner remediation evidence](docs/development/p1-acceptance-runner-remediation-evidence.md)
- [P1 formal acceptance evidence](docs/development/p1-formal-acceptance-evidence.md)
- [P2.1 immutable contract evidence](docs/development/p2-immutable-contract-evidence.md)
- [P2.2 deny-by-default policy evidence](docs/development/p2-policy-engine-evidence.md)
- [P2.3 single-writer audit journal evidence](docs/development/p2-audit-journal-evidence.md)
- [P2.4 checkpoint and anchor protocol evidence](docs/development/p2-checkpoint-anchor-evidence.md)
- [Renderer authority policy v1](docs/architecture/renderer-authority-policy-v1.json)
- [Audit remediation register](docs/security/audit-remediation-register.md)
- [Trust-boundary and threat model](docs/architecture/trust-boundary-and-threat-model.md)
- [Baseline contracts v1](docs/architecture/baseline-contracts-v1.md)
- [Schema registry v1](docs/architecture/schema-registry-v1.json)
- [Schema registry v2](docs/architecture/schema-registry-v2.json)
- [Schema registry v3](docs/architecture/schema-registry-v3.json)
- [Schema registry v4](docs/architecture/schema-registry-v4.json)
- [Schema registry v5](docs/architecture/schema-registry-v5.json)
- [Schema registry v6](docs/architecture/schema-registry-v6.json)
- [Schema registry v7](docs/architecture/schema-registry-v7.json)
- [Schema registry v8](docs/architecture/schema-registry-v8.json)
- [Acceptance-testing contract v1](docs/testing/acceptance-testing-v1.md)
- [Acceptance-test catalog v1](docs/testing/acceptance-test-catalog-v1.json)
- [Acceptance-test catalog v2](docs/testing/acceptance-test-catalog-v2.json)
- [Acceptance-test catalog v3](docs/testing/acceptance-test-catalog-v3.json)
- [Acceptance-test catalog v4](docs/testing/acceptance-test-catalog-v4.json)
- [Catalog v1-to-v2 relocation plan](docs/testing/acceptance-catalog-v1-to-v2-relocation.md)
- [Catalog v2-to-v3 implementation manifest](docs/testing/acceptance-catalog-v2-to-v3-implementation.json)
- [Catalog v3-to-v4 remediation manifest](docs/testing/acceptance-catalog-v3-to-v4-remediation.json)
- [Phase 0 discovery plan](docs/discovery/phase-0-plan.md)
- [Capability matrix](docs/discovery/capability-matrix.md)
- [Architecture decision records](docs/decisions/README.md)
- [Security policy](SECURITY.md)

`docs/product/dosai-specification-v2.md` is the authoritative product
specification. The repository-root `AACP.md` is retained only as a conceptual
guide to possible end states and does not override governing project documents.

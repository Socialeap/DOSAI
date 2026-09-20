# DOSAI

**Dashboard for Optimizing Seamless Agent Interaction** (pronounced "doh-sigh")
is a planned local-first macOS control panel for coordinating and observing AI
software-development agents. It is intended to make agent activity visible,
bounded, auditable, and easier for a human operator to govern.

DOSAI is a private, pre-launch working product name. This repository does not
claim formal trademark clearance or affiliation with another company.

## AI Agent Initialization

AI contributors start with [AI agent initialization](AGENTS.md), then load the
[AI role registry](docs/development/ai-roles/README.md). Specialized roles are
adopted only through explicit assignment and shape behavior and deliverables;
they do not grant repository, tool, runtime, approval, or production authority.

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
local checkpoint and Rekor v2 protocol baseline are accepted. The packaged Swift
helper proves process-scoped Secure Enclave signing and non-exportability on this
Mac, and the official-client TUF bootstrap fails closed correctly. The owner
deferred P2.4's unavailable persistent-Keychain and TUF-authorized Rekor v2
proofs without weakening either contract. The owner accepted P2.5's registry
v9, ownership v6, D1 approval contract, and app-unreachable no-effect
authorization proof after 153 tests. Formal P2 acceptance artifacts remain.
The owner accepted catalog v5, registry v10, six v3 fixtures, and runner 0.2.0
as one synchronized generation. Exact pinned-toolchain validation passes, and
all three formal P2 suites pass on clean commit `878abad` with 25 assertions,
six scenarios, 19 digest-verified artifacts, cleanup, empty gaps, no effects,
and secret scans. The P2.4 external proof deferral still prevents `P2.EXIT`
completion.
No public entry or production grant exists. Only
`electron.typed_bridge` is
`SUPPORTED_WITH_CONSTRAINTS`; every effectful runtime capability remains
`UNVERIFIED`.

**No production automation is authorized.** Current work permits documentation,
local implementation, read-only investigation, local validation, and explicitly
bounded capability proofs only. Production changes, Stripe Live actions, secret
access, deployment, and destructive mutations are out of scope.

## Project Documents

- [AI agent initialization](AGENTS.md)
- [AI role registry](docs/development/ai-roles/README.md)
- [Technical Peer Reviewer v1](docs/development/ai-roles/technical-peer-reviewer-v1.md)
- [DOSAI Specification v2](docs/product/dosai-specification-v2.md)
- [Live development plan](docs/development/live-development-plan.md)
- [Jev-pattern Typed Decision Plane plan](docs/development/jev-pattern-decision-layer-plan.md)
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
- [P2.4 packaged Secure Enclave helper evidence](docs/development/p2-secure-enclave-helper-evidence.md)
- [P2.5 synthetic authorization evidence](docs/development/p2-synthetic-authorization-evidence.md)
- [P2 formal acceptance generation proposal](docs/development/p2-formal-acceptance-proposal.md)
- [P2 formal acceptance evidence](docs/development/p2-formal-acceptance-evidence.md)
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
- [Schema registry v9](docs/architecture/schema-registry-v9.json)
- [Schema registry v10](docs/architecture/schema-registry-v10.json)
- [Acceptance-testing contract v1](docs/testing/acceptance-testing-v1.md)
- [Acceptance-test catalog v1](docs/testing/acceptance-test-catalog-v1.json)
- [Acceptance-test catalog v2](docs/testing/acceptance-test-catalog-v2.json)
- [Acceptance-test catalog v3](docs/testing/acceptance-test-catalog-v3.json)
- [Acceptance-test catalog v4](docs/testing/acceptance-test-catalog-v4.json)
- [Acceptance-test catalog v5](docs/testing/acceptance-test-catalog-v5.json)
- [Catalog v1-to-v2 relocation plan](docs/testing/acceptance-catalog-v1-to-v2-relocation.md)
- [Catalog v2-to-v3 implementation manifest](docs/testing/acceptance-catalog-v2-to-v3-implementation.json)
- [Catalog v3-to-v4 remediation manifest](docs/testing/acceptance-catalog-v3-to-v4-remediation.json)
- [Catalog v4-to-v5 implementation manifest](docs/testing/acceptance-catalog-v4-to-v5-implementation.json)
- [Phase 0 discovery plan](docs/discovery/phase-0-plan.md)
- [Capability matrix](docs/discovery/capability-matrix.md)
- [Architecture decision records](docs/decisions/README.md)
- [Security policy](SECURITY.md)

`docs/product/dosai-specification-v2.md` is the authoritative product
specification. The repository-root `AACP.md` is retained only as a conceptual
guide to possible end states and does not override governing project documents.

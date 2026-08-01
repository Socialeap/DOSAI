# Native Helper Boundaries

ADR 0001 reserves separate packages for policy (`Z4`), effect brokers (`Z5`),
and audit (`Z6`). Policy and effect-broker roots remain reserved. A proposed
P2.5 grant proof helper in `Z4` binds the pure policy result, exact action plan,
fresh service-local test approval, durable audit acknowledgement, and signed
checkpoint before creating a one-use no-effect grant. It is unreachable from
the application and has neither production grant nor effect authority. The audit root
contains the accepted P2.3 isolated journal plus the accepted P2.4 offline,
software-backed checkpoint and Rekor protocol baseline. An accepted standalone
Swift helper adds only a packaged, owner-gated Secure Enclave lifecycle proof;
Electron has no path to invoke it.

No implemented helper has application process-execution, network, production
credential, production signing, or external-anchor write authority. Each new authority still
requires its owner-phase contract, build, signing, entitlement, transport, and
adversarial proof before activation. Current boundaries are machine-enforced by
the proposed `docs/architecture/process-ownership-v6.json`; accepted predecessor
v5 remains immutable until owner review.

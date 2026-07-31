# Native Helper Boundaries

ADR 0001 reserves separate packages for policy (`Z4`), effect brokers (`Z5`),
and audit (`Z6`). Policy and effect-broker roots remain reserved. The audit root
contains the accepted P2.3 isolated journal plus the accepted P2.4 offline,
software-backed checkpoint and Rekor protocol baseline.

No implemented helper has process-execution, network, production credential,
Secure Enclave, or external-anchor write authority. Each new authority still
requires its owner-phase contract, build, signing, entitlement, transport, and
adversarial proof before activation. Current boundaries are machine-enforced by
`docs/architecture/process-ownership-v4.json`; accepted predecessors remain
immutable.

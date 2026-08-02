# Reserved Native Helpers

This root contains no executable code. ADR 0001 reserves separate future
packages for policy (`Z4`), effect brokers (`Z5`), and audit (`Z6`). Each helper
must receive its owner-phase contract, build, signing, entitlement, transport,
and adversarial proof before code is added beneath its reserved path.

The machine-enforced reservation is defined in
`docs/architecture/process-ownership-v1.json`.

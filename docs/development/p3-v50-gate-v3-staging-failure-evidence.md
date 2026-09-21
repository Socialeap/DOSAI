# P3 v50 gate-v3 staging failure evidence

Recorded 2026-09-21. The exact owner-authorized gate-v3 preflight ran once and
returned `PASS`. The exact `bcb69f9c7662b9b507ab1ce01c2956bf8a47d2bc`
package then built and completed its test-signing sequence once. The package is
preserved at `/private/tmp/dosai-v50-proof/out/DOSAI-darwin-arm64/DOSAI.app`.

The attempt stopped before staging because the sandbox permission covered the
fixed `v50` target but not creation of its absent `TestProofs` parent. `mkdir`
returned `Operation not permitted`; `ditto` was never invoked. The staging
parent and staged application remain absent. No application launch, native
module load, status observation, registration, unregistration, service
bootstrap, XPC connection, retry, automatic recovery, paid activity, or real
execution occurred.

A post-failure read-only manifest observed 606 package entries with digest
`9a842b75f49aaf26c1f58e8fe83f654d1940310afbfe5606b7247a781bdc31e7`.
The package script had already verified the signed package in the authorized
build context. A later restricted-context verification returned
`CSSMERR_TP_NOT_TRUSTED`, so no new signature-success claim is made from that
observation. A successor must reverify the preserved package in its authorized
context, bind the exact parent write permission, and require new owner
authorization before any staging or launch.

No Lovable action is required. There is no backend activation or frontend
Publish step.

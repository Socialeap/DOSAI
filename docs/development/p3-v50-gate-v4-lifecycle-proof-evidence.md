# P3 v50 gate-v4 lifecycle proof evidence

Recorded 2026-09-21. The exact owner-authorized reuse-only gate v4 completed
successfully. The governed preflight ran once and passed. The preserved package
then passed its fixed 606-entry manifest and signing-identity verification.
`/usr/bin/ditto` staged that package once at the fixed application-support path,
and the staged copy passed the same manifest and signature verification.

The fixed staged runner launched the app once with zero arguments. The strict
receipt reported initial `NOT_FOUND`, post-registration `ENABLED`, and terminal
`NOT_REGISTERED`, with exactly three completed status observations, one
completed registration, and one completed unregistration. The receipt result
was `REGISTERED_AND_CLEANED` and `consumed` was true.

No rebuild, signing operation, second launch, retry, automatic recovery, XPC
client connection, VM, guest execution, real execution, production operation,
workflow dispatch, or paid activity occurred. The 15-second timeout did not
trigger. Clean unregistration is proven; residual background-item state is not
unknown. The preserved source package and staged test package remain available
as evidence.

This passes the packaged macOS lifecycle critical-path proof only. It does not
prove the two independent native-amd64 Linux builders, the formal P3 acceptance
suites, or the representative supervised full-functionality workflow.

No Lovable action is required. There is no backend activation or frontend
Publish step.

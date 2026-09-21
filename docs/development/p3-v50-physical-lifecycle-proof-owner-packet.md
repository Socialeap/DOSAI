# P3 v50 physical lifecycle proof owner packet

Recorded 2026-09-21 and corrected after the pre-authorization stable-path
audit. **The source correction and fixed staged-app launcher are validated, but
every physical authority remains false until the repository owner authorizes
this exact one-attempt packet.**

## Fixed subject

- Pull request: <https://github.com/Socialeap/DOSAI/pull/3>
- Commit: `bcb69f9c7662b9b507ab1ce01c2956bf8a47d2bc`
- Package selector: `--signed-app-service-management-lifecycle-proof-fixture`
- Stable test path: `/Users/shakoure/Library/Application Support/DOSAI/TestProofs/v50/DOSAI.app`
- Fixed staged-app runner: `scripts/service-management-lifecycle-staged-proof.mjs`
- Test signing selector: `UMXN25Z493`
- TeamIdentifier: `3RD3TADLRY`
- Outer app: `com.socialeap.dosai`
- Lifecycle addon: `com.socialeap.dosai.service-management-lifecycle-addon`
- Test LaunchAgent: `com.socialeap.dosai.execution-service-fixture`

## One-attempt boundary

The authorized sequence, if granted, is: verify the exact clean subject; build
a new v50 test package without changing the preserved v49 package; test-sign
the new package; stage it at the fixed isolated application-support path;
verify staged bytes plus nested and outer signatures; use only the fixed
staged-app runner to launch the staged app once with zero arguments; permit no
more than three fixed status observations,
one registration, and one unregistration; enforce the existing 15-second
`SIGKILL` timeout; and stop with no retry.

Registration may bootstrap the inert fixture LaunchAgent, and unregistration
may terminate it. No XPC client connection, capsule, VM, guest, repository-code
execution, real execution, production operation, or paid activity is included.

Success requires the strict `REGISTERED_AND_CLEANED` receipt, initial
`NOT_REGISTERED` or first-seen `NOT_FOUND`, `ENABLED` or `REQUIRES_APPROVAL`
after registration, exact terminal `NOT_REGISTERED`, and exact completed counts
of three observations, one registration, and one unregistration. Any other
result, timeout, missing output, malformed receipt, or uncertain final state
stops the attempt. There is no automatic retry or recovery launch. The signed
package and staged test application are preserved on uncertainty, and the
residual state is reported unknown until separately authorized cleanup.

## Copy-ready authorization

```text
I authorize one isolated v50 P3 lifecycle proof from PR #3 commit bcb69f9c7662b9b507ab1ce01c2956bf8a47d2bc: build and test-sign one new exact package using selector UMXN25Z493 and TeamIdentifier 3RD3TADLRY while preserving the v49 package; stage it only at /Users/shakoure/Library/Application Support/DOSAI/TestProofs/v50/DOSAI.app; verify staged bytes and all nested and outer signatures; use only scripts/service-management-lifecycle-staged-proof.mjs to launch that staged app exactly once with zero arguments; perform at most one fixed register/observe/unregister sequence for com.socialeap.dosai.execution-service-fixture; allow the inert fixture LaunchAgent to bootstrap only as a consequence of registration; require clean unregistration before success; enforce the 15-second SIGKILL timeout; and stop without retry or automatic recovery on any failure or uncertain receipt. No XPC client connection, VM, guest execution, real execution, production use, paid activity, or other service/process action is authorized.
```

**Release classification:** isolated local test governance only. No Lovable
action, backend activation, or frontend Publish is required.

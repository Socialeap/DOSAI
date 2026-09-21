# P3 v50 physical lifecycle proof owner packet

Recorded 2026-09-21 and revised for reuse-only gate v4. **One exact v50
package has already been built and test-signed. It remains preserved and has
never been staged or launched. Every gate-v4 authority remains false until the
repository owner reauthorizes this exact one-attempt packet.**

Gate v2 stopped before build on an unavailable shell executable. Gate v3 passed
its governed preflight and completed one package build and signing sequence,
then stopped before the staging copy because the sandbox permission did not
cover creation of the absent `TestProofs` parent. No app launch, native load,
status call, registration, unregistration, retry, or automatic recovery
occurred in either attempt.

## Fixed subject

- Pull request: <https://github.com/Socialeap/DOSAI/pull/3>
- Package source commit: `bcb69f9c7662b9b507ab1ce01c2956bf8a47d2bc`
- Preserved package: `/private/tmp/dosai-v50-proof/out/DOSAI-darwin-arm64/DOSAI.app`
- Preserved manifest: 606 entries, SHA-256 `9a842b75f49aaf26c1f58e8fe83f654d1940310afbfe5606b7247a781bdc31e7`
- Verifier implementation commit: `d1f28d12d31e9b506607c8dafbfc56ce9da02f91`
- Verifier source-record commit: `41451db539a7705ea7f7bb7e64ef1f95e0eae77b`
- Gate-v4 commit: `9d500945c9c00bcd82ffa8a92bbe172aa3c7cac0`
- Required permission root: `/Users/shakoure/Library/Application Support/DOSAI/TestProofs`
- Stable test path: `/Users/shakoure/Library/Application Support/DOSAI/TestProofs/v50/DOSAI.app`
- Governed preflight: `scripts/verify-p3-v50-physical-proof-preflight.mjs`
- Preserved verifier: `scripts/verify-p3-v50-preserved-package.mjs`
- Staged verifier: `scripts/verify-p3-v50-staged-package.mjs`
- Fixed staged-app runner: `scripts/service-management-lifecycle-staged-proof.mjs`
- TeamIdentifier: `3RD3TADLRY`
- Outer app: `com.socialeap.dosai`
- Lifecycle addon: `com.socialeap.dosai.service-management-lifecycle-addon`
- Test LaunchAgent: `com.socialeap.dosai.execution-service-fixture`

## One-attempt boundary

Gate v4 performs no package build and no signing. The sequence is: acquire
turn-scoped read/write permission only for the exact `TestProofs` root; run the
governed preflight once with zero arguments; run the preserved-package verifier
once with zero arguments; proceed only if both return exact `PASS`; create the
fixed `v50` parent once; copy the preserved package once with `/usr/bin/ditto`;
run the staged-package verifier once; and proceed only on exact `PASS` to one
zero-argument launch through the fixed staged runner.

The launched bundle permits at most three fixed status observations, one
registration, and one unregistration under the existing 15-second `SIGKILL`
timeout. Registration may bootstrap the inert fixture LaunchAgent, and
unregistration may terminate it. No XPC client connection, capsule, VM, guest,
repository-code execution, real execution, production operation, or paid
activity is included.

Success requires the strict `REGISTERED_AND_CLEANED` receipt, initial
`NOT_REGISTERED` or first-seen `NOT_FOUND`, `ENABLED` or `REQUIRES_APPROVAL`
after registration, exact terminal `NOT_REGISTERED`, and exact completed counts
of three observations, one registration, and one unregistration. Any other
result, permission failure, verifier failure, timeout, missing output, malformed
receipt, or uncertain final state stops the attempt. There is no retry or
automatic recovery.

## Copy-ready authorization

```text
I authorize the exact single-attempt v50 gate-v4 reuse-only proof documented in PR #3 at gate commit 9d500945c9c00bcd82ffa8a92bbe172aa3c7cac0, using preserved package /private/tmp/dosai-v50-proof/out/DOSAI-darwin-arm64/DOSAI.app with 606-entry manifest SHA-256 9a842b75f49aaf26c1f58e8fe83f654d1940310afbfe5606b7247a781bdc31e7, verifier implementation commit d1f28d12d31e9b506607c8dafbfc56ce9da02f91, and verifier source-record commit 41451db539a7705ea7f7bb7e64ef1f95e0eae77b: obtain turn-scoped read/write permission only for /Users/shakoure/Library/Application Support/DOSAI/TestProofs; run scripts/verify-p3-v50-physical-proof-preflight.mjs exactly once and scripts/verify-p3-v50-preserved-package.mjs exactly once with zero arguments; proceed only if both return exact PASS; create the fixed v50 parent once and stage the preserved package exactly once with /usr/bin/ditto at /Users/shakoure/Library/Application Support/DOSAI/TestProofs/v50/DOSAI.app; run scripts/verify-p3-v50-staged-package.mjs exactly once; proceed only on exact PASS to one zero-argument launch through scripts/service-management-lifecycle-staged-proof.mjs; perform at most one fixed register-observe-unregister sequence for com.socialeap.dosai.execution-service-fixture; require clean unregistration before success; enforce the 15-second SIGKILL timeout; and stop without retry or automatic recovery on any failure or uncertainty. No package build, signing operation, XPC client connection, VM, guest execution, real execution, production use, paid activity, or other service/process action is authorized.
```

**Release classification:** isolated local test governance only. No Lovable
action, backend activation, or frontend Publish is required.

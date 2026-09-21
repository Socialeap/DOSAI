# P3 v49 physical lifecycle proof owner packet

Recorded 2026-09-21. Contributor: unclassified assistant; no specialized role.
**The source is ready, but every physical authority remains false until the
repository owner authorizes this exact one-attempt packet.**

## Fixed subject

- Pull request: <https://github.com/Socialeap/DOSAI/pull/3>
- Commit: `ec470119051e227409c4e994dc74743c7fe9e0bc`
- Package selector: `--signed-app-service-management-lifecycle-proof-fixture`
- Test signing selector: `UMXN25Z493`
- TeamIdentifier: `3RD3TADLRY`
- Outer app: `com.socialeap.dosai`
- Lifecycle addon: `com.socialeap.dosai.service-management-lifecycle-addon`
- Test LaunchAgent: `com.socialeap.dosai.execution-service-fixture`

## One-attempt boundary

The authorized sequence, if granted, is: verify the exact clean subject; build
and test-sign the package; verify the nested service, lifecycle addon, and outer
app signatures; launch the packaged app once with zero arguments; permit no
more than three fixed status observations, one registration, and one
unregistration; enforce the existing 15-second `SIGKILL` timeout; and stop with
no retry.

Apple documents that registering a LaunchAgent may immediately bootstrap it,
and unregistering a running LaunchAgent terminates it. The authorization must
therefore explicitly permit that one inert test-service bootstrap consequence.
No XPC client connection, capsule, VM, guest, repository-code execution, or
production operation is part of this proof.

Success requires the strict receipt `REGISTERED_AND_CLEANED`, initial and final
`NOT_REGISTERED`, `ENABLED` or `REQUIRES_APPROVAL` after registration, and exact
completed counts of three observations, one registration, and one
unregistration. Any other result, timeout, missing output, malformed receipt,
or uncertain final state stops the attempt. There is no automatic retry or
recovery launch. The signed test package is preserved and the residual state is
reported as unknown until the owner separately authorizes cleanup.

## Copy-ready authorization

```text
I authorize one isolated v49 P3 lifecycle proof from PR #3 commit ec470119051e227409c4e994dc74743c7fe9e0bc: build and test-sign the exact package using selector UMXN25Z493 and TeamIdentifier 3RD3TADLRY; launch it exactly once with zero arguments; perform at most one fixed register/observe/unregister sequence for com.socialeap.dosai.execution-service-fixture; allow the inert fixture LaunchAgent to bootstrap only as a consequence of registration; require clean unregistration before success; enforce the 15-second SIGKILL timeout; and stop without retry on any failure or uncertain receipt. No XPC client connection, VM, guest execution, real execution, production use, or other service/process action is authorized.
```

**Release classification:** local test governance only. No Lovable action,
backend activation, or frontend Publish is required.

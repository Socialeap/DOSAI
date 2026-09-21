# P3 v50 gate-v2 preflight repair evidence

Recorded 2026-09-21. The owner-authorized gate-v2 physical proof stopped during
the pre-build preflight because the ad hoc shell check referenced
`/usr/bin/test`, which is not present on this macOS host. The command reached no
physical step: no package was built or signed, no application was staged or
launched, no native module was loaded, and no Service Management operation was
attempted. The v49 package remains preserved and the v50 staging target remains
absent. The single authorized attempt was consumed and was not retried.

The replacement preflight is an additive, zero-argument Node program. It uses
only fixed local paths and a fixed `/usr/bin/git cat-file` command to verify the
exact package subject, the preserved v49 application, both governed dependency
trees, absence of the v50 staging target, and the SHA-256 digest of the cached
Electron archive. It reads local state only, emits one machine-readable result
on success, and fails closed with a generic error on any missing, malformed, or
unexpected state. It cannot build, sign, stage, launch, register, unregister,
connect to XPC, or access a network.

The source repair is validated but has not been executed as an operational
preflight. A new exact gate and new owner authorization are required before the
preflight or any physical proof action runs.

No Lovable action is required. There is no backend activation or frontend
Publish step.

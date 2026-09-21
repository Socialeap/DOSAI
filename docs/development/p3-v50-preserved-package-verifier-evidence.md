# P3 v50 preserved-package verifier evidence

Recorded 2026-09-21. The gate-v3 attempt produced one preserved exact v50
package but stopped before staging. The additive source-only verifier fixes that
package path, the stable staged path, its 606-entry manifest digest, the three
expected signing identifiers, and TeamIdentifier `3RD3TADLRY`.

Two zero-argument wrappers verify the preserved source and eventual staged copy
using the same read-only implementation. Each rejects tree drift, path-type
drift, manifest drift, signature verification failure, identifier drift,
TeamIdentifier drift, or ad-hoc signing. The verifier cannot build, sign, copy,
stage, launch, register, unregister, connect to XPC, access a network, or write
files.

This source has not been used to stage or launch the package. A successor gate
must bind these exact bytes, obtain write permission for the absent
`/Users/shakoure/Library/Application Support/DOSAI/TestProofs` parent, and
receive new owner authorization before any reuse-only physical action.

No Lovable action is required. There is no backend activation or frontend
Publish step.

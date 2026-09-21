# P3 v49 runner dependency preparation evidence

Recorded 2026-09-21. The single authorized v49 physical attempt stopped before
app launch because the outer proof runner imported the acceptance workspace's
strict-JSON module, whose package-local `json-dup-key-validator` dependency was
not present in the isolated exact-commit worktree. Packaging and test signing
completed, but no lifecycle receipt was produced and no retry was performed.

The failure was isolated-worktree dependency preparation, not drift in the
hash-governed v49 runner. The runner intentionally uses the acceptance
workspace's strict JSON parser. A future proof worktree must materialize the
locked `tools/dosai-acceptance/node_modules` dependency tree and successfully
import `scripts/service-management-lifecycle-proof.mjs` before the physical
attempt is authorized or consumed. A root-only `node_modules` link is
insufficient.

Validation on the integrated PR #3 worktree:

- the exact v49 runner bytes remain unchanged at SHA-256
  `e86755efd3ef6286573b199792fcb9e7ea7a1d139edd750b8ab9be4f704f4278`;
- the package-local dependency is locked as `json-dup-key-validator@1.0.3`;
- the existing focused lifecycle composition tests remain the governing source
  validation;
- the new operational preflight is a successful import-only check, which does
  not call the exported runner and therefore cannot launch the app.

The isolated exact-commit worktree then materialized the locked package-local
dependency link and passed the import-only preflight under Node 24.18.0 with
`IMPORT_ONLY_PREFLIGHT_PASS`. The previously signed test package remains
preserved. No packaged executable was invoked by this preflight.

This is preparation-only remediation. It does not authorize or perform another app
launch, registration, unregistration, service operation, or physical proof.
A new exact-subject gate and owner authorization are required before any new
runtime attempt.

No Lovable action is required. There is no backend activation or frontend
Publish step.

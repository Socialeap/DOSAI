# P3 status-proof CommonJS startup repair evidence

Recorded 2026-09-20. Contributor: unclassified assistant; no specialized role.
**Source repair is validated; another physical proof and real execution remain
NO-GO.**

## Authorization and bounded scope

The owner authorized the v44 successor and expressly authorized the necessary
v42 guard path after the first full-regression run exposed that additional
dependency. V44 is limited to the failed signed-app status proof's CommonJS
startup defect and its exact governance maintenance:

- `src/main/execution/service-management-status-proof-entry.ts`
- `tests/security/p3-service-management-status-addon-physical-proof-candidate.test.mjs`
- `tests/architecture/process-ownership-v37.test.mjs`
- `tests/architecture/process-ownership-v42.test.mjs`
- `tests/architecture/p3-guard-successor.mjs`
- `tests/architecture/p3-status-proof-successor.mjs`
- `tests/architecture/process-ownership-v44.test.mjs`
- `docs/architecture/process-ownership-v44.json`

The v44 record binds the accepted v37 record, the unchanged v43 record, every
authorized preimage and postimage, and all adjacent authorities as false. It
does not alter the package mode, runner deadline, native addon, status adapter,
service fixture, signing identity, registration behavior, or production path.

## Root cause and repair

The dedicated proof entry was bundled as CommonJS but initialized
`createRequire` with `import.meta.url`. The build transformed that expression to
`createRequire({}.url)`, causing initialization to fail before Electron readiness
and before any native-module observation could be established.

The source now uses `createRequire(__filename)`, the CommonJS filename provided
to the built entry. The former source-spelling test is replaced with a regression
that builds the real dedicated entry through the accepted Vite configuration,
inspects the emitted CommonJS, and evaluates it with inert Electron and native
addon stubs. The test proves:

- the emitted entry retains `createRequire(__filename)` and contains neither
  `createRequire({}.url)` nor `import.meta`;
- startup reaches the readiness callback;
- exactly one fixed native-module path is requested;
- exactly one zero-argument status observation is made;
- the exact bounded success output is emitted before exit 0; and
- a native-load failure maps to the exact fail-closed `NOT_FOUND` output and
  exits 0 without widening runtime authority.

## Validation

All checks used the pinned Node 24.18.0 toolchain and existing locked
dependencies.

- Focused v37/v42/v43/v44 and physical-proof candidate suite: **22/22 passed**.
- Full repository suite with test concurrency 2: **513/513 passed**, with no
  skipped or cancelled cases, in 129.57 seconds.
- All eight TypeScript project checks passed: tooling, audit, grants, Main,
  policy, preload, renderer, and workers.
- Normal Main, preload, and renderer production builds passed.
- A dedicated proof-mode build passed and emitted
  `createRequire(__filename)` without the earlier `{}.url` or `import.meta`
  defect.

The first full-regression attempt passed 512 of 513 tests and exposed only the
v42 historical guard's stale dependency. The owner separately authorized that
fifth governed path; v44 now binds its exact change, and the complete rerun
passes 513 of 513.

## Physical and release boundary

No proof package was built or signed during the source-repair validation itself.
The owner later granted a new single-use authorization for commit `86ff428`.
The exact package built and signed once; one app launch returned the admitted
bounded output `DOSAI_SERVICE_MANAGEMENT_STATUS_PROOF_V1:NOT_FOUND` in 3.60
seconds with exit 0. No retry occurred. The complete receipt is recorded in
`p3-v44-signed-app-status-proof-evidence.md`.

The result proves that the repaired CommonJS bundle starts and completes its
bounded proof path. It does not distinguish a successful native `NOT_FOUND`
status from addon-load, binding or native-call failure, because those cases are
intentionally collapsed by the accepted adapter. Native-addon load and the real
status call therefore remain unresolved. No registration, service launch, XPC
connection, VM, process-control, network, journal or production action occurred.

The single-use authorization is exhausted. Owner-authorized v45 now makes load
failure, native-call failure, Electron-readiness failure and legitimate native
statuses distinguishable without widening effects; see
`p3-v45-proof-observability-repair-evidence.md`. No v45 physical attempt was
made, and any later package/sign/launch attempt requires separate owner
approval. Independent Linux builders, accepted guest artifacts, and the
remaining isolation and approval proofs also remain required. Real execution
and private-beta release remain **NO-GO**.

## Release classification

**No Lovable action is required.** This is desktop-native source, test, and
governance work only. There is no backend migration, server function, secret,
provider configuration, frontend deployment, or Publish action.

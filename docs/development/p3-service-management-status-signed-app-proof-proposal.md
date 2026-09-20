# P3 Service Management Status Signed-App Physical Proof Evidence

**Status:** `ACCEPTED_SOURCE_ONLY_IMPLEMENTATION`<br>
**Recorded:** `2026-08-06T17:04:05-04:00`<br>
**Validated:** `2026-08-06T17:10:51-04:00`<br>
**Accepted:** `2026-08-11T18:03:54-04:00`<br>
**Decision:** Accepted ADR 0021<br>
**Accepted baseline:** Process ownership v36<br>
**Accepted v36 SHA-256:** `3113333bd03ede0701aa080be1cf38fdbfbe30de375272a03f352f2fb4f56d05`<br>
**Accepted gate:** Process ownership v37<br>
**V37 SHA-256:** `490ed96c98f54b6d5eb6620541805cf9a0c85322274ba8fd9b66c963a773d980`<br>

## Question

Choose the narrowest physical proof that can demonstrate the accepted native
addon loads under Electron 43.2.0 in the signed DOSAI app context and returns one
bounded Service Management status observation without adding a persistent
runtime path to the normal DOSAI Main entry.

## Recommendation

Use a separate no-window, one-shot Electron Main test entry selected only by one
distinct package mode. The implemented proof entry can load only the fixed
packaged addon when a separately authorized physical proof is later performed,
inject it into the accepted fail-closed Main adapter, make exactly one
zero-argument observation, write one bounded result line, and exit.

The normal `src/main/index.ts` entry remains unchanged. The proof bundle accepts
no argument, path, plist name, environment configuration, operation, or payload.
Its output is exactly:

`DOSAI_SERVICE_MANAGEMENT_STATUS_PROOF_V1:<OBSERVATION>`

where `<OBSERVATION>` is `NOT_REGISTERED`, `ENABLED`, `REQUIRES_APPROVAL`, or
`NOT_FOUND`. Any load, native, adapter, output, or unclassified error fails to
`NOT_FOUND`. The result is observation only and cannot establish registration
authority, service liveness, authenticated XPC reachability, reconciliation,
capsule state, or execution availability.

## Options Considered

### Add A Proof Branch To Normal DOSAI Main

Rejected. A command-line or environment-controlled branch in the normal Main
entry would leave a persistent native-loading path in every production build and
would make ambient process input part of the proof boundary.

### Load The Addon From An External Node Or Electron Process

Rejected. Host Node would not prove Electron ABI compatibility, while the stock
Electron bundle would not provide the signed DOSAI app's `Bundle.main` context
or accepted LaunchAgent declaration.

### Dedicated One-Shot Electron Main Test Bundle

Selected. It tests the correct Electron ABI and containing-app context while
keeping the normal application entry, window creation, preload, renderer, and
IPC paths outside the proof. The exact executable can later be invoked once by a
fixed audit runner with no arguments, a sanitized environment, a 15-second
timeout, no retry, and cleanup limited to its own child process.

## Implemented Files

Accepted process ownership v37 implements only:

- `src/main/execution/service-management-status-proof-entry.ts`
- `scripts/build.mjs`
- `scripts/package.mjs`
- `scripts/service-management-status-proof.mjs`
- `vite.main.config.ts`
- `tests/security/p3-service-management-status-addon-physical-proof-candidate.test.mjs`

The three new files are source-only. The build script, package script, and Vite
config retain their v36 preimplementation hashes as evidence and are bound to
their v37 implementation postimages. Neither `src/main/index.ts` nor the
accepted native source or Main adapter changed.

## Sequential Gates

1. The owner accepted process ownership v37.
2. The six exact implementation paths are complete and undergo static and
   adversarial validation only; no package build or physical run is authorized.
3. A separate owner authorization must name selector `UMXN25Z493`,
   TeamIdentifier `3RD3TADLRY`, outer identifier `com.socialeap.dosai`, and addon
   identifier `com.socialeap.dosai.service-management-status-addon` and must
   explicitly authorize the exact proof-package signing, one app launch, one
   module load, and one zero-argument status call.
4. Only after both gates may the fixed runner perform one attempt and record the
   bounded observation and cleanup evidence.

No physical authorization is inferred from v36 or v37 acceptance.

## Authority Boundary

Accepted v37 grants no package build, signing, app launch, module load, status
call, or runtime observation. It does not authorize:

- registration, unregistration, System Settings, `launchctl`, installation, or
  execution-service launch;
- XPC or application connection, listener activation, or liveness inference;
- normal Main entry changes, window creation, preload, renderer, or IPC
  exposure;
- caller-controlled paths, process targeting, retries, generic native loading,
  or arbitrary output;
- filesystem-data, network, journal, reconciliation, VM, capsule execution, or
  production behavior; or
- dependency, lockfile, accepted source, accepted package-mode, or accepted-v36
  retained-artifact changes during proposal review.

## Immutable Baseline

V37 hash-locks accepted v36, ADR 0021, the native source, Main adapter, Node and
dependency pins, lockfile, and the preimplementation values of the three amended
build/package/Vite paths. It binds all six authorized source postimages. It also
records the retained signed v36 package's exact addon, named-service, plist,
outer executable, Info.plist, app.asar, CDHashes, and TeamIdentifier.

The retained package remains unloaded and has produced no runtime status
observation.

## Validation Before Source Implementation

Proposal-only validation passed under the governed Node 24.18.0 and pnpm
11.18.0 toolchain:

- focused v36/v37 architecture and retained-artifact tests: 16 of 16 passed;
- full repository tests: 467 of 467 passed;
- TypeScript project checks: eight of eight passed;
- production builds: Main, preload, and renderer passed (three of three);
- v36 and v37 JSON parse checks and repository formatting checks passed;
- all ten immutable input hashes and retained signed-package hashes matched;
- all three proposed new implementation paths remained absent; and
- a high-confidence secret scan of the changed proposal surface found no
  secret material.

The initial focused run caught a transcription error in the newly proposed
v37 copy of the immutable `.node-version` hash. The governed file had not
changed. The v37 record was corrected to the already accepted compile-proof
hash, after which all 16 focused checks passed. No proof entry was created, the
retained package was not altered or invoked, and no module load or Service
Management call occurred.

## Source-Only Implementation Validation

On `2026-08-11T18:09:55-04:00`, validation under the governed Node 24.18.0 and
pnpm 11.18.0 toolchain passed:

- 32 focused global-ownership, v37, retained-package, and adversarial source
  checks;
- all eight TypeScript project checks; and
- the normal Main, preload, and renderer builds (three of three).

The focused suite never imported or invoked the audit runner, built a proof
package, signed, launched an app, loaded the native addon, or called Service
Management. A high-confidence secret scan of the v37 changed surface was clean.

The owner authorized the complete successor-aware maintenance set, and v37 now
binds 24 exact governance/security test postimages. The 93 affected focused
checks, all 471 repository tests, all eight TypeScript project checks, and the
three normal build targets pass under Node 24.18.0 and pnpm 11.18.0. The repairs
accept only the v37-recorded postimages; they do not weaken historical hash
verification or package-mode admission.

No validation step invoked the proof runner, built a proof package, signed,
launched an app, loaded the addon, or called Service Management.

## Known Limitations

- One successful observation would prove only that this exact signed test bundle
  loaded the exact addon and completed one bounded status read on this machine.
- `ENABLED` would not prove the execution service is running or reachable.
- `NOT_REGISTERED` and `REQUIRES_APPROVAL` are environmental observations, not
  faults in the adapter.
- Registration, approval handling, service launch, XPC connection, cleanup, and
  production composition remain later independent gates.

## Owner Decision

Accepted for the six exact source/test paths only. A package build, signing, app
launch, native-module load, Service Management status call, registration, service
launch, XPC connection, and production use remain separately unauthorized.

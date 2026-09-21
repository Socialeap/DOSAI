# P3 Service Management lifecycle composition evidence

Recorded 2026-09-21. Contributor: unclassified assistant; no specialized role.
**The signed-package lifecycle composition is source-complete and inertly
validated; package build, signing, launch and physical lifecycle remain
NO-GO.**

## Scope

This source-only successor adds the dedicated build, package and audit-runner
composition required to exercise the accepted v46-v48 lifecycle contract in a
future separately authorized physical proof. It uses the owner's standing
authorization for minor source changes, builds, tests, commits and review-branch
updates. It does not use the signing identity, build a native module or package,
launch DOSAI, load native code, or call Service Management.

## Implemented composition

The fixed build mode is `service-management-lifecycle-proof`; the fixed package
argument is `--signed-app-service-management-lifecycle-proof-fixture`. They
select only the v48 proof entry and the distinct native addon
`dosai-service-management-lifecycle.node`, identified as
`com.socialeap.dosai.service-management-lifecycle-addon`. Production continues
to select `src/main/index.ts`.

The dormant addon builder verifies the exact Node 24.18.0 N-API headers, fixes
the target to arm64 macOS 15, links only ServiceManagement, and places signing
after compilation under the existing test identity selector. The package source
requires nested-code verification before outer-app verification and validates
the exact architecture, minimum OS, framework and N-API symbol boundary. None
of those commands was invoked for this evidence.

The fixed runner launches only the packaged DOSAI executable with zero
arguments, a closed environment, a 4 KiB output ceiling, a 15-second timeout,
and `SIGKILL` on timeout. It admits one strict duplicate-key-free JSON receipt,
checks the exact schema, statuses, counts and completion bounds, and has no
retry path. Only `REGISTERED_AND_CLEANED` with a clean terminal observation is
classified as proof success; all other admitted receipts set failure status.

## Failure containment

The in-process lifecycle core requires an initial `NOT_REGISTERED` observation
and makes at most one cleanup attempt. A missing receipt, timeout,
`CLEANUP_UNVERIFIED`, or any other non-success result stops the attempt without
retry. Because `SIGKILL`, power loss, or process failure after registration can
bypass in-process cleanup, the runner does not claim automatic recovery. The
owner must inspect and resolve any residual background-item state before a
future attempt. A physical proof therefore remains a major state-changing gate
requiring exact owner authorization and a pre-agreed recovery procedure.

## Validation

Seventeen focused composition, proof-entry and v48/v49 governance checks pass.
All eight TypeScript projects pass. The complete repository regression passes
549 of 549 tests, and the normal Main, preload and renderer production builds
pass using Vite's runner config loader. The direct build wrapper first stopped
before compilation because the restricted test environment could not write
Vite's temporary config beneath the shared read-only dependency tree; it made
no package or runtime action and is not cited as build evidence.

The dedicated Vite selector builds the real CommonJS lifecycle entry into a
temporary test directory; no native module is present or loaded. Adversarial
receipt tests reject malformed JSON, duplicate keys, extra fields, expanded
counts, contradictory completion counts, stderr and extra output.

No package command, compiler link, codesign command, app launch, native-module
load, status call, registration, unregistration, service launch, XPC
connection, VM action, process-control action, network action, journal change,
production use, physical attempt or external builder provisioning occurred.

## Remaining gates

A physical lifecycle attempt requires separate owner authorization for the
exact reviewed commit, identity, package build, one app launch, one bounded
register/observe/unregister sequence, the 15-second timeout, and the recovery
procedure. Independent native Linux builders, accepted guest artifacts,
isolation and approval evidence, and supervised real-execution validation
remain required for private beta.

**Release classification:** local desktop source, tests, evidence and governance
only. No Lovable action, backend activation or frontend Publish is required.

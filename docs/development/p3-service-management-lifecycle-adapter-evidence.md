# P3 Service Management lifecycle adapter evidence

Recorded 2026-09-20. Contributor: unclassified assistant; no specialized role.
**The dormant native adapter source is implemented and syntax-validated; every
physical lifecycle action and private-beta execution remain NO-GO.**

## Authorized scope

The owner authorized one bounded source-only native Service Management
lifecycle adapter plus adversarial tests and governance records. The authority
explicitly excluded package build, signing, app launch, registration,
unregistration, service launch, connection, deployment, distribution,
production use, physical attempt and external builder provisioning.

No earlier physical-proof authority was reused. This slice created no native
bundle or executable and invoked no Service Management API.

## Implemented boundary

`src/main/execution/service-management-lifecycle-adapter.mm` is dormant
Objective-C++ source using stable Node-API v8. It exports exactly `observe`,
`register` and `unregister`; each accepts zero arguments only. The target plist
name is fixed internally to
`com.socialeap.dosai.execution-service-fixture.plist`.

The source contains one registration call site and one unregistration call
site. Each returns only a boolean success value, requires both a successful
platform result and no `NSError`, catches Objective-C exceptions, exports no
error details, and contains no retry or loop. Status observation admits only
the four existing values and maps unknown or exceptional states to
`NOT_FOUND`.

The adapter does not coordinate lifecycle order. The v46 injection-only core
continues to own the exact clean precondition, single-use sequence, one
registration attempt, at most one cleanup attempt and final clean-status
requirement.

## Reachability and validation

No Electron Main, preload, renderer, build, package or status-proof entrypoint
references the adapter. Process ownership v47 binds its exact source and
adversarial test with every runtime and physical authority false.

The compiler check uses the accepted Node 24.18.0 headers and
`arm64-apple-macos15.0` target in `-fsyntax-only` mode. It creates no linked
output and removes its temporary module cache. The test never loads the native
source or calls Service Management.

Sixteen focused v46/v47/core/adapter checks passed initially. After the final
placement correction, 17 focused adapter/governance and historical-inventory
checks passed. All eight TypeScript projects and the three normal Main,
preload, and renderer production builds passed. The final repository regression
passed all 532 tests.

The first full regression attempt identified five accepted tests that preserve
the exact historical execution-service directory inventory. The source was
moved to the already dormant Main lifecycle boundary, and those immutable
inventories then passed unchanged. No historical guard was weakened.

Two initial typecheck command attempts selected an ambient pnpm/TypeScript path
incompatible with the pinned repository toolchain and exited before checking
source. The eight projects were then run directly with pinned Node 24.18.0 and
the installed TypeScript 7.0.2 compiler; all passed. No dependency was installed
or changed.

No package, signing, app launch, native-module load, status call, registration,
unregistration, service launch, XPC connection, VM action, process action,
network action, journal mutation, production use or physical attempt occurred.

## Remaining gates

A future physical lifecycle proof still requires a separately reviewed package
path, an explicit cleanup and failure-containment plan, and separate owner
authorization acknowledging that registration may immediately bootstrap the
LaunchAgent. Independent Linux builders, accepted guest artifacts, isolation
and approval evidence, and supervised real-execution validation also remain
required.

**Release classification:** local desktop source, tests, evidence and
governance only. No Lovable action, backend activation or frontend Publish is
required.

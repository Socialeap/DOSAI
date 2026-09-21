# P3 Packaged Service Composition Evaluation

**Status:** `OWNER_ACCEPTED`<br>
**Recorded:** `2026-08-02T20:48:47-04:00`<br>
**Implementation authority accepted:** `2026-08-02T21:45:26-04:00`<br>
**Implemented:** `2026-08-02T21:56:12-04:00`<br>
**Evidence accepted:** `2026-08-02T23:55:09-04:00`<br>
**Decision:** Accepted ADR 0020<br>
**Accepted baseline:** Process ownership v16 and schema registry v18<br>
**Accepted evidence:** Process ownership v16 over accepted v15

## Question

Choose the next bounded step between the accepted authenticated anonymous XPC
fixture and ADR 0020's future per-user LaunchAgent without registering,
launching, or composing a service into Electron Main prematurely.

## Current Package Boundary

The optional static-watchdog package mode now produces a local Apple
Development-signed test app containing the exact accepted anonymous fixture at
`Contents/Library/LaunchServices/com.socialeap.dosai.watchdog-xpc-fixture`.
The nested fixture is signed before the outer app with selector `UMXN25Z493`;
both signatures report TeamIdentifier `3RD3TADLRY` and satisfy their designated
requirements.

The package has no `Contents/Library/LaunchAgents` or `LaunchDaemons` directory,
service property list, ServiceManagement import, named Mach service,
registration operation, or execution-service application path. Static mode
does not invoke the DOSAI app, nested fixture, or packaged Secure Enclave helper.

The installed macOS 26.5 SDK confirms the macOS 15-compatible `SMAppService`
contract selected by ADR 0020:

- the containing app must be code signed;
- an agent property list must live under
  `Contents/Library/LaunchAgents`;
- `BundleProgram` may name an app-bundle-relative executable;
- registration may immediately bootstrap the LaunchAgent; and
- status distinguishes not registered, enabled, requires approval, and not
  found.

Because registration may launch the service immediately, packaging and
registration are separate authority gates.

## Options Evaluated

### Package And Register Together

This would combine nested signing, app signing, plist semantics, Service
Management mutation, user approval, launchd lifecycle, named XPC, and cleanup
in one first run. A failure would be difficult to attribute and could leave a
registered background item. It is not selected.

### Package A LaunchAgent Plist Without A Service

An embedded plist could be registered externally even if DOSAI contains no
registration code. It would introduce a misleading or launchable declaration
before the named listener exists. It is not selected.

### Static Signed Nested Fixture Candidate

Package the exact accepted anonymous XPC fixture as nested test code at:

`Contents/Library/LaunchServices/com.socialeap.dosai.watchdog-xpc-fixture`

Sign the nested fixture first and the outer test app last with the exact
owner-authorized development identity. Verify the app identifier, nested
identifier, TeamIdentifier, designated requirements, package paths, source
hashes, and strict signatures. Keep the fixture application-unreachable and do
not add a LaunchAgent plist, ServiceManagement import, registration operation,
named Mach listener, application bridge, or runtime invocation.

This is the selected next slice.

## Implemented Boundary

Process ownership v15 authorized only static test-package composition and the
owner separately authorized test-only signing. The implementation changes only
the package script and exact packaging tests needed to:

- build the accepted three-source anonymous fixture for arm64 macOS 15;
- place it at the fixed LaunchServices path;
- sign nested code before the outer app;
- verify exact identifiers and TeamIdentifier `3RD3TADLRY`;
- verify the app still contains only governed ASAR and helper content; and
- suppress every packaged-executable invocation in static mode; and
- leave the signed result only as a local `out/` build artifact.

The package must remain inert: no `Contents/Library/LaunchAgents`,
`Contents/Library/LaunchDaemons`, `MachServices`, `SMAppService`,
`ServiceManagement`, `launchctl`, registration, unregistration, process launch,
or application client path is permitted.

## Evidence Recorded

The admissible final run proves:

1. accepted v14 and every accepted source hash remain immutable;
2. nested and outer signatures are valid under the exact development identity;
3. the nested executable is arm64, targets macOS 15, and retains its fixed
   anonymous no-effect interface;
4. the package contains no service plist, named listener, registration API,
   VM, filesystem, network, journal, or reconciliation path;
5. the existing ad-hoc and wrong-team adversarial proofs remain green; and
6. all focused checks, eight typechecks, full tests, three production builds,
   package checks, authority, whitespace, and secret scans pass.

Process ownership v16 binds the final package script and security-test
postimages, the exact observed identifiers and TeamIdentifier, strict signature
results, absent registration artifacts, and preserved authority denials.

## Discarded Pre-Evidence Runs

The first package implementation invoked the nested fixture's read-only
`describe` operation after signing. That execution reported no mutation and no
registration, but it exceeded the owner's no-launch authorization and was
discarded as evidence. After that call was removed, review found that the
pre-existing package baseline still invoked the packaged Secure Enclave
helper's read-only description operation. That run was also discarded.

Static mode now suppresses both invocation paths. Cross-file tests reject a
watchdog executor import, inspect the build-only helper boundary, and require
the inherited Secure Enclave description check to remain outside static mode.
The final cited run invoked no packaged executable.

## Validation

The exact governed toolchain was Node `24.18.0` and pnpm `11.18.0`.

```text
Focused v15, v16, and static-package checks
14 tests passed; 0 failed

Owner-authorized static package proof
Build, nested-first signing, and outer signing passed
Outer identifier: com.socialeap.dosai
Nested identifier: com.socialeap.dosai.watchdog-xpc-fixture
Both TeamIdentifier values: 3RD3TADLRY
Both strict designated-requirement checks passed
Keychain inventory remained exactly 1 valid code-signing identity

pnpm --config.verify-deps-before-run=warn run typecheck
8 TypeScript project checks passed

pnpm --config.verify-deps-before-run=warn test
317 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run build
main, preload, and renderer production builds passed
```

Unrestricted read-only `codesign` verification passed. The same verification
inside the restricted test sandbox reported `CSSMERR_TP_NOT_TRUSTED` because
that environment cannot evaluate the local certificate chain; normal Keychain
visibility resolved the environmental result without changing trust state.
The package was not opened, registered, deployed, or published. No identity,
Keychain, trust, launchd, background-item, or application runtime state changed.

## Known Limitations

- Static composition does not prove `SMAppService`, launchd, user approval,
  named Mach XPC, separate-process persistence, or application communication.
- The packaged binary remains the accepted anonymous inert fixture and is not
  a LaunchAgent implementation.
- Development signing proves only the test identity and cannot substitute for
  release signing, hardened runtime, notarization, or production requirements.
- The signed package remains a local generated artifact under `out/`; it is not
  installed, registered, launched, deployed, or published.
- Physical registration will require a later explicit owner authorization and
  app-launch approval because the API may immediately bootstrap the service.

## Owner Decision

The repository owner accepted process ownership v15 and authorized test-only
use of selector `UMXN25Z493` and TeamIdentifier `3RD3TADLRY` to sign the static
outer app and nested anonymous fixture. No registration or launch was
authorized. Acceptance does not authorize any plist, named service,
application connection, VM, process, filesystem, network, journal,
reconciliation, or production operation.

The repository owner accepted process ownership v16 and this static-composition
evidence. No registration, launch, plist, named-service, or application-
composition work may begin from this acceptance without a separate accepted
ownership generation and explicit owner authorization.

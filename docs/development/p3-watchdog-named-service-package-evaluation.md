# P3 Watchdog Named-Service Static Package Evaluation

**Status:** `OWNER_ACCEPTED`<br>
**Recorded:** `2026-08-03T18:31:44-04:00`<br>
**Validated:** `2026-08-03T18:34:44-04:00`<br>
**Accepted:** `2026-08-03T18:42:32-04:00`<br>
**Implemented:** `2026-08-03T18:47:29-04:00`<br>
**Implementation validated:** `2026-08-03T18:51:29-04:00`<br>
**Evidence accepted:** `2026-08-03T19:25:03-04:00`<br>
**Decision:** Accepted ADR 0020<br>
**Accepted baseline:** Process ownership v22 over accepted v21<br>
**Accepted implementation gate:** Process ownership v23 over accepted v22<br>
**Accepted evidence:** Process ownership v24 over accepted v23<br>
**V24 proposal-state SHA-256:** `f35457189dccc1d08cbc6ce8c60b9952ab1fd35dfc5c2807269107f7b8e8f839`<br>
**Accepted v24 SHA-256:** `8c419831f4d1ee9ac8efc8fd76e1fb47fccbf9197bf21334edf0a6d412098f3e`

## Question

Choose the smallest step after the accepted unsigned executable proof that can
establish exact signed package placement without adding a service declaration,
registration operation, launch, or application connection.

## Current Boundary

Accepted process ownership v22 proves that the exact five-source named-service
candidate links for arm64 macOS 15 with default Apple Silicon ad-hoc signing
disabled. The temporary executable was inspected, never invoked, and removed.
No named-service signature, package entry, plist, registration, launch, or
application path exists.

The existing owner authorization for selector `UMXN25Z493` and TeamIdentifier
`3RD3TADLRY` applies to the accepted anonymous fixture and its containing static
test app. It does not silently authorize signing the distinct named-service
executable or re-signing an app that contains that new code.

## Options Evaluated

### Add The LaunchAgent Plist Now

Rejected. A plist under `Contents/Library/LaunchAgents` would be externally
registerable and would combine package placement with launchd-visible service
semantics before the executable's exact signature and nested location are
proven.

### Register Or Launch The Unsigned Candidate

Rejected. The accepted candidate is deliberately unsigned, ineligible for
packaging, and has no service declaration. Registration can bootstrap a service
immediately and therefore requires its own physical owner gate.

### Reuse The Anonymous Fixture Signing Authorization

Rejected. That authorization names different nested code. Treating it as a
general development-signing grant would weaken the evidence-gated authority
model.

### Add One Owner-Gated Static Named-Service Package Mode

Selected. After process ownership v23 acceptance and separate explicit signing
authorization, add one fixed-source builder, one exact package mode, and one
adversarial test. Place only the named-service fixture at:

`Contents/Library/LaunchServices/com.socialeap.dosai.execution-service-fixture`

Sign the nested executable before the outer static test app, verify both exact
identifiers, TeamIdentifier, designated requirements, architecture, minimum OS,
and strict signatures, and invoke neither executable. Retain only the generated
local `out/` package artifact.

## Proposed Files

- `scripts/watchdog-named-service-fixture.mjs`
- `scripts/package.mjs`
- `tests/security/p3-watchdog-named-service-packaging-candidate.test.mjs`

The new builder must compile only the five accepted Swift source postimages for
`arm64-apple-macos15.0`. The package script may add only the exact
`--static-named-service-fixture` mode and fixed package path. The existing
anonymous static-package mode and its accepted source and test preimages remain
regression inputs.

## Required Signing Authorization

Implementation cannot begin from process ownership acceptance alone. The owner
must also authorize test-only use of:

- identity selector `UMXN25Z493`;
- TeamIdentifier `3RD3TADLRY`;
- nested identifier `com.socialeap.dosai.execution-service-fixture`; and
- outer identifier `com.socialeap.dosai` only for the containing static test
  package produced by this exact mode.

The authorization permits no identity export, Keychain mutation, production
signing, release signing, notarization, publication, installation, registration,
or launch.

## Required Implementation Evidence

After both owner gates are accepted, the implementation must prove:

1. all eight v23 immutable source and package preimages remain exact;
2. strict package admission accepts only the existing mode, the new exact mode,
   or no mode, and rejects combinations or unknown arguments;
3. the named executable is built only from the accepted five-source set for
   arm64 macOS 15 and receives the exact test identifier and TeamIdentifier;
4. nested code is signed before the outer app and both strict designated
   requirement checks pass;
5. neither the app nor any packaged helper or fixture is invoked;
6. the package contains no LaunchAgent or LaunchDaemon plist, `MachServices`,
   ServiceManagement import, `SMAppService`, registration, or unregistration;
7. no application client, VM, process, filesystem, network, journal,
   reconciliation, ownership-release, or production authority is added; and
8. focused checks, exact-toolchain typecheck, all tests, builds, package
   inspection, JSON, hashes, whitespace, artifacts, and secret scans pass.

## Explicit Denials

Process ownership v23 proposes no authority to create a plist, install,
register, unregister, launch, open the app, invoke the nested executable,
connect Electron Main, start a VM, target a process, access capsule files or
networks, write the journal, reconcile ownership, or perform production work.

No signing identity may be used until the owner explicitly authorizes it for
the exact nested named-service fixture and containing static test app.

## Proposal Validation

Validation used exact Node `24.18.0` and pnpm `11.18.0`.

```text
Focused v22-v23, executable, and package checks
17 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run typecheck
8 TypeScript project checks passed

pnpm --config.verify-deps-before-run=warn test
363 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run build
main, preload, and renderer production builds passed
```

The validated proposal-state process ownership v23 parses strictly, is
hash-bound to accepted v22 digest
`cad2d39ef855511a71b081cf1d9378a69374cf37b37b62aa7648fce9dd35a8a3`,
and had SHA-256
`b29243c0a1eeb349ccb8452359538618abe5bdad9e8ffc437191c3619bf9ddd0`.
After the owner-acceptance status and exact signing-authorization update, its
immutable accepted SHA-256 is
`e9b50e1495929034e8648612bedb586e4f7e6eb5dc0c651464a345ce96ef1f21`.
All eight accepted source and package preimages remain exact. JSON, whitespace,
executable-file, temporary-directory, proposed-artifact, plist, and high-risk
secret scans pass. `git diff --check` reports no finding beyond the existing
benign fsmonitor warning.

No named-service package helper or implementation test exists, and the package
script contains no new mode, import, or destination. No package command,
signing tool, identity lookup, plist, registration, launch, or application
operation occurred during proposal validation.

## Implementation Evidence

The accepted v23 slice added exactly:

- one fixed-source named-service build helper;
- one strict `--static-named-service-fixture` package mode; and
- one adversarial security test.

The builder compiles only the five accepted Swift postimages for arm64 macOS
15, disables default Apple Silicon ad-hoc signing, and applies the exact
owner-authorized development identity and nested identifier. The package mode
places that executable only at the accepted `Contents/Library/LaunchServices`
path, signs nested code before the outer app, and suppresses every packaged
helper or application invocation.

The corrected final physical run proved:

- nested identifier `com.socialeap.dosai.execution-service-fixture`;
- outer identifier `com.socialeap.dosai`;
- TeamIdentifier `3RD3TADLRY` on both signatures;
- strict signature and exact designated-requirement verification;
- arm64 architecture and minimum macOS 15;
- expected XPC and Dispatch libraries with no forbidden framework;
- no anonymous fixture, LaunchAgent plist, or LaunchDaemon plist; and
- no registration, launch, or application connection.

The signed test package remains only as the generated local artifact at
`out/DOSAI-darwin-arm64/DOSAI.app`. Process ownership v24 binds the three
implementation postimages, seven successor-aware historical guard updates,
artifact hashes and CDHashes, and all no-effect observations. Its SHA-256 is
`8c419831f4d1ee9ac8efc8fd76e1fb47fccbf9197bf21334edf0a6d412098f3e`.
The validated proposal-state SHA-256 before owner acceptance was
`f35457189dccc1d08cbc6ce8c60b9952ab1fd35dfc5c2807269107f7b8e8f839`.

```text
Focused ownership, executable, and package checks
63 tests passed; 0 failed

Owner-authorized static named-service package proof
Nested and outer signing passed
Both strict designated-requirement checks passed
Nested architecture arm64; minimum macOS 15.0
No service plist, registration, or launch observed

pnpm --config.verify-deps-before-run=warn run typecheck
8 TypeScript project checks passed

pnpm --config.verify-deps-before-run=warn test
373 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run build
main, preload, and renderer production builds passed
```

### Discarded Attempts

The first command included an extra separator argument and failed strict
package admission before build or signing. A direct second run built and signed
the authorized artifacts but used the wrong post-sign `codesign` requirement
argument form; that run was discarded as incomplete evidence. Local
documentation established the separate `-R` literal-source form, the call was
corrected, and the final run completed every check. Neither discarded attempt
invoked, registered, or launched the app or fixture.

Seven historical tests now preserve their original accepted preimages while
verifying the v24-bound package-script successor. No accepted ownership
manifest, source contract, schema, or prior evidence hash was rewritten.

## Known Limitations

- Static package placement will not prove launchd discovery, registration,
  user approval, named XPC messaging, disconnect behavior, or service lifetime.
- Development signing will prove only the exact local test identities, not
  hardened runtime, release signing, notarization, or production eligibility.
- A generated app bundle can be launched manually; this proposal prevents
  invocation during evidence generation but does not claim the artifact is a
  sandbox boundary.
- Plist structure, registration states, physical launch, app-to-service
  messaging, crash behavior, VM ownership, teardown, and orphan reconciliation
  remain separately gated.

## Owner Decision

The repository owner accepted process ownership v23 and authorized test-only
use of selector `UMXN25Z493` and TeamIdentifier `3RD3TADLRY` to sign only the
nested `com.socialeap.dosai.execution-service-fixture` and containing static
`com.socialeap.dosai` test app. No plist, registration, or launch was authorized.

That implementation is complete, and the repository owner accepted process
ownership v24 and this final evidence. No plist, registration, launch,
application connection, VM, process, filesystem, network, journal,
reconciliation, ownership-release, or production behavior is authorized or
claimed.

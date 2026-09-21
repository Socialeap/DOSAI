# P3 Service Management Status Addon Static Package Proposal

**Status:** `ACCEPTED`<br>
**Recorded:** `2026-08-06T14:21:03-04:00`<br>
**Validated:** `2026-08-06T14:25:17-04:00`<br>
**Owner accepted and signing authorized:** `2026-08-06T15:44:32-04:00`<br>
**Implemented and revalidated:** `2026-08-06T16:04:05-04:00`<br>
**Owner accepted evidence:** `2026-08-06T17:00:01-04:00`<br>
**Decision:** Accepted ADR 0021<br>
**Accepted baseline:** Process ownership v34<br>
**Proposed gate:** Process ownership v35<br>
**V35 proposal SHA-256:** `01dd8217e25f79078396874c0db986157503f2e45fda07cace4e37e9a5b287a8`<br>
**Accepted authorization-state v35 SHA-256:** `90c5351dea1f3bb2f3c2b593d838755440bd31a7e2aa1eff299e95d3d9ad556d`<br>
**Proposed evidence gate:** Process ownership v36<br>
**V36 SHA-256:** `e01c7afd908c83045e65a3dc3232c18577644e0b17c950ce6899c069a3c75006`<br>

## Question

Choose the smallest package-composition step after the accepted compile proof
that can place the fixed status addon in the already accepted plist-bearing
test app, preserve exact signing order, and prove static integrity without
loading the module or invoking Service Management.

## Current Boundary

Accepted v34 proves that the fixed Objective-C++ source compiles as a temporary
unsigned arm64 macOS 15 Node-API v8 bundle under the canonical Node 24.18.0
header gate. The temporary bundle is inspected and deleted. No native module is
retained, packaged, signed, loaded, or invoked.

Accepted v28 separately retains a signed local test app containing the exact
named-service executable and fixed LaunchAgent plist. That app contains no
status addon. ADR 0021 requires package composition before any signed-app load
or status-only physical proof.

## Options Evaluated

### Modify The Accepted Plist-Bearing Package Mode

Rejected. The accepted `--static-named-service-launch-agent-fixture` mode is
immutable evidence for v28. Changing its contents would erase the clean package
baseline and make regressions harder to distinguish.

### Package The Addon Without The Service Plist

Rejected. Such an app could prove only that a native file was copied. It would
not preserve the exact bundle context required by the fixed
`SMAppService.agent(plistName:)` lookup selected in ADR 0021, and a later load
proof would need another package-composition change.

### Package And Load In One Step

Rejected. Loading the module would expand Electron Main authority and invoke
the status path before nested signature, fixed layout, symbol, and package
integrity are independently established. ADR 0021 requires a separate physical
load gate.

### Add A Distinct Complete Static Package Mode

Selected. Proposed v35 reserves one fixed-source build helper, one distinct
package mode, and one adversarial package test. After proposal acceptance and
separate exact signing authorization, the mode may compose the accepted named
service, accepted plist, and fixed status addon in one local signed test app.
It may inspect the package but may not invoke any packaged code.

## Exact Package Contract

The proposed mode is:

`--static-named-service-launch-agent-status-addon-fixture`

It must preserve every accepted package mode and add exactly this status-addon
resource to the accepted plist-bearing layout:

`Contents/Resources/dosai-service-management-status.node`

The addon must retain code-signing identifier
`com.socialeap.dosai.service-management-status-addon`. The containing app must
retain `com.socialeap.dosai`. The accepted named-service executable and plist
remain at:

- `Contents/Library/LaunchServices/com.socialeap.dosai.execution-service-fixture`
- `Contents/Library/LaunchAgents/com.socialeap.dosai.execution-service-fixture.plist`

The fixed helper may compile only the accepted Objective-C++ source with the
accepted canonical Node 24.18.0 C headers, Node-API v8, C++20, target
`arm64-apple-macos15.0`, dynamic Node-API lookup, ServiceManagement, and
automatic ad-hoc signature suppression. It may invoke only `xcrun`, `codesign`,
`lipo`, `otool`, and `nm` with fixed arguments.

Nested signing order must be: accepted named-service executable, status addon,
then outer app after the accepted plist is present. Static inspection must prove
the exact identifiers and TeamIdentifier, strict and designated-requirement
verification, arm64, minimum macOS 15.0, ServiceManagement linkage, bounded
Node-API initializer and undefined symbols, no adjacent Node ABI, no forbidden
framework, and exact package paths.

## Implemented Files

After both owner gates, implementation was limited to:

- `scripts/service-management-status-addon.mjs`
- `scripts/package.mjs`
- `tests/security/p3-service-management-status-addon-packaging-candidate.test.mjs`

Proposed v36 binds those exact postimages. The helper builds and signs only the
fixed addon. The package script preserves every earlier mode and adds the one
accepted complete static mode. The adversarial test inspects the retained package
without loading or invoking it.

## Recorded Signing Authorization

Process ownership v35 acceptance alone did not open signing or implementation.
The owner separately authorized test-only use of:

- selector `UMXN25Z493`;
- TeamIdentifier `3RD3TADLRY`;
- nested addon identifier
  `com.socialeap.dosai.service-management-status-addon`; and
- containing static test app identifier `com.socialeap.dosai` with the exact
  accepted named-service executable and LaunchAgent plist.

That authorization applies only to the fixed local package proof. It does not
authorize module loading, status invocation, registration, launch,
production signing, or broader identity use.

## Authority Boundary

Accepted v35 plus the owner's exact signing authorization permitted only the
fixed local build, composition, signing, and static inspection performed for this
evidence. Neither accepted v35 nor proposed v36 authorizes:

- native module, app, service, or helper loading or invocation;
- `SMAppService.status`, registration, unregistration, or System Settings;
- `launchctl`, installation, loading, service launch, or application
  connection;
- Main adapter composition, preload or renderer exposure, generic native
  dispatch, or caller-controlled paths;
- VM, process, filesystem-data, network, XPC, journal, reconciliation,
  execution, or production behavior; or
- dependency, lockfile, accepted source, or accepted package-mode mutation; the
  new package mode remains distinct.

## Immutable Baseline

Proposed v35 is hash-bound to final accepted v34 SHA-256
`fd1468eb7b0780740ccad4f75a476439338780dd367a732750ba80fdec653aea`
and eleven accepted architecture, source, test, package, and toolchain inputs.
Before the authorized package execution, v35 recorded this exact retained v28
baseline:

| Artifact | SHA-256 |
| --- | --- |
| Named-service executable | `3ccacfdcc6b26f09ad35f830e536c3ab326ee2a6a4dee538d66a7190580529d9` |
| LaunchAgent plist | `b7c1a4e1434bea935cb6ca64f8a33e78cb8f94f0b7644bbc103c1f55c6a1c3b5` |
| Outer executable | `933d34625252b585e507b448787d3bbed6a9bc2d6ba22039934bbf40cb82adf4` |
| Outer Info.plist | `6661b003e633cff83c1e6311a387ce205c93538801043c4fe5065ab52dc219e7` |
| app.asar | `1e49b8ae842ac7134f79d6d40ff8a82ecb4154c26b22512710a0aeea0b5bf7f2` |

That retained baseline was the input to the new distinct mode. The authorized
mode replaced the local generated output with this proposed-v36 package:

| Artifact | SHA-256 |
| --- | --- |
| Status addon | `915d9858a1d93c76aefe3a176ea1d96261c49f3edf25016ff09b2d4d5c1b5270` |
| Named-service executable | `8c91543857d1b6f829dd8c88b07c3fd13616b588f1750261806e50d534b76292` |
| LaunchAgent plist | `b7c1a4e1434bea935cb6ca64f8a33e78cb8f94f0b7644bbc103c1f55c6a1c3b5` |
| Outer executable | `20140efe04f582a67ee04042efe6035e9a0c676fa0a4cb3d77575c88ddea5176` |
| Outer Info.plist | `6661b003e633cff83c1e6311a387ce205c93538801043c4fe5065ab52dc219e7` |
| app.asar | `1e49b8ae842ac7134f79d6d40ff8a82ecb4154c26b22512710a0aeea0b5bf7f2` |

Static inspection recorded addon CDHash `243e680bc451fd3231a450ff7207e628d7b4efe5`,
named-service CDHash `fa71d6d109ae21ac3edafbe73b541c824817db8a`, and
outer-app CDHash `704ecc07aefbb6768e6abe0fbef732d05e1319ae`; all three
signatures report TeamIdentifier `3RD3TADLRY` and the exact accepted identifiers.

## Validation Evidence

Proposed v36 SHA-256
`e01c7afd908c83045e65a3dc3232c18577644e0b17c950ce6899c069a3c75006`
is hash-bound to final accepted v35
`90c5351dea1f3bb2f3c2b593d838755440bd31a7e2aa1eff299e95d3d9ad556d`.
It binds three implementation postimages, 23 successor-aware historical guards,
the generated package hashes and CDHashes, and every no-effect observation.

Two authorized package attempts occurred. The first compiled and signed all
three code objects, then was discarded because an overbroad `nm` matcher counted
the exported Node-API initializer as an undefined import. The corrected matcher
considers only undefined N-API symbols; the second clean build passed every
inspection. Neither attempt loaded or invoked code, called status, registered,
launched, or connected.

```text
Focused ownership, package, and retained-artifact checks
84 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run typecheck
8 TypeScript project checks passed

pnpm --config.verify-deps-before-run=warn test
461 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run build
main, preload, and renderer production builds passed
```

JSON, formatting, postimage, retained-package, signature, designated-requirement,
architecture, minimum-OS, framework, symbol, exact-layout, and high-confidence
secret checks pass. The only workspace `.node` artifact outside dependencies is
the authorized retained addon at its exact package path. The existing
node_modules/lockfile synchronization warning remains non-blocking and unchanged.

## Known Limitations

- Static package integrity will not prove Electron can load the addon.
- A future signed-app physical proof must separately authorize module loading
  and exactly one zero-argument status call.
- A status observation will not prove service liveness, authenticated XPC,
  reconciliation, execution availability, or authorization.
- Registration, user approval handling, launch, connection, and cleanup remain
  later independent gates.

## Owner Decision

Recorded `2026-08-06T15:40:08-04:00`: the independent technical-peer-reviewer v1
recorded `RECOMMEND_ACCEPT` for proposed v35 after reproducing 10 focused
ownership checks, eight typechecks, all 451 repository tests, and three
production builds, and confirming the proposal changes only proposal fields plus
five invariants with signing kept behind a separate gate. The owner granted the
exact test-only signing authorization as worded (selector `UMXN25Z493`,
TeamIdentifier `3RD3TADLRY`, nested
`com.socialeap.dosai.service-management-status-addon` and containing static
`com.socialeap.dosai` test app with the accepted named-service executable and
LaunchAgent plist; no module load, status call, registration, launch, or
connection). Codex recorded process ownership v35 acceptance and the exact
signing authorization at `2026-08-06T15:44:32-04:00`. Implementation is now
limited to the three reserved package-composition paths.

Implementation and validation are complete under that authorization. The owner
accepted process ownership v36 at `2026-08-06T17:00:01-04:00`. Acceptance
governs only the signed static package evidence; module loading and the single
zero-argument status call remain a separate future owner gate.

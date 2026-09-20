# P3 Watchdog LaunchAgent Plist Evaluation

**Status:** `OWNER_ACCEPTED`<br>
**Recorded:** `2026-08-03T19:27:03-04:00`<br>
**Validated:** `2026-08-03T19:29:51-04:00`<br>
**Accepted:** `2026-08-04T02:55:01-04:00`<br>
**Implemented:** `2026-08-04T02:57:17-04:00`<br>
**Implementation validated:** `2026-08-04T03:01:50-04:00`<br>
**Evidence accepted:** `2026-08-04T14:38:29-04:00`<br>
**Decision:** Accepted ADR 0020<br>
**Accepted baseline:** Process ownership v24 over accepted v23<br>
**Accepted gate:** Process ownership v25 over accepted v24<br>
**V25 proposal-state SHA-256:** `8426cc8f9bcd33b510edaf99e63a94f130949bbd0d12abd6ea2b19171c6c4438`<br>
**Accepted v25 SHA-256:** `9f2f529e88577eed7f8c9ee6b1d5c6daa129a8839167d88fe4a459647615977c`<br>
**Accepted evidence:** Process ownership v26 over accepted v25<br>
**Proposed v26 SHA-256:** `ab403b0bfc0a3c8df4995b94fc10fa49b7f496dfde8d21a622345fa12432be8f`

## Question

Choose the smallest step after the accepted signed static package proof that can
define launchd discovery semantics without changing the package, registering a
service, or allowing code to launch.

## Current Boundary

Accepted process ownership v24 binds the exact signed nested test executable at
`Contents/Library/LaunchServices/com.socialeap.dosai.execution-service-fixture`
inside the static `com.socialeap.dosai` test app. The generated package has no
LaunchAgent or LaunchDaemon plist, was not invoked, and was not registered.

The accepted package, builder, Swift sources, package script, and security test
are immutable inputs to this proposal. Source-only declaration authority does
not change the accepted active-plist authority, which remains false.

## Platform Contract Reviewed

The installed macOS SDK and local `launchd.plist(5)` documentation establish:

- `Label` is required and must uniquely identify the job.
- `BundleProgram` is an app-bundle-relative executable path supported for jobs
  installed through `SMAppService`.
- `MachServices` advertises an exact Mach service when its value is `true`.
- `ProgramArguments` supplies an argument vector and is unnecessary for this
  fixed zero-argument fixture.
- `RunAtLoad` and `KeepAlive` can cause eager or repeated launch and are not
  needed for an on-demand Mach service.
- `SMAppService.agent(plistName:)` requires a matching plist under
  `Contents/Library/LaunchAgents`, and registration may make the service
  eligible to launch subject to user consent.

These facts keep source declaration, package composition, registration, and
physical launch as separate owner gates.

## Options Evaluated

### Package And Sign The Plist Now

Rejected. Placing the declaration under `Contents/Library/LaunchAgents` would
make it available to `SMAppService` and would combine contract review with a
new signed package artifact.

### Add Registration Code Now

Rejected. A `ServiceManagement` import or `SMAppService.register()` path could
make the helper launchable and therefore requires a later physical owner gate.

### Use A Generic Or Configurable Plist

Rejected. Arguments, environment, path triggers, sockets, startup controls, and
caller-selected names would add unnecessary behavior and weaken the fixed test
boundary.

### Add One Uncomposed Source Plist Contract

Selected. After separate owner acceptance of v25, add only one source plist and
one adversarial parser test. The source declaration will not be copied into the
app bundle or consumed by application code in this slice.

## Exact Proposed Contract

The source plist path is:

`native-helpers/execution-service/com.socialeap.dosai.execution-service-fixture.plist`

It must parse to exactly these three top-level keys:

| Key | Exact value |
| --- | --- |
| `Label` | `com.socialeap.dosai.execution-service-fixture` |
| `BundleProgram` | `Contents/Library/LaunchServices/com.socialeap.dosai.execution-service-fixture` |
| `MachServices` | `{ "com.socialeap.dosai.execution-service-fixture.watchdog": true }` |

The candidate must omit `Program`, `ProgramArguments`, `EnvironmentVariables`,
`RunAtLoad`, `KeepAlive`, `Disabled`, `UserName`, `GroupName`, sockets, path or
calendar triggers, network-state triggers, output paths, privileged-service
flags, and every caller-controlled setting.

## Proposed Files

- `native-helpers/execution-service/com.socialeap.dosai.execution-service-fixture.plist`
- `tests/security/p3-watchdog-launch-agent-plist-candidate.test.mjs`

Both files remained absent during proposal review. After v25 acceptance, the
implementation added exactly these files. The security test uses the already
pinned `plist` parser and rejects extra keys, altered identifiers, additional
Mach services, non-boolean service values, absolute or traversing program
paths, arguments, environment, and launch controls.

## Authority Boundary

V25 authorizes source and test scope only. It does not authorize:

- changing `scripts/package.mjs` or any Swift source;
- copying the plist into `Contents/Library/LaunchAgents`;
- signing a package containing the plist;
- importing `ServiceManagement` or calling `SMAppService`;
- using `launchctl`, installing, registering, unregistering, or launching;
- connecting the DOSAI application to the service;
- VM, process, filesystem, network, journal, reconciliation,
  ownership-release, or production behavior.

The existing local package remains the v24 evidence artifact. Before and after
proposal validation it must retain the recorded nested executable, outer
executable, and `Info.plist` hashes, and `Contents/Library` must contain no
plist.

## Validation Evidence

Proposal validation proved:

1. v25 is hash-bound to immutable accepted v24 SHA-256
   `8c419831f4d1ee9ac8efc8fd76e1fb47fccbf9197bf21334edf0a6d412098f3e`;
2. v25 changes only the new source-plist proposal fields and four invariants;
3. the two proposed implementation files are absent;
4. all eight accepted source and package inputs match their recorded hashes;
5. the package script contains no plist, Service Management, registration, or
   launch path;
6. the retained v24 package bytes and no-plist layout remain unchanged; and
7. pinned typecheck, full tests, and production build pass.

```text
Focused process ownership v25 checks
5 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run typecheck
8 TypeScript project checks passed

pnpm --config.verify-deps-before-run=warn test
378 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run build
main, preload, and renderer production builds passed
```

The retained v24 package hashes remain exact:

- nested executable:
  `9e5c9770efaca692f06696fc2e082a13733c3706eeb8799974bf5b9b03b26eec`;
- outer executable:
  `3f0ee1b7e035369efc70a234f454164ac2d1da5e7bc36efbb3f6f280c9b95c02`;
- `Info.plist`:
  `6661b003e633cff83c1e6311a387ce205c93538801043c4fe5065ab52dc219e7`.

JSON, immutable-input, proposal-file absence, no-plist package layout,
whitespace, and high-risk secret-pattern checks pass. The only diagnostic from
`git diff --check` is the existing benign Git fsmonitor warning. The pinned
package manager reports the pre-existing stale `node_modules` warning; no
dependency or lockfile change was made.

## Implementation Evidence

The accepted v25 slice added exactly:

- the fixed source plist, SHA-256
  `b7c1a4e1434bea935cb6ca64f8a33e78cb8f94f0b7644bbc103c1f55c6a1c3b5`;
  and
- its adversarial parser test, SHA-256
  `d10f8200313562c500c82b9fb4eecb5aa900f726be3d383bc43eaea7d817c883`.

`plutil -lint` accepts the source. Structured admission proves exactly three
top-level keys and one true Mach service. Adversarial cases reject identity,
path, service-set, value-type, launch-control, argument, environment, duplicate
key, non-dictionary, BOM, and size expansion.

Process ownership v26 binds both implementation postimages and fourteen
successor-aware guard remediations. Nine historical ownership tests now
recognize the accepted source-plist successor; five exact inventory guards add
only the new authorized filename.

The first complete run passed 383 of 388 tests and exposed those five stale
inventory lists. No behavior or authority check failed. After the exact-list
remediation, targeted checks and the complete suite passed:

```text
Core ownership, lineage, and plist checks
55 tests passed; 0 failed

Inventory-remediation checks
25 tests passed; 0 failed

plutil -lint
source plist: OK

pnpm --config.verify-deps-before-run=warn run typecheck
8 TypeScript project checks passed

pnpm --config.verify-deps-before-run=warn test
388 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run build
main, preload, and renderer production builds passed
```

The retained v24 package hashes remain unchanged and its `Contents/Library`
still contains only the signed LaunchServices executable. The source plist was
not copied into the package, signed, installed, registered, loaded, launched,
or connected to DOSAI. No package command, signing tool, `SMAppService`,
`launchctl`, VM, process, filesystem, network, journal, reconciliation, or
production operation ran during this slice.

## Known Limitations

- A source plist is a declaration that could become launchable if a person
  manually copied or adapted it outside this workflow; repository tests cannot
  prevent unrelated manual system administration.
- This proposal does not validate packaged plist lookup, registration status,
  user approval, on-demand launch, named XPC messaging, crash behavior, or
  service lifetime.
- Registration and physical launch must remain separate owner-gated slices
  because a successful registration may allow launchd to start the service.

## Owner Decision

The repository owner accepted process ownership v25. Implementation may add
only the exact source declaration and adversarial parser test described above.
Package composition, Service Management, registration, launch, and application
connection remain separately gated and unavailable.

The repository owner subsequently accepted process ownership v26 and this
implementation evidence. The source declaration remains uncomposed and grants
no package, registration, launch, application, VM, or production authority.

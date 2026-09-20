# P3 Watchdog Named-Service Executable Evaluation

**Status:** `OWNER_ACCEPTED`<br>
**Recorded:** `2026-08-03T17:06:30-04:00`<br>
**Validated:** `2026-08-03T17:08:51-04:00`<br>
**Accepted:** `2026-08-03T17:43:17-04:00`<br>
**Implemented:** `2026-08-03T17:47:54-04:00`<br>
**Evidence accepted:** `2026-08-03T18:29:48-04:00`<br>
**Decision:** Accepted ADR 0020<br>
**Accepted implementation gate:** Process ownership v21 over accepted v20<br>
**Accepted evidence:** Process ownership v22 over accepted v21

## Question

Choose the smallest step after the accepted compile-only named listener and
strict transport composition that can prove executable linkage without signing,
packaging, registering, launching, or invoking the service.

## Current Boundary

Process ownership v20 accepts source that can construct and activate one fixed
test Mach listener, authenticate incoming DOSAI clients, route strict watchdog
messages, and reduce inert records. No entry point calls that source. No named
service executable, signature, package entry, plist, registration operation, or
application connection exists.

## Platform Finding

The installed Xcode linker manual states that Apple Silicon binaries receive an
ad-hoc code signature by default. It also documents `-no_adhoc_codesign` to
disable that behavior. A build described merely as "unsigned" would therefore
be inaccurate unless the linker flag is explicit and the resulting Mach-O has
no `LC_CODE_SIGNATURE` load command.

## Options Evaluated

### Add A LaunchAgent Plist

Rejected. A launchd-visible declaration would precede proof that the accepted
source set links into the intended fixed service executable.

### Build With The Toolchain Default Signature

Rejected. Even an ad-hoc signature would broaden the slice beyond a genuinely
unsigned build and obscure the later owner gate for exact identity signing.

### Build And Run An Unregistered Service

Rejected. Invocation would activate the named-listener source and attempt a
launchd lookup without an accepted registration or physical runtime plan.

### Link One Temporary Unsigned Candidate Without Invocation

Selected. Add one fixed entry-point source and one adversarial test. The test
may link the exact accepted source set into an isolated temporary arm64 macOS 15
binary with `-Xlinker -no_adhoc_codesign`, inspect its format and dependencies,
and remove it without invocation.

## Proposed Boundary

Process ownership v21 proposes only:

- `native-helpers/execution-service/WatchdogNamedServiceFixtureMain.swift`; and
- `tests/security/p3-watchdog-named-service-executable-candidate.test.mjs`.

The entry point must import only `Dispatch`, accept no argument or configuration,
obtain only the accepted fixed listener through
`WatchdogNamedListenerTransportCandidate.makeActivatedListener()`, retain it,
and enter `dispatchMain()`. It may not log, recover through a fallback, inspect
the host, or expose another operation.

The test may create only an isolated temporary output and module cache. Its
exact source inputs are the accepted core, strict transport, fixed listener,
named adapter, and proposed entry point. The repository package script remains
an immutable input and cannot consume the candidate.

## Required Build Evidence

After owner acceptance, the implementation must prove:

1. the entry point has no command-line, standard-input, environment, file,
   network, process, VM, ServiceManagement, or generic configuration path;
2. `swiftc` links the exact five-source candidate for
   `arm64-apple-macos15.0` only in a temporary directory;
3. the link command passes `-Xlinker -no_adhoc_codesign`;
4. the output is arm64, has minimum macOS 15, links XPC and Dispatch as expected,
   and links no Virtualization, ServiceManagement, or Network framework;
5. `otool -l` finds no `LC_CODE_SIGNATURE`;
6. neither the test nor any helper invokes the output binary;
7. cleanup removes the binary and module cache; and
8. no package entry, plist, registration operation, launch action, application
   connection, or persistent executable appears.

## Explicit Denials

Process ownership v21 grants no authority to:

- call `codesign --sign`, use a signing identity, or retain any signature;
- invoke the temporary executable or activate its runtime behavior;
- copy it into the application or any LaunchServices, LaunchAgents, or
  LaunchDaemons directory;
- add a plist, entitlement, ServiceManagement import, or `SMAppService` call;
- install, register, unregister, launch, connect from DOSAI, or inspect live
  service state; or
- create or start a VM, launch another process, access files or networks,
  reconcile ownership, write the journal, or perform production work.

## Required Proposal Evidence

Before owner acceptance, validation must prove:

1. v21 is hash-bound to accepted v20;
2. all five accepted source and package inputs remain exact;
3. the two proposed implementation files remain absent;
4. no executable, signature, plist, package entry, schema generation,
   registration, or launch artifact appears; and
5. focused checks, eight typechecks, all repository tests, three builds, JSON,
   hash, whitespace, artifact, and secret scans pass.

## Proposal Validation

Validation used exact Node `24.18.0` and pnpm `11.18.0`.

```text
Process ownership v20-v21 checks
10 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run typecheck
8 TypeScript project checks passed

pnpm --config.verify-deps-before-run=warn test
349 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run build
main, preload, and renderer production builds passed
```

Process ownership v21 parses strictly, is hash-bound to accepted v20, and has
SHA-256 `7dd0abf3106ae6a39ea0154575967bc8a7fafde3e12c60e66e94cf0e6de66bee`.
Every accepted source and package input remains exact. Whitespace,
executable-file, proposed-artifact, and high-risk secret scans pass;
`git diff --check` reports no finding beyond the existing benign fsmonitor
warning.

At that proposal stage, no entry-point source, implementation test, executable,
plist, schema registry v19, or process ownership v22 existed. No compile, link,
signing, packaging, registration, launch, or live service-state operation
occurred during the proposal slice.

## Implementation Evidence

The accepted v21 slice adds one `Dispatch`-only entry point that accepts no
input or configuration, obtains the fixed listener through the accepted named
adapter, retains it, and enters `dispatchMain()`. It has no logging, fallback,
host inspection, or adjacent framework path.

The adversarial test linked the exact five-source set in an isolated temporary
directory with:

- target `arm64-apple-macos15.0`;
- `-Xlinker -no_adhoc_codesign`;
- no signing command or identity access; and
- fixed `lipo`, `vtool`, and `otool` inspection only.

The resulting binary was arm64, declared minimum macOS 15, linked the expected
Swift XPC and Dispatch libraries, linked no Virtualization, ServiceManagement,
Network, or Security framework, and contained no `LC_CODE_SIGNATURE`. The test
never invoked it and removed the entire output and module-cache directory.

Process ownership v22 binds the entry-point and test postimages, all seven
governance remediations, and the exact no-effect observations. Its validated
proposal-state SHA-256 was
`9134825cea7ded13b31e46a32006a3ad07ada21d54fe9f69a9b59307b996fa5b`;
after the owner-acceptance status update, its immutable accepted SHA-256 is
`cad2d39ef855511a71b081cf1d9378a69374cf37b37b62aa7648fce9dd35a8a3`.

```text
Focused executable, transport, ownership, and ripple checks
35 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run typecheck
8 TypeScript project checks passed

pnpm --config.verify-deps-before-run=warn test
358 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run build
main, preload, and renderer production builds passed
```

Both ownership generations parse strictly. Final hashes, whitespace,
executable-file, temporary-directory, plist, schema-artifact, and high-risk
secret scans pass; `git diff --check` reports no finding beyond the existing
benign fsmonitor warning.

## Audit Remediation

The first link proof produced the intended unsigned binary, but two test
assertions were inaccurate: a self-scan matched the word `codesign` inside its
own assertion, and the linked Dispatch library is named `libswiftDispatch`.
Only those assertions changed; the source and link command did not.

Five older directory allowlists were updated to admit only
`WatchdogNamedServiceFixtureMain.swift`, and the v7 guard verifies the exact
accepted v21 proposal paths. The v21 proposal-state test now verifies the two
implemented files while preserving every no-effect field. A broader run also
found that v20 still required six earlier guard postimages to remain current;
its test now preserves those historical hashes while validating the v22
successors. V22 hash-binds all seven final governance updates. No contract,
package, schema, registration, launch, or runtime guard was weakened.

## Known Limitations

- Successful linkage cannot prove launchd discovery, registration, user
  approval, authenticated named-service messaging, or disconnect behavior.
- An unsigned candidate is deliberately ineligible for package or runtime use.
- Exact service signing, package placement, plist structure, registration,
  disabled state, unregistration, launch, crash, and cleanup remain separate
  owner gates.
- VM ownership, teardown, and orphan reconciliation remain unavailable.

## Owner Decision

The repository owner accepted process ownership v21 and authorized only the two
proposed files and one temporary unsigned, never-invoked link proof. The owner
then accepted process ownership v22 and this final implementation evidence. No
signing, packaging, plist, registration, launch, application connection, VM,
filesystem, network, journal, reconciliation, or production behavior is
authorized or claimed.

# P3 Service Management Status Adapter Ownership Proposal

**Status:** `ACCEPTED`<br>
**Recorded:** `2026-08-06T04:03:24-04:00`<br>
**Validated:** `2026-08-06T04:05:56-04:00`<br>
**Owner accepted:** `2026-08-06T12:11:06-04:00`<br>
**Decision:** Accepted ADR 0021<br>
**Accepted baseline:** Process ownership v30<br>
**Proposed gate:** Process ownership v31 over accepted v30<br>
**Successor evidence:** `p3-service-management-status-adapter-source-evidence.md`<br>

## Scope

Process ownership v31 proposes only the source and adversarial-test boundary
for the accepted status-only Electron Main Node-API adapter. It does not create
an implementation file, choose or acquire Node-API headers, change a
dependency, compile, link, package, load, or invoke a native module, or call a
Service Management API.

V31 adds ADR 0021 to the accepted decision list, adds proposal-only metadata to
the existing Main boundary, and reserves one separate Z3 native-addon root. It
does not change any accepted v30 implementation or effect authority.

## Proposed Files

- `native-helpers/service-management-status-addon/service-management-status-addon.mm`
- `src/main/execution/service-management-status-adapter.ts`
- `tests/security/p3-service-management-status-adapter-candidate.test.mjs`

All three paths remain absent during owner review. No build manifest, package
mode, preload method, renderer IPC, or lifecycle module is proposed.

## Fixed Interface

The future Main adapter accepts no input and returns exactly one of:

- `NOT_REGISTERED`
- `ENABLED`
- `REQUIRES_APPROVAL`
- `NOT_FOUND`

The plist name is fixed to
`com.socialeap.dosai.execution-service-fixture.plist`. Unknown platform values,
module-load failure, native errors, unsupported platforms, and malformed native
returns must map to `NOT_FOUND`. `ENABLED` remains observation only and cannot
establish liveness, connection, generation, reconciliation, execution, or
authorization.

The first eligible implementation target is arm64 macOS 15. Neither this
proposal nor its acceptance would authorize compilation.

## Native Header Boundary

The installed `electron@43.2.0` package contains runtime files and type
declarations but no workspace `node_api.h`, `js_native_api.h`, or `node.h`.
V31 therefore records all of the following:

- no Electron Node-API header source is selected;
- no workspace Electron Node-API header is observed;
- header download or acquisition authority is false;
- dependency-change authority is false; and
- native compilation and linking authority are false.

A later implementation proposal must identify and hash-lock an Electron-
compatible header source before any compile claim. Host Node `24.18.0` reporting
N-API 10 does not prove the packaged Electron runtime's exact native build
contract and is not used as a substitute.

## Authority Boundary

V31 permits future source text to import only the Node-API C ABI and
`ServiceManagement` for the fixed observation contract after owner acceptance.
It keeps all of these authorities false:

- application reachability and native-module loading;
- compilation, linking, signing, packaging, and invocation;
- runtime `SMAppService` and `launchctl` calls;
- registration, unregistration, System Settings, service launch, and
  application connection;
- renderer or preload exposure and generic native dispatch;
- process launch, filesystem-data, network, XPC, journal, reconciliation, VM,
  execution, and production behavior.

Registration authority remains separate, false, and future owner-gated.

## Proposal Evidence

V31 is hash-bound to final accepted v30 SHA-256
`b9abc5bf0791dff5254bfbe73cbe1e09c5792c8290de5eb0866f125f7482e10a`
and final accepted ADR 0021 SHA-256
`ac3cbccf89bd4fc6f2e45c5c628deef625989ddc9408151a31c2ff27ffca7fb8`.
Its proposal SHA-256 is
`299c17372d41f1858e04b25e9224168cb1a9a013f3270a8e1723f1f8dff37caf`.

Six immutable inputs bind accepted v30, ADR 0021, the compile-only Swift status
candidate, its adversarial test, `scripts/package.mjs`, and the accepted source
plist. Ten combined v30-v31 ownership checks pass with no failures.

Pinned Node `24.18.0` and pnpm `11.18.0` validation passes:

```text
Focused accepted-v30 and proposed-v31 checks
10 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run typecheck
8 TypeScript project checks passed

pnpm --config.verify-deps-before-run=warn test
421 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run build
main, preload, and renderer production builds passed
```

Pnpm repeated the documented stale `node_modules` warning without changing a
dependency or lockfile. JSON, immutable hashes, proposed-path absence,
formatting, retained package artifacts, and high-confidence secret checks pass.
No package command, native compiler, module, app, helper, status API, or
lifecycle operation was invoked.

## Known Limitations

- V31 does not choose a Node-API header supply chain or native build tool.
- No implementation proves Objective-C++ syntax, Node-API export behavior,
  Electron ABI compatibility, app-bundle status lookup, or native return
  admission.
- No module has been packaged, loaded, or invoked, and no physical status has
  been observed.
- Registration, user approval, denial, disablement, unregistration, service
  launch, named XPC connection, and cleanup remain independent future gates.

## Owner Decision

Accepted. V31 opens only the three exact source and test paths for a source-only
implementation slice. It does not authorize Node-API header acquisition,
dependency changes, native compilation, linking, packaging, loading,
invocation, a status call, registration, launch, or connection.

The authorized files are now implemented source-only and bound by accepted
process ownership v32. That successor grants no additional runtime or lifecycle
authority; proposed v33 separately governs header selection and a temporary
compile-only proof.

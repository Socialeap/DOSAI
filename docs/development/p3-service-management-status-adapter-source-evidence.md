# P3 Service Management Status Adapter Source Evidence

**Status:** `ACCEPTED`<br>
**Implemented:** `2026-08-06T12:16:07-04:00`<br>
**Validated:** `2026-08-06T12:20:35-04:00`<br>
**Decision:** Accepted ADR 0021<br>
**Accepted implementation gate:** Process ownership v31<br>
**Accepted evidence gate:** Process ownership v32<br>
**V32 proposal SHA-256:** `a6833ca4407e5fbedd00d995b4f808cee806d789dc3940fae5d14965446d711e`<br>
**Owner accepted:** `2026-08-06T12:30:00-04:00`<br>
**Accepted v32 SHA-256:** `04ec42d538427cce3bd1ed0b2209dc5e8a94a5d5b35f02a564041936c2f9e23b`<br>

## Scope

Owner-accepted v31 opened exactly three source-only paths for the status adapter.
The slice implements those paths without acquiring Node-API headers, changing a
dependency, compiling or linking native code, packaging or loading a module, or
invoking Service Management.

The native source contains the fixed observational status lookup selected by
ADR 0021. The Main adapter receives a binding only through explicit composition;
it contains no module loader and exposes no preload, renderer, or IPC surface.
The status operation itself accepts zero arguments and returns exactly one of
`NOT_REGISTERED`, `ENABLED`, `REQUIRES_APPROVAL`, or `NOT_FOUND`.

## Implemented Files

- `native-helpers/service-management-status-addon/service-management-status-addon.mm`
  SHA-256 `fd2b38cdd9fbdd4057b668f0abd936b315c7047b792f6e8e5a88960fffc71987`
- `src/main/execution/service-management-status-adapter.ts`
  SHA-256 `f23b4eb7264314921bad4229c0974a5ed404440acdaeb5c6f19b0cc3aef7733b`
- `tests/security/p3-service-management-status-adapter-candidate.test.mjs`
  SHA-256 `6b135b9e667f1f547f33b5c148a9ea360c9ccd7e6775adec00490205a3da990a`

Accepted v32 also binds the two narrow successor-aware test updates exposed by
the first full run:

- `tests/architecture/process-ownership-v31.test.mjs`
  SHA-256 `872afb9f08a3aff6a13dd5b39a1dc418e78081fcf600b67ad03a70fbc7157a9b`
- `tests/architecture/process-ownership.test.mjs`
  SHA-256 `0aa884e469e936ed7410b323c7db7c9a230b93c1fa2f2c15b5b1a83bd823f292`

## Enforcement Evidence

The Objective-C++ source:

1. imports only the Node-API C ABI and `ServiceManagement`;
2. fixes `com.socialeap.dosai.execution-service-fixture.plist` in source;
3. exposes one Node-API function named `observe`;
4. rejects arguments and maps a missing service, unknown enum value, or
   Objective-C exception to `NOT_FOUND`;
5. maps only the four accepted `SMAppServiceStatus` cases; and
6. contains no lifecycle, generic native dispatch, process, filesystem,
   network, XPC, VM, journal, reconciliation, or production operation.

The Main adapter:

1. loads no native module and accepts only an injected own data-property
   function;
2. does not invoke binding accessors or trust a throwing descriptor proxy;
3. calls the admitted binding with zero arguments;
4. admits only the four exact observations and maps malformed returns or thrown
   errors to `NOT_FOUND`; and
5. is frozen and exposes only the zero-argument `observe` operation.

`ENABLED` remains observation only. It does not prove process liveness,
authenticated XPC, service generation, ownership reconciliation, execution
availability, or authorization.

## Governance Findings

The first complete repository test run found two expected stale governance
assertions: v31 still required its proposed paths to be absent, and the old
native-helper inventory knew only the pre-v31 roots. Neither failure reflected a
behavioral or authority defect. The checks now preserve v31's accepted bytes,
require accepted v32 to bind the exact implementation postimages, and admit only
the new fixed Objective-C++ path. V32 hash-locks both test changes.

Read-only inspection of the installed macOS SDK confirmed the exact Objective-C
factory, property, and enum names used in source. The workspace Electron package
still contains no selected `node_api.h`, `js_native_api.h`, or `node.h`, so no
native compile or ABI claim is made.

## Validation

Pinned Node `24.18.0` and pnpm `11.18.0` validation:

```text
Focused source, v31-v32, and architecture checks
33 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run typecheck
8 TypeScript project checks passed

pnpm --config.verify-deps-before-run=warn test
432 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run build
main, preload, and renderer production builds passed
```

JSON, predecessor and file hashes, immutable v31 inputs, whitespace, and
high-confidence secret checks pass. Pnpm repeated the documented stale
`node_modules` warning without changing dependencies or the lockfile. No native
compiler, linker, package command, module loader, app, helper, Service Management
API, launchctl operation, registration, launch, or connection was invoked.

## Known Limitations

- The Objective-C++ source has not been compiled, linked, loaded, or run.
- No Electron-compatible Node-API header source or native build contract is
  selected, so syntax, ABI, and Electron compatibility remain unproven.
- No physical app-bundle status lookup or runtime observation exists.
- Registration, unregistration, user approval, System Settings, service launch,
  authenticated connection, reconciliation, and cleanup remain separate future
  gates.

## Owner Decision

Accepted. Process ownership v32 binds only this source-only implementation and
its tests. It does not authorize header acquisition, dependency changes, native
compilation or linking, packaging, module loading, status invocation,
registration, launch, connection, or production use. The header-source and
compile-only proof remain separately governed by proposed process ownership v33.

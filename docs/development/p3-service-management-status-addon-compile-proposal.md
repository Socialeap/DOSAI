# P3 Service Management Status Addon Compile Proposal

**Status:** `ACCEPTED`<br>
**Recorded:** `2026-08-06T12:32:39-04:00`<br>
**Proposal validated:** `2026-08-06T12:37:29-04:00`<br>
**Implemented:** `2026-08-06T12:58:17-04:00`<br>
**Evidence validated:** `2026-08-06T13:05:09-04:00`<br>
**Decision:** Accepted ADR 0021<br>
**Accepted baseline:** Process ownership v33<br>
**Accepted v33 SHA-256:** `33163e6dac6729534aeac63b2b7ddc565c646093d4e271751ba4a98a1d8d46ae`<br>
**Accepted evidence gate:** Process ownership v34<br>
**Accepted v34 SHA-256:** `fd1468eb7b0780740ccad4f75a476439338780dd367a732750ba80fdec653aea`<br>
**Owner accepted:** `2026-08-06T12:53:54-04:00`<br>
**V34 owner accepted:** `2026-08-06T14:17:50-04:00`<br>

## Question

Choose the smallest reproducible header and build boundary that can later prove
the accepted Objective-C++ status source compiles as an Electron-loadable native
bundle without downloading headers, adding a build dependency, loading the
module, invoking status, or changing the app package.

The owner accepted v33, opening only the exact two-file compile proof. That
proof is implemented and locally validated. Accepted v34 records the observed
result and exact authority boundary.

## Compatibility Findings

Electron `43.2.0` is exactly pinned in `package.json`, reports native ABI `148`
in its installed package, and embeds Node `24.18.0`. DOSAI's accepted development
toolchain is also Node `24.18.0`, from the official archive already accepted at
SHA-256 `e1a97e14c99c803e96c7339403282ea05a499c32f8d83defe9ef5ec66f979ed1`.

The official Electron release record confirms that Electron 43.2.0 embeds Node
24.18.0: <https://releases.electronjs.org/release/v43.2.0>.

Electron's native-module guidance correctly warns that general Node addons must
be rebuilt for Electron because Node, V8, OpenSSL, and related ABIs can differ:
<https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules>.
DOSAI's addon does not use those APIs. It includes only `node_api.h` and calls
the stable C Node-API. Node documents that this API is independent of V8 and ABI
stable when an addon avoids Node C++, V8, and libuv headers:
<https://nodejs.org/api/n-api.html>.

This exact version match plus the C-only API restriction makes the governed
Node 24.18.0 headers the smallest defensible compile-proof source. A later
Electron load proof remains necessary before any runtime compatibility claim.

## Options Evaluated

### Download Electron Headers Or Add `@electron/rebuild`

Not selected for this slice. It is the general-purpose Electron path, but it
would add network acquisition, cache state, a new dependency graph, node-gyp
behavior, and broader rebuild machinery for a four-function C Node-API module.
Those costs are unnecessary while Electron and the governed toolchain embed the
same Node release. This option remains available if a later load proof reveals
an Electron-specific incompatibility.

### Vendor Header Copies In The Repository

Not selected. Copying upstream headers would duplicate accepted toolchain bytes,
create a new update obligation, and expand the reviewed source tree without
improving compatibility. The existing official archive and exact per-header
digests already provide stronger provenance.

### Use The Governed Node 24.18.0 C Node-API Headers

Selected. Resolve `include/node` relative to the exact `process.execPath`, admit
only four hash-locked C Node-API files, and reject any wrong runtime version or
header digest before compilation. No header is downloaded, copied, or changed.

The gate requires a canonical Node 24.18.0 installation from the accepted
official archive. The implementation must resolve the real executable path and
assert the standard `bin/node` plus sibling `include/node` layout explicitly.
An `npx -y node@24.18.0` shim without those headers is not an eligible build
toolchain and must fail with a dedicated canonical-layout error before any
compiler invocation; that result is an environment rejection, not a source or
ABI failure.

| Header | SHA-256 |
| --- | --- |
| `node_api.h` | `2d4560831e525b47b060ec8a0864ab73993df9e20215ce9f0fe7b24cd31af32a` |
| `node_api_types.h` | `a25356630d3058f0a0c8937d9f297e9471e037fda58c2696d8a505c2bd99cb00` |
| `js_native_api.h` | `8808ef8899a1691411928ef5dd7dae0537aedc93d3a34e223b2d89692e79c788` |
| `js_native_api_types.h` | `4f19cb90d240765cc0961d92a1ee20f65fdc50db7de1ab0a5cb6bc227224e1a0` |

`node.h`, V8, libuv, OpenSSL, BoringSSL, experimental Node-API, and C++ wrapper
headers remain forbidden.

## Authorized Implementation

Accepted v33 permitted exactly:

1. add `#define NAPI_VERSION 8` immediately before the accepted
   `#include <node_api.h>` line;
2. add
   `tests/security/p3-service-management-status-addon-compile-candidate.test.mjs`;
3. have that test verify Node `24.18.0`, the four header hashes, Electron
   `43.2.0`, ABI `148`, and every accepted source preimage before build;
4. compile only the fixed Objective-C++ source with C++20 for
   `arm64-apple-macos15.0` as a temporary `.node` bundle;
5. use unresolved dynamic Node-API symbols, link only ServiceManagement and
   ordinary platform dependencies, and suppress automatic ad-hoc signing;
6. inspect architecture, minimum OS, linked frameworks, exported initializer,
   undefined symbols, and absence of `LC_CODE_SIGNATURE`; and
7. delete the private temporary directory in success and failure paths without
   loading or invoking the bundle.

Only `/usr/bin/xcrun`, `/usr/bin/lipo`, `/usr/bin/otool`, and `/usr/bin/nm` are
spawned by the test with fixed arguments. No build script, package script, npm
script, dependency, lockfile entry, retained binary, or application artifact
was added.

## Authority Boundary

Accepted v33 authorized only the exact source hardening line and temporary
unsigned compile/link/inspection proof. It did not authorize:

- network or header acquisition, vendoring, node-gyp, or electron-rebuild;
- signing, package composition, persistent native output, or app modification;
- native module loading, `require`, `import`, or `process.dlopen`;
- Electron, DOSAI app, helper, or bundle invocation;
- a Service Management status call or runtime observation;
- registration, unregistration, System Settings, launchctl, service launch, or
  application connection; or
- renderer/preload exposure, process execution in application code, filesystem-
  data access, network, XPC, journal, reconciliation, VM, execution, or
  production authority.

## Implementation Evidence

Final accepted v33 is hash-bound to accepted v32 and now immutably opens the
two-file proof. Accepted v34 is hash-bound to final accepted v33 SHA-256
`33163e6dac6729534aeac63b2b7ddc565c646093d4e271751ba4a98a1d8d46ae`.
It records these exact postimages:

| File | SHA-256 |
| --- | --- |
| `native-helpers/service-management-status-addon/service-management-status-addon.mm` | `e28848c2b69cf28bb011bb8d516356ba11c5d6cc5e4e73d7432d045284dad55b` |
| `tests/security/p3-service-management-status-addon-compile-candidate.test.mjs` | `8bdc843e0a2854c42f73013412b2ea9965464b2ca9c9c36f8ebc655f0f398a1c` |

The source explicitly selects stable Node-API v8. The adversarial test accepts
only the exact four hash-bound C headers from a canonical Node 24.18.0 archive
installation. It rejects a shim-like executable with no sibling `include/node`
directory using `DOSAI_STATUS_ADDON_CANONICAL_NODE_LAYOUT_0001` before invoking
the compiler.

The complete evidence run compiled a temporary unsigned Objective-C++ bundle,
then observed arm64, minimum macOS 15.0, the ServiceManagement link, no forbidden
framework, no `LC_CODE_SIGNATURE`, the two Node-API initializer exports, exactly
the four admitted unresolved N-API functions, and no adjacent Node ABI symbol.
The private temporary directory was removed without loading or invoking the
bundle.

One earlier focused run is explicitly discarded: its compile, inspection, and
cleanup stages passed, but an overbroad static include assertion incorrectly
classified the permitted `node_api.h` line as forbidden. The assertion now
parses include directives and requires the exact singleton include set. That
discarded run persisted no bundle and produced no runtime or lifecycle effect.

```text
Focused status-adapter and compile-proof checks
10 tests passed; 0 failed

Focused process-ownership v31-v34 checks
20 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run typecheck
8 TypeScript project checks passed

pnpm --config.verify-deps-before-run=warn test
446 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run build
main, preload, and renderer production builds passed
```

The first full-suite run passed 445 of 446 tests and exposed one stale v31
historical source hash check. V31 now recognizes the exact v34 source successor,
v32 recognizes the v34 guard successor, and accepted v34 hash-binds all three
remediated v31-v33 guards. The complete rerun passed 446 of 446 tests.

JSON parsing, immutable hashes, formatting, high-confidence secret scanning,
and final generated-artifact checks pass. No first-party or generated `.node`
file remains outside dependencies. No header downloader, package command,
module loader, app, helper, or Service Management runtime operation is part of
this proof. The existing node_modules/lockfile synchronization warning remains
non-blocking and unchanged.

## Known Limitations

- Header equality and Node-API ABI stability do not prove Electron can load the
  eventual bundle.
- The compile-only bundle was unsigned, temporary, deleted, unpackageable, and
  ineligible for runtime use.
- Signing, package composition, module loading, physical status observation,
  registration, launch, connection, and cleanup require later independent
  gates.

## Owner Decision

Accepted. V33 opened only the exact two-file compile-proof slice and requires the
canonical Node 24.18.0 archive layout. It does not authorize any module load,
status call, package change, registration, launch, connection, or production
use. The owner accepted v34 and its implementation evidence at
`2026-08-06T14:17:50-04:00`.

Retained-record acknowledgment (`2026-08-06T15:40:08-04:00`): accepted v34's
`implemented_files` binds `service-management-status-addon.mm` at stale
`fd2b38cd…`, while the on-disk postimage and `compile_proof_implemented_files`
are `e28848c2…`. The authoritative current hash is `e28848c2…`; the
`implemented_files` entry is a known stale snapshot and is not rewritable
because v34 is immutable. No load, status call, signing, package, registration,
launch, or connection follows.

# P3 v45 signed-app status-proof evidence

Recorded 2026-09-20. Contributor: unclassified assistant; no specialized role.
**The bounded native-load and zero-argument native-observation proof passed;
registration, service launch, real execution and private-beta release remain
NO-GO.**

## Authorization and isolation

The owner authorized one isolated physical attempt from Draft PR #3 commit
`dc6f6fe49c82decbadcdbeb64af205787420830e`: build and sign the exact test
package, launch it exactly once, attempt one fixed addon load and at most one
zero-argument status read, enforce the existing 15,000 ms timeout, and stop
without retry. Registration, service launch, production use and real execution
were expressly excluded.

The attempt used a fresh detached worktree at the authorized commit. Its only
pre-build additions were local dependency links excluded from Git. The host
keychain exposed exactly one valid code-signing identity matching selector
`UMXN25Z493`, fingerprint
`0CE0BBD4215B133BE4DA45850849625E50B54333`. The cached pinned Electron 43.2.0
darwin-arm64 archive matched SHA-256
`ad4a0ae3c37ee05aa06c7e2ed0627608389790f0505a2b0d20319efbe33ffe28`;
no network retrieval occurred.

## Package and static preflight

The exact package mode
`--signed-app-service-management-status-proof-fixture` ran once and exited 0.
It built the v45 dedicated proof entry, compiled and signed the fixed status
addon and inert named-service fixture, included the accepted LaunchAgent
declaration, signed the outer test app, and did not launch or register anything.

Host-keychain verification reported all three exact artifacts valid on disk and
satisfying their designated requirements:

| Artifact | Identifier | TeamIdentifier | CDHash |
| --- | --- | --- | --- |
| Outer test app | `com.socialeap.dosai` | `3RD3TADLRY` | `57ee72a38f99811f1911e8e86eed37f2d2f229f0` |
| Status addon | `com.socialeap.dosai.service-management-status-addon` | `3RD3TADLRY` | `f5d3e392883615fcd5ad08e9dbb4fd72661773be` |
| Inert named service | `com.socialeap.dosai.execution-service-fixture` | `3RD3TADLRY` | `de1f2ceef98546944a7162b6b39a4b65a2ff291e` |

The packaged CommonJS proof entry had SHA-256
`7a60e28e4f34f433dceec178c20e2551922472e8b77d48f654b7092e623f3929`.
It contained `createRequire(__filename)`, `NATIVE_ADDON_LOAD_FAILED`,
`NATIVE_STATUS_CALL_FAILED`, and `ELECTRON_READINESS_FAILED`, and contained
neither the prior `createRequire({}.url)` transform nor `import.meta`.

The package hashes before and after the attempt were unchanged:

| Artifact | SHA-256 |
| --- | --- |
| Outer executable | `731aa14918a20837509eb2fe429ea1e364dac3a6978b1ef27be03b059631aa6f` |
| `app.asar` | `612f631d9ffec7fd54073a88c9c014aa9ab3edf68ae72d4a94d9ebdd70191481` |
| Status addon | `52d4ec6ef3e6be4f662f728189b322019dfad357f5e9b68a47f0e65a21c2d362` |
| Inert named service | `a9429b4f12f757ba9c844c3983706485dc5ecad6ba5dd9d4ff4f438772a35a5e` |
| LaunchAgent plist | `b7c1a4e1434bea935cb6ca64f8a33e78cb8f94f0b7644bbc103c1f55c6a1c3b5` |

## Single physical result

The fixed runner was invoked exactly once with no arguments. The child app
exited within 3.38 seconds, the runner exited 0, and its complete output was one
line:

```text
DOSAI_SERVICE_MANAGEMENT_STATUS_PROOF_V1:NOT_FOUND
```

No retry occurred. Under v45, addon-load failure would have emitted
`NATIVE_ADDON_LOAD_FAILED`, a missing/malformed/throwing native observer or
unadmitted raw result would have emitted `NATIVE_STATUS_CALL_FAILED`, and
readiness failure would have emitted `ELECTRON_READINESS_FAILED`. Therefore the
observed `NOT_FOUND` proves:

- the repaired CommonJS entry initialized and Electron readiness completed;
- the fixed packaged addon loaded successfully;
- its own `observe` function was found;
- that native observer completed exactly once with zero arguments; and
- the native observer returned the admitted `NOT_FOUND` observation.

The native source itself intentionally maps a nil service reference, the native
`SMAppServiceStatusNotFound` value, an unknown native status, or a caught native
exception to the same fail-closed `NOT_FOUND` observation. The proof therefore
establishes successful addon load and completed native observer invocation, but
does not claim registration, service availability, service launch, connection,
or a more specific internal reason for `NOT_FOUND`.

## Gate result

- signed-app startup and bounded-output gate: **PASS**;
- fixed native-addon load: **PASS**;
- one zero-argument native observer invocation: **PASS**;
- read-only observation: **`NOT_FOUND`**;
- registration, service launch, connection and execution: **NOT PERFORMED**;
- real-execution/private-beta gate: **NO-GO**.

The single-use authorization is exhausted. Do not repeat this package or launch.
P3.4's bounded status-observation prerequisite is now evidenced, but useful
execution still requires separately governed service lifecycle work plus the
independent Linux builders, accepted guest artifacts, and remaining isolation
and approval proofs.

## Release classification

**No Lovable action is required.** This proof used an isolated local test app
and changed no backend, secret, provider configuration or deployed frontend.
No frontend Publish is required. Nothing was registered, deployed, distributed
or promoted to production.

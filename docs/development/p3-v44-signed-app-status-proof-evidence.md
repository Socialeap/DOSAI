# P3 v44 signed-app status-proof evidence

Recorded 2026-09-20. Contributor: unclassified assistant; no specialized role.
**Bounded startup proof passed; native-load/status provenance remains unresolved;
real execution and private-beta release remain NO-GO.**

## Authorization and isolation

The owner authorized one isolated physical attempt from Draft PR #3 commit
`86ff4281094bb7cd35b89a479e2bb7a8e3276919`: build and sign the exact test
package, launch it exactly once, attempt one fixed addon load and one
zero-argument status observation, enforce the existing 15,000 ms timeout, and
stop on any failure. Registration, production use, real execution and retry
were expressly excluded.

The attempt used a fresh detached worktree at the authorized commit. Its only
pre-build additions were local dependency links excluded from Git. The host
keychain exposed exactly one valid code-signing identity:
`Apple Development: shakourechar@gmail.com (UMXN25Z493)`, fingerprint
`0CE0BBD4215B133BE4DA45850849625E50B54333`. The already-cached pinned Electron
43.2.0 darwin-arm64 archive was used; no network retrieval occurred.

## Package and static preflight

The exact package mode
`--signed-app-service-management-status-proof-fixture` ran once and exited 0.
It built the dedicated proof entry, compiled and signed the fixed status addon
and inert named-service fixture, included the accepted LaunchAgent declaration,
signed the outer test app, and did not launch or register anything.

Host-keychain verification reported all three exact artifacts valid on disk and
satisfying their designated requirements:

| Artifact | Identifier | TeamIdentifier | CDHash |
| --- | --- | --- | --- |
| Outer test app | `com.socialeap.dosai` | `3RD3TADLRY` | `e12d9e02d596711e7e28f9f0ad4fac5f17613a3b` |
| Status addon | `com.socialeap.dosai.service-management-status-addon` | `3RD3TADLRY` | `f5d3e392883615fcd5ad08e9dbb4fd72661773be` |
| Inert named service | `com.socialeap.dosai.execution-service-fixture` | `3RD3TADLRY` | `de1f2ceef98546944a7162b6b39a4b65a2ff291e` |

The packaged CommonJS proof entry had SHA-256
`ed03c978dc5eeda2c714a214671143b149ddad0fbef48a6f1bc648f599c4189c`.
It contained `createRequire(__filename)` and contained neither the prior
`createRequire({}.url)` transform nor `import.meta`.

The package hashes before and after the attempt were unchanged:

| Artifact | SHA-256 |
| --- | --- |
| Outer executable | `476533690aa548adabcad2019097b95766fc734a2d8bd28b4a5508c147c1cfb1` |
| `app.asar` | `ecfcff910759010b48dfc5619fd0805039e25ef4591f0afdf7253637fed9a88b` |
| Status addon | `0768b966720372765fa4ee219a6fbd373c251fbd9c95fdb38791e16093561c71` |
| Inert named service | `053c7a067df9ed89904d6f06e5dfce0ef05e4d0e6be0cacd2bb36761424b4060` |
| LaunchAgent plist | `b7c1a4e1434bea935cb6ca64f8a33e78cb8f94f0b7644bbc103c1f55c6a1c3b5` |

## Single physical result

The fixed runner was invoked exactly once with no arguments. The child app
exited within 3.60 seconds, the runner exited 0, and its complete output was one
line:

```text
DOSAI_SERVICE_MANAGEMENT_STATUS_PROOF_V1:NOT_FOUND
```

No retry occurred. The result proves that the v44 CommonJS entry initialized,
Electron readiness completed, the one-shot proof path ran, one fixed-path addon
load was attempted, one adapter observation was requested with zero arguments,
one admitted bounded result was emitted, and the app exited before the deadline.
This closes the earlier startup-timeout defect.

The result does **not** independently prove that the native addon loaded or that
`SMAppService.status` was reached. The accepted entry maps an addon-load failure
to an absent binding, and the adapter maps an absent/malformed binding, a native
exception, an unknown native result, and the legitimate native `NOT_FOUND`
status to the same output. Therefore the physical outcome is classified as:

- dedicated signed-app startup and bounded-output gate: **PASS**;
- successful native-addon load: **UNRESOLVED**;
- successful zero-argument native status call: **UNRESOLVED**;
- registration, service launch, connection and execution: **NOT PERFORMED**;
- real-execution/private-beta gate: **NO-GO**.

## Next gate

Do not repeat this physical attempt. The next source-only proposal should make
load success and native-call success distinguishable in the bounded protocol
without adding another load, status call, argument, registration action,
service launch, connection, or effect. That proposal and any later physical
attempt require separate owner acceptance and authorization.

Independent native amd64 Linux builders, accepted guest artifacts, and the
remaining isolation and approval proofs are still required before supervised
real execution can be considered.

## Release classification

**No Lovable action is required.** This proof used an isolated local test app
and changed no backend, secret, provider configuration or deployed frontend.
No frontend Publish is required. Nothing was registered, deployed, distributed
or promoted to production.

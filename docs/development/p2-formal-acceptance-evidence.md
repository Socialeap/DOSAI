# P2 Formal Acceptance Evidence

**Engineering result:** `PASS_WITH_EXTERNAL_LIMITATIONS`<br>
**Validated:** `2026-07-31T22:43:00-04:00`<br>
**Subject commit:** `878abad495c028c5b194f78b3e2eda175c081186`<br>
**Catalog digest:** `482887c6e3d7a24d09471428a6486c9926d11a5b3e31673e3c91bf2ebf55843a`<br>
**Runner executable digest:** `b4cb41e7aa0b5dfa823b920197d689c9a7544c02c44bfa8cd319b9d41b5d8fcd`<br>

## Scope

The accepted catalog v5 generation executed all three governed P2 suites on a
clean committed subject. These suites exercise only synthetic, local, no-effect
operations. They do not add application reachability, process execution,
network publication, credential access, deployment, or production authority.

The exact validation toolchain was Node `24.18.0` and pnpm `11.18.0`. The Node
archive matched the official Node release SHA-256 before use. Because the
existing locked `node_modules` was produced by an older local pnpm, validation
disabled pnpm's automatic dependency reinstall check while retaining the
existing lock and dependency bytes:

```text
pnpm --config.verifyDepsBeforeRun=false run check
8 typechecks passed
161 tests passed
3 builds passed
```

## Formal Results

| Suite | Result | Assertions | Artifacts | Duration | Report ID | Report SHA-256 |
| --- | --- | ---: | ---: | ---: | --- | --- |
| `P2-AT-001` | `PASS` | 6 | 6 | 266 ms | `0c98e499-1041-40fd-8ec7-c750f259400a` | `29d08d9f494efdf8e030e406cf06149c9f7e533265f60df38c2c5518056beb9a` |
| `P2-AT-002` | `PASS` | 9 | 6 | 1,391 ms | `42aee721-1887-46df-a884-4f139da26844` | `9bfc1c0ce07639c1b08dc77d174700b648f2ab1fc13ec7ef19c764fb8762039d` |
| `P2-AT-003` | `PASS` | 10 | 7 | 4,357 ms | `00f6273e-5778-4a6e-87b9-0fd32cc719b4` | `49e0ed5a6324b1289cea2aa8de56fd62d29f06e7dbca015bdeea507247f9c60a` |

Managed report locations:

```text
evidence/acceptance/p2-at-001-289d37ab-f652-42aa-bbc7-da835ff3f5f2/report.json
evidence/acceptance/p2-at-002-fad678a8-ec44-49fd-a98a-43509193e7ce/report.json
evidence/acceptance/p2-at-003-e9e9952a-8b48-49bf-909e-12c5e57ce603/report.json
```

## Independent Verification

An independent read-only verifier checked every report and artifact against the
accepted evidence-report schema v5 and repository subject. It confirmed:

- exactly three reports for the subject commit and expected suite IDs;
- all 25 assertions and all six scenarios are `PASS`;
- all 19 artifact descriptors have matching byte lengths and SHA-256 digests;
- every artifact run, suite, class, catalog, fixture, runner, lock, and registry
  identity matches the accepted generation;
- every manifested adversarial corpus file matches its recorded SHA-256;
- all journal artifacts report `LOCAL_DURABLE` and preserve `UNANCHORED` and
  local rollback limitations;
- the P2.3 verifier reports hardware key and external anchor assurance as
  `DEFERRED_EXTERNAL`;
- cleanup is `PASS`, gaps are empty, and expected/observed external effects are
  both `NONE` and reconciled;
- secret scans pass and no private-key, GitHub-token, OpenAI-key, or AWS-key
  pattern appears in any report or artifact; and
- the measured environment is arm64 `Mac16,10`, macOS `26.5.2` build `25F84`,
  Node `24.18.0`, V8 `13.6.233.17-node.50`, SQLite `3.53.1`, and Git `2.50.1`.

The first sandboxed invocation failed closed before execution because the
sandbox denied the read-only hardware-model `sysctl` probe. It wrote no report
or artifact. Re-running with approved host-level read access produced the three
formal results above without changing the committed subject.

## Gate Decision

The local formal P2 acceptance generation passes. `P2.EXIT` remains
`EVIDENCE_PENDING`, not `COMPLETE`, because P2.4 still lacks the owner-deferred
persistent Keychain/Secure Enclave runtime proof and TUF-authorized public Rekor
v2 publication proof. No hardware-backed or publicly anchored claim is inferred
from the software and offline fixtures.

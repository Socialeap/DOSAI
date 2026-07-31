# P1 Formal Acceptance Evidence

**Status:** `[x] COMPLETE`<br>
**Evidence captured:** `2026-07-31T18:16:59-04:00`<br>
**Formal acceptance result:** `PASS`<br>
**Review decision:** Owner accepted `2026-07-31T18:23:38-04:00`

This record covers the formal current-host execution and independent inspection
of all three accepted Phase 1 suites. Owner acceptance closes `P1.EXIT` and
supports only the constrained capability change recorded below.

## Subject

| Field | Value |
| --- | --- |
| Commit | `80e2fc656025e38e26e7cb857b7b140b63ae8f33` |
| Catalog | v4, SHA-256 `5339a14ddad7b79a127378b047e884b3ff3602659482b6029146bb1ab86b20ad` |
| Runner | `dosai-acceptance` 0.1.1 |
| Package SHA-256 | `f17665f02b8b33062121bc74ec5cb69c33852702dc51469765614d4f385fdd95` |
| Dependency-lock SHA-256 | `cac0046b4187975b8e38329c501f40a1874beb493bf18d9217263d7215acaf79` |
| Host | macOS 26.5.2 arm64, build 25F84, Mac16,10 |
| Runtime | Electron 43.2.0, Chromium 150.0.7871.129, Node 24.18.0, V8 15.0.1240245-electron.0 |

## Formal Reports

| Suite | Result | Assertions | Report ID | Run ID | Report SHA-256 |
| --- | --- | ---: | --- | --- | --- |
| `P1-AT-001` | PASS | 12 | `6321e7e9-7d02-4a9f-a2b9-eb204506a507` | `f65dd5c1-0398-4703-8c3c-2ac39fcb3023` | `395ad37c5d2a46db9b66e63c2a6bb0712857b7981c935372a25286afe9dbddcb` |
| `P1-AT-002` | PASS | 15 | `199a37c5-c99a-46c0-b8ff-365c1a30641e` | `be6e010c-ca9d-4f32-b298-7cf529ad4b17` | `06892ea0105606d29c3d9ffac66021b274a3447761f307eeb9a7cf9ed6c05923` |
| `P1-AT-003` | PASS | 12 | `4f3c0469-2af2-4e18-b08b-12e027a7e15a` | `c97ea9e5-ecb5-4595-b1cc-c2249f24ae30` | `c50d0fa980883b6ed7374265cfef1ff82a974bbad326839c67e8305cac937db8` |

The reports are retained under the ignored local managed directory
`evidence/acceptance/`. The earlier v3 `P1-AT-001` failure remains preserved
separately and is not replaced by these v4 results.

## Independent Review

- All three reports strictly validate as `urn:dosai:schema:evidence-report:4`.
- All six scenarios and all 39 assertions are PASS; every `gaps` array is empty.
- All 17 artifact files match their declared byte lengths and SHA-256 digests.
- Every report binds the same clean commit, package, dependency lock, registry
  v5, platform profile, and runtime identity.
- Cleanup is PASS in every report. Owned process groups exited, isolated
  profiles were removed, and the tracked worktree remained clean.
- Each report's built-in canary scan is PASS. A separate scan of every report
  and artifact byte found no private-key, GitHub-token, OpenAI-key, or AWS-key
  pattern.
- Bounded load completed 2,000 typed reads in 24 ms with a 9 ms renderer timer
  delay while the shell remained reachable.

## Validation Commands

| Command or inspection | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS; both workspaces already up to date |
| `pnpm run check` | PASS; five typecheck surfaces, 47 tests, and three production builds |
| Formal catalog-v4 `P1-AT-001` | `DOSAI_ACCEPTANCE_PASS_0000` |
| Formal catalog-v4 `P1-AT-002` | `DOSAI_ACCEPTANCE_PASS_0000` |
| Formal catalog-v4 `P1-AT-003` | `DOSAI_ACCEPTANCE_PASS_0000` |
| Schema, artifact, subject, cleanup, gap, and secret revalidation | PASS |
| `git diff --check` before the subject commit | PASS |

## Limitations

- Execution proves the registered current arm64 host only. The package declares
  macOS 15.0 minimum support, but physical execution on macOS 15.0 remains P11.
- DOSAI still exposes no process execution, persistence, browser capture,
  production integration, or agent-control authority.
- This evidence does not support execution, persistence, browser inspection,
  agent control, production integration, or any authority beyond the exact
  read-only typed bridge contract.

## Decision

The owner accepted the three reports as satisfying `P1.EXIT`. Phase 1 is
complete, `electron.typed_bridge` is `SUPPORTED_WITH_CONSTRAINTS` for the exact
current host and pinned runtime, and P2.1 may begin without activating any
effectful capability.

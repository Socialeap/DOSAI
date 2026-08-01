# P2 Formal Acceptance Generation Proposal

**Status:** `ACCEPTED`<br>
**Prepared:** `2026-07-31T22:03:36-04:00`<br>
**Accepted:** `2026-07-31T22:34:50-04:00`<br>
**Runner:** `dosai-acceptance 0.2.0`<br>
**Catalog:** `docs/testing/acceptance-test-catalog-v5.json`

## Decision Scope

This proposal implements the three formal P2 suites without adding execution,
network, application, credential, or production authority. It advances the
accepted catalog v4 through one immutable generation:

- catalog v5 and evidence-report schema v5;
- fixture-manifest schema v3 and implementation-manifest schema v2;
- accepted schema registry v10;
- identity-only v3 migrations for the three accepted P1 fixtures;
- new v3 fixtures for `P2-AT-001`, `P2-AT-002`, and `P2-AT-003`; and
- runner `0.2.0` with bounded `JOURNAL` and `VERIFIER` artifacts.

Only the three P2 suites change from `NOT_IMPLEMENTED` to `IMPLEMENTED`. P1
scenario and assertion scope is byte-equivalent after identity fields are
removed. Every other suite remains unchanged.

## Fixed Operations

| Suite | Fixed local operations | Formal purpose |
| --- | --- | --- |
| `P2-AT-001` | Policy and immutable-contract adversarial corpora, then one owner-only temporary journal probe | Prove typed tier classification, exact admission, downgrade rejection, durable evidence, and cleanup. |
| `P2-AT-002` | Synthetic-authorization and authorization-contract corpora, then one owner-only temporary journal probe | Prove exact approval/plan binding, one-use grants, attack rejection, emergency stop, no effect authority, durable evidence, and cleanup. |
| `P2-AT-003` | Journal, checkpoint, offline Rekor v2/TUF, degraded-authorization corpora, then one owner-only temporary journal probe | Prove durability faults, restart/race handling, key/fork handling, offline verification, degraded denial, emergency stop, honest assurance ranges, and cleanup. |

The runner invokes Node directly with fixed argument arrays and `shell: false`.
The manifest artifact binds every executed corpus path and SHA-256 digest. The
journal artifact contains bounded verification metadata, never the database or
authentication token. P2 reports record the actual Node, V8, and SQLite runtime.

## Independent Audit Findings

1. **Historical digest coupling.** The accepted v4 lineage test compared its
   recorded runner and package digests to mutable current files. A legitimate
   runner generation would therefore look like v4 corruption. The test now pins
   v4's accepted historical values and v5 separately binds the current files.
2. **Runtime identity omission.** Initial P2 reports would have omitted the
   Node, V8, and SQLite versions executing the corpus. Runner `0.2.0` now records
   all three.
3. **Incomplete explicit truncation probes.** The journal corpus covered
   mutation and deletion but did not name partial event and acknowledgement
   truncation separately. Both committed-corruption cases now fail verification
   and startup without history repair.
4. **Corpus provenance too indirect.** The subject commit bound the repository,
   but the manifest did not enumerate the exact corpus files. Each executed file
   is now path-and-digest bound in the `MANIFEST` artifact.
5. **Workspace pin lag.** The repository-wide run initially failed because the
   P1 scaffold test still required acceptance-runner workspace version `0.1.1`.
   The governed dependency assertion now advances with runner `0.2.0`; all other
   direct dependency pins remain unchanged.
6. **Scenario deadline mismatch.** The first P2.3 fixture draft allowed 120
   seconds for a scenario composed of several independently bounded operations.
   P2.1/P2.2 scenario deadlines are now 180 seconds, P2.3 deadlines are 600
   seconds, and every P2 command artifact records the 120-second per-operation
   subprocess timeout.

## Engineering Validation

The accepted generation passed:

```text
node --test tests/governance/p2-acceptance-generation.test.mjs
6 passed, 0 failed

node --test tests/security/p2-audit-journal.test.mjs
17 passed, 0 failed

node --test tests/*/*.test.mjs
161 passed, 0 failed on Node 26.0.0
161 passed, 0 failed on bundled Node 24.14.0

direct tsc --noEmit across eight project configurations on Node 24.14.0
8 passed, 0 failed

node scripts/build.mjs on Node 24.14.0
main, preload, and renderer builds passed
```

The generation simulation executes all three P2 handlers, validates each
evidence report against schema v5, verifies exact artifact coverage and cleanup,
and confirms a missing assertion or planted secret canary forces failure.
Before owner acceptance, catalog v5 was deliberately non-runnable. Its accepted
identity is now digest-pinned in runner `0.2.0`, which continues to reject
obsolete catalog v4 identity and requires a clean committed worktree.

## Known Limitations

- Persistent Keychain/Secure Enclave runtime proof remains
  `DEFERRED_EXTERNAL`; software test signing is not hardware assurance.
- Public Rekor v2 publication through a TUF-authorized writer remains
  `DEFERRED_EXTERNAL`; offline fixture verification is not public anchoring.
- All P2 operations are synthetic and no-effect. No executable process,
  external mutation, deployment, or production capability is introduced.
- No formal P2 PASS report exists yet. Proposed contracts cannot emit formal
  evidence until the owner accepts the synchronized generation and its digests
  are pinned in the runner.
- The exact pinned `pnpm run check` command was not rerun for this proposal. The
  active Mac toolchain is Node 26.0.0/pnpm 9.15.4, the bundled fallback is Node
  24.14.0, and downloading Node 24.18.0/pnpm 11.18.0 was blocked by the session
  usage limit. Direct tests, typechecks, and builds passed as recorded above;
  exact-toolchain validation remains required before formal acceptance runs.

## Acceptance Sequence

1. `[x]` Owner accepted catalog v5, registry v10, implementation manifest v2,
   all six v3 fixtures, and runner `0.2.0` as one synchronized decision.
2. `[x]` Statuses and acceptance timestamps advanced immutably; final catalog,
   fixture, schema, package, lock, and executable digests are pinned.
3. `[x]` Commit the accepted generation on clean subject
   `878abad495c028c5b194f78b3e2eda175c081186`.
4. `[x]` Run `P2-AT-001`, `P2-AT-002`, and `P2-AT-003` into the managed evidence root.
5. `[x]` Independently validate report schemas, artifacts, cleanup, gaps, external
   effects, secret scans, subject commit, and stated limitations.

Formal results are recorded in
`docs/development/p2-formal-acceptance-evidence.md`.

Even if all three local suites pass, `P2.EXIT` cannot be marked complete while
the owner-approved P2.4 external proof deferral remains an unmet exit dependency.

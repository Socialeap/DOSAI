# P1 Governed Acceptance Runner Evidence

**Status:** `[x] COMPLETE`<br>
**Evidence captured:** `2026-07-31T17:48:59-04:00`<br>
**Formal acceptance result:** `NOT_RUN`<br>
**Decision basis:** ADR 0011, accepted catalog v2, and Acceptance Testing and Evidence v1<br>
**Review decision:** Owner accepted synchronized set `2026-07-31T17:59:33-04:00`

This record covers the accepted executable generation for the three Phase 1
acceptance suites. It introduces no application runtime authority and makes no
P1 exit claim. Formal execution follows the clean commit of this synchronized
catalog, fixture, implementation-manifest, schema, and registry state.

## Accepted Set

| Artifact | State | SHA-256 |
| --- | --- | --- |
| `docs/testing/acceptance-test-catalog-v3.json` | Accepted | `cc5ab86d34be384d1a3150195dda247b8a1570f7bfd2e2dd5f3c961ed6fcedb1` |
| `docs/testing/acceptance-catalog-v2-to-v3-implementation.json` | Accepted | `97c9cc164b70ef4888ada4973ebc540d473be69a7497518009c2a6a6a155bf87` |
| `docs/architecture/schema-registry-v4.json` | Accepted | `c9bdd8e22a6dbe42ea3df16a517903024d71bba3f7708ac748fd9f42431be1a9` |
| Catalog schema v3 | Defined in accepted registry | `7fee34c2088cc93bb459c7c12d26d2e7631b1ca04c51b97e7c364d09cbbcf651` |
| Evidence schema v3 | Defined in accepted registry | `1789005fe31b9acbcc62654f7a3240946dea340f78a0e2559315581cc9f6de6f` |
| Fixture schema v1 | Defined in accepted registry | `4018d4c275ea86b20413cc78bfe2b6421287a986c343f7544dce70cfd160a08b` |
| Implementation schema v1 | Defined in accepted registry | `fba2d2ea7c4567dc6408d26b8024a39622d159144443de208dc7e9916f41a383` |
| `P1-AT-001` fixture | Accepted | `1b5b76b43fd3c0050240e6307a99d6cf54135a7c618ec6985777db2ebe8c85f1` |
| `P1-AT-002` fixture | Accepted | `847bec91d2806b7a8c98bedfdea677892a6de888bd46d275c135bc488d506b9c` |
| `P1-AT-003` fixture | Accepted | `05d2930235ede9feb8178fee7171fd972af29bd4729f2f86ba3d99a91928112e` |

The implementation manifest also binds runner executable digest
`08403b8c6d18bac93cb506fa19187956ac59f3c3dfbc8885054a930e2e5eea4b`,
runner package digest `07e97e24f635a3e660523ebdf0d5f970f191fa93991b08c328d0ade54ba5cf8a`,
and dependency-lock digest
`21e125c7166d61e51a048c4abeeb61bdd84bba229841e1b6d7c286d2a7a455a3`.
The workspace supply-chain policy is separately bound as
`f662a0607d5444cb923e1e7ccdcf51607113e6c1b2ca93a0f5d83ce7bd1befdc`.

## Implemented Boundaries

- `dosai-acceptance` accepts one exact argument shape, known catalog paths,
  accepted byte digests, known suite IDs, and accepted fixture digests.
- Catalog v2 remains recognized but blocked because all its suites are
  `NOT_IMPLEMENTED`. Catalog v3 and its exact fixtures are accepted and pinned.
- JSON input rejects symbolic links, oversized files, invalid UTF-8, byte-order
  marks, duplicate keys, non-finite numbers, negative zero, and schema extras.
- Child processes use exact executables and argument arrays with no shell and a
  minimal environment allowlist. No raw process output enters evidence.
- Evidence is canonical D2 JSON under the one managed repository directory,
  with owner-only modes, exclusive creation, file and directory synchronization,
  symbolic-link rejection, artifact digests, and partial-run cleanup.
- The report itself satisfies required class `REPORT`; separate descriptors
  cover every other required artifact class and avoid recursive self-digests.
- Packaged probes own their process group and profile, use loopback-only CDP,
  bound discovery and each CDP command, scan sanitized evidence for secret
  patterns, and verify post-run repository cleanliness.

## Simulated Workflows

The independent simulation exercised accepted-v2 rejection, proposed-v3
rejection, unknown catalog paths, invalid CLI shape, duplicate JSON keys, BOM,
negative zero, fixture/profile digest mismatch prevention, symbolic-link
evidence redirection, complete PASS assembly, and single-assertion FAIL
assembly. Both simulated reports compile and validate under strict Draft
2020-12 semantics, and the failed assertion cannot produce a PASS result.

## Faults Found and Remediated

1. Fixture profile digests were placeholders. Each now hashes the exact profile
   identifier plus its canonical newline, and tests recompute every binding.
2. The first evidence-directory check could create a child through an existing
   symbolic link before rejecting it. Each parent is now checked before child
   creation, canonical containment is verified, and an outside-write test passes.
3. The engineering audit inherited the full parent environment. Packaged and
   build processes now receive only the small required environment allowlist.
4. Exporting the audit initially introduced a `process.argv` guard, violating
   its fixed-input policy. Node 24's argument-free `import.meta.main` is used.
5. Evidence schema v2's PASS subschemas depended on implicit types and fail Ajv
   strict compilation. Accepted v2 is unchanged; v3 declares every required
   array and object type and passes report assembly validation.
6. CDP calls could wait without a per-command bound. Discovery fetches now use
   one-second aborts and CDP commands have fixed ten-second deadlines.
7. The first implementation manifest pinned package metadata but not executable
   source. It now binds the complete runner source set and dependency lock.
8. Initial workspace setup displaced the repository's package release-age,
   integrity, peer, engine, and exotic-subdependency policies. Every original
   control is restored, the workspace declaration is the only addition, and
   the implementation manifest now binds that configuration digest.

## Validation

| Command or inspection | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS; two-workspace lock accepted and local CLI linked |
| `pnpm run check` | PASS; five typecheck surfaces, 44 tests, and three production builds |
| Accepted v1/v2 lineage pins | PASS; all protected predecessors remain byte-identical |
| Catalog no-weakening comparison | PASS; only the three P1 implementation states change |
| Strict report simulation | PASS and FAIL reports both validate with correct result and exit semantics |
| CLI preflight | Accepted v2 returns `SUITE_NOT_IMPLEMENTED`; accepted v3 refuses a dirty subject before execution |
| `git diff --check` | PASS |

## Remaining Gate

1. The complete accepted state is committed so the formal clean-worktree precondition is true.
2. All three P1 suites run against the package and write local ignored evidence.
3. Reports, artifacts, cleanup, secret scan, subject digest, and package digest
   are independently reviewed before P1 exit is considered.

Until those steps finish, formal evidence remains absent and every runtime
capability remains `UNVERIFIED`.

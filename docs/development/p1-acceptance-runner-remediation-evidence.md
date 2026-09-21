# P1 Acceptance Runner Remediation Evidence

**Status:** `[x] COMPLETE`<br>
**Evidence captured:** `2026-07-31T18:12:47-04:00`<br>
**Formal acceptance result:** `FAIL` (preserved first attempt)<br>
**Review decision:** Owner accepted synchronized remediation `2026-07-31T18:12:47-04:00`

This record separates an acceptance-harness fault from application behavior.
The failed report remains local immutable evidence. No assertion, scenario,
application boundary, or gate condition was removed or weakened.

## Failed Attempt

| Field | Value |
| --- | --- |
| Suite | `P1-AT-001` |
| Subject commit | `eca82bf7abaf1eac3b6b38e10c9e0cf322da6823` |
| Run ID | `5d7a2e64-0233-421c-a5b9-fa865bb05a44` |
| Report ID | `882bcae0-322e-4d65-84d8-7581d7bd15db` |
| Report SHA-256 | `c15a9de8e74f1f4da34f04ea4022bd4a5e0a517eb4b6262557477f98fd078597` |
| Failure | `BOUNDARY_PROBES` / `RUNTIME_EVALUATION_FAILED` |
| Cleanup | PASS |
| Evidence secret scan | PASS |

The initial boundary probe attached to Electron's debugger endpoint before the
document had a usable `head`. Its fixed JavaScript then attempted
`document.head.append(...)`, causing a null dereference. The package had already
built, launched, validated its executable, ASAR, signature, and runtime
identity. The failure was in probe scheduling, not the DOSAI application.

## Accepted Remediation

- Runner 0.1.1 calls the existing bounded `waitForHealthyPage` readiness check
  before any boundary probe.
- Unexpected exceptions expose only a stable safe failure code; raw exception
  text cannot enter formal evidence.
- Catalog v3, runner 0.1.0, fixture v1, registry v4, and the failed report remain
  unchanged historical records.
- Catalog v4 changes only the three P1 fixture paths. Fixture v2 changes only
  identity and runner-generation fields; all cases and assertions are equal.
- Runner 0.1.1 refuses both the obsolete v3 runner identity and any unpinned
  catalog or fixture bytes.

## Accepted Set

| Artifact | SHA-256 |
| --- | --- |
| Catalog v4 | `5339a14ddad7b79a127378b047e884b3ff3602659482b6029146bb1ab86b20ad` |
| `P1-AT-001` fixture v2 | `d84b55ffab2898852e5294ac2c68a8d4aeeb12908c402b4c88d16d50cb7a6102` |
| `P1-AT-002` fixture v2 | `3eb872481850da329d980fa03c8ba596511793c530d98721bdb46aace7a642f7` |
| `P1-AT-003` fixture v2 | `ce55653c3238e40379798e011a92661eaa3d893e167afbd723cac990658aaac9` |
| Runner executable 0.1.1 | `19b9a97654a81dbb12ac0efeafe040b33e8628f51e1c76c97b200148ebd88886` |
| Runner package | `527558a690a9ac530dbf2273a1c02105c15a26429b3bdc872263126259208c07` |
| Dependency lock | `cac0046b4187975b8e38329c501f40a1874beb493bf18d9217263d7215acaf79` |
| Workspace policy | `f662a0607d5444cb923e1e7ccdcf51607113e6c1b2ca93a0f5d83ce7bd1befdc` |

## Validation Before Formal Rerun

The corrected non-formal packaged audit passed all 29 assertions, including
boundary rejection, bounded load, renderer recovery, unclean restart, cleanup,
and secret scanning. Governance tests validate the v4 contracts strictly,
recompute every digest, preserve v2 and v3 byte identities, and compare every
v1/v2 fixture case and assertion. Formal reruns require a clean commit of this
accepted generation and remain separate from this remediation decision.

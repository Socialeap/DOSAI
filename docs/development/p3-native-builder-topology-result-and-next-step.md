# Native-builder topology result and candidate intake

Status: **NO_GO for native-builder qualification**. Role: unclassified assistant.
This source-only handoff records a sanitized summary and preserves the existing
qualification, execution and acceptance gates.

On November 17, 2026, [GitHub Actions run 44150605303](https://github.com/Socialeap/DOSAI/actions/runs/44150605303)
completed on attempt 1 at merged commit `e2ad272d0e2e279312984783cacac52fcb452158`
(PR #27). Before dispatch, the workflow and embedded collector were checked
against the [activation record](../architecture/p3-mount-topology-workflow-activation-record-v1.json).
The run used the public repository's standard Ubuntu 24.04 x64 runners under
the verified zero-cost basis. The one-dispatch authorization is consumed.

| Job | Diagnostic conclusion | Exact-target mount rows | Submount rows |
| --- | --- | --- | --- |
| host_a | Success | Two: full-root read-write `autofs` and `binfmt_misc` | 0 |
| host_b | Success | Two: full-root read-write `autofs` and `binfmt_misc` | 0 |

Both observed instances fail the existing requirement for exactly one
full-root `binfmt_misc` mount at the target. The `autofs` row is consistent
with the earlier filesystem/root rejection on a different run. The topology
collector did not run the original qualification checks, open the registry,
inspect registrations, or query Docker. Writer exclusion, deployed kernel
source match, trusted issuer evidence, and host independence remain unproven.
Qualifying builder receipts remain **0 of 2**. Retain raw logs in their existing
location. This summary omits host identifiers and raw mount information.

## Next source-only step

Screen an **already available, zero-incremental-cost native host pair** from
administrator or provider documentation. A candidate record should identify the
provider or owner-managed platform, two non-sensitive host labels, the existing
cost entitlement, and the accountable administrator. The GitHub runner class
as observed is unsuitable. Reconsider it only if the provider documents a
materially different eligible host profile. Availability of an alternative
pair remains unestablished.

Use the existing [native-host profile](../architecture/p3-native-host-profile-v1.json),
[writer-boundary design](../architecture/p3-native-writer-boundary-design-v1.json),
and [ADR 0018](../decisions/0018-native-linux-independent-builders.md) for intake:

1. **Native and independent.** Require two distinct fresh native Linux x86-64
   environments, native Docker amd64, separate writable state and daemons, and
   a documented zero-cost basis. Stop when any of these is absent or unknown.
2. **Registry correct by design.** Require a documented route to exactly one
   full-root `binfmt_misc` target mount, zero submounts, and zero registrations
   in the effective registry the build would use. Stacked mounts, filtered
   mount views and replacement empty registries cannot satisfy this gate.
3. **Writer exclusion enforceable for the full interval.** Require an
   inventory and enforcement policy covering privileged writers, no DOSAI
   registry mutation capability, the active boundary epoch/generation, and
   proposed residual host/provider trust for explicit owner acceptance.
   Namespace and registry identity must remain bound to that same effective
   registry. A service list, snapshot, local lock, or owner trust statement
   alone cannot establish enforcement.
4. **Evidence source identified.** Require a route to bind exact deployed
   vendor kernel identity to reviewed source and patches, and a candidate
   independent issuer with scoped trust, freshness, revocation and replay
   controls. Unknowns stop intake advancement.

Intake screens feasibility only. For a credible pair, the next deliverable is
a source-only review of the exact candidate, predicates, and collector
compatibility. Reuse the existing collector if compatible. Where provider
identity evidence requires adaptation, propose only an additive,
provider-specific projection with equivalent checks and offline tests.
Any eventual live qualification needs explicit authorization for the exact
candidate, source digests, bounded reads, zero-cost basis, and stop conditions.
A failing or incomplete result stops the attempt. No retry is authorized.

This change grants no provisioning, dispatch, host mutation, build, guest
execution or spend authority. Two accepted native build, isolation and cleanup
receipts from identical pinned inputs, formal P3 acceptance, and the
representative workflow remain separate gates. BETA-CP-004/005/006 remain open.
There is no backend, frontend, deployment, or Lovable action for this increment.

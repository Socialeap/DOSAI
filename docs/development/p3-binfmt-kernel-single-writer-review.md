# Kernel removal and single-writer review

Status: **ADVISORY — NO_GO_FOR_CURRENT_EFFECTFUL_EXECUTOR_CONTRACT**.
Reviewed 2026-10-27 against merged PR #8, main
`3ff6545cdaa8bf2f42b9840eb69893b482a4b264`.
Role: unclassified assistant; no specialized review role assigned.
No executor was implemented. No host mutation, dispatch, build, guest execution
or paid activity was performed. Accepted ADRs and runtime gates remain unchanged.

## Primary source scope

- [Linux v6.17 binfmt_misc.c](https://github.com/torvalds/linux/blob/e5f0a698b34ed76002dc5cff3804a61c80233a7a/fs/binfmt_misc.c),
  commit `e5f0a698b34ed76002dc5cff3804a61c80233a7a`, file SHA-256
  `719979c809ff158827795956fff5e0af4eb9a80883587ae3ba78c250f32ee50a`.
- [Observed image's published inventory](https://github.com/actions/runner-images/blob/ubuntu24/20261023.334/images/ubuntu/Ubuntu2404-Readme.md)
  lists image `20261023.334.3`, kernel `6.17.0-1022-azure` and systemd
  `255.4-1ubuntu8.17`. This is vendor-image documentation, not a measurement of
  the running kernel or proof of exact distribution patches. The diagnostic
  receipt did not record the actual kernel release or package/source identity.
- [GitHub runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
  documents fresh standard VMs and passwordless sudo. Neither is a guarantee
  that no other privileged component can update registrations during a job.
- [systemd-binfmt documentation](https://www.freedesktop.org/software/systemd/man/latest/systemd-binfmt.service.html)
  identifies a service that registers kernel formats. This establishes a writer
  class to consider, not that this service was running or racing on our hosts.
  No installed service unit, timer state, process inventory or exclusion
  mechanism has been observed in the authorized diagnostic.

The upstream code establishes reference semantics only. Do not equate its
review with a verified fingerprint or behavior proof for the deployed Azure
kernel. Exact vendor behavior remains a prerequisite for a future executor.

## Kernel conclusions

`bm_entry_read` and `bm_entry_write` use the opened inode's private entry node
(lines 700–758). Removal locks the filesystem root while detaching that node;
registration uses that root lock too (768–845). A detached node's removal write
still returns the supplied byte count. Enable/disable paths do not provide a
transaction with user-space validation. Entry status has no versioned
compare-and-remove interface. References held by an in-flight format loader
can outlive registry detachment (130–171). These are limited upstream source
findings, not an execution result.

Keeping the same descriptor is the right direction for object binding. It does
not make a preceding content hash, four removals, or the subsequent predicates
one atomic operation. A directory descriptor and mount identity also need to
refer to the same effective registry that later execution uses; displaying an
empty replacement mount is not proof of native-only execution.

## Findings before implementation

| Priority | Finding | Required consequence |
| --- | --- | --- |
| P1 | A three-byte successful write can be an already-detached no-op. | Record syscall acceptance separately from observed disappearance. Never count returned bytes as proof that this helper caused a removal. Partial or ambiguous results remain quarantined. |
| P1 | Fresh VM, no-checkout workflow and local locks do not establish exclusion of all privileged writers. | Define which actors are trusted, how cooperating DOSAI writers are fenced, and what evidence supports the remaining writer assumption. Unknown state denies writes. |
| P1 | State can change between snapshots, individual writes and final observation. | Do not claim atomic compare-and-remove, exclusive causality, continuous emptiness or guaranteed absence of ABA. Retain exact pre/post checks as detectors, not prevention proof. |
| P2 | Upstream v6.17 is not the exact deployed vendor kernel fingerprint. | Bind actual kernel/package identity to a reviewed source version before executor eligibility, and separately prove descriptor behavior in an authorized disposable fixture. |
| P2 | Registry detachment does not terminate an existing interpreter invocation. | Do not claim process cleanup or past non-emulation from an empty registry. Do not add unrelated process termination to this four-entry plan. |

## Concrete source-level interleavings

1. The helper reads old entry A. Another writer removes A and registers B at the
   same name. A write through A's retained descriptor acts on A, not B. It may
   report success without removing B. A complete post-scan must detect B; the
   helper must not reopen the name and remove B as a retry.
2. Another writer disables A after validation but before the removal write.
   The syscall has no expected-enabled-state argument. A prior hash cannot be
   described as a condition enforced atomically by that syscall.
3. Another writer changes then restores registry state between samples. Equal
   snapshots do not reveal that history. No polling frequency removes this
   logical limitation.
4. All entries disappear, then another writer registers one after the final
   scan. The observation records a bounded point in time; it does not fence
   future registration or establish a durable execution boundary.

These are reference-semantic counterexamples, not observed races in run
40552566410. That run only established the bounded four-entry inventories and
preserved rejection. Its authorization is exhausted.

## Single-writer boundary that is missing

There are three distinct scopes:

- **Cooperating DOSAI preparation:** exact run/job, one helper and at most one
  attempt per entry. A lease or local lock can fence these participants if they
  all honor it. GitHub workflow concurrency only schedules workflow runs.
- **Other VM actors:** boot/configuration services, provider agents or another
  privileged process are outside that cooperative fence. Passwordless sudo
  remains available to processes in the job's account. A boolean
  `fresh_disposable_vm: true` in a test trace does not exclude them.
- **Provider/kernel trust:** privileged infrastructure can defeat local
  observations. This must be an explicit threat-model assumption accepted by
  the owner, never reported as a locally proven exclusion guarantee.

A service/process snapshot is useful evidence but is not writer prevention.
Do not silently stop services, change permissions, alter sudo policy, mount a
new registry, add namespaces, or broaden the four mutation targets to construct
an apparent single-writer environment. Such changes need a separate accepted
contract and are outside current authority.

## Narrowest safe next source increment

Prepare a **versioned contract revision**, without modifying the merged v1 plan,
its model digest or any dispatchable workflow. It should:

1. Separate `WRITE_REQUEST_ACCEPTED`, `TARGET_ABSENCE_OBSERVED` and
   `EXCLUSIVE_CAUSAL_REMOVAL_UNPROVEN`. A full byte count alone cannot advance
   preparation to completed. All runtime success still requires independent,
   exact post-state checks and every original observation predicate.
2. Require a trusted, explicitly accepted preparation/writer-boundary record.
   Bind source/kernel identity, registry and namespace identity, fresh job
   provenance, cooperating-writer fencing, and scoped privilege lifetime.
   Unavailable, expired or mismatched evidence must deny **before any write**.
3. State the residual privileged-host/provider trust assumption plainly. The
   owner must decide whether a bounded preparation under that assumption is
   acceptable or require controlled native hosts with a stronger documented
   writer boundary. No evidence currently selects or provisions those hosts.
4. Add inert race fixtures for stale descriptors, already-detached no-ops,
   enable/disable between checks, ABA, namespace/mount substitution, unknown
   writer state and registration after final observation. Simulations remain
   non-authoritative and must never output runtime admission.
5. Retain the exact four-entry limits, native-only requirement, original
   rejection gate, no retry/rollback, no builds and no paid activity. Executor
   implementation and its bounded Linux behavior proof need later decisions.

This review recommends GO only for that source-only refinement. It recommends
NO_GO for claiming or relying on the current contract's unestablished
single-writer/atomicity properties in an effectful executor. Review and merge
of this document cannot accept a new threat assumption or authorize effects.

## Validation and release classification

The changed files are documentation only. Reviewed source references and exact
hashes were checked, local links resolve, and the diff passes whitespace checks.
No new runtime test was needed to restate source semantics, and no kernel race
or single-writer property was tested on a live runner. Existing plan/model,
workflow, diagnostic and checkpoint bytes remain unchanged.

BETA-CP-004/005/006 remain NO_GO. No backend migration/function/configuration,
secret, provider activation, Lovable action, frontend Publish, deployment,
account reset or paid service is required. The 120-credit ceiling remains.

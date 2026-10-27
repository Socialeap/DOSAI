# Exact binfmt registration removal: source-only plan

Status: **PROPOSED_SOURCE_ONLY_NO_EXECUTOR**. No specialized role assigned.
Based on main `0438966a58cd95709d79261b661bd86ec75d8b67` after PR #7.
The owner authorized this plan and offline tests only. No host-mutation helper,
workflow activation, dispatch, build, guest execution or paid activity is included.

## Fixed evidence and scope

The two bounded inventories from [run 40552566410](https://github.com/Socialeap/DOSAI/actions/runs/40552566410)
identified the same four enabled registrations on Ubuntu image `20261023.334.3`:

| Registration | Interpreter | Magic |
| --- | --- | --- |
| `llvm-16-runtime.binfmt` | `/usr/bin/lli-16` | `4243` |
| `llvm-17-runtime.binfmt` | `/usr/bin/lli-17` | `4243` |
| `llvm-18-runtime.binfmt` | `/usr/bin/lli-18` | `4243` |
| `python3.12` | `/usr/bin/python3.12` | `cb0d0d0a` |

All had empty flags, offset zero and no mask. The
[fixed plan](../architecture/p3-exact-binfmt-removal-plan.json) pins each complete
entry's SHA-256, metadata, order, image version, native platform and all 16
original workflow failure predicates. The preserved workflow digest is
`1e8daa3e67ff54200dda1f0c587dfc1b9501341ddfb8608d4a0b52fbb03da53c`.
A matching name alone is insufficient. A different image or byte digest requires
a new review, not an inferred equivalence or a relaxed allowlist.

The [Linux kernel interface](https://docs.kernel.org/admin-guide/binfmt-misc.html)
distinguishes removing one registration from disabling it or clearing all
registrations. The proposed operation is removal of each exact entry; it is
never a global status write, wildcard deletion, interpreter/package removal,
service stop, mount change or disabling-only workaround. This document supplies
no runnable host-write command.

## Sequential future execution contract

1. **Authorization and isolation before any privileged access.** Require fresh
   explicit owner authorization binding an accepted executor, exact source and
   workflow digests, selected commit/ref, one manual dispatch, two fresh distinct
   disposable standard native-x64 VMs and a zero-charge preflight. Recheck public
   visibility and current billing eligibility. No old run, long-lived/self-hosted
   machine, ARM/emulated host, shared state or unexplained privileged writer is
   admissible. Source tests and self-declared trace fields do not prove this.
2. **Read-only preflight.** Run all original non-removal preconditions, including
   native architecture, Docker architecture and identity/image checks, before
   mutation. Do not execute the original empty-registry assertion or emit a host
   receipt yet: these four registrations are expected to exist. Use the bounded
   diagnostic collector. Require global enabled state and exactly these four
   enabled entries, with exact metadata and byte digests. Refuse missing, extra,
   duplicate, disabled, changed, malformed, unreadable, linked or unstable state.
   An already-empty host is not this plan's removal case; stop without writing
   and seek a separately scoped observation decision.
3. **Revalidate descriptor identity and preimage.** A future minimal privileged
   helper must traverse only fixed `/proc/sys/fs/binfmt_misc` components with
   no-follow descriptors. Before the first write, validate all four preimages
   and the complete membership set. Immediately before each later write, require
   the exact remaining membership/digests and unchanged global state. Read and
   write through the same verified entry descriptor, never by reopening a
   previously checked string path. No caller-selected path, generic command,
   environment override, sudo shell or interpreter execution may be exposed.
4. **At most four bounded removal attempts per host.** In fixed manifest order,
   the intended per-entry payload is the three bytes described by hex `2d310a`.
   Permit one write attempt per entry and no more than four total. Require its
   exact completion result and verify that only the selected registration
   disappeared. Keep all remaining entries hash-exact. Limit the preparation
   phase to five seconds and hard-stop child work on deadline. Do not launch a
   build or container in this phase. The actual permission/privilege mechanism
   is not selected or implemented here and requires independent review.
5. **Fail closed after any uncertainty.** A partial/error/timeout/unknown write,
   changed identity, extra or reappearing entry, changed global state, missing
   target, deadline breach or unexpected output ends the attempt. No next write,
   retry, automatic rerun or attempted re-registration/rollback is permitted.
   Mark the disposable job unusable, preserve minimized failure evidence and
   terminate its owned work; rely only on provider disposal of that VM. Do not
   claim an unknown effect was absent or continue on the second host as a way
   to hide a failed two-host attempt.
6. **Rerun every original predicate from the beginning.** After verified removal
   of all four entries and loss of mutation authority, rerun the entire original
   host observation sequence on the same job/VM/run/SHA, including diagnostics,
   architecture, image and DMI checks, Docker query/architecture, directory and
   scan checks, the unchanged no-registration rejection and receipt emission.
   Do not reuse earlier predicate booleans or cached host identity. Any failed
   predicate or reappearing registration produces no qualifying receipt. The
   fixture manifest enumerates all 16 original failure paths; none is waived.
7. **Separate host and builder evidence.** Only the existing offline verifier
   may qualify the two original host receipts, checking distinct identities,
   common run/commit/image and native architecture. Preparation records use a
   separate evidence family and cannot masquerade as host success. Even two
   qualified candidate hosts supply zero builder receipts. ADR 0018's exact
   builder/image inputs, independent state, non-root/no-network builds,
   execution-eligible artifacts and P3 acceptance remain later gates.

## Limits that must be resolved before an executor

Opening and hashing an entry is not an atomic kernel compare-and-remove
operation. A same-descriptor design reduces path-replacement risk but does not
prove that concurrent privileged registration changes or ABA races cannot occur.
A future implementation must be reviewed against the runner kernel interface,
prove its descriptor behavior in a separately authorized disposable fixture,
and establish the single-writer preparation boundary. If it cannot, retain NO_GO
and choose a separately reviewed native host source. Do not silently stop system
services or acquire broader privileges to make this plan work.

Only the four kernel registrations are proposed mutation targets. No installed
Python/LLVM executable or package is modified. Their registered handlers' absence
must remain true during later admitted work; an entry reappearing invalidates
that observation. No continuous-stability or actual-removal proof exists yet.

## Offline test model and results

`tools/supervised-execution/binfmt-removal-model.mjs` is an inert trace validator.
It hashes the exact plan, accepts only bounded strict JSON fixtures and exposes
no CLI, host filesystem, process, network or write implementation. Trace metadata,
descriptor claims, event results and predicate booleans are synthetic test inputs,
not authenticated evidence. Even a complete successful trace returns
`simulation_only: true`, `execution_authorized: false`, `runtime_admission: false`
and zero builder receipts. It is not to be wired into a runtime approval path.

The 11 focused model tests pass on Node 24.18.0. Combined with the existing
diagnostic, readiness, repair and host-verifier checks, 28/28 focused tests pass. Cases cover the exact four
preimages, extra/missing/disabled/changed registrations, metadata drift, stale or
emulated host context, descriptor substitution, reordered/repeated/extra writes,
wrong payloads, partial/failed/unknown/timed-out results, membership races,
reappearance, incomplete preparation, duplicate JSON keys, size limits and all
mandatory pre/post predicates. Fixtures assert unchanged inputs and immutable,
non-authoritative outputs. No host write is mocked as a real execution result.

```sh
node --test tests/governance/p3-exact-binfmt-removal-plan.test.mjs
```

## Review and release gates

Owner review of this proposal precedes any request to implement a privileged
helper. Implementation, independent security review, workflow/checkpoint
activation, merge and exact one-attempt host-mutation/dispatch approval remain
separate future steps. The current workflow, diagnostic source, accepted
checkpoint and its history remain unchanged. Beta remains NO_GO.

No database migration, backend function/configuration, secret, provider change,
Lovable activation, frontend Publish, deployment, package build or account reset
is required. The 120-credit mission ceiling and no-paid-activity boundary remain.

# Consolidated native-host and writer-boundary feasibility packet

Status: **SOURCE REVIEW ONLY; RUNTIME NO_GO**.
Baseline: merged main `3b273cb8d861be3810918118f02187fa27b812c4`.
Role: unclassified assistant; no specialized role assigned.
Owner authorization covers this packet and offline tests. It grants no merge,
workflow activation, dispatch, executor, host mutation, build, guest execution,
provisioning or paid activity. No new collector or runtime verifier is supplied.

## Decision

Recommend source review of a **preprovisioned clean native-amd64 host profile**
for two fresh independent hosts, whose real effective registries already contain
no registration files. This avoids adding a DOSAI registration-removal executor.
Every original predicate, kernel/source requirement and writer trust boundary
still applies. Availability and zero-cost eligibility for such hosts are
**NOT_ESTABLISHED**. No host or provider has been selected, acquired or provisioned.
If no admissible zero-cost environment and accepted trust boundary can be
identified, the constrained beta remains NO_GO; more diagnostics do not remove
that dependency.

The current hosted-runner path supplies no qualifying host/builder receipts.
The exact-four-registration removal route remains NO_GO for an effectful
executor because its trusted writer boundary is absent. Neither observation
merge nor this packet accepts a new provider/kernel trust assumption.

The existing GitHub/image-specific v2 removal contract is preserved. A different
provider or image requires a separately reviewed versioned host profile; changing
its fields or copying its fixture trust records cannot admit that environment.
ADR 0018's native-only, two-host independence, pinned-input and isolation
requirements are not changed by proposing an alternative host profile.

## Observed facts and unknowns

| Evidence | What it establishes | What remains unknown |
| --- | --- | --- |
| [40552566410](https://github.com/Socialeap/DOSAI/actions/runs/40552566410) | Those two historical hosts had the four pinned LLVM/Python registration files and failed the existing presence gate. | Current-host inventory, CPU emulation history, deployed source match and writer exclusion. |
| [40563905019](https://github.com/Socialeap/DOSAI/actions/runs/40563905019) | Both jobs rejected the v1 kernel/writer collector without a structured record. | Internal rejection stage and all later unrecorded observations. |
| [40568691301](https://github.com/Socialeap/DOSAI/actions/runs/40568691301) | Both attempt-1 jobs at the baseline emitted `MOUNTINFO_TARGET_FS_OR_ROOT`; no structured diagnostic, host success or builder record resulted. | Exact topology, current registrations, package/source identity and actual writer state. |

The latest code is the first detected failure of the root/filesystem conjunction
for a row at the fixed registry target. A non-root binfmt mount, a target row
with another filesystem, or an autofs/binfmt stack can each produce it. The
fixtures demonstrate that ambiguity. **Autofs is not a confirmed runner cause.**
An early mount failure also prevents later package/unit/namespace projections;
their absence does not mean that the corresponding checks passed.

No raw host log, process list, credential, host UUID or evidence capture is added
to this packet. The source summary references public run IDs and fixed failures.
Minimized operational receipts remain in ignored local temporary storage.

## One requirements matrix

The [machine-readable packet](../architecture/p3-native-writer-feasibility-packet.json)
binds all inputs by SHA-256 and records the current gaps:

| ID | Evidence required before runtime eligibility can be considered |
| --- | --- |
| NH-01 | Fresh native Linux x86-64 and Docker amd64, no emulation, and every original architecture/context predicate. Native architecture strings alone do not establish the whole boundary. |
| NH-02 | Two distinct host identities, fresh disks and independent writable daemons/layers/caches/home/work/output state. Two jobs or two containers alone do not establish independence. |
| NH-03 | The same verified content-addressed builder archive, sealed source, recipe, full defconfig and fixed parameters; separate provenance/SBOM and artifact comparison. Accepted declarations do not prove an archive was built and verified. |
| NH-04 | The actual effective registry for later execution: strict accepted mount topology, filesystem/device/inode, namespaces, stable identity, no registration files including disabled entries, and unchanged pre/post checks. A substitute empty mount cannot satisfy this. |
| NH-05 | Actual deployed kernel/package identity bound to the exact reviewed vendor source/patch context. A package row or upstream reference review is insufficient. |
| NH-06 | Current writer inventory, enforced/documented actor boundary, active cooperative fencing and explicit owner acceptance of residual privileged-host/provider trust. Snapshots, locks and workflow queues do not prove exclusion of all privileged actors. |
| NH-07 | Enforced privilege scope/lifetime for any separately accepted preparation, revocation/drop verification and complete original rechecks. A helper cannot claim account-wide sudo removal from a local state field. The no-removal alternative still needs the accepted non-root/capability boundary. |
| NH-08 | An independent trusted issuer/verifier for exact source/run/job/kernel/registry/fence bindings, freshness, expiry and revocation. Test fixtures and hashes do not authenticate an issuer. |
| NH-09 | Two actual builder/isolation/cleanup receipts, accepted artifacts, then the separately governed physical P3 acceptance and representative beta workflow. Diagnostic or simulated success supplies zero builder receipts. |

All 16 original predicates and the added kernel/writer rejection remain in
force. Registration-file presence still rejects, regardless of enabled state
or an apparently ordinary interpreter. All three workflows, both removal
models/contracts, both kernel collectors, activation history and checkpoint v2
remain byte-identical. The current reporter remains NO_GO.

## Consolidated future evidence bundle

Before proposing another external attempt, review one complete bundle rather
than another isolated diagnostic question. Its source-only design must specify:

1. Exact candidate host/provider profile, two-host identities/independence,
   immutable image inputs, zero-cost basis and native-only acceptance predicates.
2. Fixed read-only registry/mount/namespace projections, including bounded target
   row count, root class, filesystem class and identity-match booleans. Retain
   the current rejection result; do not ignore autofs or select a topmost mount
   as an unreviewed exception. Never emit unrelated mount paths or raw rows.
3. Bounded deployed release/package/source observations and the exact source
   review they would need. Keep metadata observation distinct from verified
   source correspondence. Unsupported or uncollected observations stay UNKNOWN.
4. The fixed writer-unit observations and, separately, the trusted actor-boundary
   evidence and explicit owner/provider assumption. No additional process dump
   or polling frequency can establish the missing trust decision.
5. Provenance, limits, failure codes and collection ordering for every subrecord;
   identify which later checks cannot run after an unsafe identity failure.
   Preserve the reviewed no-follow paths, byte/deadline bounds and query allowlist.
6. Independent receipt verification, the residual limitations and every
   acceptance/activation/dispatch stop condition. No self-issued “trusted” flag,
   caller-selected path/command, implicit retry or runtime promotion is allowed.

This is a bundle design checklist, not a new collector implementation or a claim
that read-only diagnostics can supply a trusted writer boundary. If the issuer,
enforcement mechanism, source match, two-host independence or zero-cost host
availability cannot be established, stop before activation/dispatch. A new Linux
runner label by itself is not evidence that any of these gaps is resolved.

## Primary source scope

- [Linux binfmt documentation](https://docs.kernel.org/admin-guide/binfmt-misc.html)
  describes interpreter registrations and their enable/disable state. These
  general interface semantics do not identify any runner's actual registrations
  or deployed kernel behavior. Current documentation is not a vendor source pin.
- [Linux mountinfo documentation](https://man7.org/linux/man-pages/man5/proc_pid_mountinfo.5.html)
  describes process-namespace rows, filesystem roots, devices and mount stacking.
  That explains why one rejection code is not a unique topology fingerprint;
  it does not authorize changing the current strict parser.
- [systemd-binfmt documentation](https://www.freedesktop.org/software/systemd/man/latest/systemd-binfmt.service.html)
  identifies a service that registers formats. It establishes a writer class,
  not the existence, state or exclusivity of a writer on a measured host.
- [GitHub's runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
  documents fresh standard VMs and passwordless sudo. **Inference:** freshness
  and workflow serialization cannot by themselves demonstrate exclusion of
  privileged actors. Future current-cost eligibility needs its own preflight.
- The hash-bound [kernel/writer review](p3-binfmt-kernel-single-writer-review.md)
  remains the reference-semantic analysis of stale descriptors, no-op accepted
  writes, ABA, delayed references and post-scan registrations. No new live
  kernel race or vendor behavior proof is claimed here.

The Trove catalog identified a relevant book, but the read limit blocked TOC and
page access. No book content or findings were used, and no upgrade/subscription
or repeated read was attempted.

## Offline validation

Eight new Node test groups cover 15 misleading-boundary substitutions, all 16
original predicates independently missing/false, accepted requests without
absence evidence and indistinguishable hidden histories. Rebinding fixture
digests does not admit incomplete source/writer/privilege evidence. Complete
synthetic traces remain simulation-only with all authority/proof fields false.
The new test-only builder is unreachable from application source and has no
host-operation imports; the existing inert v2 model remains unchanged.

Three new Python tests show that distinct mount causes share the same code,
an early failure masks later observations, and complete package metadata plus
inactive fixed units still leaves source/writer/runtime proofs false. They use
temporary fixtures and fake responses; no host proc, package or service query
is executed.

The combined relevant suite passes **64/64 checks on Node 24.18.0**. The new
Python cases pass on Python 3.9.6 and 3.15.0. Historical model, diagnostic,
activation, host-verifier and readiness checks pass. Readiness remains expected
exit 2 with BETA-CP-004/005/006; no latency, reliability or production result is
claimed. No native/build suite or remote run was invoked.

```sh
node --test tests/governance/p3-native-writer-feasibility.test.mjs
/usr/bin/python3 -B tests/governance/p3-native-writer-feasibility.test.py -v
node scripts/report-private-beta-readiness.mjs
```

Use the exact pinned Node 24.18.0 runtime and retained lockfile-matched local
dependencies. No dependency installation or build is needed for these fixtures.

## Sequential gates and operator stop rules

1. Owner reviews this packet and approves any source merge separately. No
   dispatch or mutation approval is requested. Stop if a protected input or
   native predicate changes, a current unknown becomes an asserted fact, or a
   fixture is promoted to trusted evidence.
2. If pursuing the recommended profile, identify two existing admissible native
   hosts and document availability, zero cost, independence, actual registry
   scope, kernel/source provenance and the proposed trust boundary. No new
   service, hardware purchase, provisioning or host preparation is authorized.
   If those prerequisites cannot be met, record NO_GO rather than switch to
   emulation, a shared host or a paid runner.
3. Review a versioned exact host profile, independent verifier/trust design and
   complete evidence bundle. Keep old contracts intact. Only after source
   acceptance may a separate activation increment be prepared. Any later run
   still requires exact merged SHA/ref/digest, current zero-cost checks and fresh
   bounded authorization. Unknown results stop; no blind retry or recovery.
4. Only after qualifying evidence and new bounded approvals may builder
   preparation/builds, artifact acceptance and physical P3 work proceed under
   their existing contracts. Their scopes, cleanup, timing and costs must be
   concrete before requesting authorization. No consequential authority is
   derived from this packet's merge or test results.

The narrow source-only next step is host-profile/evidence feasibility, not an
effectful executor or another automatic diagnostic dispatch. P3 acceptance and
the broader beta/production roadmap remain open.

## Release classification

Diff: documentation, a supplemental source record and offline test fixtures.
No backend migration, durable backend state, function deployment, secret,
environment/provider configuration, workflow modification or app activation is
required. **No Lovable action is required.** No frontend Publish or application
deployment is required. Owner review is the next action; later activation,
execution and owner QA remain separate gates. The 120-credit ceiling remains;
no reset, paid activity or new service is authorized.

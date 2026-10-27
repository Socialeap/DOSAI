# Deployed kernel and writer diagnostics: source-only preparation

Status: **PREPARED_INACTIVE_NOT_DISPATCHED**.
Based on merged PR #10, main `649aa510085770044b8a55b3c05f6c29b8ed55c9`.
Role: unclassified assistant; no specialized role assigned.
The owner authorized diagnostic source and offline fixtures only. No removal
executor, workflow activation, dispatch, host mutation, build, guest execution
or paid activity is implemented or authorized by this increment.

## Fixed collection scope

`scripts/p3-kernel-writer-diagnostic.py` is a standalone standard-library
collector. Its production entry accepts no arguments and requires isolated
Python with bytecode writes disabled on native x86-64 Linux. A future approved
launcher must use isolated/no-bytecode flags and a hard outer 10-second timeout.
There is no launcher or dispatchable workflow change in this preparation.

Only these projections are collected:

1. `os.uname()` release/machine, compared with fixed
   `/proc/sys/kernel/osrelease`. Hostname and the full uname version are not
   emitted. An optional bounded Ubuntu `/proc/version_signature` projection
   provides declared vendor/version/upstream tokens; unsupported forms are
   UNKNOWN, never silently mapped to a reviewed source tree.
2. One exact read-only `dpkg-query` projection for `linux-image-<validated release>`:
   binary package/version, source package/version and installed status. It does
   not enumerate packages, read package payloads, retrieve sources or use a
   package manager to install/change anything. Missing/unsigned-only package
   layouts are UNKNOWN; no wildcard or speculative fallback query is made.
3. The collector's own mount and user namespace identifiers, read only as two
   fixed kernel link targets. Its own bounded mountinfo is matched with the
   actual no-follow registry directory device/inode. Stacked target mounts,
   submounts under that root, wrong filesystem/device, malformed topology,
   changed namespaces or changed root identity are rejected. Other mount paths
   are never emitted. This does not prove the registry used by future execution.
4. Read-only `systemctl show` projections for exactly:
   `systemd-binfmt.service`, `binfmt-support.service`,
   `proc-sys-fs-binfmt_misc.automount`, and
   `proc-sys-fs-binfmt_misc.mount`. Fields are closed load/active/sub/unit-file
   states, reload-needed boolean, drop-in-present boolean and trigger count.
   No raw drop-in paths, trigger names, unit contents or logs are emitted.

The [dpkg-query interface](https://manpages.debian.org/trixie/dpkg/dpkg-query.1.en.html)
provides package-database metadata, not authentication of the running kernel.
[Mountinfo](https://man7.org/linux/man-pages/man5/proc_pid_mountinfo.5.html)
describes this process's mount namespace; IDs may be reused and are not durable
attestation. [systemctl introspection](https://www.freedesktop.org/software/systemd/man/latest/systemctl.html)
provides state observations, not exclusion of privileged writers.

No process list, process arguments, process environment, cookies, credentials,
DMI UUID, arbitrary file, raw exception, raw stderr or full host log is collected.
Only the existing nine allowlisted GitHub run/image/native-context environment
fields are read. Those caller-visible values are provenance context, not a
trusted issuer or an accepted writer-boundary record.

## Bounds and read-only query control

Fixed paths are traversed using no-follow directory descriptors; regular file
reads are nonblocking, size-capped and checked for replacement. Namespace links
are the only deliberate link reads: their targets must match the exact kernel
namespace-ID syntax and are never followed. Registry/namespace and release
identity are sampled before and after the five query projections.

| Resource | Limit |
| --- | --- |
| Kernel release / Ubuntu signature | 256 / 512 bytes |
| Own mountinfo | 65536 bytes and at most 512 rows |
| Observation child invocations | At most five attempted projections, no retry |
| Child stdout | 4096 bytes per query, streamed with an overflow check |
| Per-child deadline | One second, within the collection deadline |
| Collection / process alarm | Seven / eight seconds |
| Future outer launcher timeout | Ten seconds, separately reviewed before use |
| Encoded structured output | 65536 bytes |

The only child command forms are one fixed package query and four fixed
`systemctl show` queries, using absolute executables, closed arguments, no shell,
no stdin, discarded stderr, and a minimal locale/PATH environment. No sudo or
service-control operation is exposed. Unexpected arguments are rejected before
launch. Timeout, overflow or failure may terminate only the collector's own
observation child, followed by a bounded wait. Cleanup failure remains an error;
no successful cleanup proof is invented. Tests mock these calls; no live query
child was launched during preparation.

Unknown package/signature/unit data is marked UNKNOWN with a fixed reason and
no raw exception. Unsafe or inconsistent root/native identity rejects the whole
observation with a fixed failure line. The collection is diagnostic-only even
when all projections are present. Unit samples are sequential and non-atomic;
absence or inactivity of the four selected units cannot exclude other writers.

## Output and permanent evidence gaps

Output uses separate prefix/schema `DOSAI_KERNEL_WRITER_DIAGNOSTIC_V1`, with
`diagnostic_only: true` and writer scope `FIXED_UNITS_ONLY_NON_ATOMIC`.
Source match, single-writer exclusion, runtime admission and execution authority
are always false. The record always states these unresolved gaps:

- The running kernel is not cryptographically bound to the installed package.
- Vendor source and patch correspondence is not verified.
- Unlisted privileged writers are not excluded.
- No cooperating-writer fence is observed.
- No owner host/provider trust decision is accepted.
- The effective registry of later execution is not proven.

This is raw material for later source review and an independent trusted verifier.
It does not fill v2's trusted-boundary fields or create an admission receipt.
No proof field is promoted by an apparently complete package/service inventory.
The provider-owned tools and kernel remain unverified trust dependencies.

## Local validation

The new 14 Python adversarial fixture tests pass on Python 3.9.6 and 3.15.0.
The normal test wrapper plus prior v1/v2, binfmt diagnostics, readiness, repair
and host verifier pass 45/45 focused checks on pinned Node 24.18.0.

```sh
/usr/bin/python3 -B tests/governance/p3-kernel-writer-diagnostic.test.py -v
node --test tests/governance/p3-kernel-writer-diagnostic.test.mjs
```

The tests use an on-disk temporary fixture hierarchy and fake query responses;
`os.uname_result` fixtures match the real API shape without sampling a host.
Coverage includes missing tools/data, unknown and duplicate service properties,
malformed package metadata, native/release mismatch, namespace changes,
stacked/substituted mounts, symlinks, FIFO, bounds/deadlines, command allowlisting,
child overflow/timeout/nonzero-exit handling, fixed errors and minimized output.
A complete result still asserts no authenticated source match or writer exclusion.
No live Linux kernel, package database, service manager or writer boundary was
queried or validated. No build was run.

## Next review gates

Owner source review precedes separate workflow-candidate preparation and
activation/checkpoint binding. A later single diagnostic dispatch requires its
own exact merged SHA/ref/digest and current zero-cost preflight authorization.
No current dispatch authorization remains. Any resulting bounded record stays
untrusted until independently reviewed; real source correspondence and the
writer/trust decision remain separate gates. Executor work is still NO_GO.

No database migration, backend function/configuration, secret, provider setting,
Lovable activation, frontend Publish, deployment, package build, account reset
or paid activity is required. Existing workflow, v1/v2 history and checkpoint
bytes remain unchanged. BETA-CP-004/005/006 remain NO_GO; the 120-credit ceiling
remains in effect.

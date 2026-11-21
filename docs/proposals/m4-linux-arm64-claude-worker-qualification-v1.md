# M4 Linux ARM64 Claude worker qualification

**Proposed source-only plan. Provisioning and execution held.**

Use a dedicated Linux ARM64 VM on the M4 as a separate qualification
candidate for the owner's existing Claude subscription. Claude Code
documents client-managed file storage on Linux, and Apple documents
ARM64 Linux guests on Apple silicon. This proposal preserves the
[macOS Keychain hold](m4-system-keychain-enforcement-v1.md). The human
Anthropic answer for the pinned macOS login remains pending.

The candidate takes the no-inference startup proof first. Qualification
of this route requires acceptance of the exact guest boundary and owner
sign-in procedure under [ADR 0022](../decisions/0022-one-run-existing-account-coordination-review.md).
Review applicable Anthropic terms for the proposed use of the stock client.
The owner signs in directly to Anthropic through the stock client. DOSAI
receives typed, bounded results and handles no provider credentials.

[Linux credential storage](https://code.claude.com/docs/en/authentication#credential-management) ·
[Anthropic stock-client terms](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use) ·
[Apple Linux virtualization](https://developer.apple.com/documentation/virtualization/creating-and-running-a-linux-virtual-machine)

## Reviewed source pin

| Field | Value |
| --- | --- |
| Repository baseline | `af7343ca9a265f01612dc635887dc5707243eda0` |
| Claude Code candidate | Stock `2.1.314`, `linux-arm64` |
| Binary SHA-256 from signed manifest | `a66c0a8f5d0c87a439953d797985192bbcbaefbce2e0d7b2eaa8df30ef0f3ef2` |
| Manifest SHA-256 | `ded1c9a0a47ae65dc03165b0fab7b0bbd4aadd55de20b53c9f994308552d623d` |
| Release signing fingerprint | `31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE` |

The detached signature verified against the documented Anthropic key.
The manifest also matches the current macOS ARM64 binary pin. The
Linux binary, guest image, and runtime have yet to be obtained or
tested. Pin the exact M4/OS build, guest image and kernel, VM settings,
supervisor and worker versions, resource limits, and maximum lifetime
before seeking any execution approval. Use native ARM64 with no emulation.

[Release manifest](https://downloads.claude.ai/claude-code-releases/2.1.314/manifest.json) ·
[Vendor signature procedure](https://code.claude.com/docs/en/setup#verify-the-manifest-signature)

## Qualification sequence

1. **Isolated synthetic guest.** After separate approval, use a dedicated
   disposable VM and non-admin guest account with an empty workspace.
   Qualify the pinned guest under the Mac workload gate. Keep host files,
   clipboard, keychains, browser state, credential stores, and repository
   mounts outside the guest. Keep network, including guest loopback,
   blocked during the worker proof. Test absent shared devices, escape
   boundaries using synthetic file and connection canaries, subprocess
   denial, and exact instance, worker and process-start identity.
2. **Owner-only sign-in, separately approved.** Enable only the reviewed
   vendor-auth path for the owner to sign in in the guest. Keep the
   supervisor and model worker inactive during sign-in. Use a dedicated
   browser profile and stock CLI. Keep any vendor-created credential file
   in the private guest profile. Verify only metadata, owner-only access,
   stable file identity, and no copies, links, shared mounts or API-key
   fallback. Preserve all host Keychain and billing settings. Hold on
   unexpected networking, credential storage or authentication mode.
3. **Network-denied startup and Stop.** Remove the guest's external network
   attachment and verify guest restrictions, including loopback, before
   startup. Check cached subscription status and the fixed startup handshake
   with zero inference requests. Bind the result to the approved VM,
   guest profile, stock binary, and pinned process start identity.
   Exercise Stop before and after readiness. Require revocation, owned
   process exit, rejection of late output, and verified cleanup. Keep the
   first proof entirely inside the guest. Export only a sanitized receipt.
4. **Separate bridge qualification before any live review.** A later
   host-to-guest route must prove fresh session binding, protected peer
   identities, bounded schemas, replay rejection and revocation under
   [ADR 0006](../decisions/0006-authenticated-packet-transport.md).
   A guest socket, port, or text output alone grants zero authority.
   Effective tool access, provider egress, verified spend, and fresh
   explicit local owner approval remain separate gates.

## Offline fixtures

Run with the repository's pinned Node 24.18.0 from the repository root.

```sh
node --test tests/coordination/m4-linux-arm64-claude-worker.test.mjs \
  tests/coordination/m4-linux-arm64-claude-qualification-runner.test.mjs
```

The fixture checks a synthetic startup trace and rejects altered guest or
worker identity, missing isolation controls, unsafe sign-in and startup
transitions, Stop ordering and replay failures, and forged receipt authority.
A matching trace leaves guest execution, sign-in and live launch held and
adds zero builder receipts. This suite runs entirely in memory.

The [source runner](../../tools/local-coordination-pilot/m4-linux-arm64-claude-qualification-runner.mjs)
rehearses six ordered stages against the fixture baseline merged in #67.
It stops at missing, contradicted, unavailable, or mismatched observations.
An in-memory digest binds each row to the same synthetic case, guest, profile,
file identity, distinct process starts, and pinned source and artifact digests.
The digest is only a correlation check. A complete rehearsal still reports
`HOLD` at `PHYSICAL_GUEST_QUALIFICATION`.

To read the source-only status on Node 24.18.0, run the command below.
The entry point reports `HOLD` with exit code 2. It reads no stdin and accepts
no arguments, driver, or credential path. Exit code 1 means invalid invocation.

```sh
node tools/local-coordination-pilot/m4-linux-arm64-claude-qualification-runner.mjs
```

## Guest isolation collectors

The [collector source](../../tools/local-coordination-pilot/m4-linux-arm64-guest-isolation-collectors.py)
projects bounded, read-only Linux `/proc/thread-self` metadata. It checks a
reviewed task ID, start ticks, and mount, network and user namespaces before
and after sampling. Its report contains fixed status labels for user/group
and restriction flags, mount review indicators, and interface inventory.
It discards the projection if identity changes or a required input is
unavailable or malformed. Raw records, paths, interface names and IDs stay
out of the report.

The report always holds physical qualification. Restriction flags alone
leave effective syscall policy unverified. Mount and interface listings
also leave host-file, device, clipboard, egress and loopback isolation
unverified. A later approved harness must pin the VM and collector and
check independent host configuration and effective denial with positive
controls. The collector has no command-line entry point or runtime wiring.

[Linux proc metadata](https://docs.kernel.org/filesystems/proc.html) ·
[Mount namespace records](https://man7.org/linux/man-pages/man5/proc_pid_mountinfo.5.html)

Run the offline collector fixtures from the repository root. The tests
substitute all Linux metadata reads and require no Linux guest.

```sh
python3 -B tests/fixtures/coordination/m4-linux-arm64-guest-isolation-collectors-test.py
```

## Guest isolation canary harness

The [source harness](../../tools/local-coordination-pilot/m4-linux-arm64-guest-isolation-canary-harness.py)
asks an offline fixture observer for four checks in order. It rehearses a
synthetic host-file read, egress connection, loopback connection and
subprocess attempt. Each uses a reachable control before and after one
attempt from the restricted fixture identity. A failed control, unexpected
reachability, inconclusive denial or mismatched observation stops the
rehearsal. A refused connection, missing target or timeout is inconclusive.

Each reply is bound to its position, role, process start and a challenge
derived from the synthetic run, guest generation and configuration digest.
This correlation can reject mismatched replies within the rehearsal. It
provides no attestation or persistent replay protection. The report always
holds physical qualification and adds zero builder receipts.

The source-only observer in the same module projects typed probe and policy
records into harness replies. It checks the same reviewed target digest on
both control legs and the restricted leg, exact operation success markers,
and process identity before and after the attempt. A restricted permission
error produces a modeled denial only when a separate policy record matches
that attempt, target and configuration. Other errors remain inconclusive.
Out-of-order or replayed requests and failed probes close the observer
for that rehearsal.

The [source probe driver](../../tools/local-coordination-pilot/m4-linux-arm64-guest-isolation-canary-probe-driver.py)
implements the four fixed probes through injected system operations. It
checks the owner-only file identity before reading and checks it again after
the bounded read. It uses fixed numeric IPv4 peers and checks the exact marker
within one deadline per probe. The subprocess check asks for a supervisor-owned
observation bound to the pinned executable and deadline, with cleanup verified.
The driver accepts no command, path, address, or environment from a canary
request. Permission errors remain raw outcomes for the observer to evaluate.

The driver module also defines inactive Linux ARM64 bindings for the fixed
file and TCP operations. Preparation checks the platform and binds one
canary to the preparing thread for one attempt. Before the clock read, file
operation, socket operation or exec observation, the binding requires an
active scope from the trusted in-process supervisor. Descriptor and socket
cleanup stays available after revocation. The binding passes the pinned
executable digest and deadline to the supervisor-owned subprocess probe.

The supervised rehearsal in the harness binds each attempt to its sequence,
supervisor generation, target, process start, and monotonic deadline. It checks
the same scope before preparation, before the attempt, during guarded
operations, and before consuming evidence. The native binding uses the earlier
of the driver's budget and the supervisor deadline. Stop, scope drift, or an
expired result prevents subsequent attempts and policy reads.

The rehearsal revokes the attempt's local guard before requesting cleanup,
including after partial preparation or failure. It accepts canary evidence
only after cleanup matches the attempt binding. Missing or uncertain cleanup
produces a quarantined rehearsal and holds the result. Tests exercise the
supervisor and native binding together with substituted operations.

The source-only watchdog accepts serialized timer pulses and a Stop for one
registered attempt. It revokes the attempt before requesting termination. The
same 250 ms grace period as the capsule supervisor bounds escalation to one
force request, subject to the registered cleanup deadline. An unavailable or
rolled-back clock also revokes, requests force, and quarantines the rehearsal.
The watchdog consumes already available cleanup evidence so an absent verifier
cannot delay escalation.

Cleanup requires a fresh inventory from the separately bound verifier for the
same capsule, watchdog generation, attempt, and latest revocation or force
fence. The inventory must show quiescence and zero owned processes, mounts,
sockets, descriptors, temporary files, leases, and brokered resources. Missing,
stale or mismatched evidence keeps cleanup uncertain. Expiry quarantines the
rehearsal and closes it to late evidence. The existing supervisor rehearsal
can consume the verified cleanup readback and still discard results after Stop.

The [timer and transport source](../../tools/local-coordination-pilot/m4-linux-arm64-guest-isolation-canary-watchdog-transport.py)
adds an absolute, one-shot Linux ARM64 monotonic timer. The dispatcher consumes
one expiration and samples the current clock before advancing the watchdog and
arming the next attempt, grace, or cleanup deadline. Timer failures revoke the
attempt and request force through the watchdog's existing quarantine path.

The transport uses separate, preconnected Unix sequenced-packet lanes for
graceful and force requests. A fixed authenticated frame binds the operation,
session nonce, direction and registered attempt digest. Each lane submits at
most one frame without blocking. The receiver checks force first and rejects
truncation, ancillary data, tampering and stale bindings. An accepted frame
requests termination. Cleanup still requires the independent inventory.

Endpoint and session enrollment in the same module checks an immutable
ownership record for both roles, including their process generations and
start identities, the four socket identities in role and lane order, and the
registered attempt digest. It checks Linux peer credentials for each preconnected
socket. The kernel credentials describe connection establishment, so enrollment
also requires independently registered process-start and endpoint ownership
readback. The two roles and their socket identities must be distinct.

Enrollment is one attempt per prepared request and rechecks ownership, sockets,
and the monotonic admission deadline before publishing either role. The nonce
and ephemeral MAC key are generated only after the first successful verification.
Failure after preparation retires any unpublished roles. Retirement disables
both roles while the registered resource owner handles physical cleanup.
The admission deadline governs enrollment. The future trusted owner must retire
the enrolled session on role loss or after reconciling the attempt so the
bound reduce-only Stop path remains available during cleanup.

The [owned-capsule terminator](../../tools/local-coordination-pilot/m4-linux-arm64-guest-isolation-canary-watchdog-terminator.py)
reads the enrolled transport for the exact registered attempt digest. It
requires fresh ownership readback that the capsule is revoked, the subtree is
owned, and the watchdog and terminator are outside it. Graceful termination
uses bounded, pinned pidfs-backed process descriptors. Force checks the
preopened write-only `cgroup.kill` handle against the fixed control in the
pinned cgroup v2 directory. It stays available if graceful membership has
changed and cgroup ownership still matches. Both paths hold private descriptor
copies for the operation and close them afterward. Delivery and cleanup remain
separate evidence. A partial or failed request leaves delivery uncertain.

The [independent cleanup collector](../../tools/local-coordination-pilot/m4-linux-arm64-guest-isolation-canary-harness.py)
runs outside the serialized watchdog turn. It requires the exact revoked,
quiesced scope and a fresh, complete inventory of its mounts, sockets,
descriptors, temporary files, leases, and brokered resources. Each snapshot
is bracketed by readbacks of the same cleanup fence and by two
`populated 0` reads from `cgroup.events`. The reader checks the pinned
cgroup v2 directory and the fixed, read-only event file on private descriptor
copies. The watchdog binding, capsule generation, and event registration
digest must all match before the reader touches the descriptors.

Linux reports live processes recursively through `populated`. The six other
resource classes each require their own counts from the registered inventory
source. A termination receipt supplies no inventory evidence. A nonzero count
keeps cleanup uncertain. Missing, stale, inconsistent, or out-of-deadline
readbacks produce no inventory.

The source-only cleanup registry supplies separate owner and read-only verifier
ports for the collector. The trusted owner creates one registry, with a fresh
generation for the exact pinned capsule, before any resource effect. Every
resource writer reserves one of 64 slots before beginning. Stop closes new
admission under the same lock, including when its timestamp is invalid. The
fence becomes readable only after every reserved writer has finished. All
finished reservations count toward cleanup, including failed or partial
acquisitions whose absence has yet to be verified.

At settlement, the writer binds the ticket to the resource kind, capsule
generation, registered reader generation and authority, exact slot, and
resource instance. For mounts, sockets, descriptors, and temporary files,
the authority and slot must identify the owning mount namespace, socket
owner, process instance, or directory and the exact resource location
within it. For leases and brokered resources they identify the owning
service and its exact record. The fixture uses opaque identifiers for those
pins. The same slot cannot bind twice. Partial acquisitions with unknown
identity remain counted.

The registry selects the registered reader for the bound kind and sends a
fresh probe under the exact quiescence fence. To clear the ticket, the
reader must return a complete observation for that probe and binding, with a
vacant slot and zero references to the owned instance. A replaced slot, a
retained reference, an incomplete result, or an out-of-deadline observation
leaves the count in place. The registry rechecks the fence and ticket after
the read. The reader runs outside its lock so a force-fence advance can
invalidate an in-flight result. The registry never reopens for the capsule.

The absence readers project two independently inventoried tables for each of
the six resource classes. The first lists occupied slots, including replacements.
The second covers references outside those slots. Each table is limited to 256
rows with unique locators. The reader selects the pinned source and requires
complete tables for the same probe, authority and cleanup fence. It derives
vacancy and reference counts from the rows. A reference in a different slot
still counts. Missing or ambiguous census coverage supplies no readback.

Physical integration must bind the opaque pins to real owned identities,
provide complete kernel or service inventories for each resource class,
and enforce exclusive admission through verification. Linux can remove a
lazily unmounted filesystem from the mount table while it is still busy.
An unlinked file can also remain open. Physical collectors must establish
full reference coverage before reporting either resource absent.
[Linux unmount behavior](https://man7.org/linux/man-pages/man2/umount.2.html) ·
[Linux unlink behavior](https://man7.org/linux/man-pages/man2/unlink.2.html)

The source-only temporary-file observer covers one fixed fixture entry,
`fixture-canary.tmp`, and one pre-enrolled descriptor table. It binds the
private file directory, original regular file, and process's procfs
descriptor directory by device and inode. It checks the slot without
following links, opens a fresh read-only view of the pinned descriptor
directory and follows only enumerated numeric procfs descriptor links for
metadata. It reads no file contents. Each matching descriptor retains a
reference even after the fixed entry disappears. A replaced entry, a changed
pin, a descriptor that disappears mid-scan, or more than 256 entries
leaves cleanup held.

Descriptor-table enrollment takes a preopened, pinned procfs process directory
and the preopened descriptor directory. It checks the same device and inode
at the fixed `fd` child of the process directory. A bounded read of its
`stat` record verifies the registered PID and start time. Both checks repeat
before enrollment is accepted. They reject PID reuse, a replaced table, a
retired process, and unavailable or malformed procfs evidence.
[Linux process descriptor entries](https://man7.org/linux/man-pages/man5/proc_pid_fd.5.html) ·
[Linux process stat fields](https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html)

Before and after every temporary-file inventory read, the coverage verifier
requires fresh readback from the registered policy authority. Admission must
be revoked, the enrolled table must have been the only possible descriptor
owner since file creation, and alternate names, descriptor transfer, file
mappings, and kernel holds must have been excluded. Each policy readback is
bound to its own challenge and the exact enrollment. Coverage is withheld if
any control is unknown, a readback is replayed, or the kernel identity changes.

The [native reference filter](../../tools/local-coordination-pilot/m4-linux-arm64-guest-isolation-canary-reference-filter.c)
is for a dedicated, single-threaded temporary-file fixture holder. It has no
launcher or runtime caller. It sets `no_new_privs` and installs the exact
ARM64 seccomp program with thread synchronization. Installation failure
exits the holder. The program allows close, exit, and one-byte reads from
the fixed control descriptor 3. Other syscalls terminate the process.
This prevents the holder from creating alternate names, new descriptors,
processes, mappings, transfers, or kernel-retained file references after
installation. A trusted bootstrap must establish exclusive custody from
file creation through installation and keep the control pipe at descriptor
3 distinct from the tracked file. A separate boundary must exclude
references and descriptor acquisition by other processes and verify there
is no pending close or deferred release of the tracked file.
[Linux seccomp filter semantics](https://docs.kernel.org/userspace-api/seccomp_filter.html) ·
[Linux seccomp installation](https://man7.org/linux/man-pages/man2/seccomp.2.html)

The readback source binds the exact filter digest and exclusive bootstrap
from a trusted installation receipt to the enrolled process. It compares
that receipt with bounded, independently read procfs status from the same
process instance. It requires one thread, no tracer, `NoNewPrivs: 1`, and
one active filter in filter mode. Procfs reports mode and filter count. The
trusted installation receipt supplies the identity of the filter bytes.
Fresh records of the revoked fence, external reference exclusion, and
close completion are required on both sides of the status read. Missing
evidence holds cleanup.
[Linux process status fields](https://man7.org/linux/man-pages/man5/proc_pid_status.5.html)

Offline tests interpret the instruction words from the C source and exercise
the full temporary-file cleanup path with substituted kernel operations.

The [native holder bootstrap](../../tools/local-coordination-pilot/m4-linux-arm64-guest-isolation-canary-holder-bootstrap.c)
accepts only the registered owner-private directory and two distinct
anonymous pipes. It separates the holder's descriptor table, closes
unregistered descriptors, rechecks the pins, and creates the fixed file
with exclusive, no-follow creation. The holder checks that it owns a regular
single-link file and drops its directory descriptor before installation.
It writes one fixed 112-byte setup frame with the public launch challenge,
PID, and directory, file, control-pipe, and setup-pipe pins. The frame
reports setup only. The holder closes its setup writer after installation
and uses only the existing close, exit, and one-byte control-read rules.
[Linux descriptor-table separation](https://man7.org/linux/man-pages/man2/close_range.2.html) ·
[Linux pipe EOF semantics](https://man7.org/linux/man-pages/man7/pipe.7.html)

The source-only setup collector uses a preopened, exclusively owned anonymous
pipe read end. It checks the pinned device and inode, pipe filesystem, read
access, and nonblocking flags. A zero-timeout poll leaves the stream untouched
until hangup. After hangup, the collector requires precisely 112 bytes and a
zero-byte read, then rechecks the descriptor. A short frame, extra byte,
wrong launch nonce, poll error, or unavailable read leaves setup unverified.
The adapter checks every field against the registered frame, holds it within
the monotonic deadline, and releases it once to the same registration.
The trusted launcher must keep read ownership exclusive and prevent other
processes from duplicating or changing the pipe handles.
[Linux poll and pipe hangup](https://man7.org/linux/man-pages/man2/poll.2.html)

The source-only launch evidence collector keeps a baseline while the
trusted launcher blocks bootstrap and holds exclusive custody of the
empty fixture slot, directory, and two pipes. The baseline requires the
registered process to have one thread, no tracer, and zero active filters.
After bootstrap, each receipt-side read checks that the same custody
interval still covers the launch and the same process has one active filter
and `no_new_privs`. A missing baseline, custody change, replay, stale clock,
or process drift withholds evidence. The collector cannot release bootstrap.

The Linux ARM64 process reader checks the pinned proc directory and start
time, then resolves only the fixed procfs `exe` entry for metadata. It
matches that target to a preopened, read-only sealed image and hashes the
complete admitted bytes with a 4 MiB cap. This candidate admits a static
little-endian ARM64 ELF without an interpreter or dynamic program segment.
It rechecks process and executable identity after the status sample. A
separately trusted build manifest must bind the executable digest to the
reviewed filter digest. Status supplies mode and count, and the manifest
supplies the filter's identity.
[Linux process executable link](https://man7.org/linux/man-pages/man5/proc_pid_exe.5.html) ·
[Linux file seals](https://man7.org/linux/man-pages/man2/F_GET_SEALS.2const.html) ·
[ELF program headers](https://man7.org/linux/man-pages/man5/elf.5.html)

The [v1 holder build manifest](m4-linux-arm64-holder-build-manifest-v1.json)
pins the bootstrap and filter C sources from the PR #88 merge and the
encoded filter words. It records an offline native Linux ARM64 build
contract for this temporary-file fixture. The output must conform to the
launch reader's static ELF, size, and sealing checks. The proposed C
compile and link flags select a static, non-PIE executable. The reviewed
recipe must preserve the filter symbol for independent inspection.
[GCC link options](https://gcc.gnu.org/onlinedocs/gcc/Link-Options.html)

The manifest's SHA-256 is
`5d115ca42e5d514db5ead1ff56310a52af6d8a4aa97ffe533bba9c0cf257ad4a`.
The offline validator requires the exact reviewed manifest digest and
source revision as inputs. It independently hashes both supplied sources
and encodes the filter words from C. Only the held declaration can pass
this validator. Its entry-input, pinned toolchain closure, and artifact
receipt fields remain unset.

A future reviewed build receipt must bind the source manifest digest,
source revision, complete build-input digest, executable digest and size,
and digest of the embedded `reference_filter` bytes independently extracted
from the image. The build-input digest must cover the admitted entry shim,
compiler, assembler, linker, sysroot, and exact offline recipe. A separate
review verifies these inputs and the linked artifact before the launch
evidence collector can use its image digest. No builder qualification or
launch authority follows from the source manifest.

The [holder entry shim](../../tools/local-coordination-pilot/m4-linux-arm64-guest-isolation-canary-holder-entry.c)
is a source candidate for the future reviewed build. Its SHA-256 is
`d74a9a47f6479fe9141678ff885544f729919f16d4bfc9d2a99d6531546b38cf`.
It accepts the fixed holder program name with no additional arguments and
an empty environment. It reads one read-only sealed plan from descriptor
6, checks the 96-byte size and EOF, and closes the descriptor. The
little-endian plan carries the `DOSAIE01` marker, launch nonce, PID, and
directory, control-pipe, and setup-pipe pins. The encoder uses the existing
fixture launch plan, and the offline ABI test compares the entry and
bootstrap C declarations.
[Linux memory-file seals](https://man7.org/linux/man-pages/man2/memfd_create.2.html) ·
[Linux positional reads](https://man7.org/linux/man-pages/man2/pread.2.html)

The shim verifies the expected process leader and pins the blocking
anonymous control-pipe read end. It waits for one `B` byte before entering
bootstrap. The trusted launcher must supply the sealed plan, the empty
environment, and the exclusive writer, and it must hold the startup
deadline outside the holder. It sends `B` only after the parked process
baseline and all launch approvals are accepted. The later `C` byte retains
its existing close role. Failed admission or pipe EOF exits the shim before
bootstrap. The shim and offline encoder supply no launch authority.

The [v2 holder build manifest](m4-linux-arm64-holder-build-manifest-v2.json)
binds the merged entry shim with the prior bootstrap and filter sources.
It preserves the exact v1 manifest digest and the existing static ELF
output contract. Its recipe stages only those three sources, declares
three compilation steps and one static link as direct arguments, and
names the staged compiler, tool prefix, and sysroot. It declares a clean
environment on a disposable native ARM64 build root. The recipe requires
physical enforcement of filesystem and toolchain closure. GCC search
options alone do not prove it.
[GCC search and sysroot options](https://gcc.gnu.org/onlinedocs/gcc/Directory-Options.html)

The v2 manifest SHA-256 is
`d64c75e57e71ca4ff11795f3ebf087a457eb8faaa99ffc4d4bd8e3e72ab87a3e`.
The recipe SHA-256 is
`c0c9d991e2da8966a2d8ab53f73935b7465ee3d998c848b52ad85a67350e0272`,
computed from compact ASCII JSON with sorted keys. Source-only verification
checks both digests and all three source pins. The native toolchain closure,
artifact receipt, build approval, and launch approval remain held.

The [toolchain inventory verifier](../../tools/local-coordination-pilot/m4-linux-arm64-guest-isolation-canary-holder-toolchain-closure.py)
binds a proposed lock to the exact v2 manifest and recipe digests. It
requires an independently pinned lock digest and matches it against the
complete, write-fenced synthetic inventory. Each regular file has a
canonical staging path, size, SHA-256, and executable flag. File aliases
must resolve to listed regular files inside the staged toolchain. Sysroot
aliases must also remain inside the sysroot. The verifier rejects absolute
or escaping links, loops, directory aliases, and extra, missing, or changed
entries. It expects the staged GCC driver, `cc1`, `as`, `collect2`, `ld`,
the required header and startup inputs, and the static C and GCC runtimes.
The complete inventory also binds supporting files such as host-side loader
dependencies. It returns a separate sysroot digest and a held status.

This verifier performs no filesystem reads or executions. The offline
tests supply synthetic files and aliases. A future native readback must
measure the complete staged inventory and prove that compiler lookup and
host-runtime resolution stay inside the disposable build root. The v2
manifest's toolchain field remains unset until that toolchain is selected
and independently reviewed.

The [Debian 13 ARM64 toolchain candidate](m4-linux-arm64-holder-toolchain-candidate-v1.json)
pins the Debian-published metadata for the native GCC 14 driver and
frontend, binutils, glibc development and runtime packages, Linux UAPI
headers, and the GCC development runtime. Those seven package roots total
37,227,976 archive bytes. The package file lists identify the driver,
`cc1`, `collect2`, assembler, linker, headers, startup object, static
archives, and loader candidates for the staging layout.
[GCC driver files](https://packages.debian.org/trixie/arm64/gcc-14-aarch64-linux-gnu/filelist) ·
[Frontend files](https://packages.debian.org/trixie/arm64/cpp-14-aarch64-linux-gnu/filelist) ·
[Binutils files](https://packages.debian.org/trixie/arm64/binutils-aarch64-linux-gnu/filelist) ·
[Glibc development files](https://packages.debian.org/trixie/arm64/libc6-dev/filelist) ·
[Glibc runtime files](https://packages.debian.org/trixie/arm64/libc6/filelist) ·
[UAPI header files](https://packages.debian.org/trixie/all/linux-libc-dev/filelist) ·
[GCC runtime archive](https://packages.debian.org/trixie/arm64/libgcc-14-dev/filelist)

The candidate SHA-256 is
`b499f1cecd84044854631bd702dd33d33666d1fcabcfbf706d27317d62735f0e`.
It records the versions, archive sizes, and SHA-256 values published by
Debian's package pages.
[GCC package](https://packages.debian.org/trixie/arm64/gcc-14-aarch64-linux-gnu/download) ·
[Frontend package](https://packages.debian.org/trixie/arm64/cpp-14-aarch64-linux-gnu/download) ·
[Binutils package](https://packages.debian.org/trixie/arm64/binutils-aarch64-linux-gnu/download) ·
[Glibc development package](https://packages.debian.org/trixie/arm64/libc6-dev/download) ·
[Glibc runtime package](https://packages.debian.org/trixie/arm64/libc6/download) ·
[UAPI header package](https://packages.debian.org/trixie/all/linux-libc-dev/download) ·
[GCC runtime package](https://packages.debian.org/en/trixie/arm64/libgcc-14-dev/download)

The [signed ARM64 dependency candidate](m4-linux-arm64-holder-debian-dependency-candidate-v1.json)
records the November 21, 2026 metadata check. It pins the exact Debian
`trixie` and `trixie-security` Release digests, detached signature digests,
three reviewed Debian 13 signers, and `binary-arm64` and `binary-all`
`Packages.xz` digests for both suites. In an isolated temporary directory,
the check compared the public key material to the reviewed fingerprints
and hashes, split the detached signature packets, and used `gpgv` with only
the matching reviewed key for each of the three required signatures over
the exact Release bytes. The signature bundles also carried Debian 12
signatures. The candidate derives its trust from the Debian 13 signatures.
The check matched the compressed index sizes and SHA-256 values in those
Release files to the four downloads by hash. The security Release had a
validity deadline at observation time. The main Release did not publish
one. This record identifies the observed snapshot and cannot establish
freshness for future staging.

All seven roots match the authenticated package records. The frozen set
includes 35 packages and 105 declared dependency clauses, totaling
52,851,844 package archive bytes according to the indexes. The
[offline resolver](../../tools/local-coordination-pilot/m4-linux-arm64-guest-isolation-canary-holder-debian-dependencies.py)
uses the exact roots, evaluates `Depends` and `Pre-Depends` recursively, and
checks `Breaks` and `Conflicts` within the chosen set. It reads preverified
Deb822 records and applies Debian version ordering to concrete providers.
The fixture suite replays the pinned projection offline. Optional
relationships, the implicit Essential base, and file-level loader
resolution are outside this declared-dependency count.
[Debian package relationships](https://www.debian.org/doc/debian-policy/ch-relationships.html)

The [package-hash observation](m4-linux-arm64-holder-debian-package-hash-observation-v1.json)
records the matching byte counts and hashes for all 35 archives.
The [native staging and ELF plan](m4-linux-arm64-holder-native-staging-and-elf-plan-v1.md)
defines the future payload, custody, and loader checks. Physical staging,
ELF loader resolution, and approval of the staged lock remain held.

The [v1 staging allowlist](m4-linux-arm64-holder-staging-allowlist-v1.json)
pins the 11 previously reviewed candidate paths against the merged staging
plan, build manifest, toolchain candidate, signed dependency candidate,
and package-hash observation. Each row names one exact package member
and staged destination.

The [member observation](m4-linux-arm64-holder-staging-member-observation-v1.json)
binds the local measurement receipt to the exact reader, allowlist, and
PR #96 merge. All seven archives matched their pins. The reader measured
10 files and one symlink from those archives in memory. The observation
records a SHA-256 over the raw receipt and over sorted compact ASCII JSON
rows in package, member path, staged path, kind, size, mode, SHA-256, and
link target order. These measurements remain held for review.

The [v2 staging allowlist](m4-linux-arm64-holder-staging-allowlist-v2.json)
adds `usr/bin/aarch64-linux-gnu-ld.bfd` from the same pinned ARM64 binutils
archive at `toolchain/bin/aarch64-linux-gnu-ld.bfd`. The observed `ld`
symlink retains its literal relative target `aarch64-linux-gnu-ld.bfd` in
the proposed layout. The target file's type, mode, size, and SHA-256 still
require measurement. Reviewed member pins, remaining native runtime
paths, and the staged toolchain lock remain held.
[Debian ARM64 binutils file list](https://packages.debian.org/trixie/arm64/binutils-aarch64-linux-gnu/filelist)

The [bounded in-memory archive reader](../../tools/local-coordination-pilot/m4-linux-arm64-guest-isolation-canary-holder-deb-reader.py)
checks the same immutable archive bytes against the exact signed size and
SHA-256 before parsing. It admits the Debian 2.0 container, reads plain or
integrity-checked single-stream xz data tar, and skips the control payload
as opaque bytes. It bounds each archive to 24 MiB, the expanded tar to
96 MiB, the xz decoder to 64 MiB, and the data tar to 16,384 members with a
64 MiB cap per member. The reader validates the whole data tar and only
returns measurements for explicitly selected members. Projection requires
the exact reviewed member metadata and rejects path collisions, including
overlaps, and aliases that escape, cycle, or change their source target.
Unsupported compression, extended tar headers, unapproved member modes,
and malformed data stop the check. The synthetic fixtures cover acceptance
of the exact linker target and refusal of a missing or redirected target.
[Debian binary package format](https://manpages.debian.org/trixie/dpkg-dev/deb.5.en.html)
[Debian archive authentication](https://manpages.debian.org/trixie/apt/apt-secure.8.en.html) ·
[GCC dependencies](https://packages.debian.org/trixie/gcc-14-aarch64-linux-gnu) ·
[Binutils dependencies](https://packages.debian.org/trixie/binutils-aarch64-linux-gnu)

The single-attempt receipt issuer requires the exact setup frame and EOF
on the registered pipe, the trusted executable and filter digests, and
exclusive bootstrap evidence with no inherited filters. EOF can also
result from early exit. The issuer checks active filter status on the same
enrolled process, confirms the original file is present with one holder
descriptor, and rechecks enrollment and launch evidence before the
monotonic deadline. Only then does it issue the existing filter receipt.
Offline tests exercise the collectors and issuer with substituted operations
and check the ordering in the C source. The native holder has no launcher.
Physical launch admission and custody evidence, the admitted native build
manifest, external reference exclusion, and ARM64 kernel validation remain held.

The fixture registry is in memory. Losing it leaves cleanup uncertain and
requires reconciliation.

The qualification tooling has no runtime caller. Physical
integration requires separate review and approval for the guest and scope
source, fixture directory, non-forwarded peers, owned subprocess probe, and
independent policy evidence. Physical watchdog use requires an independent
dispatcher, trusted enrollment and retirement wiring, delegated capsule-only
control handles, and verified physical writer admission and resource accounting.
Before activation, verify live role ownership at connection establishment,
distinct owned socket pairs, and the exact guest kernel's peer credentials,
pidfd identity and cgroup v2 behavior. Offline results leave physical
qualification held.

[Linux read-only open flags](https://man7.org/linux/man-pages/man2/open.2.html) ·
[IPv4 special-purpose registry](https://www.iana.org/assignments/iana-ipv4-special-registry/iana-ipv4-special-registry.xhtml) ·
[Python socket operations](https://docs.python.org/3/library/socket.html) ·
[Python ephemeral randomness](https://docs.python.org/3/library/secrets.html) ·
[Linux timer descriptors](https://man7.org/linux/man-pages/man2/timerfd_create.2.html) ·
[Unix sequenced-packet sockets](https://man7.org/linux/man-pages/man7/unix.7.html) ·
[Linux pidfd signaling](https://man7.org/linux/man-pages/man2/pidfd_send_signal.2.html) ·
[Linux positional reads](https://man7.org/linux/man-pages/man2/pread.2.html) ·
[Linux cgroup v2 controls](https://docs.kernel.org/admin-guide/cgroup-v2.html)

```sh
python3 -B tests/fixtures/coordination/m4-linux-arm64-guest-isolation-canary-harness-test.py
python3 -B tests/fixtures/coordination/m4-linux-arm64-guest-isolation-canary-observer-test.py
python3 -B tests/fixtures/coordination/m4-linux-arm64-guest-isolation-canary-probe-driver-test.py
python3 -B tests/fixtures/coordination/m4-linux-arm64-guest-isolation-canary-native-bindings-test.py
python3 -B tests/fixtures/coordination/m4-linux-arm64-guest-isolation-canary-supervisor-test.py
python3 -B tests/fixtures/coordination/m4-linux-arm64-guest-isolation-canary-watchdog-test.py
python3 -B tests/fixtures/coordination/m4-linux-arm64-guest-isolation-canary-watchdog-transport-test.py
python3 -B tests/fixtures/coordination/m4-linux-arm64-guest-isolation-canary-watchdog-enrollment-test.py
python3 -B tests/fixtures/coordination/m4-linux-arm64-guest-isolation-canary-watchdog-terminator-test.py
python3 -B tests/fixtures/coordination/m4-linux-arm64-guest-isolation-canary-cleanup-inventory-test.py
python3 -B tests/fixtures/coordination/m4-linux-arm64-guest-isolation-canary-cleanup-registry-test.py
python3 -B tests/fixtures/coordination/m4-linux-arm64-guest-isolation-canary-resource-absence-test.py
python3 -B tests/fixtures/coordination/m4-linux-arm64-guest-isolation-canary-temp-file-test.py
python3 -B tests/fixtures/coordination/m4-linux-arm64-guest-isolation-canary-holder-bootstrap-test.py
python3 -B tests/fixtures/coordination/m4-linux-arm64-guest-isolation-canary-launch-evidence-test.py
python3 -B tests/fixtures/coordination/m4-linux-arm64-guest-isolation-canary-holder-build-manifest-test.py
python3 -B tests/fixtures/coordination/m4-linux-arm64-guest-isolation-canary-holder-entry-test.py
python3 -B tests/fixtures/coordination/m4-linux-arm64-guest-isolation-canary-holder-toolchain-closure-test.py
python3 -B tests/fixtures/coordination/m4-linux-arm64-guest-isolation-canary-holder-toolchain-candidate-test.py
```

## Qualification limits

A signed-in startup pass covers this Claude candidate only. An ARM64 guest
produces zero qualifying AMD64 receipts under [ADR 0018](../decisions/0018-native-linux-independent-builders.md).
Native-builder work continues in the [separate intake](p3-gce-native-amd64-desk-screen-v1.md).
Keep #52 and #53 in draft. This source plan authorizes no VM creation,
host or Keychain changes, account changes, model requests, or live run.

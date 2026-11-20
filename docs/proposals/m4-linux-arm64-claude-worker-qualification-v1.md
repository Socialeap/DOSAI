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
readbacks produce no inventory. The trusted owner must supply the resource
source and hold the admission fence against new processes and resource
writers across the snapshot and through verification.

The source has no command-line entry point or runtime caller. Physical
integration requires separate review and approval for the guest and scope
source, fixture directory, non-forwarded peers, owned subprocess probe, and
independent policy evidence. Physical watchdog use requires an independent
dispatcher, trusted enrollment and retirement wiring, delegated capsule-only
control handles, and trusted fence and resource inventory sources. Before
activation, verify live role ownership at connection establishment, distinct owned socket pairs, and
the exact guest kernel's peer credentials, pidfd identity and cgroup v2
behavior. Offline results leave physical qualification held.

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
```

## Qualification limits

A signed-in startup pass covers this Claude candidate only. An ARM64 guest
produces zero qualifying AMD64 receipts under [ADR 0018](../decisions/0018-native-linux-independent-builders.md).
Native-builder work continues in the [separate intake](p3-gce-native-amd64-desk-screen-v1.md).
Keep #52 and #53 in draft. This source plan authorizes no VM creation,
host or Keychain changes, account changes, model requests, or live run.

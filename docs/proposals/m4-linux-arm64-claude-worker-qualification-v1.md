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

## Qualification limits

A signed-in startup pass covers this Claude candidate only. An ARM64 guest
produces zero qualifying AMD64 receipts under [ADR 0018](../decisions/0018-native-linux-independent-builders.md).
Native-builder work continues in the [separate intake](p3-gce-native-amd64-desk-screen-v1.md).
Keep #52 and #53 in draft. This source plan authorizes no VM creation,
host or Keychain changes, account changes, model requests, or live run.

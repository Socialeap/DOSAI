# Two-Mac mutual TLS device test runbook v1

**Current decision — NO_GO for a device test.** This runbook is a source
proposal. The endpoint, drivers, activation wrapper, and local policy
bridge below are scoped to offline validation. A reviewed device launcher,
accepted P3 evidence, and fresh authorization for the exact devices and
session are required before a listener can be armed.

- **Baseline** — [PR #35](https://github.com/Socialeap/DOSAI/pull/35) merged into
  `main` at `81b4a6885b6abdc548bfad39019e3bffd159f552`. The fixture, launcher,
  and protocol files match the tested PR head `554626b27430178a500883d66b3da3021f2d3137`.
  That candidate passed eight native OpenSSL 3.6.4 test groups on the local
  arm64 Mac. It supplied no evidence from a two-device TLS connection.
- **Scope** — One attended session on a known private LAN. The M1 sends the
  fixed synthetic `SUMMARIZE_FIXTURE` proposal and the M4 receives it.
  Allocate at most three fresh one-shot ceremonies in a fixed order, with one
  handshake and at most one proposal each. The session stops on the first
  unexpected outcome. No retries or provider spend.
- **Development role** — Unclassified assistant.

The [v1 protocol](mac-lan-mtls-protocol-v1.md) sets the exact TLS profile,
framing, time limits and authenticated closure. The
[enrollment plan](mac-lan-peer-enrollment-plan.md) sets the two local
confirmations, fresh in-memory keys, pinning and revocation. The
[manual handoff evidence](mac-fixture-handoff-result.md) records the separate
local approval proof.

## Go/no-go before activation

All rows must pass in order. Capture the evidence privately before sending
the owner an activation request. A missing, stale, contradictory, or
unverifiable row is **NO_GO**.

| Gate | Evidence required |
| --- | --- |
| 1. Phase eligibility | The active [beta critical path](private-beta-operator-runbook.md) shows accepted BETA-CP-004 and BETA-CP-005 evidence and P3 exit. BETA-CP-004 requires two independent native Linux AMD64 builder receipts and the existing single-mount and writer-exclusion predicates. BETA-CP-005 requires formal P3 acceptance. P5 remains gated on P3. |
| 2. Reviewed device-test candidate | Review the exact immutable source revision and SHA-256 of each device artifact. Record native arm64, OS, compiler, protocol version and exact TLS-library identity for both Macs. Verify the artifact and configuration against those values. Run the existing offline checks on the exact candidate and exercise the candidate's transport boundary, local approval interlock and teardown offline before requesting activation. Require no app integration, automatic evaluation, privilege elevation, or installation of a service. A dependency or artifact mismatch blocks the run. |
| 3. Exact scope and cleanup | Identify the two devices, one existing private-LAN interface per device, the exact M4 unicast bind address and unprivileged port, the authorized M1 source address, operator and test window. Confirm that the reviewed candidate restricts bind and connection to those endpoints, stops on an unexpected peer, closes admission after one attempt and provides a local stop independent of transport and audit. Require the existing LAN path and free port. Stop if a permission prompt, firewall or router change, alternate interface, discovery, relay, or persistent credential setup is needed. Do not scan or try a different address or port. |
| 4. Owner authorization for this exact test | Obtain fresh explicit authorization for the merged candidate, artifact digests, endpoints and test window, the three named ceremonies and the one temporary M4 listener per ceremony. Approval is consumed by the authorized session. The owner attends both trusted local prompts and supervises the session. Pairing consent and approval of the synthetic evaluation are separate local decisions. |

BETA-CP-006 remains the representative full-beta workflow gate. A pass in
this narrow test cannot satisfy it or qualify either Mac as a native builder.
Today the [readiness report](private-beta-operator-runbook.md#sequential-release-gates)
returns exit 2 and `NO_GO`, with BETA-CP-004/005/006 open and zero of two
qualifying native builder receipts.

## Attended test after GO

1. **Confirm the preflight immediately before the first run.** Match the
   verified artifacts, approved targets and window. Record scoped pre-run
   evidence for the approved port and the exact test processes. Use the
   reviewed candidate's commands and limits from the activation packet. This
   runbook supplies no activation command because the candidate and targets
   have yet to be reviewed.
2. **Pair afresh for each scenario.** On the trusted local prompts, exchange
   only the public leaves and compare the full role-ordered certificate
   fingerprints, profile and fixed action. Both confirmations must be valid
   before opening the M4's temporary one-shot listener and connecting from
   M1. The authorized source address bounds the test. TLS still authenticates
   by the enrolled pins and roles. The transport uses the exact v1 profile,
   one frame, and authenticated closure, with no early data or resumption.
   Admission closes the receive window and creates at most one local review.
3. **Perform the scenarios in this order.** Before any new ceremony, verify
   cleanup and fresh fingerprints and confirmations. A missed deadline or an
   outcome different from the table ends the session.

   | Scenario | Owner action on the M4 | Required evidence |
   | --- | --- | --- |
   | 1. Local denial | After one authenticated proposal reaches local review, deny the fresh local plan. | Exactly one proposal, one local denial, zero grants, zero evaluations and zero external effects. |
   | 2. Local approval | Inspect the fresh plan after local preflight. Confirm it matches `SUMMARIZE_FIXTURE`, the approved data scope and zero external effects. Approve only that plan using the trusted local prompt. | Exactly one proposal and one explicitly approved synthetic evaluation. Verify the plan and local receipt correspond to the same review. Record the actual receipt assurance and `effects: NONE`. |
   | 3. Revocation before approval | After authenticated admission, revoke the pairing while local review is pending. Check locally that the pending review cannot proceed. | Review is invalidated and transport state is closed. Zero approvals, grants, evaluations and external effects for this ceremony. |

4. **Verify teardown after every scenario, including failure.** Stop the two
   exact owned test processes if still active. Verify the expected listener
   and connection are closed, the process identities have exited, and the
   test-owned run files and pending review are gone. The candidate must have
   no persistence path for credentials, pins, or session state. At session
   end, remove only the staged candidate files listed in the activation
   packet. Check only test-owned resources and the approved endpoint. Never
   kill unrelated processes or clear shared state. If cleanup is uncertain,
   end the session, preserve sanitized evidence for the owner, and skip
   remaining scenarios.

## Stop and record the decision

Stop immediately on scope or identity drift, a TLS or framing error, unplanned
prompt, pause, timeout, unintended effect, sensitive output, or uncertainty
about teardown. Use the reviewed local stop on both devices. Never retry
through a failure, reconnect, or switch transports within the authorized run.
Use the [security stop-work rules](../../SECURITY.md) if a trust boundary is
crossed or a secret is exposed.

The receiver's reviewed observations establish local admission. A sender's
clean TLS close carries no application acknowledgement or delivery claim. No
approval, grant, generic command, result or receipt flows over this connection.
Keep only the exact tested revision and artifact digests, device-role aliases,
scenario labels, stage dispositions, local receipt assurance, observed effect
count, and scoped cleanup result. Store reviewed evidence in an ignored local
path. Exclude addresses from shared reports, and exclude raw packets, private
keys, session identifiers, certificates, and approval transcripts from exports.

A test pass requires all three expected outcomes and verified teardown for
each ceremony. Record `NO_GO` on any missing or unexpected result. Even a
pass concerns this one fixture and these two devices. It grants no P5 exit,
deployment, full-beta, or production authority.

## Standalone candidate and offline evidence

The [endpoint candidate](../../tools/mtls-device-test/device-v1.h), based on
[merged PR #36](https://github.com/Socialeap/DOSAI/pull/36) at `0179400`,
implements independent M1 and M4 state machines using the same
[protocol primitives](../../tools/mtls-device-test/protocol-v1.h) as the
reference fixture. Each endpoint checks its own role-ordered certificate
comparison, exact private IPv4 scope and one-shot attachment. The driver
supplies scoped endpoint observations and elapsed monotonic time. The endpoint
processes only bounded encrypted bytes and explicit local events.

The M4 requires a complete authenticated frame, authenticated TLS closure,
and the driver's transport teardown before exposing one typed untrusted
proposal. A separate local interface binds a single plan digest and checks
denial, exact local confirmation, expiry, stop and policy invalidation. The
confirmation disposition has no grant or evaluation authority. The M1
reports delivery unknown after TLS closure.

From a clean checkout on the pinned arm64 OpenSSL host, run the reference,
endpoint, driver, and activation tests in the existing network-denied sandbox:

```sh
"$HOME/.local/bin/codex-heavy" /bin/sh tests/source-only/test-offline-mtls-v1.sh
```

The five candidate groups exercise real TLS over in-memory transport and
synthetic local decisions. They exercise the denial, confirmation and
revocation sequence without running fixture evaluation. The separate eight
reference groups cover wire-profile, replay, certificate and framing negatives.
The endpoint candidate has no bind, listen, connect, application import, or
durable receipt path. The source candidate supplies none of the pending
phase or device activation evidence.

## Connected-stream and local operator drivers

The [transport driver](../../tools/mtls-device-test/transport-v1.h) accepts one
owned stream, checks the observed endpoints against the paired scope, and
pumps bounded ciphertext in nonblocking turns. Partial writes retain their
pending bytes. The M4 waits for authenticated TLS closure, an empty output
buffer, and successful closure of the owned stream before offering review.
An unexpected endpoint, I/O or clock failure, close error, or deadline breach
ends the run. Local stop closes the owned stream and invalidates pending review.

The [local operator driver](../../tools/mtls-device-test/operator-v1.h) uses a
distinct terminal channel. It displays the exact scope and full role-ordered
certificate fingerprints for pairing. On M4 it accepts only a plan digest
from the trusted local policy caller. It displays the fixed synthetic action
and requires the exact local approval line or explicit denial. EOF, expiry,
loss of the foreground terminal, stop, policy invalidation or invalid input
fails closed. The resulting disposition gives no grant or evaluation authority.
No approval bytes travel through the transport.

The [macOS adapters](../../tools/mtls-device-test/macos-io-v1.h) adopt
already-open, exclusively transferred descriptors. They verify connected IPv4
TCP metadata, close-on-exec, nonblocking and safe-close flags, or the foreground
controlling terminal in canonical mode. They create no socket or terminal and
change no descriptor flags or persistent settings. The elapsed clock uses
continuous monotonic time and rejects inconsistent wall-clock samples.
Terminal foreground checks cover the OS session and process group. They
do not establish physical owner identity. [Apple continuous clock](https://developer.apple.com/documentation/kernel/1646199-mach_continuous_time).

The four driver groups use real TLS with in-memory streams and a synthetic
foreground terminal. They cover partial writes, backpressure, scope rejection,
teardown and close failure, early EOF, clock and deadline failure, exact
approval, denial, stop and revocation. The macOS adapter checks cover clock
sampling and rejection of pipes and invalid descriptors. A connected TCP
descriptor and physical terminal have not been exercised.

## Activation wrapper and M4 policy bridge

The [activation wrapper](../../tools/mtls-device-test/activation-v1.h)
coordinates pairing, one adopted transport, teardown, and local review over
supplied resources. Only M4 can consume the resulting fixture proposal, once.
The wrapper will not expose a terminal decision twice. Stop, policy change,
clock failure and expiry invalidate a pending decision, including after the
terminal accepted it and before it is taken by policy.

The [local policy bridge](../../tools/mtls-device-test/local-policy-v1.mjs)
accepts only the single synthetic proposal on a distinct trusted local
channel. It prepares a fresh plan with the existing supervised fixture
engine. It gives the native terminal driver the exact plan digest and
requires the plan-bound confirmation or denial after the driver closes.
The engine rechecks policy and consent and verifies its durable journal.
A failure to verify the outcome withholds the result. Returned outcomes
remain local, synthetic and no-effect. No TLS acknowledgement carries a
decision, grant, result or receipt.

With the locked dependencies and pinned Node 24.18.0 on PATH, run the
cross-language offline proof from the repository root:

```sh
/bin/sh tests/source-only/test-offline-mtls-policy-v1.sh "$(command -v node)"
```

The launcher acquires the shared workload gate separately for the temporary
native compile and then the SQLite tests. The proof uses real TLS over
bounded memory buffers, synthetic terminal events and private inherited test
channels. It does not establish device enrollment, physical owner presence,
or socket ownership. The native fixture's synthetic inputs exist only in test
source. The JavaScript bridge trusts the local caller that owns the channel.
A reviewed launcher must establish that provenance for a device run. The
offline proof passed 18 native test groups and eight cross-language policy
tests, including approval, denial, late revocation, stale decisions, and
audit loss. It used OpenSSL 3.6.4 and Node 24.18.0.

The read-only device preflight uses the canonical readiness report and fails
closed. The source has no device opener or live authorization verifier. It
cannot accept a live run, grant a P3 exception, or update release readiness.
A future release must preserve BETA-CP-004/005/006 and the native-only,
single-mount and writer-exclusion requirements. Before requesting approval,
review the exact device launcher, transport ownership, terminal scope and
local receipt path together with accepted prerequisite evidence.

## Source change classification

This source and test increment requires no backend migration, secrets, runtime
configuration, deployment, Lovable handoff, frontend publish, or device QA.
Listener activation, host changes, workflow dispatch and paid activity are
outside the increment. A future host or release action requires its own
review and authorization.

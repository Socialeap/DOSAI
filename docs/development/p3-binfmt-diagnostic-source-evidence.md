# Bounded binfmt diagnostic: source-only preparation

Status: **PREPARED_INACTIVE_NOT_DISPATCHED**. No specialized role assigned.
This owner-authorized increment prepares diagnostic source and offline tests.
It does not authorize dispatch, host mutation, builds, guest execution, or spend.

## Artifacts and activation boundary

- `scripts/p3-binfmt-diagnostic.py`: standalone standard-library inventory.
- `tests/governance/p3-binfmt-diagnostic.test.py`: adversarial temporary fixtures.
- `tests/governance/p3-binfmt-diagnostic.test.mjs`: normal test-command entrypoint.
- `docs/proposals/p3-native-builder-host-feasibility-diagnostic.yml`: inactive
  candidate; GitHub does not discover workflows here. Its two inline diagnostic
  programs are exact copies of the Python source. No repository checkout or
  network source retrieval is needed if a later approved workflow embeds them.

The dispatchable `.github/workflows/p3-native-builder-host-feasibility.yml`
remains byte-identical, with SHA-256
`6d04426acf2f30e406a4d948861951813146c20f80196e315feec070cf101d63`.
No success or failure predicate in that workflow changes. The candidate differs
only by adding diagnostic invocation before each original registration scan.
If diagnostic collection succeeds and any registration exists, the original
`BINFMT_MISC_INTERPRETER_ACTIVE` rejection still occurs. Diagnostic collection
failure adds a stricter `BINFMT_DIAGNOSTIC_REJECTED` denial.

## Bounds and authority

CLI entry accepts no arguments and reads only `/proc/sys/fs/binfmt_misc`,
traversing fixed components with no-follow directory descriptors. Entries are
opened read-only, nonblocking and no-follow; no interpreter is executed. The
write-only registration control is never read or written. Only regular files
are admitted. The inventory permits at most 32 registration entries, 4096 bytes
per read file and 131072 output bytes. A 1.5-second monotonic collection deadline,
2-second process alarm and 5-second outer kill timeout bound the attempt.

Two bounded snapshots compare bytes and file identities, plus directory
membership before and after each scan. Detected replacement, membership/content
change, unreadable files, malformed metadata, unknown flags/formats, special
files, links, overflow and timeouts fail closed. Repeated reads detect changes;
they do not prove continuous stability or exclude an ABA change between reads.
This is diagnostic evidence only, never host admission or builder attestation.

The parser accepts the classic enabled/disabled, interpreter, P/O/C/F flags and
magic/offset/optional-mask or extension format from the
[Linux v6.17 status formatter](https://github.com/torvalds/linux/blob/v6.17/fs/binfmt_misc.c).
New kernel output forms remain unavailable until reviewed and tested. Interpreter
paths are bounded data, never followed. Per-entry SHA-256 binds the read bytes.

Output uses separate prefix/schema `DOSAI_BINFMT_DIAGNOSTIC_V1`, explicit
`diagnostic_only: true`, and exact allowlisted run, job, commit, image and native
architecture context. No DMI UUID, arbitrary environment, raw exception, raw log,
credential or caller-selected path is emitted. Invalid inputs yield only the
fixed diagnostic failure line. A diagnostic subprocess runs Python in isolated
mode with bytecode writes disabled; it imports only standard-library modules.
The host Python/runtime remains part of the provider trust dependency.

## Reproduction and results

```sh
/usr/bin/python3 -B tests/governance/p3-binfmt-diagnostic.test.py -v
node --test tests/governance/p3-binfmt-diagnostic.test.mjs
```

All 15 offline cases pass on Python 3.9.6 and 3.15.0. They cover empty and global-
disabled inventories, enabled/QEMU-like and disabled/ordinary entries, extension
and magic parsing, missing controls, invalid status/encoding/fields, hostile
strings, duplicates, count/byte/output bounds, links, FIFO, permission errors,
replacement, inventory changes, deadline expiry, caller arguments, exact native
context and environment minimization. No fixture accesses the live Linux root.
The wrapper runs the same corpus under the ordinary repository test command.
The wrapper plus the existing readiness, repair and host-verifier tests pass
13/13 on pinned Node 24.18.0. No native build or full-suite rerun was needed for
this isolated diagnostic path.
Both embedded shell programs pass `bash -n`; candidate YAML parsing passes.
Tests reconstruct the entire candidate from the unchanged accepted workflow and
source, proving identical original admission and success-receipt code. Shell
fixtures verify the original gate passes an empty directory and rejects both
enabled and disabled registrations. No full native or remote run is claimed.

## Review digests

The [source preparation record](../architecture/p3-binfmt-diagnostic-source-record.json)
binds the source, inactive candidate and unchanged dispatchable workflow.
The inactive candidate SHA-256 is
`1e8daa3e67ff54200dda1f0c587dfc1b9501341ddfb8608d4a0b52fbb03da53c`.
The record authorizes none of the listed external or activation actions.

## Next approval sequence

1. Independently review source, tests, candidate bytes and parser assumptions.
2. Only after owner acceptance, promote the candidate through a separately
   reviewed activation increment, binding the new workflow digest and preserving
   historical records. The checkpoint currently pins the old workflow; it must
   fail on activation until a reviewed successor records the new evidence.
   Do not overwrite old validation or historical repair hashes to make it pass.
3. Before any dispatch, obtain fresh authorization for the exact promoted commit,
   named ref, workflow digest, public-repository zero-cost eligibility and one
   attempt with no retries. No dispatch or activation approval is conveyed here.
4. Review bounded output as untrusted diagnostic evidence. Any registrations
   still block candidate-host admission. Host preparation or changing a runner
   remains a separate decision, not an automatic response.

No migration, backend configuration, secret, Lovable action, deployment,
frontend Publish, package build or runtime activation is required for this
source-only preparation. BETA-CP-004/005/006 remain NO_GO. The 120-credit ceiling
and no-paid-activity boundary remain in effect.

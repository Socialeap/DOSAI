# Native Linux runner suitability: source-only analysis

Recorded: 2026-10-27. Status: **PROPOSAL — NO DISPATCH OR HOST MUTATION AUTHORITY**.
Role: unclassified assistant; no specialized role assigned.
Baseline: merged main `20700f8e9dfa063f152a405c0647b2c84d258cb4`.

## Finding and evidence boundary

The one authorized branch-based observation, [run 40544343024](https://github.com/Socialeap/DOSAI/actions/runs/40544343024),
ran attempt 1 at `1afb5f989a6faeed91bcc08a27c32013f6d8fd13`. Both
`BUILDER_HOST_A` and `BUILDER_HOST_B` failed with the fixed code
`BINFMT_MISC_INTERPRETER_ACTIVE`. Both setup logs identify Ubuntu image
`20261012.334.1` and link its [published image inventory](https://github.com/actions/runner-images/blob/ubuntu24/20261012.334/images/ubuntu/Ubuntu2404-Readme.md).
No candidate-host or builder receipts were produced. No retry, build, guest
execution, or paid activity was performed. The preceding raw-SHA dispatch
request was rejected with HTTP 422 and created no run; it is not a second
runner execution. The temporary branch remains at the approved commit.

The workflow bytes had SHA-256
`6d04426acf2f30e406a4d948861951813146c20f80196e315feec070cf101d63`.
Its relevant predicate is:

```sh
active_binfmt="$(find /proc/sys/fs/binfmt_misc -maxdepth 1 -type f ! -name register ! -name status -print -quit)" || fail BINFMT_MISC_SCAN_FAILED
test -z "$active_binfmt" || fail BINFMT_MISC_INTERPRETER_ACTIVE
```

This tests **registration-file presence**, not whether a registration is enabled,
what interpreter it selects, what binary formats it matches, or whether an
interpreter executed. The failure name overstates the available evidence.
The source-only conclusion is that these two observed hosts fail the current
admission predicate. It does not establish CPU emulation, identify QEMU, or
prove that all future Ubuntu 24.04 jobs are unsuitable.

[Linux kernel documentation](https://docs.kernel.org/admin-guide/binfmt-misc.html)
describes registration files, per-entry enable/disable state, and interpreters
for formats such as Java or Windows executables as well as foreign architectures.
Thus an entry alone is not CPU-emulation evidence. Conversely, native `uname`
and Docker architecture fields alone cannot establish the absence of a foreign
execution path. Preserve all existing checks and the native-only requirement.

## Published runner source: useful, insufficient

The exact image [toolset](https://github.com/actions/runner-images/blob/ubuntu24/20261012.334/images/ubuntu/toolsets/toolset-2404.json)
and [build template](https://github.com/actions/runner-images/blob/ubuntu24/20261012.334/images/ubuntu/templates/build.ubuntu-24_04.pkr.hcl)
were inspected alongside the apt and container-tool installation scripts. The
template selects apt and container-tool installation. This inspection did not
identify the actual offending registration on either observed host. A Mono
installation script exists in the upstream repository but is not selected by
this Ubuntu 24.04 template; its presence is not evidence that Mono caused this
failure. Package dependency or image-source speculation cannot replace a host
inventory. The published source tag is provenance context, not a proof of the
exact runtime registration state or an immutable full host-image digest.

GitHub documents `ubuntu-24.04` standard runners as x64 fresh VMs, with the
single-CPU exception described separately in its [runner selection documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job).
Its [billing documentation](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
states standard hosted runners in public repositories are free. Public
visibility was verified for DOSAI for the authorized observation. Future
eligibility must be checked again; no larger/custom runner, paid tier, artifact
storage, cache expansion, or new service is proposed.

## Narrowest safe next step

Prepare a separate source-only diagnostic proposal for the same two standard
native-x64 candidate jobs. Add bounded read-only inventory before the current
binfmt rejection; preserve its failure and every existing success predicate.
Do not dispatch while preparing or reviewing it.

The diagnostic proposal should require:

- Fixed `/proc/sys/fs/binfmt_misc` root; no caller-selected paths, symlink
  traversal, mount operation, sudo, or writes to the kernel interface.
- At most 32 entries, at most 4096 bytes per entry, bounded total output, and
  fixed execution deadlines. Unknown shapes, unreadable entries, concurrent
  inventory changes, oversized data, and invalid encodings fail closed.
- Strictly encoded diagnostic fields: workflow/run/job/SHA and image provenance,
  native architecture, global enabled state, entry basename, entry enabled
  state, interpreter path, flags, magic/mask/offset when present, and a digest
  of each bounded entry. Treat path strings as data; never execute or follow
  an interpreter. Exclude host UUIDs, environment dumps, credentials, raw logs,
  and arbitrary files from this diagnostic output.
- Separate diagnostic schema and prefix, never `DOSAI_HOST_OBSERVATION_V1` or
  `PASS_CANDIDATE_HOSTS_ONLY`. An inventory with entries does not qualify a host.
- No checkout, third-party actions, cache, artifact upload, container start,
  network retrieval by job steps, package installation, compilation, guest
  execution, auto retry, or new success assertion.
- Offline fixture tests covering empty, enabled, disabled, QEMU-like and ordinary
  interpreter entries, hostile strings, malformed/oversized/unstable inventories,
  and preservation of the original fail-closed admission result.

After implementation and review, select an exact commit, workflow digest,
branch, zero-cost preflight, and one-attempt limit for **fresh owner authorization**.
The completed attempt's authorization is exhausted. No diagnostic run is
currently authorized or implemented by this analysis.

## Decision after inventory, not before

| Option | Assessment and required gate |
| --- | --- |
| Bounded read-only diagnostic on the same standard runners | Recommended next proposal: smallest new authority, no privileged changes, preserves denial, supplies the missing cause evidence. Requires reviewed source and fresh dispatch approval. |
| Remove known registrations on each fresh disposable VM, then rerun every original predicate | Potential subsequent remedy that preserves the strict empty-registry gate. Requires evidence identifying exact entries, a separately accepted host-preparation contract, exact bounded privileged operations, pre/post inventory, no re-registration during builds, and explicit mutation/dispatch authorization. Not authorized here. |
| Use another standard x64 runner image or owner-provided native-amd64 hosts | Fallback if exact host preparation cannot be accepted. Suitability, two-instance independence, image inputs, zero cost, and absence of emulation remain unproven. Switching labels alone is not a fix. No runner provisioning is authorized. |
| Ignore ordinary entries, check only `uname`, or infer disabled entries are safe | Rejected as the immediate remedy: changes admission semantics without sufficient evidence or an accepted replacement contract. Do not edit the verifier or report success. |
| Use arm64 Docker Desktop, emulated amd64, one long-lived VM twice, or paid/custom runners | Excluded by ADR 0018, independence requirements, or the owner boundary. |

The kernel provides removal/disable mechanisms, but a global disable alone does
not satisfy the present **no-registration-files** predicate. This document
provides no executable host-mutation instructions. A future preparation phase
must stay separate from the accepted no-network, non-root, no-host-mutation
build stage. It cannot weaken ADR 0018 or count candidate hosts as builder proof.

## Checkpoint and release classification

BETA-CP-004 remains missing two independent builder receipts; BETA-CP-005/006
remain blocked. Historical checkpoint JSON and hash-bound records remain
unchanged. This analysis is a supplemental proposal, not a capability update.

This increment changes documentation only. No backend migration, durable
backend-state change, secret, environment/provider configuration, deployment,
Lovable activation, frontend Publish, runtime registration, or host activation
is required. The ordinary next action is owner review of the proposal; Codex may
prepare the bounded source-only diagnostic after approval. No paid activity or
account reset is authorized. No latency, reliability, or release-readiness claim
is made.

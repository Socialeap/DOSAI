# Binfmt diagnostic workflow activation increment

Status: **PREPARED_FOR_REVIEW_NOT_DISPATCHED**. No specialized role assigned.
Based on merged PR #6, main `74da5a5addc8f0766b32c6789e9eb670ad0eda61`.
The owner's authorization covers preparation of this separate source increment,
not merge, dispatch, host mutation, builds, guest execution or paid activity.

## Exact placement and history

`.github/workflows/p3-native-builder-host-feasibility.yml` is now byte-identical
to the PR #6 reviewed candidate in
`docs/proposals/p3-native-builder-host-feasibility-diagnostic.yml`.
Its SHA-256 is
`1e8daa3e67ff54200dda1f0c587dfc1b9501341ddfb8608d4a0b52fbb03da53c`.
It retains workflow-dispatch-only triggering, no permissions, the two fixed
standard `ubuntu-24.04` jobs, deadlines and all original success and rejection
predicates. No push/pull-request trigger or automatic execution was added.

The prior workflow is preserved byte-for-byte at
`docs/proposals/p3-native-builder-host-feasibility-pre-diagnostic.yml`, SHA-256
`6d04426acf2f30e406a4d948861951813146c20f80196e315feec070cf101d63`.
The previous repair and diagnostic-preparation records remain immutable history.
Their old workflow references are validated against that exact historical copy;
the promoted workflow is independently validated against the reviewed candidate.
Historical guards were adapted only to select those exact prior bytes, never to
accept arbitrary successors or replace old evidence digests.

The [activation source record](../architecture/p3-binfmt-workflow-activation-record.json)
binds both workflows, the diagnostic source, PR #6 preparation record and the
historical checkpoint. All runtime, merge and capability authorities remain
false. Source placement is prepared; no observation result is added.

## Successor checkpoint

`docs/development/private-beta-critical-path-status.json` remains byte-identical.
The reporter now reads [checkpoint v2](private-beta-critical-path-status-v2.json).
V2 binds the historical checkpoint and activation record. Existing source
validation counts and gate evidence are carried forward as historical fields;
they are not new validation of the promoted workflow or a new host observation.
The separately recorded failed run 40544343024 remains supplemental evidence in
the operator runbook; this increment does not invent receipts from that run.

The reporter pins the activation record digest and approved workflow digest,
hashes the actual workflow bytes, validates every activation input and rejects
changes to the inherited gate evidence or a declaration of GO. The historical
checkpoint's hash is bound by the pinned activation record. New diagnostic
source placement cannot promote an incomplete runtime gate or authorize a run.

## Local validation

On Node `24.18.0`, all 17 focused checks pass:

```sh
node --test --test-concurrency=1 tests/governance/p3-binfmt-diagnostic.test.mjs tests/governance/private-beta-critical-path-status.test.mjs tests/governance/p3-native-builder-host-observability-repair.test.mjs tests/governance/p3-native-builder-host-observation-verifier.test.mjs
node scripts/report-private-beta-readiness.mjs
```

The Python wrapper executes the existing 15 offline adversarial fixtures. They
prove exact candidate promotion, strict native context, bounds, read-only
collection and preservation of the original registration rejection. The two
embedded shell programs pass syntax checks. YAML parses locally. No tests access
the live runner kernel, launch a container, compile anything or dispatch a job.

Additional readiness fixtures reject changed/missing active workflow bytes,
changed candidate, historical workflow and diagnostic source, altered activation
bindings, checkpoint-forged digests with dispatch authority, empty or promoted
gate lists and a forged GO declaration. The report exits 2 with the expected
NO_GO blockers BETA-CP-004/005/006; this is not an evidence-rejection error.

No broad native/build suite was run because this is a source activation increment
with an explicit no-build boundary. No Linux runner result is claimed.

## Owner gates after review

1. Review and separately approve merge of this exact source increment. Merge
   makes the updated manual workflow discoverable; it does not run it.
2. After merge, verify the selected full commit and named ref, actual workflow
   SHA-256 above and current public-repository/standard-runner zero-cost
   eligibility. If any identity, digest, scope or cost precondition differs,
   stop and return for a new decision. Never use a moving ref unchecked.
3. Obtain fresh owner authorization for exactly one manual dispatch on those
   exact bytes, no retries, host changes, builds, guest execution or paid
   activity. No existing authorization covers this future run.
4. Treat resulting output as untrusted diagnostics only. Any registrations must
   still trigger the original rejection. Candidate-host success, if any, is not
   an independent builder receipt. Any cleanup proposal requires separate
   source review and explicit bounded host-mutation authorization.

## Live-state classification

No database migration, durable backend-state change, backend function, secret,
provider setting, Lovable activation or frontend Publish is involved. The only
future activation here is GitHub's manual workflow source after an approved
merge. No dispatch, host mutation, build, guest execution, account reset or paid
activity occurred. The 120-credit ceiling and beta NO_GO remain in force.

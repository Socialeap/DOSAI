# P3 Native Builder Host Observation — Attempt 1 and Observability Repair

## Result

The single owner-authorized manual run completed once at GitHub Actions run
`35669182950`, attempt `1`, against merged `main` commit
`6495ffe787189c9836af4d6a5be4e480bc9f38f1`. Both fixed observation jobs
failed closed with exit code `1` before emitting a
`DOSAI_HOST_OBSERVATION_V1` receipt. No retry or rerun occurred.

The retained logs identify neither the failing command nor the failed host
predicate. The result therefore produces zero candidate-host receipts, zero
builder receipts, and no support for `BETA-CP-004`.

## Source-only repair

The workflow now emits exactly one fixed
`DOSAI_HOST_OBSERVATION_FAILURE_V1:<CODE>` line before the same nonzero exit for
each possible failure boundary. The codes contain no DMI identity, environment
value, command output, or platform error text. All existing host predicates and
the exact success receipt remain intact.

The workflow remains manual-only with `permissions: {}`, two
`ubuntu-24.04` jobs, no checkout, no third-party action, no secret, no cache,
no artifact upload, and no build or signing step. This source change does not
authorize another dispatch, runner allocation, builder action, guest action,
merge, default-branch change, paid activity, or production use.

## Validation

- Both embedded Bash programs pass `/bin/bash -n` after YAML extraction.
- Eighteen focused governance and critical-path tests pass on Node `24.18.0`.
- The complete serial repository suite passes `643/643` on Node `24.18.0`
  after materializing the already-validated ignored test package in the isolated
  worktree; no package was rebuilt or re-signed.
- The critical-path reporter returns the expected `NO_GO` result with
  `BETA-CP-004`, `BETA-CP-005`, and `BETA-CP-006` still open.
- The attempt and repair records are strict-JSON parsed and hash-bound by the
  critical-path checkpoint.

## Next gate

Review and merge this source-only repair. Any second physical observation is a
new external action and requires a fresh exact owner authorization. A successful
candidate-host observation would still prove only host feasibility; it would
not satisfy the two independent native builder receipts required by ADR 0018.

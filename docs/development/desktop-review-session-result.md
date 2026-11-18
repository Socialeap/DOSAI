# DOSAI sample two-agent review result

On November 18, 2026, the owner and Codex tested the supervised manual review
flow on the Apple Silicon desktop bundle from PR #41. The tested bundle's
source tree matched merge commit `94099b9e0604907367f57d7e047e671ba0f0995a`.
The review target was the DOSAI PR #29 sample, from base `1f2ef15` to
candidate `314b633`. See the [operator runbook](desktop-review-session-runbook.md)
for the full pins and patch fingerprint. The notes below summarize the
observations without storing the review transcripts or session receipts.

## Observed desktop flow

- An initial accidental approval was stopped. DOSAI displayed **Stopped** and
  hid the handoffs.
- In a fresh session, the owner chose **Deny** in the native dialog. The app
  displayed **Approval denied**, its receipt showed `denied`, and neither
  handoff appeared.
- The owner approved the next request in the native dialog. The receipt showed
  `locally-approved` and the app displayed two distinct manual handoffs.
- Codex reviewed the pinned patch for correctness and returned **No findings**
  with **0** findings. Claude reviewed test coverage and returned
  **Incomplete** with **5** findings. The Claude report's handoff ID and full
  candidate SHA matched the active assignment. Both reviews were read-only
  and skipped execution. Claude reported that it skipped independent patch
  fingerprint verification.
- After both entries were recorded, the app displayed **Both reports recorded**
  and the receipt showed `complete`. That status means both reports were
  recorded. The receipt is unsigned and held in memory, and its report
  provenance is operator-recorded and unverified.

## Verified source follow-up

[PR #42](https://github.com/Socialeap/DOSAI/pull/42) merged at
`8304ebe45b72890eded7a76dfe6dbf3ff9cc4f50`. It pinned the v1 handoff to the
two documented actions, covered default and invalid receiver arguments, added
a fresh approval test for two separate receiving sessions, covered sender
errors and fixed usage text, and exercised both Node version guards. It also
removed a stray README line. On the exact merge commit, nine no-emit type
checks and 135 tests passed on Node 24.18.0 under the macOS workload gate.

## Offline regression

The regression drives the real desktop preload bridge and registered main-process
review handlers through a test-only Electron fixture. It simulates the window
and native dialog responses, checks denial before approval, rejects swapped and
repeated report submissions, and verifies the completed receipt. The fixture
uses generated IDs and keeps the session in memory.

```sh
node --version  # v24.18.0
node --test tests/review/local-session-ipc.test.mjs
```

The desktop test and offline regression cover manual review coordination.
Native-builder readiness remains `NO_GO` with 0 of 2 qualifying builders.
Full functionality testing remains subject to `BETA-CP-004`, `BETA-CP-005`,
and `BETA-CP-006` in the [private-beta operator runbook](private-beta-operator-runbook.md).

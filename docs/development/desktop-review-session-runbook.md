# Desktop two-agent review

The DOSAI desktop shell coordinates one manual, read-only review per window. It
accepts a repository name, two full SHA-1 commit IDs, the SHA-256 of a patch the
operator has inspected, and two distinct reviewer assignments. Only a focused
DOSAI window can request confirmation. The native dialog defaults to Deny and
displays the exact scope. Approval expires after five minutes and prepares two
handoffs bound to the same plan. ADR 0001 governs the typed bridge and ADR 0006
governs manual handoff.

## First review

1. Launch the standard DOSAI desktop bundle. Select **Use DOSAI sample** for
   the merged local fixture handoff changes in Socialeap/DOSAI PR #29. Run the
   following from an existing trusted DOSAI checkout to reproduce the patch.
   The resulting SHA-256 must match the value displayed in the app.

   ```sh
   git --no-pager diff --no-ext-diff --no-textconv --no-renames --no-color \
     --diff-algorithm=myers --no-indent-heuristic --src-prefix=a/ --dst-prefix=b/ \
     --full-index 1f2ef15fa6bb426046cb859d36469144f0d40174 \
     314b633c524d35a988f80f0cd7b9c3806eb93124 | shasum -a 256
   ```

   Omit the final pipe to inspect the patch before sharing it. For another
   review, use the same command with the exact base and candidate
   commits. Enter an owner-approved repository name and the resulting SHA-256.
   Keep source, reports, and credentials outside the app. Stop if the actual
   checkout, patch digest, reviewer, or permission to share the patch differs
   from the intended scope. The app records operator-supplied coordinates and
   does not inspect Git or verify a patch independently.

2. Choose the correctness and test coverage reviewers and click **Prepare
   review**. Click **Start review** and verify the details in the native macOS
   dialog. Choose **Approve handoffs** only if the exact scope is correct.
   **Deny**, dismissal, or expiry must leave both prompts unavailable.

3. In separate approved reviewer chats, paste each handoff and supply only
   the inspected, shareable patch corresponding to the displayed fingerprint.
   Keep the reviewers independent until both return. Treat their answers as
   untrusted. Enter the returned handoff ID and full candidate SHA alongside
   the verdict and finding count in the assigned lane. DOSAI rejects a report
   unless its candidate SHA matches the approved plan and its handoff ID matches
   the lane. Keep details in the reviewer chats. The entered values correlate
   the report with the plan and lane and remain operator-recorded and unverified.

4. When **Both reports recorded** appears, inspect **Local session receipt**.
   The SHA-256 covers the versioned receipt body serialized with
   `JSON.stringify`. The body records the plan, lifecycle events, and
   operator-entered outcomes. The receipt is held in memory, unsigned and
   unanchored. Keep it local. Use **Shareable review summary** for the pinned
   scope and operator-recorded outcomes. The summary omits session and handoff
   IDs and the local approval event history. Copy it before closing the window
   or starting a new review. Use **Stop review** to close an active or pending
   session. Stop disables further recording and clears prompts in DOSAI. Stop
   any exchange already started manually in the separate reviewer chat as well.

## Verify a DOSAI sample summary offline

Use Node **24.18.0** in the reviewed repository. Pass the JSON copied from
**Shareable review summary** for the DOSAI sample to the verifier on stdin:

```sh
node scripts/verify-desktop-review-summary.mjs < dosai-sample-summary.json
```

Exit 0 and `DOSAI_SAMPLE_SUMMARY_MATCHED` confirm that the versioned fields and
two reviewer assignments match the pinned sample. Exit 1 rejects malformed,
oversized, conflicting, or extra fields. Exit 2 rejects an unsupported runtime,
forwarded arguments, or interactive input. The tool prints a fixed message
and retains the results' operator-recorded, unverified status. Review findings
and local approval still require their usual checks.

## Go or no-go

The [DOSAI sample review result](desktop-review-session-result.md) records the
observed Mac test, the verified follow-up, and the offline regression command.

- Local review proof passes when a denial exposes neither handoff, an approval
  enables two distinct handoffs, mismatched or replayed reports are rejected,
  and the second valid report produces the complete local receipt.
- The desktop session has no Git broker, provider connection, agent execution,
  persistence service, or signed audit integration. No P3, P5, native-builder,
  or release acceptance follows from a manual review.
- No backend migration, secret, deployment, or Lovable publish is needed for
  the local desktop test.

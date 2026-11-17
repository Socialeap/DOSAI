# Devalley display adapter fixture

Source-only preparation by an unclassified assistant. P3 remains the active
delivery phase. This fixture runs through the Node test runner and has no app
entry point.

A live, display-only probe observed that the M4 Devalley hook updated one
synthetic M1 resident across SSH sessions. The card still showed Working during
the gap. This fixture uses the same two event forms seen in the probe,
`SessionStart` and `UserPromptSubmit`, with fixed synthetic fields. Its output
is a value containing an agent label and JSON stdin data. Only the tests consume
that value. The fixture opens no connection and invokes no process.

| Observation | DOSAI fixture view | Devalley input |
| --- | --- | --- |
| Queue or work | Last accepted state | Display event with the same synthetic session ID |
| Five seconds without an accepted observation | Stale plus last observed state and sequence | None |
| Reconnect | Show the new connection, retaining stale status until accepted data arrives | None |
| Owner approval pending or task completed | Display the synthetic state | None |

Connection generations increase across reconnects. The observation sequence is
monotonic across the life of the resident. Older generations, duplicates and
late sequences leave the latest observation and its age intact. The five-second
threshold uses a caller-provided synthetic monotonic clock.

The two-resident fixture assigns fixed, distinct session IDs and agent labels to
its M1 and M4 slots. Each slot tracks its own connection, sequence, clock and
last observation. The tests interleave both slots and show that one resident can
remain fresh while the other reconnects. Events carry no resident selector.
Each slot is selected by the fixture caller. A future integration would need
authenticated routing under the accepted transport contract before enabling
delivery. The fixture models neither identity authentication nor durable replay.

Run the isolated synthetic tests on Node 24.18.0:

```sh
node --test tests/governance/devalley-display-fixture.test.mjs
```

The repository change consists of a test fixture, a test suite and this note.
Policy, approval, grant and audit authority stay with DOSAI. There is no workflow
activation, backend migration, secret or environment configuration, frontend
Publish, deployment or owner QA for this increment.

## Delayed display consumption

The buffered fixture retains up to one unsent frame per resident. A newer
accepted observation replaces the frame. Approval and completion observations
clear the slot and remain in DOSAI. Disconnect clears the slot immediately.
Reconnect alone leaves it empty. Taking a frame at or after the five-second
freshness threshold returns no frame, while the DOSAI view retains the last
observation and shows stale status. Rejected observations do not replace a frame
that is still eligible.

The buffer is an in-memory simulation of delayed display consumption. Taking a
frame transfers a test value once. It does not model Devalley delivery,
acknowledgement, or recovery, and a superseded SessionStart may be discarded.
A live consumer would need its initial resident behavior verified separately.

```sh
node --test tests/governance/devalley-display-buffer-fixture.test.mjs
```

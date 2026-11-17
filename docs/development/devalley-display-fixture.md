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
threshold uses a caller-provided synthetic monotonic clock. The model has one
fixed resident identity per proof, with no authentication or persistent replay
store. Production handling would require the accepted transport and integration
boundaries before adding callers, permissions or delivery.

Run the isolated synthetic tests on Node 24.18.0:

```sh
node --test tests/governance/devalley-display-fixture.test.mjs
```

The repository change consists of a test fixture, a test suite and this note.
Policy, approval, grant and audit authority stay with DOSAI. There is no workflow
activation, backend migration, secret or environment configuration, frontend
Publish, deployment or owner QA for this increment.

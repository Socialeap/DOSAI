# Local agent connector

The owner approved proceeding with the two-agent pilot. This increment implements its application adapter and verifies it with two offline MCP clients. Live activation still needs an accepted protected launcher and current cost evidence for the exact client sessions.

The broker works against one admitted SQLite fixture project. A trusted host binds one endpoint to Codex as lead and one to Claude Code as review specialist. The lead assigns the fixed review. The specialist can save bounded progress and a result using the last observed task revision. Both can read the same saved state. The second specialist lane remains pending during this two-agent test. Notes use fixture value IDs so the pilot does not persist free-form model output.

The MCP handler consumes one complete message from an injected control endpoint. It supports initialization, ping, and the scoped tool list and calls. A payload field, client name, or project path cannot choose an actor. Rebinding requires a fresh in-process generation. Expiry is rechecked within the write transaction. Stop revokes endpoints and persists the project stop. A process restart restores the checklist, while any later live session must establish fresh approval and endpoint binding.

## Proof and activation boundary

- The two installed native CLI binaries can be checked using their local version commands. A local binary is neither evidence of the agent executor's location nor a successful MCP connection.
- Use a dedicated control endpoint that meets [ADR 0006](../../docs/decisions/0006-authenticated-packet-transport.md). The application handler here assumes that its caller has already authenticated and authorized the peer. Native client stdout, an editable MCP command or a shared macOS UID cannot supply that proof. The test harness injects endpoints. It does not open sockets or configure either client.
- For the exact approved synthetic project, independently verify the trusted launcher, peer process identity, bounded lifetime and revocation, and current provider terms for zero-cost use. The owner-approved [pilot scope](../../docs/proposals/local-coordination-pilot-v1.md) sets the live acceptance sequence. Treat reported MCP support as feasibility until the actual client sessions prove automatic task pickup, receipt and reconnect.

## Offline verification

Use Node 24.18.0. The suite opens disposable SQLite projects under the Mac workload gate.

```sh
"$HOME/.local/bin/codex-heavy" node --test --test-concurrency=1 tests/coordination/*.test.mjs
```

This source increment requires no backend migration, deployment, secret configuration, Lovable action or change to native-builder admission.

# Local agent connector

The owner approved proceeding with the two-agent pilot. This increment implements its application adapter and verifies it with two offline MCP clients. Live activation still needs an accepted protected launcher and current cost evidence for the exact client sessions.

The broker works against one admitted SQLite fixture project. A trusted host binds one endpoint to Codex as lead and one to Claude Code as review specialist. The lead assigns the fixed review. The specialist can save bounded progress and a result using the last observed task revision. Both can read the same saved state. The second specialist lane remains pending during this two-agent test. Notes use fixture value IDs so the pilot does not persist free-form model output.

The MCP handler consumes one complete message from an injected control endpoint. It supports initialization, ping, and the scoped tool list and calls. A payload field, client name, or project path cannot choose an actor. Rebinding requires a fresh in-process generation. Expiry is rechecked within the write transaction. Stop revokes endpoints and persists the project stop. A process restart restores the checklist, while any later live session must establish fresh approval and endpoint binding.

## Protected macOS launcher fixture

The supervisor starts exactly two disposable Node fixture processes, one for each pilot role. It checks PID, parent PID, effective UID, process start time and exact executable path before handing each child fresh key material on its inherited descriptor. It rechecks the same identity after an authenticated proof and only then binds the role and exposes its MCP tools. The worker's stdout and stderr have no control authority.

The binary framing uses a fixed bounded preamble, session and endpoint IDs, HKDF-SHA-256 direction keys, ordered sequences, nonces, message and correlation IDs, SHA-256 payload digests and a constant-time HMAC comparison. Each connection has record, byte, time and lifetime limits. Invalid or incomplete frames close the channel. The supervisor cleans up its own children and key buffers. This validates the approach for fixed fixture children and does not implement the reviewed native-client bootstrap or establish full ADR 0006 acceptance.

## Proof and activation boundary

- The two installed native CLI binaries can be checked using their local version commands. A local binary is neither evidence of the agent executor's location nor a successful MCP connection.
- Use a dedicated control endpoint that meets [ADR 0006](../../docs/decisions/0006-authenticated-packet-transport.md). The application handler here assumes that its caller has already authenticated and authorized the peer. Native client stdout, an editable MCP command or a shared macOS UID cannot supply that proof. The test harness injects endpoints. It does not open sockets or configure either client.
- For the exact approved synthetic project, independently verify the trusted launcher, peer process identity, bounded lifetime and revocation, and current provider terms for zero-cost use. The owner-approved [pilot scope](../../docs/proposals/local-coordination-pilot-v1.md) sets the live acceptance sequence. Treat reported MCP support as feasibility until the actual client sessions prove automatic task pickup, receipt and reconnect.

### Zero-cost preflight

Check the exact accounts and executor mode immediately before an approved live window. For Codex, confirm included ChatGPT usage, no authorized credit draw or purchase, and no reset. Turning off auto-reload prevents automatic purchases, while an existing credit balance can still be used when included usage ends. For Claude Code, confirm the chosen mode uses included subscription allowance, usage credits are disabled, and the approved launch will not use an API-key or metered provider path. Hold activation if any part of the cost basis is unknown. [Codex credit behavior](https://help.openai.com/en/articles/12642688-using-credits-for-flexible-usage-in-chatgpt-personal-plans) · [Claude usage credits](https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans) · [Claude Code API-key precedence](https://support.claude.com/en/articles/12304248-manage-api-key-environment-variables-in-claude-code)

## Offline verification

Use Node 24.18.0. The suite opens disposable SQLite projects under the Mac workload gate.

```sh
"$HOME/.local/bin/codex-heavy" node --test --test-concurrency=1 tests/coordination/*.test.mjs
```

This source increment requires no backend migration, deployment, secret configuration, Lovable action or change to native-builder admission.

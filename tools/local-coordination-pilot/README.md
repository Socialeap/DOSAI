# Local agent connector

The owner approved proceeding with the two-agent pilot. This increment implements its application adapter and verifies it with two offline MCP clients. Live activation still needs an accepted protected launcher and current cost evidence for the exact client sessions.

The broker works against one admitted SQLite fixture project. A trusted host binds one endpoint to Codex as lead and one to Claude Code as review specialist. The lead assigns the fixed review. The specialist can save bounded progress and a result using the last observed task revision. Both can read the same saved state. The second specialist lane remains pending during this two-agent test. Notes use fixture value IDs so the pilot does not persist free-form model output.

The MCP handler consumes one complete message from an injected control endpoint. It supports initialization, ping, and the scoped tool list and calls. A payload field, client name, or project path cannot choose an actor. Rebinding requires a fresh in-process generation. Expiry is rechecked within the write transaction. Stop revokes endpoints and persists the project stop. A process restart restores the checklist, while any later live session must establish fresh approval and endpoint binding.

## DOSAI-managed review

The [local dashboard](../coordination-prototype/README.md#run-one-managed-review-offline)
offers a one-review fixture run. The supervisor selects the roles and project,
requests native approval, and dispatches up to three turns without polling or
retries.

| Turn | Accepted output | Saved effect |
| --- | --- | --- |
| Codex assigns | The fixed synthetic review ID | One assignment from lead to reviewer |
| Claude Code reviews | One allowlisted finding ID | Progress when the supervisor observes the worker start |
| Codex receives | The exact finding ID returned by the reviewer | The result from reviewer to lead and one completed checklist item |

The turn adapter consumes bounded Codex JSONL and Claude Code structured JSON.
It admits a closed result schema, discards process output after validation, and
passes only fixed fixture fields or the finding ID into the next turn. A native
approval request shows the fixture scope, $0 cost, and plan fingerprint. The
review uses a new, local one-task database identity. A completed, stopped, or
interrupted project cannot redispatch.

Stop aborts the owned fixture worker and revokes the broker before any late
result can schedule another turn or advance the persisted checklist. The
offline proof does not establish native-provider process isolation or durable
cross-provider transport. See the [Codex JSON output format](https://learn.chatgpt.com/docs/non-interactive-mode#make-output-machine-readable)
and [Claude Code structured output format](https://code.claude.com/docs/en/headless#get-structured-output).

### Native worker preflight

The merged offline review flow remains the entry point. The next live-candidate
check is to verify the effective tool catalog and process boundary on the exact
installed binaries. Version output, help text, and Codex feature rows provide
limited offline evidence. This preflight has no launcher or approval interface.

On the M4, Codex `0.169.0-alpha.11.1` in an empty profile reported
`shell_tool` off and `unified_exec` on after explicit disable requests.
The listing leaves the effective command tool surface unresolved. Claude Code
`2.1.314` advertises restricted mode, safe mode, an empty built-in tool list,
and strict MCP configuration. Restricted mode still admits managed settings.
Verify the effective configuration before a model request. [Codex CLI
reference](https://learn.chatgpt.com/docs/cli/reference) · [Claude Code CLI
reference](https://code.claude.com/docs/en/cli-reference)

Use absolute paths to the native binaries and disposable, empty profile and
working directories for metadata capture. Create `$probe_dir/codex` before
probing and use a separate empty `CLAUDE_CONFIG_DIR` for Claude Code. Use only `--version`, Codex
`exec --help`, Claude Code `--help`, and the Codex feature listing below.
Record each binary's SHA-256 with `shasum -a 256`. Never read the provider's
auth files or use the signed-in home for this probe.

```sh
/usr/bin/env -i HOME="$probe_dir" CODEX_HOME="$probe_dir/codex" PATH=/usr/bin:/bin \
  "$codex_binary" --disable shell_tool --disable unified_exec --disable unified_exec_tty \
  --disable hooks --disable plugins --disable apps --disable multi_agent \
  -c 'web_search="disabled"' -c 'mcp_servers={}' features list
```

Provide a strict ASCII JSON object with `codex` and `claude` observations to
`node tools/local-coordination-pilot/native-review-preflight.mjs` on stdin.
Encode Unicode in help output as JSON escapes.
Both records contain `version`, `sha256` and `help` strings. The Codex record
also contains the `features` string from the command above. The report emits
sanitized findings and returns status `HOLD` (exit 2) even when all reported
settings match. Malformed observations exit 1.

Before connecting clients, require reviewed evidence of the exact per-turn tool
surface, startup configuration, process isolation and cancellation. Then verify
included-only usage for the exact accounts and obtain fresh local approval.
Native-builder admission remains separate. This source adds neither a live
route nor a desktop MCP dependency.

## Desktop MCP proof and activation boundary

- The two installed native CLI binaries can be checked using their local version commands. A local binary is neither evidence of the agent executor's location nor a successful MCP connection.
- Use a dedicated control endpoint that meets [ADR 0006](../../docs/decisions/0006-authenticated-packet-transport.md). The application handler here assumes that its caller has already authenticated and authorized the peer. Native client stdout, an editable MCP command or a shared macOS UID cannot supply that proof. The test harness injects endpoints. It does not open sockets or configure either client.
- For the exact approved synthetic project, independently verify the trusted launcher, peer process identity, bounded lifetime and revocation, and current provider terms for zero-cost use. The proposed [pilot scope](../../docs/proposals/local-coordination-pilot-v1.md) describes the live acceptance sequence. Treat reported MCP support as feasibility until the actual client sessions prove automatic task pickup, receipt and reconnect.

## Offline verification

Use Node 24.18.0. The suite opens disposable SQLite projects under the Mac workload gate.

```sh
"$HOME/.local/bin/codex-heavy" node --test --test-concurrency=1 tests/coordination/*.test.mjs
```

This source increment requires no backend migration, deployment, secret configuration, Lovable action or change to native-builder admission.

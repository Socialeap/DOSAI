# Local agent connector

The owner approved proceeding with the two-agent pilot. This increment implements its application adapter and verifies it with two offline MCP clients. Live activation still needs an accepted protected launcher and current cost evidence for the exact client sessions.

The broker works against one admitted SQLite fixture project. A trusted host binds one endpoint to Codex as lead and one to Claude Code as review specialist. The lead assigns the fixed review. The specialist can save bounded progress and a result using the last observed task revision. Both can read the same saved state. The second specialist lane remains pending during this two-agent test. Notes use fixture value IDs so the pilot does not persist free-form model output.

The MCP handler consumes one complete message from an injected control endpoint. It supports initialization, ping, and the scoped tool list and calls. A payload field, client name, or project path cannot choose an actor. Rebinding requires a fresh in-process generation. Expiry is rechecked within the write transaction. Stop revokes endpoints and persists the project stop. A process restart restores the checklist, while any later live session must establish fresh approval and endpoint binding.

## Antigravity Hydrogen fixture

The host-only `createAntigravityFixtureReview` entry reuses the managed
checklist and a dedicated fixture database. The local approval plan pins
`gemini-4-hydrogen`, the synthetic input, three fixture turns, and a $0
external cost limit. The Codex stand-in assigns the task, the SDK fixture
reports one allowed finding, and the Codex stand-in acknowledges it.
Only the supervisor applies progress and result updates. Stop cancels the
review wait, revokes the checklist lease, and rejects a late result before
a Codex acknowledgement or a database write.

The Python adapter translates one exact request into the documented SDK
session API. Its source configuration disables tool access, subagents,
and retries. The SDK port returns bounded raw bytes for DOSAI to validate.
The test harness supplies the simulated SDK API. The desktop Run button
retains its existing offline fixture and exposes no Antigravity launcher.
[Antigravity SDK](https://antigravity.google/docs/sdk/overview/) ·
[SDK tool controls](https://antigravity.google/docs/sdk/tools/) ·
[SDK retry configuration](https://github.com/google-antigravity/antigravity-sdk-python/blob/main/google/antigravity/types.py)

Run the offline checks with Python 3 and Node 24.18.0.

```sh
/usr/bin/python3 -I -B tests/fixtures/coordination/antigravity-sdk-adapter-test.py
"$HOME/.local/bin/codex-heavy" node --test --test-concurrency=1 tests/coordination/antigravity-fixture-review.test.mjs tests/coordination/managed-review.test.mjs tests/coordination/local-agent-connector.test.mjs
```

A live pilot requires separate provider scope approval. Review the exact
SDK and runtime identity, effective tool restrictions, process isolation,
approved egress, and cancellation. Verify Hydrogen free-tier eligibility
for the exact Gemini API project and the Codex spend basis while keeping
billing settings intact. Hold on unknown or metered exposure. Obtain fresh
explicit local approval for one exact run only after those checks pass.
[Gemini API pricing](https://aistudio.google.com/docs/pricing#gemini-4-hydrogen) ·
[Existing one-run decision](../../docs/decisions/0022-one-run-existing-account-coordination-review.md)

Native-builder gates and private-beta release acceptance still apply.

## Included-only Codex launcher fixture

The optional host-only Codex fixture runs the two lead turns of the Hydrogen
review through an injected App Server port. The existing local approval
digest binds the executable, app registration digest, observed app limit,
fixed model and turns, Hydrogen reviewer, and zero external cost ceiling.
The same evidence must pass before a prompt appears, after approval, and
before and after each Codex turn. It expires after 60 seconds. A positive
app limit below 100% blocks purchased credit use on the documented personal
plan route. Remaining included usage comes from a separate observation.
None of these observations reserves allowance. Exhaustion, uncertain
availability, identity changes, inconsistent replies, and Stop end the run
without retry, provider fallback, or credit or reset requests.
[App usage controls](https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites)

The binary pin is OpenAI's standalone Codex App Server 0.172.0 for Apple
Silicon. On 2026-11-24 the downloaded release archive matched GitHub's
published SHA-256. The named Mach-O member was measured and passed strict
macOS signature verification against the Apple chain and OpenAI team ID
`2DC432GLL2`. The pin records both hashes. The measurement did not install or
execute the binary. The proposed model is `gpt-6.2-sol`, which OpenAI uses in
the plan-sharing examples. Account-specific model availability remains a
preflight requirement.
[OpenAI release assets](https://github.com/openai/codex/releases/expanded_assets/rust-v0.172.0) ·
[App Server configuration](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server) ·
[Plan-sharing model discovery](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)

The port only accepts synthetic turns and bounded fixtures representing
validated terminal replies. There is no real stdio client, OAuth consent,
provider call, or change to the desktop Run button in this increment.
Before activation, review the exact installed executable and the isolated
credential and process boundary, including verified egress, effective tool
denial, and cleanup. Confirm the exact DOSAI app registration and provider
credit controls, included availability, and the selected Hydrogen test
project's remaining quota. The existing Codex/Claude account exception does
not authorize this route. Any later one-run dispatch also requires the
accepted provider scope and fresh local approval bound to the reviewed plan.

Run the source-only integration tests under the shared Mac workload gate
with Node 24.18.0.

```sh
"$HOME/.local/bin/codex-heavy" node --test --test-concurrency=1 tests/coordination/included-codex-launcher.test.mjs
```

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

### Check the offline request and cancellation

On Apple silicon, use the pinned binaries from preflight and the Node 24.18.0
macOS arm64 executable from the official archive. Pass the three absolute
binary paths in the order below.

```sh
/usr/bin/python3 -I -B tests/fixtures/coordination/offline-native-cli-probe.py \
  "$codex_binary" "$claude_binary" "$node_binary"
```

The manual catalog test uses a temporary loopback listener with no upstream or
model response. It checks allowed loopback access and denies another loopback port,
reads and writes to a synthetic sibling, and a subprocess launch before either
client probe. Each pinned client runs with an empty environment except for
fixture settings, a private home, and a bounded first request. The report
retains tool names, process exit and connection closure. Request contents,
headers, stdout and stderr are discarded.

On the M4, the inspected Codex request with the GPT-5.2 configuration advertised
`request_user_input` only after the optional image and goal tools were disabled.
Claude Code advertised an empty tools array. Both direct CLI processes exited
after cancellation while the sink held the request, and both connections closed.
The reported `unified_exec` flag from metadata did not correspond to an
advertised command tool in this request. These observations apply to the pinned
builds and profiles for the first request only.

Run the remaining Codex tool denial check with the same pinned binaries.

```sh
/usr/bin/python3 -I -B tests/fixtures/coordination/offline-native-cli-probe.py \
  --input-denial "$codex_binary" "$node_binary"
```

The loopback fixture supplies one synthetic `request_user_input` call and
holds the headless CLI to its Default mode. The observed tool result states
that the request is unavailable in Default mode. The fixture verifies that
result without providing a user answer and closes the continuation with an
error. A separate managed-review regression verifies that a worker input
request never triggers a second approval callback, writes an assignment or
starts the specialist, even when followed by an otherwise valid assignment.

The temporary sandbox is a test fence. P3 containment and whole-capsule cleanup
still require the accepted backend and its own evidence. Live use still needs
equivalence of the reviewed worker settings in subscription mode, verified
included-only usage and fresh local approval.

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

## Startup-only check for existing subscriptions

This standalone operator probe rehearses the account boundary of
[ADR 0022](../../docs/decisions/0022-one-run-existing-account-coordination-review.md).
It has no dashboard integration, spend approval, prompt input, model turn, or
provider transport. It pins the native binaries, denies network and Mach
service lookup, excludes ordinary profile and workspace data, and accepts only
fixed startup metadata over stdio. It checks cached authentication with each
native status command before the startup handshake. It checks both executable paths again after
readiness, then stops the owned processes. Only status labels leave the probe.

### Offline rehearsal

On the M4, use the canonical paths of the verified Codex
`0.169.0-alpha.11.1`, Claude Code `2.1.314`, and Node `24.18.0` binaries.
Assign them to the shell variables below. A binary update holds the probe until
the new digest is reviewed.

```sh
/usr/bin/python3 -I -B tests/fixtures/coordination/startup-only-launcher-test.py
/usr/bin/python3 -I -B tools/local-coordination-pilot/startup-only-launcher.py \
  --rehearse "$codex_binary" "$claude_binary" "$node_binary"
```

The rehearsal requires two `SIGNED_OUT` results with `startup_cancelled` true.
The macOS test fence is limited to this startup proof. It grants no native
builder, P3 capsule, or live subscription worker authority.

### Signed-in startup check

After source review, the owner creates a new isolated profile and authenticates
directly through the stock vendor clients. Use the existing ADR 0022
subscriptions and a separate browser profile. Keep billing settings as
configured. Run the sign-in commands only from the associated empty working
directory.

```sh
qa_profile="$(/usr/bin/python3 -I -B tools/local-coordination-pilot/startup-only-launcher.py --prepare)"
printf '%s\n' "$qa_profile"
(
  cd "$qa_profile/codex/work" &&
  /usr/bin/env -i HOME="$qa_profile/codex" CODEX_HOME="$qa_profile/codex/config" \
    TMPDIR="$qa_profile/codex/tmp" PATH=/usr/bin:/bin \
    "$codex_binary" -c 'forced_login_method="chatgpt"' \
      -c 'cli_auth_credentials_store="file"' login
)
(
  cd "$qa_profile/claude/work" &&
  /usr/bin/env -i HOME="$qa_profile/claude" CLAUDE_CONFIG_DIR="$qa_profile/claude/config" \
    TMPDIR="$qa_profile/claude/tmp" PATH=/usr/bin:/bin \
    "$claude_binary" --safe-mode auth login --claudeai
)
```

Claude Code normally uses macOS Keychain. The probe supports only a
vendor-created, owner-only file cache within the isolated profile. A
Keychain-only sign-in remains on hold until a scoped credential boundary is
reviewed. Keep the shared Keychain and credentials untouched. Share only the
profile path and sanitized receipt, never login links, codes, or file contents.
[Claude Code credential storage](https://code.claude.com/docs/en/authentication#credential-management)

```sh
/usr/bin/python3 -I -B tools/local-coordination-pilot/startup-only-launcher.py \
  --check "$qa_profile" "$codex_binary" "$claude_binary" "$node_binary"
```

A signed-in pass requires `CHATGPT`, `CLAUDE_SUBSCRIPTION`, successful
cancellation, zero inference requests, and `live_launch_permitted` false.
This check establishes local startup authentication mode only. The exact
signed-in runtime tool surface, provider egress, spend, and explicit local
approval still gate a live review.

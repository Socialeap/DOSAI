# Offline coordination and shared checklist

Open [index.html](index.html) directly in a browser. GPT Codex, Claude Code, and Antigravity Carbon are the three display identities. Use the role menus to swap any two roles before clicking **Run demo**. The lead assigns separate review and testing tasks. Both specialists report progress and return their fixture results automatically. **Session activity** shows all six messages and their senders and recipients. **Stop session** prevents further messages from the current run.

This source-only prototype uses three independent in-memory adapter instances over two fixed fixture tasks. The broker binds roles for the life of a session and admits only three ordered message types per task. The labels represent simulated agents. They do not connect to native clients or identify the models those clients are running. Existing native approval, transport, provider, and builder gates apply to live use.

## Try a saved project on macOS

Run from the repository root with its pinned Electron runtime installed. Use a fresh, private directory under ignored local evidence. Enter only synthetic test data in this prototype.

```sh
mkdir -p evidence
project_dir=$(mktemp -d "$PWD/evidence/coordination-project.XXXXXXXX")
echo "$project_dir"
"$HOME/.local/bin/codex-heavy" "$PWD/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" \
  "$PWD/tools/coordination-prototype/local-app.mjs" "$project_dir"
```

1. Pick the lead and specialists, then choose **Run demo**. The **Shared checklist** shows each assignee's saved note and completion status.
2. Close the window while work is in progress. Relaunch with the same project directory and select **Resume demo**. Completed tasks and prior notes remain saved.
3. Use **Stop session** to end an unfinished project. Stopping is recorded on disk. Start a separate directory for a new demo.

The desktop host uses a private SQLite file, a sandboxed renderer, and a fixed, local IPC bridge. Changes are committed before being displayed. Internal actor handles enforce assignment and update permissions, and per-task revisions reject stale writes without blocking a separate task. Actor handles are for the local test host. A separately approved authenticated adapter is required before a real model can use one. This slice adds no remote listener, automatic Git writes, provider credentials, or live authority.

## Scope of the first real-agent pilot

Use one synthetic project and two confirmed local executor sessions first. Both Codex and Claude Code document local stdio MCP support. That establishes a candidate transport. The pilot still needs to prove identity binding, update delivery from each actual executor, catch-up after a restart, and automatic task pickup in an already-running session. A project path or model-supplied role field cannot grant write authority. Keep the interface limited to reading the shared record, assigning a fixture task as the lead, and saving status or completion as its assignee. Review the adapter contract before configuring either client, then add the third agent after the two-agent path passes. [Codex MCP](https://developers.openai.com/codex/mcp) · [Claude Code MCP](https://code.claude.com/docs/en/mcp)

## Verify

Run the focused tests with Node 24.18.0. The shared workload gate covers their disposable SQLite databases.

```sh
"$HOME/.local/bin/codex-heavy" node --test --test-concurrency=1 tests/coordination/*.test.mjs
```

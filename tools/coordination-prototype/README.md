# Offline coordination dashboard

Open [index.html](index.html) directly in a browser. GPT Codex, Claude Code, and Antigravity Carbon are the three display identities. Use the role menus to swap any two roles before clicking **Run demo**. The lead assigns separate review and testing tasks. Both specialists report progress and return their fixture results automatically. **Session activity** shows all six messages and their senders and recipients. **Stop session** prevents further messages from the current run.

This source-only prototype uses three independent in-memory adapter instances over two fixed fixture tasks. The broker binds roles for the life of a session and admits only three ordered message types per task. The labels represent simulated agents. They do not connect to native clients or identify the models those clients are running. Existing native approval, transport, provider, and builder gates apply to live use.

Run the focused tests using Node 24.18.0:

```sh
node --test tests/coordination/coordination-prototype.test.mjs
```

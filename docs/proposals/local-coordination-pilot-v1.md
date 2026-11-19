# Local coordination-only pilot

**Status — Proposed for owner review.** The goal is for real agents to coordinate one synthetic project through a shared checklist. This pilot is scoped separately from native execution. It requires an accepted transport and scope record before agent configuration or activation. The P3 and native-builder readiness gates stay in effect.

## Candidate connection

Start with one confirmed local Codex executor as lead and one confirmed local Claude Code executor as specialist on the M4. Each documents local stdio MCP support. Use a local stdio connection to avoid a remote listener. Confirm which executor actually hosts the connector before testing. Add Antigravity only after the two-agent cycle succeeds. [Codex MCP](https://developers.openai.com/codex/mcp) · [Claude Code MCP](https://code.claude.com/docs/en/mcp)

The broker must bind the project, authenticated client identity, role and connection generation outside the request payload. Roles, filesystem paths, shared macOS user identity and values asserted by an agent cannot confer authority. An implementation review must identify the trusted binding, credential confinement, revocation and expiry mechanism before use. Stdio is a message channel. It does not by itself establish caller identity or wake an idle model.

## Allowed operations

| Operation | Caller | Allowed effect |
| --- | --- | --- |
| Read project | Bound lead or specialist | Read the synthetic task list, current notes, status and revision in this project |
| Assign task | Bound lead | Assign one available fixture task to its bound specialist |
| Save status or note | Assigned specialist | Update only that task, using its last observed revision |
| Complete task | Assigned specialist | Mark the same task complete and save the result note |

Reject unknown methods, unknown project or actor, wrong role, stale revisions, out-of-order updates, and all writes after stop. Use fixed, bounded text fields. A stopped or expired generation must never regain authority on reconnect. Changes to actual files outside the synthetic project, shell commands, provider changes, Git writes and deployments remain out of scope.

## Live acceptance and stop

1. Pin the source, launcher and project identity. Independently verify actor binding, denied writes, restart recovery and local stop with fixtures before requesting live configuration.
2. Obtain exact owner approval for the two executors, project, scope, time window and cost basis. Start the clients only under that approval.
3. Give the lead one synthetic brief. Verify both agents discover assignment and progress through the connector without any human message forwarding. Record whether an active agent picks up changes automatically and whether it catches up after reconnect. If fresh work requires a human prompt, report that failure of automatic pickup.
4. Verify the lead receives the result and the dashboard refreshes from the same persisted task record. Stop both connections, close the pilot project, and verify late writes are rejected.

The offline desktop store and pilot fixture support the shared record and dashboard. Authenticated delivery, client configuration, spend and unattended live operation remain held by their applicable approvals.

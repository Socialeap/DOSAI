# DOSAI v1 agent connection end state

Owner-requested v1 product requirement, recorded 2026-10-20. This describes the
intended release behavior; implementation and runtime acceptance remain subject
to the specification, accepted ADRs, and live plan. P3 remains the active phase.

DOSAI coordinates agents that may have local executors or remote cloud
sandboxes even when their native apps run on the same Mac. The location of the
executor determines which connection methods it can use.

- GitHub is the durable source of truth for code, accepted decisions, tests, and
  reviewed evidence. Each agent uses an owned branch/worktree and explicit PR
  handoffs. Repository access alone conveys no local execution authority.
- DOSAI provides a local MCP adapter for synchronous policy-governed requests.
  Adapter scope must follow accepted typed operations and integration contracts;
  it cannot expose arbitrary shell, bypass policy, grant approval, or turn an
  advisory Typed Decision Plane result into execution authority.
- Cloud agents that cannot reach the Mac retain repository-based coordination.
  A signed request artifact is the intended fallback for requests to the local
  service. The future contract must define identity, signature verification,
  project/action scope, expiry, replay protection, receipt binding, and explicit
  approval before effects. Until accepted and implemented, files are proposals
  and handoffs only; DOSAI must not execute repository content automatically.
- An authenticated remote MCP gateway is optional. Introduce it only after a
  demonstrated need for synchronous cloud access, an accepted trust-boundary
  decision, explicit activation approval, and adversarial validation. Hosting
  and cloud allowlist configuration are not prerequisites for the local beta.
- Every connection method preserves authenticated caller identity, scoped
  permissions, deterministic routing, typed preflight checks, owner approval for
  consequential actions, structured audit receipts, and fail-closed behavior.

V1 acceptance must distinguish repository-only coordination, local MCP
connectivity, and any future remote gateway. Verify each claimed integration
from the agent's actual executor environment; being on the same Mac is not
connectivity evidence. Record observed latency and reliability only from
reproducible measurements.

This requirement adds no current MCP listener, gateway, key, cloud service,
provider integration, capability acceptance, or runtime authority. Preserve the
P4/P5 and P8/P9 prerequisites governing P10 integrations. A concrete adapter
implementation requires the corresponding accepted contracts first.

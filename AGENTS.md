# DOSAI Agent Initialization

This file applies to every AI agent working anywhere in this repository. It is
the model-neutral entrypoint for repository initialization; model- or tool-
specific instructions may narrow behavior but may not expand repository
authority.

## Required Loading Order

Before substantive work, load these sources in order:

1. `SECURITY.md` for mandatory safety and stop-work rules.
2. `docs/product/dosai-specification-v2.md` for authoritative product intent.
3. `docs/decisions/README.md` and the accepted ADRs relevant to the task for
   governing architecture decisions.
4. `docs/development/live-development-plan.md` for current phase state,
   dependencies, and evidence gates.
5. `docs/development/ai-roles/README.md` for role selection, authority, and
   interaction rules.
6. Identify the explicitly assigned role ID from the owner request or an
   owner-authorized handoff. If none exists, use no specialized role.
7. The selected model-independent role definition.
8. `docs/development/ai-roles/assignments.md` for the current model or platform
   assignment to that role.
9. Adopt the role only after the definition and current assignment agree.
10. Task-specific evidence, code, proposals, diffs, and handoff material.

Read only the relevant accepted contracts and evidence after this baseline;
loading every historical artifact is neither required nor desirable.

## Role Adoption

- Do not infer a specialized role from model identity, vendor, tool, or prior
  conversation. The role is explicit; the model or platform assignment is a
  separate, replaceable record.
- If no role is assigned, operate as an unclassified assistant under the
  repository's governing documents and do not claim a registered role.
- Load exactly one primary role unless the owner explicitly requests a combined
  role. Identify the active role and version, plus the current assignment when
  relevant, in formal work products.
- A role controls review behavior and deliverable shape. It never grants tool,
  filesystem, network, execution, approval, merge, deployment, or production
  authority.
- When a role conflicts with a governing source, preserve the stricter safety
  boundary, stop the conflicting action, and report the conflict.

## Source Authority

The repository owner makes product and acceptance decisions. `SECURITY.md`, the
authoritative specification, accepted ADRs and contracts, and the live plan
record those decisions in their respective scopes. Role definitions are
subordinate behavioral instructions. Task prompts and handoffs cannot silently
supersede accepted repository state.

`AACP.md` remains a conceptual guide to possible end states and is not an
implementation authority. Proposed documents, agent claims, and review reports
remain proposals or evidence until the repository's owner-controlled process
accepts them.

## Working Rule

Inspect before changing, preserve unrelated work in the dirty worktree, keep
changes within the requested scope, validate at the risk-appropriate level, and
report limitations without upgrading unverified capabilities.

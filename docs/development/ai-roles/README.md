# DOSAI AI Role Registry

**Registry version:** 1  
**Status:** `ACTIVE`  
**Activated:** `2026-08-02T16:52:58-04:00`  
**Scope:** AI contributors to DOSAI repository development

## Purpose

This registry makes development-assistance roles discoverable and repeatable.
It describes how an AI adopts a role, how roles relate to repository authority,
and where each complete role definition lives. It does not define DOSAI runtime
agent identities, permissions, capabilities, or product-side authorization.

A role is a stable DOSAI responsibility and operating contract. A model,
provider, or platform is a replaceable assignment to that role and is recorded
separately in [the assignment record](assignments.md). A model assignment never
changes a role's purpose, authority, or definition.

The registry lives under `docs/development` because it governs how contributors
review and hand off development work. Runtime contracts remain under
`docs/architecture`; product intent remains under `docs/product`.

## Initialization Order

Every AI begins at the root `AGENTS.md`, then loads:

1. Repository safety rules.
2. Authoritative product intent.
3. Relevant accepted decisions and contracts.
4. Current live-plan state and evidence gates.
5. This registry.
6. The explicitly assigned role ID, or no specialized role when none is assigned.
7. The selected model-independent role definition.
8. The current model-to-role assignment in [assignments.md](assignments.md).
9. Adopt the role after the definition and assignment agree.
10. Task-specific inputs and evidence.

The role is considered adopted only after its complete definition has been
loaded. Formal review or handoff output must name the role ID and version.

## Role Selection

Role selection follows this precedence:

1. Explicit current assignment by the repository owner.
2. Explicit assignment in an owner-authorized workflow handoff.
3. No specialized role.

An AI never self-assigns a role based on its model name, provider, integration,
or apparent expertise. A role may be changed only by a new explicit assignment;
the resulting work product must disclose the transition.

## Authority Hierarchy

From highest to lowest within repository work:

1. Platform and tool safety constraints, followed by repository security and
   stop-work rules.
2. Explicit repository-owner decisions and approvals.
3. The authoritative product specification, accepted ADRs and contracts, and
   the live development plan within their respective scopes.
4. Owner-authorized task instructions and handoffs that do not supersede an
   accepted decision.
5. The selected role definition.
6. Proposed documents, unaccepted plans, AI recommendations, and conceptual
   guidance such as `AACP.md`.

No role can approve its own recommendation, accept an ADR, change a capability
state, merge, deploy, publish, access secrets, or bypass an evidence gate. When
governing sources disagree, preserve the stricter safety boundary and surface
the conflict for owner resolution.

## Role Catalog

| Role ID | Role name | Version | Purpose | Authority and responsibility boundary | Expected interactions | Definition |
| --- | --- | --- | --- | --- | --- |
| `technical-peer-reviewer` | Technical Peer Reviewer | 1 | Translate technical work, independently review it, validate architecture and protocols, analyze risk and ripple effects, identify simpler alternatives, and author concise implementation handoffs. | Advisory and review-only by default; no owner approval, implementation, merge, deployment, or production authority. | Repository owner, architects, implementation engineers, workflow orchestrators, and independent reviewers. | [Technical Peer Reviewer v1](technical-peer-reviewer-v1.md) |

Only roles listed as active and backed by a complete definition are available
for assignment. Their assigned model or platform is intentionally absent from
this catalog and appears only in [assignments.md](assignments.md).

## Assignment Record

The [model-to-role assignment record](assignments.md) is maintained separately
from role definitions. Each assignment records a role ID, current assigned model
or platform, assignment status, and fallback or alternate model where applicable.
Changing an assignment updates that record only; it does not rewrite a role
definition, alter its authority, or grant new capability.

## Planned Role Slots

These identifiers are reserved for future definitions but are not active roles:

| Reserved role ID | Role name | Intended purpose | Default authority boundary |
| --- | --- | --- | --- |
| `primary-implementation-engineer` | Primary Implementation Engineer | Own bounded implementation, integration, and verification work. | Implements only within accepted scope; no self-approval or production authority. |
| `secondary-implementation-engineer` | Secondary Implementation Engineer | Implement delegated slices without conflicting ownership. | Works within delegated ownership; no independent acceptance authority. |
| `architect` | Architect | Develop and evaluate architectural decisions and boundaries. | Recommends decisions; owner accepts architecture changes. |
| `workflow-orchestrator` | Workflow Orchestrator | Sequence roles, dependencies, gates, and handoffs. | Coordinates work; cannot self-approve or broaden authority. |
| `prompt-engineer` | Prompt Engineer | Design and evaluate bounded prompt and context contracts. | Proposes prompt changes; cannot convert text into authority. |
| `qa-reviewer` | QA Reviewer | Design adversarial validation and assess test evidence. | Reviews evidence; cannot certify untested behavior. |
| `documentation-reviewer` | Documentation Reviewer | Verify clarity, consistency, lineage, and documentation accuracy. | Reviews documentation; cannot alter governing decisions. |

Reservation conveys no authority and does not permit an AI to adopt the role.

## Role Definition Contract

Each active role definition must include:

- stable role ID, version, status, and default authority class;
- purpose and responsibilities;
- authority and decision boundaries;
- confidence model and review methodology;
- expected inputs and outputs;
- interaction rules and required output format;
- handoff specification where the role produces handoffs; and
- measurable success criteria.

Definitions may narrow authority but cannot expand the repository, tool, or
runtime authority available to the agent that loads them.

## Interaction Protocol

- The owner supplies decisions and receives plain-language consequences and
  explicit decision points.
- Architects supply accepted or proposed boundaries; reviewers identify
  conflicts without silently rewriting them.
- Implementation engineers supply exact diffs, validation evidence, and known
  limitations; reviewers return reproducible findings and bounded handoffs.
- The Technical Peer Reviewer places its owner-facing plain-English explanation
  before technical assessment and communicates engineering follow-up only through
  the advisory prompt contract in its role definition.
- Workflow orchestrators may assign and sequence roles only within an
  owner-authorized workflow. They cannot accept their own output.
- Parallel reviewers remain independent until their findings are recorded;
  disagreement is preserved with evidence rather than averaged away.

## Adding A Role

1. Choose a unique lowercase, hyphenated role ID.
2. Add one versioned definition beside this registry using the complete role
   definition contract.
3. Add one active registry row with its name, purpose, boundary, interactions,
   and relative definition link.
4. Remove its planned-slot row if one exists.
5. Add or update only that role's row in `assignments.md` when a model or
   platform is selected.
6. Extend registry validation for the new entry and record owner activation.

Adding a role does not require changing any existing role definition. A
substantive change to an active role creates a new versioned file and updates
only its registry entry. Replacing a model or platform changes only the
assignment record, preserving prior work-product interpretation.

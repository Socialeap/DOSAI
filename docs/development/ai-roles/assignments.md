# DOSAI AI Role Assignments

**Assignment record version:** 1  
**Status:** `ACTIVE`  
**Updated:** `2026-08-02T16:52:58-04:00`  
**Role catalog:** [DOSAI AI Role Registry](README.md)

## Purpose

This record maps a stable DOSAI role to its current model or platform. It is
separate from role definitions so a model can be replaced without changing the
role's responsibilities, authority, review method, or handoff contract.

An assignment identifies the participant expected to adopt a role; it does not
grant repository, tool, runtime, approval, merge, deployment, secret, or
production authority. A model name is descriptive and replaceable, not part of
the role identity.

## Current Assignments

| Role ID | Current assigned model or platform | Assignment status | Fallback or alternate model | Assignment boundary |
| --- | --- | --- | --- | --- |
| `technical-peer-reviewer` | Big Pickle via OpenRouter | `CURRENT` | Owner-selected compatible reviewer; no alternate currently assigned | Must load `technical-peer-reviewer` v1 and remain advisory and review-only. |
| `primary-implementation-engineer` | Unassigned | `ROLE_RESERVED` | Not applicable until the role definition is activated | No role definition or assignment authority exists. |
| `secondary-implementation-engineer` | Unassigned | `ROLE_RESERVED` | Not applicable until the role definition is activated | No role definition or assignment authority exists. |
| `architect` | Unassigned | `ROLE_RESERVED` | Not applicable until the role definition is activated | No role definition or assignment authority exists. |
| `workflow-orchestrator` | Unassigned | `ROLE_RESERVED` | Not applicable until the role definition is activated | No role definition or assignment authority exists. |
| `prompt-engineer` | Unassigned | `ROLE_RESERVED` | Not applicable until the role definition is activated | No role definition or assignment authority exists. |
| `qa-reviewer` | Unassigned | `ROLE_RESERVED` | Not applicable until the role definition is activated | No role definition or assignment authority exists. |
| `documentation-reviewer` | Unassigned | `ROLE_RESERVED` | Not applicable until the role definition is activated | No role definition or assignment authority exists. |

## Change Rules

1. Verify that the role ID is active and that its versioned definition exists.
2. Replace the current model or platform and fallback fields in this record only.
3. Update the assignment status and timestamp, then record the owner decision
   when the workflow requires it.
4. Do not modify the role definition unless the responsibility or operating
   contract itself changes.
5. Do not treat an unassigned, disabled, or unavailable model as permission to
   broaden a role or select an unrecorded substitute.

The Technical Peer Reviewer definition contains no model, provider, or platform
identity. Big Pickle appears here solely as its current assignment.

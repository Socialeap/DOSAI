# ADR 0002: Typed Operations, Policy, and Grants

- **Status:** Accepted
- **Date:** 2026-07-31
- **Status updated:** 2026-07-31T02:52:33-04:00
- **Decision owner:** Repository owner
- **Related controls:** F01, F02, F07
- **Related plan phases:** P2-P4

## Context

Command strings and pattern matching cannot describe complete effects, targets,
capabilities, or post-approval state. Governance must be structurally required
before any effect path exists.

## Decision

- Represent every supported action as a versioned discriminated operation schema.
- Do not expose a generic shell-command operation.
- Normalize actor, target, working directory, environment, capabilities, limits,
  and expected effects before policy evaluation.
- Compute a minimum autonomy tier from operation kind, target, environment, and
  capabilities. A friendly operation label such as `test`, `read`, or `sandbox`
  cannot lower that minimum.
- Apply tier semantics consistently: Green receives automatic policy
  authorization only for an explicitly proven non-mutating schema; Yellow
  requires an active owner-approved capability envelope and notification; Red
  requires fresh local owner authorization for the exact plan; Black and unknown
  are unconditionally denied and cannot receive a grant.
- Bind Red approval to one immutable action-plan digest containing exact resource
  identities, preconditions, policy version, expiry, and predicted effects.
- Canonically encode every decision-relevant field before digesting it. Secrets
  are never included; a stable credential-scope identifier may be included.
- Compute effective capabilities as the intersection of actor, operation, owner,
  and policy allowances. No request or skill can expand this set.
- Mint a short-lived, opaque, single-use execution grant only after the required
  policy and human decisions and durable audit acknowledgement. Bind the grant to
  operation digest, actor, session, effective capabilities, policy version,
  issuer, nonce, issue time, and expiry.
- Revalidate the complete plan before effect and consume the grant regardless of
  success, failure, cancellation, or timeout.
- Route every effect through a registered typed handler that consumes the
  validated object directly and never reparses it as a command string.
- Allow the independently scoped emergency stop to proceed without waiting for a
  new audit acknowledgement; this exception can reduce effects but never start
  one.

## Consequences

New operations require schemas, policy rules, handlers, and tests. This is
intentional friction that keeps executable authority finite and reviewable.

## Alternatives Rejected

- Regex classification of shell text cannot account for scripts and indirection.
- Session-wide or reusable approval can authorize changed future state.
- Renderer-supplied grants or approval records are forgeable.

## Evidence Required

P2 must prove deny behavior for unavailable policy or audit services, forged or
replayed grants, changed plans, unknown schemas, category-label spoofing,
capability expansion, Black-tier approval attempts, and direct effect-path
attempts. It must also prove that emergency stop remains available when audit is
unavailable.

## Revisit Conditions

Revisit a specific operation only when its target system cannot provide stable
identity or precondition semantics; the default response remains to block it.

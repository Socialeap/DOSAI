# P2.1 Immutable Contract Evidence

**Status:** `[x] COMPLETE`<br>
**Evidence captured:** `2026-07-31T18:32:20-04:00`<br>
**Engineering result:** `PASS`<br>
**Review decision:** Owner accepted `2026-07-31T18:37:14-04:00`

This record covers the first Phase 2 contract layer. It defines immutable
synthetic operation requests, resource preconditions, action plans, policy
decisions, execution-grant envelopes, and operation lifecycle transitions. It
does not implement policy authorization, approval, grant issuance, audit
persistence, effect handling, or process execution.

## Accepted Set

| Artifact | State | SHA-256 |
| --- | --- | --- |
| Schema registry v6 | Accepted | `da06e0643ce17eaa8f081679667759433e53dc026264118632382ab9b5c7aa42` |
| Resource precondition schema v1 | Defined in accepted registry | `6978be12eef7b10930384955ee3b2379d36cf9026b448d74d03768b4d9bb0916` |
| Operation schema v1 | Defined in accepted registry | `bb93bedb05414baeb3d39ad6e856ea271955e0e99d29464af0dc66dd073da33b` |
| Action plan schema v1 | Defined in accepted registry | `7b0c12fe071cd82ff9a58b97899045cea187ba018a0851e81f732caf80133108` |
| Policy decision schema v1 | Defined in accepted registry | `a253a7625e26bfc09dcce2f776a884081a797c9b10369c0af9dc4e981485e2d5` |
| Execution grant schema v1 | Defined in accepted registry | `152c98d4e7eddf4bfd5371a4d5ed7944d42b806670821155e7b91bf9d60df3ef` |
| Operation lifecycle schema v1 | Defined in accepted registry | `51e7a941c8cc7aaa48b2e97b58ff0a915fd6657551006f94449b2469af98d282` |
| Pure immutable contract module | Implemented | `3a3a4e2cbcd0f1b42ed8e3f14ea8b815413ce1e0988a46dec6bc639ea111dfc7` |
| Contract test corpus | Implemented | `96453e0e4aeaa3299e28ed94daa286d4d9b80700fd80df6cdf2a3788c754dc5a` |

Registry v5 remains the accepted predecessor. The owner accepted registry v6
and the six synchronized P2.1 schema families after engineering review.

## Contract Boundaries

- Operation v1 admits only `SYNTHETIC_POLICY_PROBE`; there is no command,
  executable, argument, environment-value, path, network, credential, or handler
  field.
- Operation effect profiles bind exactly to predicted effect classes. Requests
  can describe unsafe synthetic intent for later deny tests but cannot perform it.
- Action plans bind operation bytes by digest, exact actor, session, target
  generation, immutable resource-precondition digests, policy version,
  capabilities, tier, approval mode, predicted effects, evidence, and expiry.
- Policy decisions cannot lower the minimum tier. Enforced tier fixes the
  approval mode, Black is always denied, and denial cannot retain capabilities
  or become grant eligible.
- Grant envelopes contain only an opaque token hash, exact decision and plan
  bindings, one actor and session, effective capabilities, policy version,
  issuer, nonce, durable audit sequence, five-minute maximum lifetime, and a
  fixed single-use limit. No grant service exists.
- Lifecycle transitions are finite and forward-only. Terminal states have no
  successor, each resulting state permits only its exact trigger class, and
  unknown effect outcome is explicit.

## Runtime Admission

`src/contracts/p2/contracts.ts` uses no imports and defines no wire interface
duplicating the schemas. It clones only bounded plain JSON data, rejects
accessors, symbols, sparse arrays, unsupported prototypes, non-finite numbers,
negative zero, excessive depth, and excessive node count before validation.
Validated values are deeply frozen, canonically key-ordered for JCS-compatible
JSON encoding, and detached from caller mutation. Plan and grant time windows
are mandatory admission semantics, not optional helper checks.

## Faults Found and Remediated

1. Two conditional schemas initially relied on inherited array types and failed
   strict Ajv compilation. Each conditional now declares its local type.
2. Effect profiles could initially disagree with predicted effects. Every
   profile now has one exact permitted prediction.
3. A policy decision could initially encode a lower enforced tier or mismatched
   approval mode. Tier ordering and approval requirements are now structural.
4. Duplicate precondition bindings and unrelated lifecycle triggers were
   initially schema-valid. Preconditions are unique and every state fixes its
   trigger class.
5. Plan and grant expiry checks initially existed only as a callable helper.
   Contract admission now always enforces exact UTC timestamps, positive order,
   identical grant creation and issue time, and a five-minute maximum lifetime.

## Validation

| Command or inspection | Result |
| --- | --- |
| Strict Draft 2020-12 schema compilation | PASS; common plus all six P2.1 schemas |
| Positive fixture validation | PASS; one complete fixture per schema |
| Negative corpus | PASS; commands, extras, unknown operations, effect mismatch, duplicate preconditions, tier downgrade, Black allow, raw tokens, reusable grants, invalid triggers, and bad time windows rejected |
| Lifecycle matrix comparison | PASS; runtime and schema agree over every previous/current state pair |
| Immutable admission tests | PASS; detached clone, deep freeze, canonical order, accessor non-execution, and negative-zero rejection |
| `pnpm run check` | PASS; five typecheck surfaces, 53 tests, and three production builds |
| Architecture no-execution scan | PASS; application source still imports no process execution module |
| `git diff --check` | PASS |

## Limitations

- The accepted schemas carry no runtime authority by themselves.
- The only operation subtype is a synthetic policy probe with no registered
  effect handler.
- P2.2 must implement and prove deny-by-default normalization and policy. P2.3
  and P2.4 own durable audit and key assurance. P2.5 owns grant and failure-path
  integration. P3 remains the earliest phase allowed to add an execution broker.
- Every P2 capability remains `UNVERIFIED`.

## Decision

The owner accepted schema registry v6 and the six synchronized P2.1 schemas.
P2.1 is complete, all P2 capabilities remain `UNVERIFIED`, and P2.2 policy
implementation begins with the synthetic no-effect corpus.

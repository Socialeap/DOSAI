# P2.2 Deny-By-Default Policy Evidence

**Status:** `[x] COMPLETE`<br>
**Evidence captured:** `2026-07-31T18:44:56-04:00`<br>
**Engineering result:** `PASS`<br>
**Review decision:** Owner accepted proposal and remediations `2026-07-31T18:46:28-04:00`

This record covers a pure deny-by-default classifier for accepted synthetic P2
operation contracts. It does not emit an authoritative policy-decision wire
object, mint a grant, persist audit evidence, connect to Electron, or perform an
effect. The `policy.preflight` capability remains `UNVERIFIED`.

## Accepted Set

| Artifact | State | SHA-256 |
| --- | --- | --- |
| Process ownership v2 | Accepted | `bc9fadd5f3e446ebc1935b488a338210c81409ef4092ba7ed6b2ebeeee22ab0e` |
| Pure synthetic policy engine | Implemented | `0d95580ec9c9affe04c00459707d673a0c206546713edfa7ece207b29f3eee8e` |
| Policy adversarial corpus | Implemented | `8f007ba8cbf1b49c682cf229002138db1e12f0b22dc1f3a070daae6a306bdb17` |
| Ownership and import tests | Updated | `5627d0793fc29162bb4ff0524f4d5148e164dd327d02e8d53545b7026ea6b7f8` |
| Isolated policy typecheck | Implemented | `9856470238b659030d96ce83e65e00d6d2b9e4a4d63254ad65d7519888badf94` |
| Root package scripts | Updated | `7513bcdf995ca808ca5dacc26ebeddc8667487e9d35c158fcb94eb2f579e2420` |

Process ownership v1 remains byte-identical at SHA-256
`60552dfd6d0e7d3020b22b84716ff5a9a4e8880da516ca71956dd94923635c1f`.
V2 adds only `src/policy` as a pure tested Z4 library. Main, preload, renderer,
and workers cannot import it; the future authoritative policy helper remains
reserved.

## Policy Rules

- The evaluator owns strict admission of operation schema v1. Unknown schema,
  unknown fields, generic commands, omitted effects, duplicate capabilities,
  and forged JavaScript objects become Black denial before classification.
- Minimum tier is the maximum of fixed environment and effect floors. There is
  no caller-provided tier field and therefore no downgrade input.
- `LOCAL_TEST` begins Green, `LOCAL_DEVELOPMENT` Yellow, `STAGING` Red, and
  `PRODUCTION` Black. None/read begins Green, local mutation Yellow, remote
  mutation Red, and prohibited intent Black.
- P2.2 recognizes only `policy.preflight` in the synthetic corpus. Unknown
  capabilities and any capability missing from actor, owner, or policy
  allowances become Black denial.
- Green yields `AUTO_ALLOW` only for the admitted synthetic subtype. Yellow
  requires one active envelope containing every effective capability. Red
  yields `OWNER_REVIEW_REQUIRED`; Black is unconditionally denied.
- Policy outage, actor/session drift, target-generation drift, malformed trusted
  context, and context accessor attempts all fail Black.
- Output is deterministic, deeply immutable, and contains no grant or execution
  field.

## Boundary Safety

Policy context is local trusted configuration rather than a wire contract, but
it still receives exact-key admission. Only plain data properties are read;
object and array accessors are rejected without execution, capability arrays
are detached and frozen, identities are exact, and extra fields fail closed.
The policy source imports only the accepted P2 contract module and has no
external dependency.

## Faults Found and Remediated

1. The initial evaluator trusted an erased TypeScript brand, allowing a direct
   JavaScript caller to bypass operation admission. Strict schema admission now
   occurs inside every evaluation and malformed objects return Black denial.
2. Initial context validation read caller fields directly. Exact descriptor-safe
   context admission now precedes all policy reads.
3. Initial context cloning used array spread, which could invoke hostile element
   getters. Arrays are now cloned only through inspected own data descriptors.
4. The policy TypeScript import was initially extensionless for compilation but
   unresolved under Node's native type stripping. The isolated no-emit policy
   config now explicitly permits the exact `.ts` import used by tests.

## Validation

| Command or inspection | Result |
| --- | --- |
| Green, Yellow, Red, and Black positive profiles | PASS |
| Environment/effect cross-product floor and no-downgrade checks | PASS |
| Policy outage, identity drift, production target, unknown capability, and capability expansion | PASS; Black denial |
| Inactive and incomplete Yellow envelopes | PASS; denied without capability retention |
| Unknown schemas, command-shaped objects, label spoofing, omitted effects, and duplicates | PASS; rejected before classification |
| Context object and array accessor probes | PASS; rejected without getter execution |
| Determinism, deep immutability, and no-grant output | PASS |
| Process ownership and directional imports | PASS; application boundaries cannot import policy |
| `pnpm run check` | PASS; six typecheck surfaces, 62 tests, and three production builds |
| Architecture no-execution scan | PASS |
| `git diff --check` | PASS |

## Limitations

- Process ownership v2 is accepted for the isolated, non-authoritative policy
  boundary proven by this checkpoint.
- The engine handles only accepted `SYNTHETIC_POLICY_PROBE` contracts and one
  synthetic capability. No operation handler exists.
- The evaluator result is internal and non-authoritative. P2.3 must provide
  durable audit acknowledgement, P2.4 owns key and checkpoint assurance, and
  P2.5 must bind decisions and grants before any P2 exit claim.
- No application behavior or capability support state changes in P2.2.

## Decision

The owner accepted process ownership v2, the pure synthetic policy engine, and
all four recorded remediations. P2.2 is complete, `policy.preflight` remains
`UNVERIFIED`, and P2.3 single-writer sanitized journal implementation begins
with process execution still absent.

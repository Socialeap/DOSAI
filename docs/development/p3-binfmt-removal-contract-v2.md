# Exact-registration removal contract v2: source-only refinement

Status: **PROPOSED_SOURCE_CONTRACT_V2_NO_EXECUTOR**.
Based on main `cb9feaac79a439029b8caad96de366277561e287` after PR #9.
Role: unclassified assistant; no specialized role assigned.
This increment prepares a versioned contract and inert fixtures only. No
executor, runtime authentication, host mutation, workflow activation, dispatch,
build, guest execution or paid activity is authorized or implemented.

## History and binding

The [v1 plan](../architecture/p3-exact-binfmt-removal-plan.json), its model,
tests and development document remain byte-identical. V2 does not rewrite v1
semantics or reinterpret its historical simulation results as runtime evidence.
The [v2 contract](../architecture/p3-exact-binfmt-removal-contract-v2.json) binds
v1's exact digest and the [merged kernel review](p3-binfmt-kernel-single-writer-review.md).
The v2 model pins the exact v2 contract SHA-256:
`65338e7d60401f3967bfb9a44ca32488167497bc3f147c0103a99a62576b7124`.

The same four entry names, full preimage digests, metadata, native architecture,
image version, fixed payload, four-write/one-attempt limits, five-second
preparation bound and all 16 original workflow predicates are retained. The
active workflow, diagnostic collector, checkpoint generations and accepted ADRs
are unchanged. No real evidence or owner trust decision is added.

## Separate outcomes

| Outcome | Meaning and limit |
| --- | --- |
| `WRITE_REQUEST_ACCEPTED` | The observed call result matches the complete request. It does not establish a new removal: an already-detached no-op can look the same. |
| `TARGET_ABSENCE_OBSERVED` | An exact post-state sample has the expected remaining entries and identities. This does not establish exclusive causality or continuous absence. |
| `EXCLUSIVE_CAUSAL_REMOVAL_UNPROVEN` | Remains unproven for every modeled path, including the best-case complete recheck. No return count or polling history promotes it to proven. |

An accepted request with no post-state sample cannot complete the target.
Detected/unknown interference, incomplete or ambiguous responses, completion
beyond the allowed privilege lifetime, and expired evidence quarantine the
modeled attempt without retry, rollback or a later request. Revoked or mismatched
fences and expired evidence at request time deny before request admission.
Registry/descriptor replacement, changed enabled state, stale preimages,
reappearing entries or failed original predicates cannot yield a complete
recheck. All pre/post identity and native-only checks remain mandatory.

## Future writer-boundary record

A real implementation would require an **independently authenticated trusted
control-plane verifier** to admit a record with these bindings:

- Exact contract, implementation commit, current run/attempt/job, reviewed kernel
  source and actual deployed kernel/package identity. Upstream review alone is
  insufficient to assert the deployed vendor behavior matches.
- Effective registry identity: filesystem, device, inode, mount identity, mount
  namespace, user namespace and the registry actually used by later execution.
  Reading a substitute empty mount does not satisfy this requirement.
- Entry object identities and exact four-entry scope; one cooperating writer,
  one helper, active lease/fencing generation, bounded issue/expiry times and
  privilege restricted to preparation. No generic shell or caller path scope.
- Current documented writer inventory and an explicit owner-accepted privileged-
  host/provider trust decision, bound to that exact environment and review.
  Cooperative fencing does not exclude other privileged writers. State snapshots
  alone do not prove that exclusion; unknown writer state denies preparation.
- Revocation/expiry checks before every request and recheck, with the same source,
  job, kernel, registry and fencing identities throughout. The modeled recheck
  also requires mutation authority to have been dropped. This does not claim
  that a local helper can remove account-wide passwordless sudo capability.

No real verifier, issuer/signature validation, writer-exclusion mechanism or
privilege revocation mechanism is implemented here. The owner has **not**
accepted a host/provider trust assumption. The contract records actual deployed
kernel behavior, atomic compare-and-remove and exclusive-writer proof as false;
effectful executor status remains NO_GO. Contract merge does not change these.

## Inert fixture interfaces

`tools/supervised-execution/binfmt-removal-model-v2.mjs` accepts three bounded
strict-JSON byte inputs: exact contract, trace and an independent **test-only**
trust fixture. The trust fixture pins the boundary-record digest, review input,
expected host/registry/fencing context and evaluation time. The boundary fixture
binds the context, scope, object identities and proposed trust assumption.
Missing, expired, future-issued, unknown, revoked or mismatched fixtures reject.
These relations test the shape and enforcement ordering of the future contract;
they are not authentication. A caller can manufacture test fixtures, so this
model must never be imported as an approval or admission authority.

All positive boundary examples explicitly use fixture-only schemas, synthetic
kernel/package identities and fictional trust decisions. Positive fixture
acceptance does not imply that any real host has the required trusted record.
The model has no CLI, host filesystem, process, network or mutation implementation.
Its output is immutable and always includes:

- `simulation_only: true`, `execution_authorized: false`, `runtime_admission: false`;
- zero builder receipts and `trust_authentication: NOT_PERFORMED_TEST_FIXTURE`;
- separate accepted-request and absence-observation counters;
- unproven exclusive causality, atomic compare/remove, privileged-writer
  exclusion and continuous registry emptiness.

Request and completion times are distinct. Expiry before a request denies it;
expiry/timeout while an already-admitted synthetic request is pending quarantines
its outcome. Remaining requests cannot proceed after uncertainty. Every complete
trace still requires all original predicates and the exact same host/registry
context after preparation. Successful simulation is not a host receipt.

## Race fixtures and local validation

All **16 new v2 tests** pass on pinned Node `24.18.0`. Combined with v1,
diagnostics, readiness, repair and host-verifier checks, **44/44 focused tests**
pass. The diagnostic wrapper executes the existing 15 Python adversarial cases.

```sh
node --test tests/governance/p3-binfmt-removal-v2.test.mjs
```

Cases cover stale descriptor/replacement identity, already-detached no-ops,
enable/disable changes, detected and unknown interference, ABA limits, missing
post-state observation, namespace/mount/effective-registry substitution, unknown
writer state, kernel/source/context drift, self-asserted boundary data, stale or
revoked cooperative fences, multiple helper slots, privilege-scope drift,
expiry before/during requests, incomplete traces and reappearance at recheck.
They also cover exact scope/payload/attempts, malformed/duplicate/oversized JSON,
missing or failed original predicates and immutable v1/active-workflow history.

The tests explicitly demonstrate indistinguishability: a normal removal, an
already-detached no-op and an undetected ABA can present identical samples.
They do **not** claim that an offline model can detect unseen races. A registration
after the last sample is likewise not detectable from that sample. Outputs retain
the corresponding unproven fields rather than inventing guarantees.

No live kernel race, real writer boundary, deployed kernel fingerprint or actual
privilege drop was tested. No native/build suite or remote run was executed.

## Next gates and release classification

Owner review and independent security acceptance of v2 come before deciding
whether a real trusted evidence/privilege boundary can be supplied. If it cannot,
the effectful executor remains NO_GO and controlled native-host alternatives
need separate review. Executor implementation, kernel behavior proof, workflow
activation, merge and exact one-attempt mutation/dispatch approval remain future,
separate gates. There is no request for runtime authorization in this increment.

BETA-CP-004/005/006 remain NO_GO. No database migration, backend function/config,
secret, provider setting, Lovable activation, frontend Publish, deployment,
account reset or paid activity is required. The 120-credit ceiling remains.

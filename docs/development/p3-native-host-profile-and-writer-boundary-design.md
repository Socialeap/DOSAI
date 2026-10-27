# Native-host profile and writer-boundary design

Status: **PROPOSED SOURCE ONLY; RUNTIME NO_GO**.
Baseline: PR #15 merged as `8ed3442626229dc4e811e500f59a0f902024bb9d`.
Role: unclassified assistant; no specialized role assigned.
Owner authorization covers source design and offline tests only. No provisioning,
dispatch, executor, host mutation, builds, guest execution or paid activity is
implemented or authorized. No production verifier or new collector is supplied.

## Source artifacts and unchanged authority

- [Native-host profile v1](../architecture/p3-native-host-profile-v1.json) fixes
  the proposed platform, independence, registry, evidence and time constraints.
- [Writer-boundary design v1](../architecture/p3-native-writer-boundary-design-v1.json)
  defines responsibilities, independent trust inputs, signature proposal,
  verification ordering and fail-closed conditions.
- [Source record](../architecture/p3-native-host-profile-source-record.json) binds
  both proposals, offline model/tests, accepted decisions and protected history.

These are supplemental proposals under the accepted ADRs and PR #15 feasibility
packet. They do not register schemas, modify the accepted registry, accept a
provider assumption, change phase state or grant runtime authority. All three
workflows, collectors, historical removal contracts/models, feasibility packet
and checkpoints remain byte-identical. BETA-CP-004/005/006 remain NO_GO.

## Proposed clean-host profile

Two slots, A and B, must represent fresh native Linux x86-64 hosts with native
Docker amd64 and no emulation. Host and boot identities must differ. Writable
instance/disk/daemon/cache/home/work/output identities must be disjoint across
hosts, including cross-class sharing. Both hosts must bind the same immutable
builder archive/source/recipe/defconfig/fixed-parameter input-set digest. Those
references still need actual independent artifact verification; equality of two
claimed digests does not prove that either archive exists or was verified.

The profile requires the actual effective binfmt registry to be empty before
DOSAI begins. No DOSAI registry writer or removal helper is allowed. The strict
existing single-target, binfmt filesystem, `/` root, no-submount condition is
retained. Registry device/inode/mount and namespace identities must remain stable
across observations and bind the effective registry intended for any later
separately approved execution. Empty substituted mounts, disabled registration
files, ignored lower mounts and autofs exceptions are not admitted.

Each host context binds an owner-reviewed provider-profile digest, host image,
evidence manifest, actual kernel release/package/version, reviewed vendor source,
vendor-patch manifest and running-identity evidence reference. Every digest needs
admitted underlying evidence under the eventual verifier; the fixture model
checks relations and shapes only. It cannot establish a running-kernel/source
match or source truth from a package row or signature.

All 16 original predicate IDs and the added kernel/writer rejection remain
required reference constraints. The current workflows keep their exact
GitHub-specific tests. No alternative provider is admitted by changing a label
or supplying `true` values. A future provider adapter must receive a separately
reviewed exact mapping and evidence contract before use; none is implemented.

**Current selection:** provider, host A and host B are null. Availability and
zero-cost eligibility are NOT_ESTABLISHED. Issuer registration, writer enforcement
and live verification are absent; owner host/provider trust is NOT_ACCEPTED.
These are stop conditions, not placeholders that a caller may treat as defaults.
The fixture envelope also binds a zero-cost basis digest to an independent
fixture trust view and a zero spend ceiling. Unknown cost status or a positive
amount rejects. This exercises the check without establishing any real host's
cost eligibility.

## Writer boundary and independent responsibilities

| Role | Responsibility and limitation |
| --- | --- |
| Observer | Supplies fixed, minimized, read-only measurements. Its output is untrusted and cannot select keys, trust state, provenance or approval. |
| Independent issuer | Binds admitted measurements to an exact host/control-plane context under an owner-approved issuer. Its signing key and policy are outside agents, worktrees and the tested execution account. A signature preserves a claim; it does not prove that claim true. |
| Owner policy | Separately accepts the exact provider profile, residual privileged-host/provider assumption, permitted subjects and scope. The issuer cannot self-approve this decision. |
| Read-only verifier | Uses an independently obtained trust/key/revocation/time view. It has no registry-write, service-control, launch or execution authority. |
| Existing consumer | Retains policy, grant, audit, native build, artifact, capsule and acceptance gates. A qualified observation does not authorize a build or execution. |

The boundary record must bind the issuer epoch/sequence, request nonce, exact
profile/source, owner-decision digest, both host/boot contexts, registry identity,
writer-policy epoch/generation, actor inventory, enforcement evidence and
privilege scope. DOSAI registry-write capability and helper count are zero.
An enforcement claim must cover both observation samples and the complete
requested interval. Local locks, workflow queues, inactive unit snapshots and
dropping one helper's privileges cannot substitute for that policy boundary.

Real actor inventory and enforcement must identify which privileged actors are
constrained, which remain in the accepted trust assumption, and how revocation
is observed. Provider/kernel compromise remains a disclosed trust dependency.
Neither this design nor its fixtures prove exclusion of every privileged actor.
No enforcement mechanism is installed, selected as proven or exercised here.

## Signature and trust-registry proposal

The offline protocol exercises P-256/SHA-256 with DER-SPKI public keys and
64-byte IEEE-P1363 signatures. It uses the existing `canonicalAuditJson` helper
over closed ASCII-keyed, integer-bounded fixture payloads, prefixed with
`DOSAI/NATIVE-HOST-BOUNDARY/FIXTURE/V1` followed by byte `00`.
[Node's crypto documentation](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptoverifyalgorithm-data-key-signature)
documents the verification primitive and signature encoding. The exact pinned
Node 24.18.0 implementation was tested locally. No new general canonicalizer or
cryptographic primitive is invented.

This is a proposed fixture suite, not a registered runtime wire suite. A future
runtime suite requires separate review, a distinct registered domain/version,
exact encoding rules and interoperability evidence. The accepted checkpoint
signing helper and its restricted API are unchanged; they are not repurposed to
sign host records. Test signing uses newly generated in-memory software keys;
private keys are never exported, printed, written or committed. No Keychain,
Secure Enclave, provider key or existing account credential is accessed.

Before live use, the protected trust registry must independently pin the approved
profile/provider/issuer and public-key identity, subjects, current issuer and
boundary epochs/generations, owner decision, rotation/revocation state, known
sequence/head and challenge status. Trust anchors cannot arrive in the signed
claim or from an agent-owned repository. Unknown keys, uncertain rotation,
rollback/fork detection gaps or stale revocation views deny new admission.

Replay identity must bind profile, issuer epoch, sequence, request nonce and
canonical payload digest. It must not use signature bytes as a unique identity.
Real challenge consumption and accepted-sequence advancement require durable,
atomic trusted state and recovery/reconciliation. No such store is implemented
here. The fixture model deliberately accepts the same valid fixture twice and
reports `replay_persistence: NOT_IMPLEMENTED`; a supplied USED/unknown nonce view
rejects. This demonstrates a missing runtime prerequisite rather than claiming
persistent replay prevention.

## Time and interval semantics

The proposal uses a five-second observation-validity cap and a 100 ms maximum
admitted clock uncertainty. These are proposed rejection bounds, not measured
latency or clock-synchronization guarantees. A real independent timebase and
bounded mapping from host observations remain unimplemented activation gates.

Sample start/completion times are checked separately from signature issuance.
An issuer cannot refresh old samples merely by signing a new envelope. The
conservative current-time interval must fit within issuance/expiry; samples
must be recent; and writer enforcement must cover sample start through the
requested end, including the uncertainty margin. Evidence does not silently
renew or authorize a longer operation.

A five-second observation cannot establish writer control throughout a later
multi-minute build. Before any future operation, its separately accepted plan
must cover the actual operation and cleanup interval, with fresh challenge,
current generation/revocation checks and enforcement appropriate to that scope.
Loss before admission denies use. Loss during an independently authorized owned
operation requires the existing stop/reconciliation/quarantine protocol; this
increment implements no executor or stop mechanism.

## Offline verification model and tests

`tests/fixtures/p3/native-host-profile-model.mjs` accepts only bounded byte inputs:
the exact pinned proposal, a fixture-only signed envelope and a separate
fixture-only trust configuration. It copies bytes, uses strict duplicate-key
JSON parsing, rejects unknown fields, pins the external fixture public key,
checks P-256 and canonical SPKI, verifies domain-separated payload signatures,
then checks scope/context, nonce/epoch/generation/time, both hosts, writer policy
and every predicate. Maximum envelope/trust size is 65536 bytes; exactly two
hosts and closed fixed-field sets are permitted. There are no filesystem,
network, subprocess, native-service, signing-key or host-mutation operations.

All successful outputs remain simulation-only. A fixture signature can be
cryptographically verified while `runtime_trust_authentication` remains
`NOT_PERFORMED_TEST_TRUST_ANCHOR`. Source match, writer exclusion, continuous
emptiness, runtime admission and execution authority are false; builder receipts
are zero. Caller-created fixture keys and trust configurations cannot become
real trust anchors through this model. The module is unreachable from app imports.

All **77 focused checks pass on pinned Node 24.18.0**, including 13 new groups.
New cases cover tampering, wrong domains, self-issued/revoked keys, changed
issuer/owner scope, repeated fixtures and used challenges, old samples with fresh
signatures, uncertainty/expiry edges, re-signed context substitutions, emulation,
registrations and unsafe mounts, shared state and differing inputs, inadequate
writer intervals, residual account privilege, all 17 predicates missing/false
for each host, unknown fields, oversized/duplicate/malformed JSON and wrong key
curves. Valid signatures with consistently repinned fixture contexts still cannot
override intrinsic native, registry, privilege or independence requirements.

```sh
node --test tests/governance/p3-native-host-profile.test.mjs
node scripts/report-private-beta-readiness.mjs
```

Use Node exactly 24.18.0 and retained lockfile-matched dependencies. The combined
suite includes the prior 64 checks and Python diagnostic fixtures. Readiness
still returns expected exit 2, NO_GO and BETA-CP-004/005/006. No live host, kernel,
writer enforcement, source correspondence, external provider, hardware signing,
production behavior or performance result is claimed. The prior Trove read-limit
outcome was reused; no pages were retried or read.

## Sequential operator gates

1. Owner reviews this source proposal and approves merge separately. Stop on any
   changed protected input, weakened native check, unknown promoted to fact or
   fixture promoted to runtime authority. No activation or execution is requested.
2. Identify two actual admissible existing hosts and establish zero cost,
   independent state, exact provider/image/source evidence and feasible writer
   enforcement. No provisioning, preparation, new service or purchase is
   authorized. If availability or trust cannot be established, retain NO_GO.
3. Accept the exact provider-profile/predicate mapping, issuer/key lifecycle and
   owner trust decision, enforcement evidence, runtime wire/time protocols and
   verifier/nonce-state design. An independent reviewer must evaluate them before
   real verifier or collector activation work. Missing or ambiguous evidence stops.
4. Only after those source gates may a separately authorized runtime verifier,
   collector/activation increment or bounded observation be prepared. Any run
   requires exact source/ref/digest, current zero-cost preflight and fresh owner
   authorization. No retry, mutation or paid fallback is implied.
5. Native builds, accepted artifacts, P3 physical suites and representative app
   QA retain their separate prerequisites and explicit bounded approvals. Source
   merge or a verified observation cannot authorize them.

## Release classification

Source proposals, documentation and offline fixtures only. No backend migration,
durable live state, function deployment, secret, provider/environment setting,
workflow change or application activation is required. **No Lovable action is
required.** No frontend Publish or application deployment is required. Owner
review is next; future activation and owner QA remain separate gates. The
120-credit ceiling remains; no reset or paid activity is authorized.

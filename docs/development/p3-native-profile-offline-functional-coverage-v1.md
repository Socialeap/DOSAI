# Native-host v2 offline functional coverage

Status: **PREPARED SOURCE ONLY; RUNTIME NO_GO**.
Role: unclassified assistant; no specialized repository role assigned.
Baseline: PR #17 merged as `1615630` (full SHA in the source record).

## Increment

The merged namespace correction passes its six regression groups on Node
24.18.0. The new functional suite applies all thirteen original adversarial
host-profile groups to the corrected v2 model. A source equality guard requires
the complete original corpus as an unchanged prefix except for the model path.
Neither historical suite nor verifier implementation is edited.

Four additional multi-step groups cover:

- Repeated stateless checks, consumed nonces, stale sequence views and a fresh
  synthetic request at the next sequence. Verification never mutates inputs.
- Revoked keys and loss of revocation freshness, owner policy, zero-cost status
  or clock trust after a previously valid relation; re-signing cannot restore it.
- Both host slots undergoing writer generation, epoch and namespace changes:
  stale independent context rejects; explicit synthetic repinning restores only
  fixture relations, and subsequent fence loss rejects again.
- Exact conservative writer start/end boundaries under clock uncertainty,
  one-millisecond coverage gaps, and expiry.

Every positive result is frozen and explicitly denies runtime admission,
execution, source verification, single-writer proof and continuous emptiness;
receipt count stays zero. Repinning is test construction, not an implemented
trust update API. Repeated checks deliberately remain possible because this
fixture has no durable nonce consumption. These scenarios must never be used as
runtime trust, writer enforcement or app acceptance evidence.

## Reproduce locally

Use exactly Node 24.18.0 with retained lockfile-matched dependencies:

```sh
node --test --test-concurrency=1 tests/governance/p3-native-host-profile.test.mjs tests/governance/p3-native-host-profile-v2.test.mjs tests/governance/p3-native-host-profile-v2-functional.test.mjs
node scripts/report-private-beta-readiness.mjs
```

Validation passed all **37/37 groups on Node 24.18.0**.
The first command must pass all 37 groups. The readiness command must retain
exit 2 / NO_GO with BETA-CP-004/005/006. The supplemental
[source record](../architecture/p3-native-profile-functional-source-record-v1.json)
binds the suites, unchanged model, historical record and accepted source inputs.
Ephemeral software keys stay in memory; no private key export is performed.

## Next gates and release classification

This removes a local coverage gap: the corrected successor now runs the full
host-profile adversarial corpus plus multi-step scenarios. It does not resolve
the native-host dependency. Native host availability and zero-cost eligibility,
owner-accepted independent trust, durable replay protection, enforceable writer
boundaries, physical builder receipts, formal P3 acceptance and the representative
app workflow remain separate gates. All native-only and existing rejection
requirements remain intact.

The diff contains tests, documentation and a source record only. No application
or workflow change, provisioning, dispatch, executor, host mutation, build,
guest execution or paid activity is performed or authorized. It adds no backend
migration, function deployment, durable live-state change, secret or environment
configuration. **No Lovable action is required.** No frontend Publish or app
deployment is required. Owner source review precedes merge; no activation or
functional app testing is unlocked by merge alone.

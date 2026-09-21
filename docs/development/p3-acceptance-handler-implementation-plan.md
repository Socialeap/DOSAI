# P3 formal-acceptance handler implementation plan

Recorded 2026-09-21. This is a source plan only. It does not accept the proposed
P3 fixture bytes, modify the current runner, implement a handler, build or
launch a candidate, dispatch a workflow, or exercise any execution authority.

## Result

All three P3 suites, six scenarios, and 27 assertions are declared. Existing
contract, supervisor, coordinator, state-store, and watchdog tests provide
useful source-level coverage for every scenario, but none of the 27 assertions
is currently proven for formal acceptance. Source tests cannot establish guest
execution, native-amd64 provenance, signed-candidate behavior, physical cleanup,
independent watchdog timing under host saturation, or crash/orphan recovery.

The exact implementation proposal at
`docs/architecture/p3-acceptance-handler-implementation-proposal.json` maps all
27 assertions once, binds every proposal input, identifies the fixed existing
corpus for each future handler, and lists the missing physical evidence. It
also fixes the future change set so P1/P2 accepted bytes and behavior cannot be
quietly altered while adding P3.

## Safe implementation sequence

1. Pass the separately authorized v50 lifecycle proof.
2. Prove two distinct native-amd64 builders and accept their exact receipts.
3. Build, verify, and accept the execution-eligible guest artifacts and one
   exact signed test candidate.
4. Accept the exact schema, manifests, assertion map, handler boundaries, and
   prerequisite receipts.
5. Implement only two new runner modules: an exact prerequisite verifier and a
   fixed P3 suite handler. No generic shell or command construction is allowed.
6. Create schema registry v19 and catalog v6 without changing any accepted P1
   or P2 fixture bytes. Preserve the proposal manifests; create accepted v4
   successors at new paths.
7. Independently review runner 0.3 before activation, then run all three suites
   on one clean exact candidate. Any missing, malformed, contradictory, or
   uncertain receipt fails the suite without retry.

## Current gate

The source plan is ready, but implementation remains intentionally gated by the
physical prerequisites and exact owner acceptance. This prevents a passing unit
corpus from being mislabeled as execution, isolation, cleanup, performance, or
recovery proof.

**Release classification:** inert planning and governance only. No Lovable
action, backend activation, or frontend Publish is required.

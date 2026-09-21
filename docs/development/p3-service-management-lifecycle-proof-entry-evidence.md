# P3 Service Management lifecycle proof-entry evidence

Recorded 2026-09-21. Contributor: unclassified assistant; no specialized role.
**The inert lifecycle integration entry is implemented and validated; build,
package, launch and physical Service Management lifecycle remain NO-GO.**

## Scope

The owner's standing authorization permits minor source changes, builds, tests,
commits and review-branch updates. This slice uses that authority only to join
the v46 injection-only lifecycle core to the exact v47 native binding contract
inside an application-unreachable proof entry.

It adds no build-mode selector, package mode, native-addon builder, audit runner,
signing step or production import. No native module was built or loaded, and no
Service Management API was invoked.

## Implemented boundary

`src/main/execution/service-management-lifecycle-proof-entry.ts` fixes the future
native filename to `dosai-service-management-lifecycle.node`, performs at most
one load request and invokes the lifecycle core exactly once. It admits only an
exact own-data-property binding with `observe`, `register` and `unregister`.
Accessor properties, extra or missing keys, symbols and hostile reflection traps
fail closed without invocation.

The entry monitors every native operation. It requires zero arguments, at most
three observations, one registration attempt and one unregistration attempt,
and exact agreement between actual calls and the core receipt. Thrown or
incomplete native calls produce `NATIVE_CALL_CONTRACT_FAILED`; load and Electron
readiness failures remain distinct. No platform error detail is emitted.

The single output is one JSON receipt under the fixed
`DOSAI_SERVICE_MANAGEMENT_LIFECYCLE_PROOF_V1:` prefix. It records admitted
before/after statuses, attempt and completion counts, consumption and the
fail-closed result. Delivering the receipt is protocol success, not proof that
cleanup, service launch, XPC connection or execution succeeded.

## Inert proof

The adversarial test bundles only this entry as CommonJS and replaces the native
addon with in-memory functions. It proves:

- exact zero-argument clean registration and cleanup ordering;
- dirty-precondition refusal without mutation;
- clean registration rejection without unnecessary cleanup;
- one cleanup attempt and `CLEANUP_UNVERIFIED` on uncertain terminal state;
- distinct thrown-native-call, addon-load, binding and Electron-readiness
  failures; and
- accessor and hostile-proxy rejection without attacker-controlled invocation.

The proof entry is absent from the normal Electron Main entry, preload,
renderer, build selector, package selector and Vite Main configuration. Process
ownership v48 binds the exact implementation and test with all runtime and
physical authority false.

## Validation

The five proof-entry cases and three v48 governance cases pass. Twenty-five
focused proof-entry, source-graph and ownership checks pass. All eight
TypeScript projects and the three normal Main, preload and renderer production
builds pass under pinned Node 24.18.0. The complete repository regression
passes all 540 tests.

No dependency installation, native linked output, package build, signing, app
launch, native-module load, status call, registration, unregistration, service
launch, XPC connection, VM action, process action, network action, journal
mutation, production use, physical attempt or external builder provisioning
occurred.

## Remaining gates

Before a physical lifecycle proof, DOSAI still needs a separately reviewed
source-only build/package/runner composition, exact signed-artifact and output
admission, and an explicit failure-containment plan for a process interruption
after registration. The physical attempt then requires separate owner
authorization because registration may immediately bootstrap the LaunchAgent.

Independent Linux builders, accepted guest artifacts, isolation and approval
evidence, and supervised real-execution validation remain required for the
private beta.

**Release classification:** local desktop source, tests, evidence and governance
only. No Lovable action, backend activation or frontend Publish is required.

# P3 service-management lifecycle core evidence

Recorded 2026-09-20. Contributor: unclassified assistant; no specialized role.
**The injection-only lifecycle reducer is implemented; native registration,
service launch, real execution and private-beta release remain NO-GO.**

## Scope

The owner's standing authorization permits minor source adjustments, builds,
tests, commits and review-branch updates without a separate question. This slice
uses that authority only to implement and test the deterministic lifecycle core
that a future native adapter could call. It adds no native adapter, package
mode, signing step, app launch, registration, unregistration or service launch.

The physical v45 status-proof authorization remains exhausted. A future
registration attempt is consequential because macOS may immediately bootstrap
a registered LaunchAgent, so native binding, packaging and physical execution
remain separate explicit gates.

## Implemented boundary

`src/main/execution/service-management-lifecycle-core.ts` accepts only an exact
injected object with own data-property functions named `observe`, `register`
and `unregister`. It does not import ServiceManagement, Electron, Node native
loading, process, filesystem or network modules.

The core enforces:

- exactly one lifecycle exercise per instance;
- an exact `NOT_REGISTERED` initial observation before any mutation;
- at most one zero-argument registration attempt;
- at most one zero-argument cleanup attempt, only after reported or observed
  registration;
- an exact final `NOT_REGISTERED` observation before reporting clean cleanup;
- no retry path; and
- fail-closed `CLEANUP_UNVERIFIED` reporting for unknown, malformed, thrown or
  ambiguous post-mutation state.

Malformed bindings, accessors and hostile proxy traps return `BINDING_INVALID`
without invoking attacker code. A second exercise returns `ALREADY_CONSUMED`
without any additional observation or mutation attempt.

## Reachability and privacy

The core is not imported by Electron Main, preload, renderer, normal build,
package script or either existing signed proof path. No native lifecycle binding
exists. Process ownership v46 binds this source-only boundary with every
physical and runtime authority false.

The v44 and v45 physical receipts were also sanitized to remove an unnecessary
personal signing subject while retaining the stable selector, TeamIdentifier,
certificate fingerprint, code identifiers, CDHashes and package hashes. The v45
lineage hash was advanced to bind the sanitized v44 receipt.

## Validation

The focused lifecycle suite passes six cases covering the clean path, dirty
preconditions, rejected registration, partial-registration recovery, failed or
ambiguous cleanup, hostile bindings, zero-argument calls, single-use behavior
and application/package unreachability. Together with the v45 lineage and v46
governance suites, 12 focused cases pass. All eight TypeScript projects and the
three normal Main, preload and renderer production builds pass on pinned Node
24.18.0, pnpm 11.18.0 and Vite 8.2.0. One complete repository run passed all
525 tests. After the final hostile-function hardening, the repeated full run
passed 524 of 525 and encountered only the pre-existing virtualization probe's
temporary Swift module-cache cleanup race (`ENOTEMPTY` after its 60-second
compiler boundary); its exact two-test file then passed in isolation. No
lifecycle or v46 case failed. The review worktree's dependency symlink is
read-only under the sandbox, so the equivalent Vite `runner` config loader was
used to avoid the default temporary cache write; no source or dependency bytes
were changed for that environment workaround.

No dependency installation, native compilation, package, signing, app launch,
native module load, status call, registration, unregistration, service launch,
XPC connection, VM action, network action, journal mutation, production use or
physical retry occurred.

## Remaining gates

Before any physical lifecycle proof, DOSAI still needs a separately reviewed
native adapter and proof package that preserve the exact single-use protocol,
plus explicit authorization for the physical registration risk and cleanup
plan. Independent native Linux builders, accepted guest artifacts and remaining
isolation/approval proofs also remain required for supervised real execution.

**Release classification:** local desktop source, tests, evidence and governance
only. No Lovable action, backend activation or frontend Publish is required.

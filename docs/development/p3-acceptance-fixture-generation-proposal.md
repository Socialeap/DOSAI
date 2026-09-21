# P3 formal-acceptance fixture generation proposal

**Status:** Proposed for owner review  
**Recorded:** 2026-09-21 01:28 EDT  
**Scope:** Schema and fixture declarations only

## Finding

Acceptance catalog v5 already names `P3-AT-001`, `P3-AT-002`, and
`P3-AT-003`, their six scenarios, required evidence classes, deadlines, and
requirements. They remain `NOT_IMPLEMENTED`. The accepted fixture schema v3
admits only P1/P2 identifiers and handlers, and runner 0.2 dispatches only P1
and P2. Therefore, creating P3 manifests under the accepted schema or quietly
adding them to the current runner would be invalid.

## Prepared successor inputs

The proposed fixture schema v4 and three proposed manifests now express the
accepted P3 scenario topology without activating it. They add no scenario,
capability, production claim, or external effect. Each manifest:

- is `PROPOSED`, never `ACCEPTED`;
- targets future runner 0.3, which does not exist;
- requires both `MACOS_ARM64_V1` and `LINUX_AMD64_V1` evidence;
- requires the physical P3 prerequisites, exact signed candidate, and two
  accepted native-builder receipts before a handler could run;
- preserves the catalog's exact scenario IDs, modes, artifact classes, timeout
  ceilings, and requirement claims;
- defines fixed input profiles and exact digests; and
- requires cleanup, unrelated-resource survival, no invented outcomes, and no
  production claim.

The six future handler families cover typed capsule execution, hostile execution
forms, cancellation faults, scoped cleanup, watchdog saturation, and crash
reconciliation. No handler source exists.

## Activation boundary

Catalog v5, schema registry v18, fixture schema v3, runner 0.2, and every
accepted P1/P2 fixture remain unchanged. The current runner must continue
returning `DOSAI_ACCEPTANCE_SUITE_NOT_IMPLEMENTED_0001` with exit 2 for P3.

After the physical P3 prerequisites pass, activation still requires owner
acceptance of these exact proposal bytes, a separately accepted schema-registry
successor, independently bounded P3 handler implementations, and a new catalog
and runner generation. Only then may the exact candidate run all three suites
and produce evidence for owner gate acceptance.

The proposal record at
`docs/architecture/p3-acceptance-fixture-generation-proposal.json` hash-binds
every current input and proposed output. All registration, runner, handler,
execution, signing, builder, Service Management, acceptance, and production
authorities remain false.

**Release classification:** Inert schema/manifests, governance tests, and
documentation only. No Lovable action is required. No frontend Publish is
required.

# P3 v49 `NOT_FOUND` source diagnosis

Recorded 2026-09-21. This is a source-and-package review only. It did not
launch an app, load a native module, call Service Management, register or
unregister a service, dispatch a workflow, or change a default branch.

## Result

The replacement v49 receipt remains a valid fail-closed result, but it does not
show that the packaged plist or helper is defective. The package uses the
documented `Contents/Library/LaunchAgents` location, the fixed plist name agrees
with the native adapter, `BundleProgram` is bundle-relative, and the prior proof
verified the outer and nested signatures and TeamIdentifier.

Apple's local SDK header defines `notFound` as a generic inability to find the
service. Apple Developer Technical Support further explains that this status can
mean the system has never seen the service and therefore has no state to report.
V49 treated that first-seen state as dirty and stopped before its one bounded
registration attempt. Direct execution from `/private/tmp`, rather than a
stable installed test path like Apple's package-installer sample uses, remains
a second environmental variable; the current receipt cannot distinguish the
two.

## Proposed v50 correction

The exact source-only successor is recorded in
`docs/architecture/p3-v50-first-registration-successor-proposal.json`. It would:

- admit `NOT_REGISTERED` or `NOT_FOUND` for one registration attempt;
- continue to stop without mutation on `ENABLED` or `REQUIRES_APPROVAL`;
- perform at most one cleanup attempt whenever registration reports success or
  the post-registration status is active;
- accept success only after an active post-registration state, successful
  unregistration, and exact terminal `NOT_REGISTERED`; and
- keep every ambiguous result fail-closed with no retry.

Because this changes the mutation precondition for a future physical proof,
implementation remains owner-gated even though it is source-only. A later
physical attempt would require a new exact authorization, a newly built
successor package, isolated stable-path staging, signature and byte checks, one
launch, the existing 15-second timeout, and no retry. The preserved v49 package
must not be modified.

## Validation

```text
node --test tests/governance/p3-v50-first-registration-successor-proposal.test.mjs
```

The three focused cases pass. All runtime, signing, registration, workflow,
merge, production, and paid authorities remain false.

**Release classification:** desktop governance and planning only. No Lovable
action, backend activation, or frontend Publish is required.

# P3 v50 first-registration implementation evidence

Recorded 2026-09-21. The owner authorized only the exact source-only v50
correction, tests, documentation, commit, and push to Draft PR #3.

## Implemented boundary

The dormant lifecycle reducer now treats `NOT_FOUND` as an eligible first-seen
precondition alongside `NOT_REGISTERED`. It still refuses `ENABLED` and
`REQUIRES_APPROVAL` without mutation, calls registration at most once with zero
arguments, performs at most one cleanup attempt when registration reports
success or the post-registration status is active, and accepts success only
after exact terminal `NOT_REGISTERED`.

`NOT_FOUND` remains fail-closed everywhere else. A false registration result
followed by `NOT_FOUND`, an ambiguous post-registration state, failed cleanup,
or final `NOT_FOUND` cannot claim success. The strict physical-proof runner now
admits either eligible initial state only for a fully clean
`REGISTERED_AND_CLEANED` receipt.

## Validation boundary

The focused source suite proves the first-seen sequence, active dirty-state
refusal, clean rejection, ambiguous rejection, one cleanup maximum, hostile
binding rejection, exact zero-argument counts, strict receipt admission, and
the inert dedicated bundle. The complete repository regression passed 605/605
tests. All nine applicable TypeScript projects passed with the repository-pinned
Node 24.18.0 and existing TypeScript 7.0.2 compiler. No dependency install or
build was performed.

No package was built or signed. No app was launched. No native module was
loaded. Service Management, registration, unregistration, LaunchAgent
bootstrap, workflow dispatch, PR merge, default-branch change, paid activity,
real execution, and production use did not occur and remain unauthorized.

**Release classification:** desktop source, tests, and governance only. No
Lovable action, backend activation, or frontend Publish is required.

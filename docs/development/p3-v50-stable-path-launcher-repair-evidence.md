# P3 v50 stable-path lifecycle launcher repair evidence

Recorded 2026-09-21. The pre-authorization audit found that the physical gate
required launching the staged app at
`/Users/shakoure/Library/Application Support/DOSAI/TestProofs/v50/DOSAI.app`,
while the existing v49-compatible runner remained fixed to the build output
under `out/`. Launching that runner would not have tested the stable-path
condition named by the gate.

The additive staged runner fixes the exact stable application and executable
paths, accepts no arguments or caller-selected path, launches one child with
zero arguments, reuses the strict v50 receipt admission and success classifier,
and preserves the 15-second `SIGKILL` timeout and no-retry boundary. The
historical v49 runner and accepted v50 lifecycle behavior remain unchanged.

This is source-only preparation. No package was built or copied, no identity
was queried, no code was signed, no application or native module was launched,
and no Service Management operation occurred. The physical proof remains
separately owner-gated.

**Release classification:** local desktop proof tooling only. No Lovable
action, backend activation, or frontend Publish is required.

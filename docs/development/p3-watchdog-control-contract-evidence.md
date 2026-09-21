# P3 Watchdog Control Contract Evidence

**Status:** `OWNER_ACCEPTED`<br>
**Recorded:** `2026-08-02T17:36:14-04:00`<br>
**Validated:** `2026-08-02T17:41:16-04:00`<br>
**Accepted:** `2026-08-02T17:47:40-04:00`<br>
**Decision:** Accepted ADR 0020<br>
**Ownership:** Accepted process ownership v9 over accepted v8<br>
**Contracts:** Accepted schema registry v18 over accepted v17

## Scope

This declaration-only slice defines the exact no-effect boundary that must be
accepted before a native watchdog transport fixture is implemented. It adds
three strict JSON Schemas and a proposed process-ownership generation. It adds
no Swift source, LaunchAgent property list, service registration, XPC listener,
client connection, inert service process, VM operation, process launch,
filesystem access, network access, reconciliation, journal write, or production
authority.

## Contract Boundary

The proposed session contract fixes:

- mutual XPC code-requirement assurance;
- a service boot ID, service generation, coordinator instance, and session ID;
- sequence start at one;
- a 4,096-byte frame ceiling, bounded cached responses, bounded inspect and
  stop-one queues, one reserved stop-all slot, and a fixed response timeout;
- disconnect behavior fixed to `STOP_ALL`; and
- inert test-fixture mode with `NO_EFFECT_TEST_ONLY` authorization.

The proposed request contract admits only:

- `INSPECT` for one exact supervisor generation;
- `STOP_ONE` for one UUID capsule in one exact supervisor generation; and
- `STOP_ALL` for one exact supervisor generation.

Requests contain no executable, arguments, environment, path, mount, PID,
process name, socket, network destination, journal, database, signing field, VM
configuration, start/resume operation, or arbitrary payload. Responses contain
only bounded capsule IDs, generations, states, stop dispositions, replay
identity, or a fixed safe error.

## Ownership Boundary

Process ownership v9 is hash-bound to immutable accepted v8 and changes only
the Main and execution-service declarations plus their governing invariants.
Main retains its existing imports and no authority. It may later define an
uncomposed typed test client, but cannot register, configure, discover, or set
peer requirements for the service.

The proposed execution-service boundary is test-only and application-
unreachable. It can affect only inert fixture records through the three fixed
operations. Production registration, generic payload, PID targeting, ownership
release, reconciliation, journal, VM creation, VM start, process launch,
filesystem, and network authority all remain false.

The native execution-service root remains empty until the owner accepts process
ownership v9 and schema registry v18.

## Adversarial Admission

The focused governance suite verifies that:

- registry v18 adds only the three watchdog contracts over immutable v17;
- ownership v9 is hash-bound to immutable v8 and preserves every unrelated
  source and native-helper boundary;
- production mode, expanded queue limits, keep-running disconnect behavior,
  credentials, execution authorization, sequence zero, start operations, PIDs,
  paths, executables, arbitrary payloads, unsafe response states, and unknown
  errors are rejected; and
- no execution-service implementation exists.

## Validation

The exact governed toolchain is Node `24.18.0` and pnpm `11.18.0`.

```text
node --test tests/governance/p3-watchdog-control-contracts.test.mjs
4 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run typecheck
8 TypeScript project checks passed

pnpm --config.verify-deps-before-run=warn test
268 tests passed; 0 failed

pnpm --config.verify-deps-before-run=warn run build
main, preload, and renderer production builds passed
```

The pnpm flag preserved the existing stale `node_modules` workspace-state record
while using the installed exact lockfile dependencies. The first response-schema
audit exposed an explicit-object typing omission in conditional operation/result
constraints. The schema was corrected and focused plus full validation reran
successfully.

`git diff --check`, JSON parsing, immutable-input digests, implementation-
authority scans, and high-confidence changed-file secret scans pass. The benign
Git fsmonitor IPC warning remains environmental.

## Known Limitations

- JSON Schema proves shape and fixed bounds, not XPC peer authentication,
  framing, sequencing, replay-cache behavior, queue precedence, disconnect
  handling, or native-process independence.
- No runtime admission implementation exists yet; relational checks between
  request, response, session, boot, generation, sequence, and operation remain
  part of the next accepted slice.
- No service is signed, packaged, registered, launched, or connected to the
  Electron application.
- No VM or inert native process has been created, and no cleanup or crash claim
  is made.
- Registry v16 and Linux builder manifest v2 remain unchanged and retain their
  existing owner-review status.

## Owner Decision

The repository owner accepted process ownership v9 and schema registry v18
together. Acceptance authorizes only the bounded test-fixture implementation
described by those artifacts; it does not authorize production service
registration, VM creation or start, process launch, filesystem or network
access, or runtime eligibility.

# P3 Execution Service Boundary Evidence

**Status:** `ACCEPTED`  
**Prepared:** `2026-08-01T14:23:28-04:00`  
**Accepted:** `2026-08-01T14:51:58-04:00`  
**Governing decision:** `docs/decisions/0014-linux-microvm-isolation-backend.md`

## Scope

This slice establishes the process boundary for the future Swift execution service
and proves only that the macOS 15 Virtualization framework can represent the
fixed, device-empty starting configuration. It does not implement, package, or
launch the service and does not create or start a virtual machine.

## Ownership Proposal

`docs/architecture/process-ownership-v7.json` replaces the former generic
`effect-brokers` reservation with one dedicated `execution-service` reservation.
The accepted boundary is application-unreachable and explicitly has no VM
creation, VM start, process launch, filesystem, or network authority. Its native
helper root must remain empty until a later ownership generation is accepted.

The accepted v6 manifest remains byte-identical. The v7 proposal binds its exact
SHA-256 digest and adds accepted ADRs 0003 and 0014 without reopening any earlier
accepted boundary.

## No-Effect Framework Probe

The Swift probe is a test fixture, not product code. Its exact protocol has two
operations:

- `describe` reports support in the current process context and the absence of
  runtime authority.
- `inspect-fixed-profile` constructs only `VZVirtualMachineConfiguration`, sets
  one CPU and 512 MiB memory, and reports the configured device counts.

The fixture is ad-hoc signed with the single
`com.apple.security.virtualization` entitlement so its process-context support
query is meaningful. It does not instantiate `VZVirtualMachine`, call `start` or
`stop`, call framework validation without boot artifacts, create a process,
access standard input, read or write a file, or use a network API. Its output labels the result
as structural inspection rather than a bootable-VM proof.

On the development M4 Mac mini, `kern.hv_support` is `1`. The probe reports
support as false inside the restricted Codex execution sandbox and true when the
same signed binary is run outside that sandbox with explicit approval. This is a
process-context restriction, not absent host virtualization hardware. Automated
tests therefore require a boolean observation and preserve the external result
as local evidence; they do not hard-code sandbox or unsandboxed availability.

## Validation

| Check | Result |
| --- | --- |
| Process ownership v6 SHA-256 | PASS; remains `a02bf6e7b4af2244e878f7f066aa246928ec881dc2a8c3f0279fe6ea08b7ad62` |
| Accepted v7 lineage and zero-authority service reservation | PASS |
| Swift source and protocol adversarial checks | PASS |
| arm64 architecture and macOS 15 deployment target | PASS |
| Exact ad-hoc entitlement set | PASS; only `com.apple.security.virtualization` |
| Fixed profile | PASS; one CPU, 512 MiB, all inspected optional device arrays empty |
| VM lifecycle, process, input, host-file, and network symbols | PASS; absent |
| Exact Node 24.18.0 / pnpm 11.18.0 repository check | PASS; eight typechecks, 188 tests, production build |
| Electron package | PASS; 9 fuses, 11 ASAR entries, least-privilege Info.plist |
| Probe absent from packaged app | PASS; zero resource or ASAR entries |
| Added-file secret scan | PASS; no recognized credential or private-key pattern |

## Remaining Gates

- A reproducible guest kernel, initramfs, root filesystem, and guest-agent
  manifest before complete configuration validation can be truthful.
- Exact entitlement, signing, packaging, authenticated transport, lifecycle,
  cancellation, watchdog, teardown, and crash-recovery proofs.
- Physical macOS 15 packaged evidence before full supported-range acceptance.

Arbitrary repository execution remains unavailable.
